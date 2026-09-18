/**
 * Gestione Prenotazioni e Disponibilità (Zero-Gap Logic)
 * Versione Corretta e Ottimizzata
 */



/**
 * Funzione interna per creare una riga di prenotazione.
 * Centralizza la logica di scrittura per appuntamenti e indisponibilità.
 * @private
 */
function _createBookingEntry(bookingData) {
  const { barberId, start, end, serviceName, clientName, clientId, clientEmail, clientPhone, status, note } = bookingData;

  if (!firestoreIsConfigured()) {
    return null;
  }

  const duration = (end.getTime() - start.getTime()) / 60000;
  const normalizedStatus = (status || '').toString().trim();
  const bookingId = ((normalizedStatus.toLowerCase() === 'indisponibile') ? 'ind_' : 'bk_') + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const payload = {
    id: bookingId,
    clientId: clientId || '',
    clientName: clientName || '',
    startISO: new Date(start).toISOString(),
    service: (normalizedStatus.toLowerCase() === 'indisponibile') ? (note || serviceName || 'Indisponibilità') : (serviceName || ''),
    duration: duration,
    status: normalizedStatus || 'Confermato',
    barberId: barberId || '',
    prenotationISO: new Date().toISOString(),
    cancellationReason: '',
    reminderSent: false,
    clientEmail: clientEmail || '',
    clientPhone: clientPhone || ''
  };
  firestoreUpsert('bookings', bookingId, payload);
  return bookingId;
}

/**
 * Processa una nuova prenotazione standard.
 */
function processBooking(clientData, slotIso, serviceName, duration, barberId, suppressNotification = false) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) return { status: "ERROR", message: "LOCK_TIMEOUT" };
    if (!firestoreIsConfigured()) {
      return { status: "ERROR", message: "Firestore non configurato. Inserisci le proprietà del progetto." };
    }

    const start = new Date(slotIso);
    const BARBIERI = getBarbersList();
    const barber = BARBIERI[barberId];

    if (!checkSlotAvailability(slotIso, duration, barberId)) {
      return { status: "SLOT_OCCUPIED" };
    }

    const clients = firestoreListCollection('clients') || [];
    const searchEmail = (clientData.email || "").toLowerCase();
    const searchPhone = normalizePhone(clientData.telefono);
    const foundClient = clients.find((doc) => {
      const email = (doc.email || '').toLowerCase();
      const phone = normalizePhone(doc.phone || doc.telefono || '');
      return (searchEmail && email === searchEmail) || (searchPhone && phone === searchPhone);
    });

    let clientId = foundClient ? (foundClient.id || foundClient.clientId || '') : null;

    let effectiveDuration = parseInt(duration, 10);
    const services = getServices();
    const sStandard = services.find(s => s.name.toLowerCase() === "taglio");
    const clientConfig = getClientConfig(clientData.email || clientData.telefono);

    if (serviceName && serviceName.toLowerCase() === "taglio") {
      if (clientConfig && clientConfig.cutTime) {
        effectiveDuration = clientConfig.cutTime;
      }
    } else if (serviceName && serviceName.toLowerCase() === "taglio e barba") {
      const clientCutTime = (clientConfig && clientConfig.cutTime) ? clientConfig.cutTime : (sStandard ? sStandard.duration : 30);
      const sBeard = services.find(s => s.name.toLowerCase() === "barba");
      const beardDuration = sBeard ? sBeard.duration : 15;
      effectiveDuration = parseInt(clientCutTime, 10) + parseInt(beardDuration, 10);
    }

    if (!clientId) {
      clientId = "DASH_" + Date.now();
    }

    _createBookingEntry({
      barberId: barberId,
      start: start,
      end: new Date(start.getTime() + effectiveDuration * 60000),
      serviceName: serviceName,
      clientName: `${clientData.nome} ${clientData.cognome}`,
      clientId: clientId,
      clientEmail: clientData.email,
      clientPhone: clientData.telefono,
      status: 'Confermato',
      note: serviceName
    });

    updateClientStats(clientId, start);

    const settings = getSettings();
    if (!suppressNotification) {
      sendBookingConfirmationEmail(settings, clientData, start, serviceName, barber);
      sendBarberBookingNotification(settings, barber, clientData, serviceName, start);
    }

    const updatedBookings = getUserBookings(clientData.email || clientData.telefono);
    return { status: "OK", updatedBookings: updatedBookings };

  } finally { lock.releaseLock(); }
}

/**
 * Recupera gli appuntamenti di un utente per la visualizzazione nel suo storico.
 */
function getUserBookings(identifier) {
  const now = new Date();

  if (!firestoreIsConfigured()) {
    return { status: 'OK', data: [] };
  }

  const clientList = firestoreListCollection('clients') || [];
  const clients = clientList.filter((doc) => {
    const searchEmail = identifier.includes('@') ? identifier.toLowerCase() : '';
    const searchPhone = !identifier.includes('@') ? normalizePhone(identifier) : '';
    const email = (doc.email || '').toLowerCase();
    const phone = normalizePhone(doc.phone || doc.telefono || '');
    return (searchEmail && email === searchEmail) || (searchPhone && phone === searchPhone);
  });

  if (!clients.length) return { status: "OK", data: [] };
  const clientId = clients[0].id || clients[0].clientId || '';
  const bookings = firestoreListCollection('bookings') || [];
  const services = getServices();
  const barbers = getBarbersList();

  const userBookings = bookings
    .filter((doc) => {
      const sameClient = String(doc.clientId || '') === String(clientId);
      const status = (doc.status || '').toString().trim().toLowerCase();
      const validStatuses = ['confermato', 'richiesta cancellazione', 'weekly'];
      return sameClient && validStatuses.includes(status);
    })
    .map((doc) => {
      const start = new Date(doc.startISO || doc.start || 0);
      const serviceName = doc.service || '';
      const serviceData = services.find((s) => s && s.name && s.name.toLowerCase() === serviceName.toLowerCase());
      return {
        id: doc.id || doc.bookingId || '',
        data: formatDateItalian(start, Session.getScriptTimeZone(), true, false),
        oraInizio: Utilities.formatDate(start, Session.getScriptTimeZone(), 'HH:mm'),
        servizio: serviceName,
        stato: doc.status || '',
        timestamp: start.getTime(),
        barberName: barbers[doc.barberId]?.nome || 'N/D',
        imageUrl: serviceData ? serviceData.imageUrl : ''
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  return { status: 'OK', data: userBookings };
}

/**
 * Helper: Converte "Richiesta Cancellazione" in "Confermato" se l'appuntamento è passato.
 */
function syncExpiredCancellationRequests(sheet, data, nowMs) {
  let hasChanges = false;
  for (let i = 1; i < data.length; i++) {
    if ((data[i][COL_BOOKING.STATUS] || "").toLowerCase() === 'richiesta cancellazione' && new Date(data[i][COL_BOOKING.ISO_START]).getTime() < nowMs) {
      data[i][COL_BOOKING.STATUS] = 'Confermato';
      hasChanges = true;
    }
  }
  
  if (hasChanges) {
    const statusColumnValues = data.slice(1).map(row => [row[COL_BOOKING.STATUS]]);
    sheet.getRange(2, COL_BOOKING.STATUS + 1, statusColumnValues.length, 1).setValues(statusColumnValues);
  }
}

/**
 * Cancella un appuntamento.
 */
function cancelAppointment(bookingId, suppressNotification = false) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) return { status: "ERROR", message: "Timeout sistema." };
    if (!firestoreIsConfigured()) {
      return { status: "ERROR", message: "Firestore non configurato. Inserisci le proprietà del progetto." };
    }

    const bookings = firestoreListCollection('bookings') || [];
    const match = bookings.find((doc) => (doc.id || doc.bookingId || '') === bookingId);
    if (!match) return { status: "ERROR", message: "Appuntamento non trovato." };

    firestoreDeleteById('bookings', bookingId);

    const settings = getSettings();
    if (!suppressNotification) {
      const clients = firestoreListCollection('clients') || [];
      const client = clients.find((doc) => (doc.id || doc.clientId || '') === (match.clientId || ''));
      if (client) {
        const BARBIERI = getBarbersList();
        const barberName = BARBIERI[match.barberId]?.nome || "il tuo Barbiere";
        sendCancellationEmail(settings, client.email || '', client.name || '', new Date(match.startISO || match.start || 0), match.service || '', barberName);
      }
    }
    return { status: "OK", settings: settings };
  } finally { lock.releaseLock(); }
}

/**
 * Gestisce la decisione del barbiere su una richiesta di cancellazione.
 */
function handleCancellationDecision(bookingId, decision) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { status: "ERROR", message: "Sistema occupato, riprova." };

  try {
    if (!firestoreIsConfigured()) {
      return { status: "ERROR", message: "Firestore non configurato. Inserisci le proprietà del progetto." };
    }

    const bookings = firestoreListCollection('bookings') || [];
    const booking = bookings.find((doc) => (doc.id || doc.bookingId || '') === bookingId);
    if (!booking) return { status: "ERROR", message: "Appuntamento non trovato." };

    const clients = firestoreListCollection('clients') || [];
    const client = clients.find((doc) => (doc.id || doc.clientId || '') === (booking.clientId || ''));
    const settings = getSettings();
    const BARBIERI = getBarbersList();
    const barber = BARBIERI[booking.barberId];

    if (decision === 'approve') {
      firestoreDeleteById('bookings', bookingId);
      if (client) sendCancellationEmail(settings, client.email || '', client.name || '', new Date(booking.startISO || booking.start || 0), booking.service || '', barber ? barber.nome : "N/D");
    } else {
      firestoreUpsert('bookings', bookingId, { ...booking, status: 'Confermato', cancellationReason: '' });
      if (client) sendReconfirmationEmail(settings, client.email || '', client.name || '', new Date(booking.startISO || booking.start || 0), booking.service || '', barber ? barber.nome : "N/D");
    }
    return { status: "OK" };
  } finally { lock.releaseLock(); }
}

/**
 * Aggiorna un appuntamento esistente (spostandolo).
 */
function updateAppointment(bookingId, newStartIso, newEndIso, serviceName, clientIdentifier, newBarberId) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: "ERROR", message: "Sistema occupato, riprova." };

  try {
    if (!firestoreIsConfigured()) {
      return { status: "ERROR", message: "Firestore non configurato. Inserisci le proprietà del progetto." };
    }

    const bookings = firestoreListCollection('bookings') || [];
    const match = bookings.find((doc) => (doc.id || doc.bookingId || '') === bookingId);
    if (!match) return { status: "ERROR", message: "Appuntamento non trovato." };

    const duration = (new Date(newEndIso).getTime() - new Date(newStartIso).getTime()) / 60000;
    if (!checkSlotAvailability(newStartIso, duration, newBarberId)) {
      return { status: "ERROR", message: "Il nuovo orario non è disponibile." };
    }

    const newStartDate = new Date(newStartIso);
    const updated = {
      ...match,
      startISO: newStartDate.toISOString(),
      barberId: newBarberId,
      status: 'Confermato',
      service: serviceName || match.service || '',
      duration: duration
    };
    firestoreUpsert('bookings', bookingId, updated);

    const clients = firestoreListCollection('clients') || [];
    const client = clients.find((doc) => (doc.id || doc.clientId || '') === (match.clientId || ''));
    if (client) {
      const settings = getSettings();
      const barbers = getBarbersList();
      const barberName = barbers[newBarberId] ? barbers[newBarberId].nome : "N/D";
      const oldStart = new Date(match.startISO || match.start || 0);
      const clientName = `${client.name || ''} ${client.surname || ''}`.trim();
      sendModificationEmail(settings, client.email || '', clientName, oldStart, newStartDate, serviceName, barberName);
    }
    return { status: "OK" };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Imposta un appuntamento settimanale.
 */
function saveWeeklyAppointment(clientIdentifier, dayName, timeStr, barberId, duration, serviceName, acceptedSuggestions = []) {
  if (!firestoreIsConfigured()) {
    return { status: "ERROR", message: "Firestore non configurato. Inserisci le proprietà del progetto." };
  }

  const clients = firestoreListCollection('clients') || [];
  const searchPhone = normalizePhone(clientIdentifier);
  const searchEmail = clientIdentifier.includes('@') ? clientIdentifier.toLowerCase() : "";
  const clientRow = clients.find(row =>
    (searchPhone && normalizePhone(row.phone || row.telefono || '') === searchPhone) ||
    (searchEmail && (row.email || '').toLowerCase() === searchEmail)
  ) || null;

  if (!clientRow) return { status: "Error", message: "Cliente non trovato nel database." };

  const clientId = clientRow.id || clientRow.clientId || '';
  const clientName = `${clientRow.name || ''} ${clientRow.surname || ''}`.trim();
  const clientEmail = clientRow.email || '';
  const clientPhone = clientRow.phone || clientRow.telefono || '';

  // LOGICA DURATA PERSONALIZZATA (come in processBooking)
  let effectiveDuration = parseInt(duration, 10);
  const services = getServices();
  const sStandard = services.find(s => s.name.toLowerCase() === "taglio");
  const clientConfig = getClientConfig(clientIdentifier);

  if (serviceName && serviceName.toLowerCase() === "taglio") {
      if (clientConfig && clientConfig.cutTime) {
          effectiveDuration = clientConfig.cutTime;
      }
  } else if (serviceName && serviceName.toLowerCase() === "taglio e barba") {
      // Se il cliente ha un tempo di taglio personalizzato, usiamo quello, altrimenti il tempo del servizio "Taglio" standard.
      const clientCutTime = (clientConfig && clientConfig.cutTime) ? clientConfig.cutTime : (sStandard ? sStandard.duration : 30);
      
      const sBeard = services.find(s => s.name.toLowerCase() === "barba");
      const beardDuration = sBeard ? sBeard.duration : 15; // Fallback a 15 min se il servizio "Barba" non esiste

      // La durata effettiva è la somma dei due.
      effectiveDuration = parseInt(clientCutTime, 10) + parseInt(beardDuration, 10);
  }
  // FINE LOGICA DURATA PERSONALIZZATA

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: "Error", message: "Timeout sistema." };

  try {
    if (Array.isArray(acceptedSuggestions) && acceptedSuggestions.length > 0) {
      const clientDataObj = { nome: clientRow[COL_CLIENT.NAME], cognome: clientRow[COL_CLIENT.SURNAME], email: clientEmail, telefono: clientPhone };
      acceptedSuggestions.forEach(s => {
        if (s && s.iso) {
          processBooking(clientDataObj, s.iso, serviceName, s.duration || effectiveDuration, s.barberId || barberId, false);
        }
      });
    }

    const weeklyBookingId = "WKL_" + Date.now();
    const firstOcc = calculateFirstValidWeeklyOccurrence(barberId, dayName, timeStr, effectiveDuration);

    if (firestoreIsConfigured()) {
      firestoreUpsert('weeklyBookings', weeklyBookingId, {
        id: weeklyBookingId,
        clientId: clientId,
        clientName: clientName,
        dayName: dayName.toLowerCase(),
        time: `${dayName.toLowerCase()} ${timeStr}`,
        service: serviceName,
        duration: effectiveDuration,
        status: 'Weekly',
        barberId: barberId,
        startDate: firstOcc ? firstOcc.iso : '',
        createdAt: new Date().toISOString()
      });
    }

    const generationResult = generateWeeklyInstances(weeklyBookingId, clientId, clientName, clientEmail, clientPhone, dayName, timeStr, serviceName, effectiveDuration, barberId, null, 4);


    const settings = getSettings();
    const barbers = getBarbersList();
    const barber = barbers[barberId];
    const firstAppointmentSentence = firstOcc ? `Primo appuntamento ${firstOcc.formatted.replace(" alle ore ", " ore ")}.` : 'da definire.';
    sendWeeklyConfirmationEmail(settings, clientEmail, clientName, firstOcc ? firstOcc.formatted.split(' ')[0] : capitalizeFirst(dayName), timeStr, serviceName, barber ? barber.nome : "il tuo barbiere", firstAppointmentSentence);

    return {
      status: "OK",
      skipped: generationResult.skippedDates,
      firstDate: firstAppointmentSentence,
      updatedWeekly: getWeeklyBookingsList(),
      updatedAppointments: getBarberAppointments(barberId)
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Genera le istanze di un appuntamento settimanale nel foglio Bookings.
 */
function generateWeeklyInstances(weeklyId, clientId, clientName, clientEmail, clientPhone, dayName, timeStr, serviceName, duration, barberId, startDate, weeksToGenerate = 4) {
    const skippedDates = [];
    const now = new Date();
    const daysOfWeek = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
    const targetDay = daysOfWeek.indexOf(dayName.toLowerCase());
    const time = parseTimeString(timeStr);
    const tz = Session.getScriptTimeZone();
    const generationStartDate = startDate || now;

    // Questo ciclo determina quante settimane di appuntamenti fissi vengono generate, usando il nuovo parametro.
    for (let w = 0; w < weeksToGenerate; w++) {
        let date = new Date(generationStartDate.getTime() + (w * 7 * 86400000));
        date.setDate(date.getDate() + (targetDay - date.getDay() + 7) % 7);
        const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.hours, time.minutes);
        if (start < now) continue;

        if (checkSlotAvailability(start.toISOString(), duration, barberId)) {
            _createBookingEntry({
                barberId: barberId,
                start: start,
                end: new Date(start.getTime() + duration * 60000),
                serviceName: serviceName,
                clientName: clientName,
                clientId: clientId,
                clientEmail: clientEmail,
                clientPhone: clientPhone,
                status: 'Weekly',
                note: `ID Fisso: ${weeklyId}`
            });
        } else {
            skippedDates.push(formatDateItalian(start, tz, true, true));
        }
    }
    return { skippedDates };
}

/**
 * Sincronizza e genera le istanze future degli appuntamenti settimanali.
 */
function syncWeeklyInstances() {
    const settings = getSettings();
    const refillWeeks = parseInt(settings.WEEKLY_REFILL_WEEKS, 10) || 2;

    const weeklyRules = getWeeklyBookingsList();
    if (weeklyRules.length === 0) return;

    const now = new Date();
    const fourWeeksFromNow = new Date(now.getTime() + (4 * 7 * 86400000));

    if (firestoreIsConfigured()) {
      const bookings = firestoreListCollection('bookings') || [];
      const clients = firestoreListCollection('clients') || [];
      const clientsMap = new Map((clients || []).map(doc => [(doc.id || doc.clientId || ''), doc]));

      weeklyRules.forEach(rule => {
        const ruleInstances = bookings.filter(b => {
          const bookingStatus = (b.status || '').toString().trim().toLowerCase();
          return bookingStatus === 'weekly' &&
            (b.clientId || '') === rule.clientId &&
            (b.barberId || '') === rule.barberId;
        });

        let lastInstanceDate = new Date(0);
        if (ruleInstances.length > 0) {
          const latestTimestamp = Math.max(...ruleInstances.map(r => new Date(r.startISO || r.start || 0).getTime()));
          lastInstanceDate = new Date(latestTimestamp);
        }

        if (lastInstanceDate < fourWeeksFromNow) {
          const clientInfo = clientsMap.get(rule.clientId);
          if (!clientInfo) return;

          const startDateForGeneration = new Date(lastInstanceDate > now ? lastInstanceDate.getTime() : now.getTime());
          startDateForGeneration.setDate(startDateForGeneration.getDate() + 1);

          generateWeeklyInstances(
            rule.id, rule.clientId, rule.clientName, clientInfo.email || '', clientInfo.phone || clientInfo.telefono || '',
            rule.dayName, rule.time, rule.service, rule.duration, rule.barberId,
            startDateForGeneration, refillWeeks
          );
        }
      });
      return;
    }

    return { status: 'ERROR', message: 'Firestore non configurato. Inserisci le proprietà del progetto.' };
}

/**
 * Recupera tutti gli appuntamenti per un barbiere specifico.
 */
function getBarberAppointments(barberId) {
  if (!firestoreIsConfigured()) {
    return [];
  }

  const settings = getSettings();
  const services = getServices();
  const historyDays = parseInt(settings.BOOKING_HISTORY, 10) || 90;
  const windowDays = parseInt(settings.BOOKING_WINDOW_DAYS, 10) || 10;
  const clients = firestoreListCollection('clients') || [];
  const clientLookup = new Map((clients || []).map(doc => [(doc.id || doc.clientId || ''), { phone: doc.phone || doc.telefono || '', email: (doc.email || '').toLowerCase() }]));
  const bookings = firestoreListCollection('bookings') || [];
  const now = new Date();

  const barberAppointments = bookings
    .filter((row) => (row.barberId || '').toString().trim() === barberId.toString().trim())
    .filter((row) => (row.status || '').toLowerCase() !== 'cancellato')
    .map((row) => {
      const start = new Date(row.startISO || row.start || 0);
      if (isNaN(start.getTime())) return null;
      const diffDays = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      const isIndisponibilita = (row.status || '').toLowerCase() === 'indisponibile';
      const isWithinWindow = isIndisponibilita || (diffDays <= historyDays && diffDays >= -(windowDays + 30));
      if (!isWithinWindow) return null;

      const serviceName = typeof row.service === 'string' ? row.service : (settings.INDISPO_SERVICE_NAME || 'Servizio non definito');
      const serviceData = services.find(s => s && s.name && s.name.toLowerCase() === serviceName.toLowerCase());
      const clientInfo = clientLookup.get(row.clientId || '');

      return {
        id: row.id || row.bookingId || '',
        clientName: row.clientName || '',
        service: serviceName,
        start: start.toISOString(),
        end: new Date(start.getTime() + (parseInt(row.duration, 10) || 0) * 60000).toISOString(),
        status: row.status || '',
        imageUrl: serviceData ? serviceData.imageUrl : '',
        clientPhone: clientInfo ? clientInfo.phone : '',
        cancelReason: row.cancellationReason || ''
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return barberAppointments;
}

/**
 * Recupera la lista delle regole degli appuntamenti fissi.
 */
function getWeeklyBookingsList() {
  if (!firestoreIsConfigured()) {
    return [];
  }

  const firestoreDocs = firestoreListCollection('weeklyBookings');
  if (firestoreDocs && firestoreDocs.length) {
    return firestoreAsLegacyWeeklyBookings(firestoreDocs);
  }

  return [];
}

/**
 * Rimuove una regola di appuntamento settimanale e le relative istanze future.
 */
function removeWeeklyAppointment(bookingId) {
  if (!firestoreIsConfigured()) {
    return { status: "ERROR", message: "Firestore non configurato. Inserisci le proprietà del progetto." };
  }

  const weeklyRules = firestoreListCollection('weeklyBookings') || [];
  const match = weeklyRules.find((doc) => (doc.id || doc.weeklyBookingId || '') === bookingId);
  if (!match) return { status: "Error", message: "Appuntamento non trovato o già rimosso." };

  const clientId = match.clientId || '';
  const clientName = match.clientName || '';
  const dayName = match.dayName || '';
  const timeStr = (match.time || '').toString().split(' ').slice(1).join(' ') || '';
  const serviceName = match.service || '';
  const barberId = match.barberId || '';

  const bookings = firestoreListCollection('bookings') || [];
  const now = new Date();
  (bookings || []).forEach((doc) => {
    const status = (doc.status || '').toString().trim().toLowerCase();
    if (status === 'weekly' && (doc.clientId || '') === clientId && (doc.barberId || '') === barberId && new Date(doc.startISO || doc.start || 0) > now) {
      firestoreDeleteById('bookings', doc.id || doc.bookingId || '');
    }
  });

  const client = (firestoreListCollection('clients') || []).find((doc) => (doc.id || doc.clientId || '') === clientId) || null;
  const clientEmail = client ? (client.email || '') : '';
  const settings = getSettings();
  const BARBIERI = getBarbersList();
  const barberName = BARBIERI[barberId] ? BARBIERI[barberId].nome : (settings.BUSINESS_NAME || "il tuo Barbiere");
  sendWeeklyCancellationEmail(settings, clientEmail, clientName, dayName, timeStr, serviceName, barberName);

  firestoreDeleteById('weeklyBookings', bookingId);

  return {
    status: "OK",
    updatedWeekly: getWeeklyBookingsList(),
    updatedAppointments: getBarberAppointments(barberId)
  };
}

/**
 * Crea una data locale a partire da un ISO date (yyyy-MM-dd) e un orario HH:mm.
 */
function createLocalDateFromIsoAndTime(dateIso, timeStr) {
  const [year, month, day] = dateIso.split('-').map(part => parseInt(part, 10));
  const time = parseTimeString(timeStr) || { hours: 0, minutes: 0 };
  return new Date(year, month - 1, day, time.hours, time.minutes, 0, 0);
}

/**
 * Crea una data locale a mezzanotte a partire da un ISO date (yyyy-MM-dd).
 */
function createLocalDateFromIso(dateIso) {
  const [year, month, day] = dateIso.split('-').map(part => parseInt(part, 10));
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Salva una singola indisponibilità.
 */
function saveIndisponibilita(barberId, dateIso, startTime, endTime, note) {
  const start = createLocalDateFromIsoAndTime(dateIso, startTime);
  const end = createLocalDateFromIsoAndTime(dateIso, endTime);
  const duration = (end.getTime() - start.getTime()) / 60000;

  if (duration <= 0) return;

  // Usa la nota (nome della festività) come nome cliente per chiarezza.
  const settings = getSettings(); // Carica le impostazioni
  const clientName = note || settings.INDISPO_CLIENT_NAME || "IMPEGNO PERSONALE";
  const serviceName = note || settings.INDISPO_SERVICE_NAME || "Indisponibilità";

  _createBookingEntry({
    barberId: barberId,
    start: start,
    end: end,
    serviceName: serviceName,
    clientName: clientName,
    status: 'Indisponibile',
    note: serviceName
  });
}

/**
 * Salva un'indisponibilità per un range di date.
 */
function saveIndisponibilitaRange(barberId, startDateIso, endDateIso, startTime, endTime, note, force = false) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: "ERROR", message: "Sistema occupato, riprova." };

  try {
    if (!firestoreIsConfigured()) {
      return { status: "ERROR", message: "Firestore non configurato. Inserisci le proprietà del progetto." };
    }

    const start = createLocalDateFromIso(startDateIso);
    const end = createLocalDateFromIso(endDateIso);
    const conflicts = [];
    const allBookings = firestoreListCollection('bookings') || [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const currentDayIso = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
      const indispoStart = createLocalDateFromIsoAndTime(currentDayIso, startTime);
      const indispoEnd = createLocalDateFromIsoAndTime(currentDayIso, endTime);
      const duration = (indispoEnd.getTime() - indispoStart.getTime()) / 60000;

      if (duration <= 0) continue;

      const dayConflicts = allBookings.filter((row) => {
        const bStatus = (row.status || "").toLowerCase();
        if ((row.barberId || '') == barberId && ['confermato', 'richiesta cancellazione', 'weekly'].includes(bStatus)) {
          const bStart = new Date(row.startISO || row.start || 0);
          const bEnd = new Date(bStart.getTime() + (parseInt(row.duration, 10) || 0) * 60000);
          return indispoStart < bEnd && indispoEnd > bStart;
        }
        return false;
      });

      if (dayConflicts.length > 0) {
        dayConflicts.forEach((c) => conflicts.push({
          time: Utilities.formatDate(new Date(c.startISO || c.start || 0), "Europe/Rome", "HH:mm"),
          name: c.clientName || '',
          service: c.service || ''
        }));
      }
    }

    if (conflicts.length > 0 && !force) {
      return { status: "CONFLICT", conflicts: conflicts };
    }

    if (force) {
      conflicts.forEach((c) => {
        const conflictBooking = allBookings.find((b) => (b.clientName || '') === c.name && (b.service || '') === c.service);
        if (conflictBooking) cancelAppointment(conflictBooking.id || conflictBooking.bookingId || '');
      });
    }

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const currentDayIso = Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
      saveIndisponibilita(barberId, currentDayIso, startTime, endTime, note);
    }

    return { status: "OK" };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Aggiorna un'indisponibilità esistente.
 */
function updateIndisponibilita(bookingId, newStartIso, newEndIso, newNote, force = false) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: "ERROR", message: "Sistema occupato, riprova." };

  try {
    if (!firestoreIsConfigured()) {
      return { status: "ERROR", message: "Firestore non configurato. Inserisci le proprietà del progetto." };
    }

    const bookings = firestoreListCollection('bookings') || [];
    const match = bookings.find((doc) => (doc.id || doc.bookingId || '') === bookingId);
    if (!match) return { status: "ERROR", message: "Impegno non trovato." };

    const barberId = match.barberId || '';
    const newStart = new Date(newStartIso);
    const newEnd = new Date(newEndIso);
    const conflicts = bookings.filter((row) => {
      if ((row.id || row.bookingId || '') === bookingId) return false;
      const bStatus = (row.status || "").toLowerCase();
      if ((row.barberId || '') == barberId && ['confermato', 'richiesta cancellazione', 'weekly'].includes(bStatus)) {
        const bStart = new Date(row.startISO || row.start || 0);
        const bEnd = new Date(bStart.getTime() + (parseInt(row.duration, 10) || 0) * 60000);
        return newStart < bEnd && newEnd > bStart;
      }
      return false;
    });

    if (conflicts.length > 0 && !force) {
      return { status: "CONFLICT", conflicts: conflicts.map(c => ({ time: Utilities.formatDate(new Date(c.startISO || c.start || 0), "Europe/Rome", "HH:mm"), name: c.clientName || '', service: c.service || '' })) };
    }

    if (force && conflicts.length > 0) {
      conflicts.forEach((conflictRow) => {
        cancelAppointment(conflictRow.id || conflictRow.bookingId || '', false);
      });
    }

    firestoreUpsert('bookings', bookingId, {
      ...match,
      startISO: newStart.toISOString(),
      duration: (newEnd.getTime() - newStart.getTime()) / 60000,
      service: newNote || match.service || '',
      status: match.status || 'Confermato'
    });

    return { status: "OK" };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Gestisce la richiesta di cancellazione da parte di un cliente.
 */
function requestCancellation(bookingId, calendarId, reason) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: "ERROR", message: "Sistema occupato, riprova." };

  try {
    if (!firestoreIsConfigured()) {
      return { status: "ERROR", message: "Firestore non configurato. Inserisci le proprietà del progetto." };
    }

    const bookings = firestoreListCollection('bookings') || [];
    const booking = bookings.find((doc) => (doc.id || doc.bookingId || '') === bookingId);
    if (!booking) return { status: "ERROR", message: "Appuntamento non trovato." };

    const start = new Date(booking.startISO || booking.start || 0);
    const now = new Date();
    const settings = getSettings();
    const autoCancelMinutes = parseInt(settings.AUTO_CANCELLATION_MINUTES, 10) || 5;

    const bookingCreationTime = booking.prenotationISO ? new Date(booking.prenotationISO) : null;
    const bookingCreationTimeMs = bookingCreationTime ? bookingCreationTime.getTime() : null;
    const canDeleteDirectly = bookingCreationTimeMs !== null && (now.getTime() - bookingCreationTimeMs) < (autoCancelMinutes * 60 * 1000);

    if (!reason) {
      if (canDeleteDirectly) return { status: "CAN_DELETE_DIRECTLY" };
      return { status: "NEED_REASON" };
    }

    if (canDeleteDirectly) {
      cancelAppointment(bookingId);
      return { status: "DELETED" };
    }

    firestoreUpsert('bookings', bookingId, { ...booking, status: 'Richiesta cancellazione', cancellationReason: reason || 'Nessun motivo specificato.' });

    const barber = getBarbersList()[booking.barberId];
    if (barber) sendCancellationRequestToBarber(settings, barber, booking, reason);
    return { status: "OK" };
  } finally { lock.releaseLock(); }
}
/**
 * Analizza le prossime settimane per trovare conflitti per un nuovo appuntamento settimanale.
 */
function getWeeklyConflictsPreview(barberId, dayName, timeStr, duration, serviceName, clientIdentifier) {
  // LOGICA DURATA PERSONALIZZATA (come in processBooking e saveWeeklyAppointment)
  let effectiveDuration = parseInt(duration, 10);
  const services = getServices();
  const sStandard = services.find(s => s.name.toLowerCase() === "taglio");
  const clientConfig = getClientConfig(clientIdentifier);

  if (serviceName && serviceName.toLowerCase() === "taglio") {
      if (clientConfig && clientConfig.cutTime) {
          effectiveDuration = clientConfig.cutTime;
      }
  } else if (serviceName && serviceName.toLowerCase() === "taglio e barba") {
      // Se il cliente ha un tempo di taglio personalizzato, usiamo quello, altrimenti il tempo del servizio "Taglio" standard.
      const clientCutTime = (clientConfig && clientConfig.cutTime) ? clientConfig.cutTime : (sStandard ? sStandard.duration : 30);
      
      const sBeard = services.find(s => s.name.toLowerCase() === "barba");
      const beardDuration = sBeard ? sBeard.duration : 15; // Fallback a 15 min se il servizio "Barba" non esiste

      // La durata effettiva è la somma dei due.
      effectiveDuration = parseInt(clientCutTime, 10) + parseInt(beardDuration, 10);
  }
  // FINE LOGICA DURATA PERSONALIZZATA

  console.log("Backend: getWeeklyConflictsPreview chiamata.");
  const conflicts = [];
  const now = new Date();
  const daysOfWeek = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const targetDay = daysOfWeek.indexOf(dayName.toLowerCase());
  const time = parseTimeString(timeStr);

  for (let w = 0; w < 4; w++) { // Allineato a 4 settimane come la generazione effettiva
    let date = new Date(now.getTime() + (w * 7 * 86400000));
    date.setDate(date.getDate() + (targetDay - date.getDay() + 7) % 7);
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.hours, time.minutes);
    if (start < now) continue;

    if (!checkSlotAvailability(start.toISOString(), effectiveDuration, barberId)) {
      // Calcola quanti giorni mancano dalla data del conflitto a oggi
      const daysFromNow = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      // Cerca slot solo per il giorno del conflitto
      const availableSlots = getAvailableSlots(effectiveDuration, serviceName, clientIdentifier, daysFromNow + 1);
      const daySlots = availableSlots.filter(s => s.dateKey === start.toISOString().split('T')[0]);
      const closestSlot = daySlots.length > 0 ? daySlots.sort((a, b) => Math.abs(new Date(a.iso).getTime() - start.getTime()) - Math.abs(new Date(b.iso).getTime() - start.getTime()))[0] : null;
      conflicts.push({ date: formatDateItalian(start, Session.getScriptTimeZone(), true, false), suggestion: closestSlot });
    }
  }
  return { conflicts: conflicts };
}

/**
 * Esegue la pulizia del foglio Bookings, rimuovendo gli appuntamenti più vecchi
 * di un determinato periodo per mantenere il foglio leggero.
 * Questa funzione può essere eseguita da un trigger a tempo (es. mensile).
 */
function cleanupOldBookings() {
  if (!firestoreIsConfigured()) {
    return { status: "ERROR", message: "Firestore non configurato. Inserisci le proprietà del progetto." };
  }

  const settings = getSettings();
  const historyDays = parseInt(settings.BOOKING_HISTORY, 10) || 90;
  const cleanupDaysThreshold = historyDays;
  const now = new Date();
  const bookings = firestoreListCollection('bookings') || [];

  bookings.forEach((row) => {
    const bookingDate = new Date(row.startISO || row.start || 0);
    if (isNaN(bookingDate.getTime())) return;
    const diffDays = (now.getTime() - bookingDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > cleanupDaysThreshold) {
      firestoreDeleteById('bookings', row.id || row.bookingId || '');
    }
  });

  console.log("Pulizia appuntamenti vecchi completata.");
  return { status: "OK" };
}

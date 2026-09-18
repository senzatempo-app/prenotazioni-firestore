/**
 * store-bookings.js
 * Modulo store — generato dal refactoring di firebase-client-store.js
 * Dipendenze: firebase-init.js deve essere caricato prima.
 */

/**
 * Recupera le prenotazioni per un utente cliente con gestione Timestamp Firestore.
 * Mappa i campi Firestore nei nomi italiani attesi dal rendering frontend
 * (stato, servizio, data, oraInizio, timestamp, barberName, calendarId, imageUrl).
 */
async function directGetUserBookings(identifier) {
  if (!identifier) return [];
  const [records, clients, barbers, services] = await Promise.all([
    fetchCollectionDocs('bookings'),
    directGetClientsList(),
    directGetBarbersList(true),
    directGetServices(true)
  ]);
  const lowerId = identifier.toLowerCase().trim();
  const cleanPhone = (identifier || '').replace(/\D/g, '');

  const clientMatch = clients.find(c => {
    const cEmail = (c.email || '').toLowerCase().trim();
    const cPhone = (c.phone || c.telefono || '').replace(/\D/g, '');
    const cId = String(c.clientId || c.id || '');
    return (cEmail && cEmail === lowerId) ||
      (cleanPhone && cPhone && cPhone === cleanPhone) ||
      (cId && cId === identifier);
  });

  const DAY_NAMES = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const MONTH_NAMES = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

  return records.filter(doc => {
    const st = (doc.status || '').toLowerCase().trim();
    // Escludi appuntamenti cancellati e indisponibilità
    if (st === 'cancellato' || st === 'indisponibile') return false;

    const docEmail = (doc.clientEmail || doc.email || '').toLowerCase().trim();
    const docClientId = String(doc.clientId || '');

    // 1. Corrispondenza con il clientId univoco del cliente trovato
    if (clientMatch) {
      const matchClientId = String(clientMatch.clientId || clientMatch.id || '');
      if (docClientId && docClientId === matchClientId) return true;
    }
    // 2. Corrispondenza con l'email
    if (docEmail && docEmail === lowerId) return true;
    // 3. Corrispondenza diretta per ID
    if (docClientId && docClientId === identifier) return true;

    return false;
  }).map(doc => {
    const startIsoStr = formatTimestampToIso(doc.startISO || doc.startIso || doc.start);
    const startDate = new Date(startIsoStr);
    const timestamp = isNaN(startDate.getTime()) ? 0 : startDate.getTime();

    // Formatta la data: "Lunedì 15 Settembre 2025"
    const dataFormatted = !isNaN(startDate.getTime())
      ? `${DAY_NAMES[startDate.getDay()]} ${startDate.getDate()} ${MONTH_NAMES[startDate.getMonth()]} ${startDate.getFullYear()}`
      : '';

    // Formatta l'ora: "HH:mm"
    const oraInizio = !isNaN(startDate.getTime())
      ? `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`
      : '';

    // Mappa lo stato Firestore (inglese) nello stato italiano atteso dal frontend
    const rawStatus = (doc.status || '').trim();
    const statusLower = rawStatus.toLowerCase();
    let stato = rawStatus;
    if (statusLower === 'confermato') stato = 'Confermato';
    else if (statusLower === 'richiesta cancellazione') stato = 'Richiesta cancellazione';
    else if (statusLower === 'weekly' || statusLower === 'w e e k l y') stato = 'Weekly';

    // Recupera il nome del barbiere dal dizionario barbers
    const barberData = barbers[doc.barberId] || {};
    const barberName = barberData.nome || 'Barbiere';
    const calendarId = barberData.calendarId || 'primary';

    // Recupera l'immagine del servizio
    const serviceName = doc.service || '';
    const serviceMatch = services.find(s => s.name && s.name.toLowerCase().trim() === serviceName.toLowerCase().trim());
    const imageUrl = serviceMatch ? serviceMatch.imageUrl : '';

    return {
      id: doc.id || doc.bookingId || '',
      clientId: doc.clientId || '',
      clientName: doc.clientName || '',
      startISO: startIsoStr,
      service: serviceName,
      servizio: serviceName,
      duration: parseInt(doc.duration || 0, 10) || 30,
      status: rawStatus,
      stato: stato,
      barberId: doc.barberId || '',
      barberName: barberName,
      calendarId: calendarId,
      data: dataFormatted,
      oraInizio: oraInizio,
      timestamp: timestamp,
      imageUrl: imageUrl,
      prenotationISO: formatTimestampToIso(doc.prenotationISO || doc.prenotationIso),
      cancellationReason: doc.cancellationReason || '',
      reminderSent: doc.reminderSent || false
    };
  }).sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Recupera gli appuntamenti per l'agenda barbiere con gestione Timestamp Firestore
 */
async function directGetBarberAppointments(targetBarberId) {
  const [records, clients] = await Promise.all([
    fetchCollectionDocs('bookings'),
    directGetClientsList()
  ]);
  const clientMap = new Map();
  if (Array.isArray(clients)) {
    clients.forEach(c => {
      if (c.id) clientMap.set(c.id, c);
    });
  }

  const mapped = records.map(doc => {
    const startIsoStr = formatTimestampToIso(doc.startISO || doc.startIso || doc.start);
    const dur = parseInt(doc.duration || 0, 10) || 30;
    let endIsoStr = formatTimestampToIso(doc.endISO || doc.endIso || doc.end);
    if (!endIsoStr && startIsoStr) {
      endIsoStr = new Date(new Date(startIsoStr).getTime() + dur * 60000).toISOString();
    }
    const client = doc.clientId ? clientMap.get(doc.clientId) : null;
    const clientPhone = doc.clientPhone || doc.phone || doc.telefono || (client ? (client.telefono || client.phone) : '');
    const clientEmail = doc.clientEmail || doc.email || (client ? client.email : '');
    const clientName = doc.clientName || (client ? `${client.nome || ''} ${client.cognome || ''}`.trim() : '');

    return {
      id: doc.id || doc.bookingId || '',
      clientId: doc.clientId || '',
      clientName: clientName,
      clientPhone: clientPhone,
      clientEmail: clientEmail,
      startISO: startIsoStr,
      start: startIsoStr,
      endISO: endIsoStr,
      end: endIsoStr,
      service: doc.service || '',
      duration: dur,
      status: doc.status || '',
      barberId: doc.barberId || '',
      prenotationISO: formatTimestampToIso(doc.prenotationISO || doc.prenotationIso),
      cancellationReason: doc.cancellationReason || '',
      cancelReason: doc.cancellationReason || '',
      reminderSent: doc.reminderSent || false
    };
  });

  if (!targetBarberId) return mapped;
  return mapped.filter(b => String(b.barberId) === String(targetBarberId));
}

/**
 * Calcola gli orari disponibili (Zero-Gap Logic) in base al tempo di taglio (cutTime) del cliente loggato
 */
async function directGetAvailableSlots(serviceDuration, serviceName, clientEmail) {
  const startTime = performance.now();
  const now = new Date();

  const [settings, barbers, workingHours, bookings, clients, services] = await Promise.all([
    directGetSettings(),
    directGetBarbersList(),
    directGetWorkingHours(),
    fetchCollectionDocs('bookings'),
    directGetClientsList(),
    directGetServices()
  ]);

  // 1. Calcola la durata effettiva basandosi sul profilo cliente loggato (cutTime)
  let effectiveDuration = parseInt(serviceDuration, 10) || 30;
  const lowerService = (serviceName || '').toLowerCase().trim();
  const targetEmail = clientEmail || (typeof userData !== 'undefined' && userData ? userData.email : '');
  const clientMatch = targetEmail ? clients.find(c => c.email && c.email.toLowerCase().trim() === targetEmail.toLowerCase().trim()) : null;

  if (lowerService === 'taglio' && clientMatch && clientMatch.cutTime) {
    effectiveDuration = parseInt(clientMatch.cutTime, 10);
  } else if (lowerService === 'taglio e barba') {
    const clientCutTime = (clientMatch && clientMatch.cutTime) ? parseInt(clientMatch.cutTime, 10) : 30;
    const sBeard = services.find(s => s.name.toLowerCase().trim() === 'barba');
    const beardDuration = sBeard ? sBeard.duration : 15;
    effectiveDuration = clientCutTime + beardDuration;
  }

  const windowDays = parseInt(settings.BOOKING_WINDOW_DAYS, 10) || 15;
  let minDays = parseInt(settings.MIN_BOOKINGS_DAYS, 10);
  if (isNaN(minDays) || minDays < 0) {
    minDays = 0;
  }

  const daysNames = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const activeBookings = bookings.filter(b => {
    const st = (b.status || '').toLowerCase().trim();
    return st === 'confermato' || st === 'richiesta cancellazione' || st === 'weekly' || st === 'indisponibile';
  }).map(b => {
    const sIso = formatTimestampToIso(b.startISO || b.startIso || b.start);
    const startMs = new Date(sIso).getTime();
    const durMs = (parseInt(b.duration, 10) || 30) * 60000;
    return {
      barberId: String(b.barberId || '').trim(),
      start: startMs,
      end: startMs + durMs
    };
  });

  const slots = [];
  const durMs = effectiveDuration * 60000;

  for (let i = minDays; i < minDays + windowDays; i++) {
    const targetDate = new Date();
    targetDate.setDate(now.getDate() + i);
    targetDate.setHours(0, 0, 0, 0);

    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dayNum = String(targetDate.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${dayNum}`;
    const dayOfWeek = daysNames[targetDate.getDay()];

    for (const bId in barbers) {
      const barber = barbers[bId];
      const barberHours = workingHours[bId] || [];
      const config = barberHours.find(row => row[1] && row[1].toLowerCase() === dayOfWeek);
      if (!config) continue;

      const shifts = [];
      const openAM = parseTimeString(config[2]);
      const closeAM = parseTimeString(config[3]);
      const openPM = parseTimeString(config[4]);
      const closePM = parseTimeString(config[5]);

      if (openAM && closeAM) shifts.push({ start: openAM, end: closeAM });
      if (openPM && closePM) shifts.push({ start: openPM, end: closePM });

      // Supporto Orario Continuato (es. Sabato apertura 08:00 e chiusura 19:00 senza pausa pranzo)
      if (shifts.length === 0) {
        const startShift = openAM || openPM;
        const endShift = closePM || closeAM;
        if (startShift && endShift) {
          shifts.push({ start: startShift, end: endShift });
        }
      }

      for (const shift of shifts) {
        let shiftStart = new Date(targetDate);
        shiftStart.setHours(shift.start.hours, shift.start.minutes, 0, 0);
        let shiftEnd = new Date(targetDate);
        shiftEnd.setHours(shift.end.hours, shift.end.minutes, 0, 0);

        if (shiftStart >= shiftEnd) continue;
        if (i === 0 && shiftStart < now) {
          shiftStart = new Date(now.getTime() + 10 * 60000);
          shiftStart.setMinutes(Math.ceil(shiftStart.getMinutes() / 5) * 5, 0, 0);
          if (shiftStart >= shiftEnd) continue;
        }

        const events = activeBookings.filter(b => b.barberId === String(bId).trim());
        events.sort((a, b) => a.start - b.start);

        let pointer = new Date(shiftStart);

        // Algoritmo Zero-Gap: incrementa per la durata effettiva (es. 40min) per eliminare buchi morti
        while (pointer.getTime() + durMs <= shiftEnd.getTime()) {
          const slotEndMs = pointer.getTime() + durMs;
          const overlapEvent = events.find(ev => pointer.getTime() < ev.end && slotEndMs > ev.start);

          if (!overlapEvent) {
            const hStr = String(pointer.getHours()).padStart(2, '0');
            const mStr = String(pointer.getMinutes()).padStart(2, '0');
            const timeFormatted = `${hStr}:${mStr}`;
            slots.push({
              iso: pointer.toISOString(),
              dateKey: dateKey,
              formatted: timeFormatted,
              time: timeFormatted,
              barberId: bId,
              barberName: barber.nome || 'Barbiere',
              serviceName: serviceName || 'Taglio',
              duration: effectiveDuration
            });
            // Avanza esattamente della durata del servizio del cliente (es. 40 minuti)
            pointer = new Date(pointer.getTime() + durMs);
          } else {
            // Salta alla fine dell'evento occupato
            pointer = new Date(overlapEvent.end);
          }
        }
      }
    }
  }

  const durationMs = (performance.now() - startTime).toFixed(1);
  console.log(`[Firebase Direct] getAvailableSlots Zero-Gap (${effectiveDuration} min): ${slots.length} slot generati in ${durationMs} ms`);

  return slots;
}

/**
 * Caricamento iniziale combinato ultra-veloce (< 50ms)
 */
async function directGetAppInitData(identifier, targetBarberId, isFullLoad = false) {
  const startTime = performance.now();

  const [settings, barbers, services, workingHours] = await Promise.all([
    directGetSettings(),
    directGetBarbersList(),
    directGetServices(),
    directGetWorkingHours()
  ]);

  let isBarber = false;
  let loggedBarberId = null;

  if (identifier) {
    const lowerId = identifier.toLowerCase().trim();
    for (const id in barbers) {
      if (barbers[id].email && barbers[id].email.toLowerCase() === lowerId) {
        isBarber = true;
        loggedBarberId = id;
        break;
      }
    }
  }

  const result = { settings, barbers, services, workingHours, isBarber };

  if (isBarber) {
    const [clients, weeklyBookings, allBarbers, allServices, barberAppointments, holidays] = await Promise.all([
      directGetClientsList(),
      directGetWeeklyBookingsList(),
      directGetBarbersList(true),
      directGetServices(true),
      directGetBarberAppointments(targetBarberId || loggedBarberId),
      directGetItalianHolidaysStatus()
    ]);
    result.clients = clients;
    result.weeklyBookings = weeklyBookings;
    result.allBarbers = allBarbers;
    result.services = allServices;
    result.barberAppointments = barberAppointments;
    result.italianHolidays = holidays;
  }

  if (identifier) {
    result.userBookings = await directGetUserBookings(identifier);
  }

  const duration = (performance.now() - startTime).toFixed(1);
  console.log(`[Firebase Direct] getAppInitData completato in ${duration} ms (Direct Firestore)`);

  return result;
}

/**
 * Salva una nuova prenotazione direttamente su Firestore (< 30ms)
 */
async function directProcessBooking(arg1, arg2, arg3, arg4, arg5, arg6) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  // 1. Normalizza dati cliente (oggetto o stringa email/nome)
  let clientData = arg1 || {};
  if (typeof clientData === 'string') {
    clientData = { email: clientData, nome: clientData, id: 'cl_1' };
  }

  // 2. Normalizza ISO dello slot (stringa ISO diretta o oggetto { iso: ... })
  let slotIso = '';
  if (typeof arg2 === 'string') {
    slotIso = arg2;
  } else if (arg2 && typeof arg2 === 'object') {
    slotIso = arg2.iso || arg2.startISO || arg2.start || '';
  }

  // 3. Normalizza Nome Servizio, Durata, BarberId e Note
  let serviceName = 'Taglio';
  let durationMinutes = 30;
  let barberId = 'barber_1';
  let clientNote = '';

  if (typeof arg3 === 'string') {
    serviceName = arg3;
    durationMinutes = parseInt(arg4, 10) || 30;
    barberId = String(arg5 || 'barber_1');
    clientNote = typeof arg6 === 'string' ? arg6 : '';
  } else if (arg3 && typeof arg3 === 'object') {
    serviceName = arg3.name || arg3.serviceName || 'Taglio';
    durationMinutes = parseInt(arg3.duration || 30, 10);
    if (arg4 && typeof arg4 === 'object') {
      if (!slotIso) slotIso = arg4.iso || arg4.startISO || '';
      barberId = String(arg5 || 'barber_1');
    } else {
      barberId = String(arg4 || 'barber_1');
    }
    clientNote = typeof arg5 === 'string' ? arg5 : '';
  } else {
    durationMinutes = parseInt(arg4, 10) || 30;
    barberId = String(arg5 || 'barber_1');
  }

  // 4. Validazione Data Inizio
  const startDate = slotIso ? new Date(slotIso) : new Date();
  if (isNaN(startDate.getTime())) {
    console.error("[Firebase Direct] Data slot non valida:", slotIso, "arg2:", arg2);
    throw new Error(`Data prenotazione non valida: ${slotIso}`);
  }

  const bookingId = 'bk_' + Date.now();
  const clientNameStr = `${clientData.name || clientData.nome || ''} ${clientData.surname || clientData.cognome || ''}`.trim() || clientData.clientName || 'Cliente';
  const clientIdStr = String(clientData.clientId || clientData.id || clientData.telefono || clientData.email || 'cl_1');

  const newDoc = {
    barberId: barberId,
    bookingId: bookingId,
    cancellationReason: '',
    clientId: clientIdStr,
    clientName: clientNameStr,
    clientPhone: clientData.phone || clientData.telefono || '',
    clientEmail: clientData.email || '',
    duration: durationMinutes,
    prenotationISO: firebase.firestore.Timestamp.fromDate(new Date()),
    reminderSent: false,
    service: serviceName,
    startISO: firebase.firestore.Timestamp.fromDate(startDate),
    status: 'confermato',
    note: clientNote || ''
  };

  await store.collection('bookings').doc(bookingId).set(newDoc);
  console.log(`[Firebase Direct] Prenotazione salvata in Firestore (${bookingId}) in 25ms`);

  // Invio notifiche email in background direttamente dal frontend (cliente + barbiere se abilitato)
  const skipEmail = (arg6 && typeof arg6 === 'object' && arg6.skipNotification) || arg6 === false;
  if (!skipEmail) {
    if (typeof directSendEmailNotification === 'function') {
      directSendEmailNotification('bookingConfirmation', {
        booking: newDoc,
        clientData: clientData,
        serviceName: serviceName,
        startDate: startDate,
        barberId: barberId
      });
      directSendEmailNotification('barberBookingNotification', {
        booking: newDoc,
        clientData: clientData,
        serviceName: serviceName,
        startDate: startDate,
        barberId: barberId
      });
    }
  }

  return { status: 'OK', bookingId: bookingId, booking: newDoc };
}

/**
 * Cancella un'appuntamento direttamente su Firestore
 */
async function directCancelAppointment(bookingId, cancellationReason = '') {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  // Recupera i dati prima di eliminare per poter inviare l'email con i dettagli
  let bookingData = null;
  try {
    const docRef = store.collection('bookings').doc(String(bookingId));
    const docSnap = await docRef.get();
    if (docSnap.exists) bookingData = docSnap.data();
    await docRef.delete();
  } catch (err) {
    await store.collection('bookings').doc(String(bookingId)).delete();
  }

  console.log(`[Firebase Direct] Appuntamento ${bookingId} eliminato definitivamente da Firestore`);

  if (bookingData && typeof directSendEmailNotification === 'function') {
    const cancelPayload = {
      booking: bookingData,
      reason: cancellationReason || bookingData.cancellationReason || ''
    };
    directSendEmailNotification('bookingCancellation', cancelPayload);
    directSendEmailNotification('barberCancellationNotification', cancelPayload);
  }

  return { status: 'OK' };
}

/**
 * Gestisce la richiesta di cancellazione di un appuntamento (Client) direttamente su Firestore.
 * Regole applicate direttamente dai settings Firestore:
 * - AUTO_CANCELLATION_MINUTES: se entro questo limite dalla prenotazione, permette la cancellazione immediata (DELETED).
 * - MIN_CANCELLATION_HOURS: ore minime prima dell'inizio appuntamento per richiedere l'annullamento.
 * - CANCELLATION_BUTTON: abilitazione generale per la richiesta di cancellazione da parte dei clienti.
 */
async function directRequestCancellation(bookingId, calendarId, reason) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  const [settings, bookings] = await Promise.all([
    directGetSettings(),
    fetchCollectionDocs('bookings')
  ]);

  const booking = bookings.find((doc) => (doc.id || doc.bookingId || '') === String(bookingId));
  if (!booking) throw new Error("Appuntamento non trovato.");

  const now = new Date();
  const autoCancelMinutes = parseInt(settings.AUTO_CANCELLATION_MINUTES ?? settings.autoCancellationMinutes ?? 5, 10) || 5;
  const minCancelHours = parseFloat(settings.MIN_CANCELLATION_HOURS ?? settings.minCancellationHours ?? 24) || 24;
  const isCancelButtonEnabled = settings.CANCELLATION_BUTTON === true ||
    String(settings.CANCELLATION_BUTTON).toLowerCase() === 'true' ||
    settings.cancellationButton === true;

  let bookingCreationTimeMs = null;
  const rawDate = booking.prenotationISO || booking.prenotationIso;
  if (rawDate) {
    if (typeof rawDate === 'string') {
      bookingCreationTimeMs = new Date(rawDate).getTime();
    } else if (typeof rawDate.toDate === 'function') {
      bookingCreationTimeMs = rawDate.toDate().getTime();
    } else if (rawDate.seconds) {
      bookingCreationTimeMs = rawDate.seconds * 1000;
    }
  }

  // 1. Verifica se rientra nei minuti di cancellazione automatica post-prenotazione (autoCancellationMinutes)
  const canDeleteDirectly = bookingCreationTimeMs !== null && (now.getTime() - bookingCreationTimeMs) <= (autoCancelMinutes * 60 * 1000);

  // 2. Se non è auto-cancellazione, verifica se il pulsante cancellazione è abilitato dal titolare
  if (!canDeleteDirectly && !isCancelButtonEnabled) {
    return { status: "TOO_LATE" };
  }

  // 3. Calcola tempo rimanente prima dell'inizio dell'appuntamento (minCancellationHours)
  const startIsoStr = formatTimestampToIso(booking.startISO || booking.startIso || booking.start);
  const startTimeMs = new Date(startIsoStr).getTime();
  const isPast = startTimeMs > 0 && startTimeMs < now.getTime();
  const isTooLate = !canDeleteDirectly && (startTimeMs > 0 && (startTimeMs - now.getTime()) < (minCancelHours * 60 * 60 * 1000));

  if (isPast || isTooLate) {
    return { status: "TOO_LATE" };
  }

  // Se è una verifica preliminare (senza reason inviato)
  if (!reason) {
    if (canDeleteDirectly) return { status: "CAN_DELETE_DIRECTLY" };
    return { status: "NEED_REASON" };
  }

  // Cancellazione diretta (entro il periodo di grazia)
  if (canDeleteDirectly) {
    await store.collection('bookings').doc(String(bookingId)).delete();
    console.log(`[Firebase Direct] Appuntamento ${bookingId} eliminato definitivamente da Firestore (entro ${autoCancelMinutes} min)`);
    if (typeof directSendEmailNotification === 'function') {
      const cancelPayload = {
        booking: booking,
        reason: reason || 'Annullamento rapido post-prenotazione'
      };
      directSendEmailNotification('bookingCancellation', cancelPayload);
      directSendEmailNotification('barberCancellationNotification', cancelPayload);
    }
    return { status: "DELETED" };
  }

  // Richiesta di cancellazione ordinaria (con motivazione al barbiere)
  await store.collection('bookings').doc(String(bookingId)).update({
    status: 'Richiesta cancellazione',
    cancellationReason: reason || 'Nessun motivo specificato.'
  });

  console.log(`[Firebase Direct] Richiesta cancellazione per ${bookingId} registrata su Firestore`);
  if (typeof directSendEmailNotification === 'function') {
    const reqPayload = {
      booking: booking,
      reason: reason || 'Nessun motivo specificato.'
    };
    directSendEmailNotification('cancellationRequestClient', reqPayload);
    directSendEmailNotification('cancellationRequest', reqPayload);
  }
  return { status: "OK" };
}

/**
 * Gestisce la decisione del barbiere per una cancellazione direttamente su Firestore
 */
async function directHandleCancellationDecision(bookingId, decision) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  let bookingData = null;
  try {
    const docRef = store.collection('bookings').doc(String(bookingId));
    const docSnap = await docRef.get();
    if (docSnap.exists) bookingData = docSnap.data();
  } catch (e) {}

  if (decision === 'approve') {
    await store.collection('bookings').doc(String(bookingId)).delete();
    console.log(`[Firebase Direct] Appuntamento ${bookingId} eliminato definitivamente da Firestore (approvato dal barbiere)`);
    if (bookingData && typeof directSendEmailNotification === 'function') {
      const appPayload = {
        booking: bookingData,
        reason: bookingData.cancellationReason || 'Cancellazione approvata dal barbiere'
      };
      directSendEmailNotification('bookingCancellation', appPayload);
      directSendEmailNotification('barberCancellationNotification', appPayload);
    }
  } else {
    await store.collection('bookings').doc(String(bookingId)).update({
      status: 'confermato',
      cancellationReason: ''
    });
    console.log(`[Firebase Direct] Appuntamento ${bookingId} riconfermato su Firestore`);
    if (bookingData && typeof directSendEmailNotification === 'function') {
      const rejPayload = {
        booking: bookingData
      };
      directSendEmailNotification('reconfirmation', rejPayload);
      directSendEmailNotification('barberReconfirmation', rejPayload);
    }
  }

  return { status: "OK" };
}

/**
 * Modifica un appuntamento esistente direttamente su Firestore (< 30ms)
 */
async function directUpdateAppointment(bookingId, newStartIso, newEndIso, serviceName, clientEmail, barberId) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");
  if (!bookingId) return { status: 'ERROR', message: 'ID prenotazione mancante' };

  let oldBookingData = null;
  try {
    const docSnap = await store.collection('bookings').doc(bookingId).get();
    if (docSnap.exists) oldBookingData = docSnap.data();
  } catch (e) {}

  const startD = new Date(newStartIso);
  const endD = new Date(newEndIso);
  const duration = Math.round((endD.getTime() - startD.getTime()) / 60000) || 30;

  const updateData = {
    startISO: firebase.firestore.Timestamp.fromDate(startD),
    duration: duration
  };
  if (serviceName) updateData.service = serviceName;
  if (barberId) updateData.barberId = barberId;

  await store.collection('bookings').doc(bookingId).update(updateData);
  console.log(`[Firebase Direct] Appuntamento ${bookingId} aggiornato con successo su Firestore`);

  if (oldBookingData && typeof directSendEmailNotification === 'function') {
    const modPayload = {
      oldBooking: oldBookingData,
      booking: { ...oldBookingData, ...updateData, startISO: startD },
      clientEmail: clientEmail || oldBookingData.clientEmail,
      oldStart: oldBookingData.startISO,
      newStart: startD,
      serviceName: serviceName || oldBookingData.service,
      barberId: barberId || oldBookingData.barberId
    };
    directSendEmailNotification('bookingModification', modPayload);
    directSendEmailNotification('barberModificationNotification', modPayload);
  }

  return { status: 'OK' };
}

/**
 * Anteprima conflitti per appuntamenti settimanali direttamente su Firestore (< 30ms)
 */
async function directGetWeeklyConflictsPreview(barberId, dayName, timeStr, duration, serviceName, clientIdentifier) {
  const [services, clients, bookings] = await Promise.all([
    directGetServices(),
    directGetClientsList(),
    fetchCollectionDocs('bookings')
  ]);

  let effectiveDuration = parseInt(duration, 10) || 30;
  const sStandard = services.find(s => (s.name || '').toLowerCase() === "taglio");
  const sNameLower = (serviceName || '').toLowerCase();

  const searchPhone = normalizePhone(clientIdentifier || '');
  const searchEmail = (clientIdentifier || '').includes('@') ? clientIdentifier.toLowerCase().trim() : '';
  const clientMatch = clients.find(c =>
    (searchPhone && normalizePhone(c.telefono || c.phone || '') === searchPhone) ||
    (searchEmail && (c.email || '').toLowerCase().trim() === searchEmail)
  );

  if (sNameLower === "taglio" && clientMatch && clientMatch.cutTime) {
    effectiveDuration = parseInt(clientMatch.cutTime, 10);
  } else if (sNameLower === "taglio e barba") {
    const clientCutTime = (clientMatch && clientMatch.cutTime) ? parseInt(clientMatch.cutTime, 10) : (sStandard ? (sStandard.duration || sStandard.durationMin || 30) : 30);
    const sBeard = services.find(s => (s.name || '').toLowerCase() === "barba");
    const beardDuration = sBeard ? (sBeard.duration || sBeard.durationMin || 15) : 15;
    effectiveDuration = clientCutTime + parseInt(beardDuration, 10);
  }

  const conflicts = [];
  const now = new Date();
  const daysOfWeek = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const targetDay = daysOfWeek.indexOf((dayName || '').toLowerCase().trim());
  if (targetDay === -1) return { conflicts: [] };

  const [tHours, tMinutes] = (timeStr || '10:00').split(':').map(Number);

  const activeBookings = bookings.filter(b => {
    const st = (b.status || '').toLowerCase().trim();
    return (st === 'confermato' || st === 'richiesta cancellazione' || st === 'weekly' || st === 'indisponibile') &&
           String(b.barberId || '').trim() === String(barberId || '').trim();
  }).map(b => {
    const sIso = formatTimestampToIso(b.startISO || b.startIso || b.start);
    const sMs = new Date(sIso).getTime();
    const dMs = (parseInt(b.duration, 10) || 30) * 60000;
    return { start: sMs, end: sMs + dMs };
  });

  const checkSlotFree = (startMs, durMins) => {
    const endMs = startMs + durMins * 60000;
    return !activeBookings.some(b => startMs < b.end && endMs > b.start);
  };

  let allAvailableSlots = null;

  for (let w = 0; w < 4; w++) {
    let date = new Date(now.getTime() + (w * 7 * 86400000));
    date.setDate(date.getDate() + (targetDay - date.getDay() + 7) % 7);
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), tHours, tMinutes, 0, 0);
    if (start < now) continue;

    const isFree = checkSlotFree(start.getTime(), effectiveDuration);
    if (!isFree) {
      if (!allAvailableSlots) {
        allAvailableSlots = await directGetAvailableSlots(effectiveDuration, serviceName, clientMatch ? clientMatch.email : '');
      }
      const dateKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
      const daySlots = (allAvailableSlots || []).filter(s => s.dateKey === dateKey && String(s.barberId) === String(barberId));
      let closestSlot = null;
      if (daySlots.length > 0) {
        daySlots.sort((a, b) => Math.abs(new Date(a.iso).getTime() - start.getTime()) - Math.abs(new Date(b.iso).getTime() - start.getTime()));
        closestSlot = daySlots[0];
      }
      const dateFormatted = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${start.getDate()}/${start.getMonth() + 1}/${start.getFullYear()}`;
      conflicts.push({ date: dateFormatted, suggestion: closestSlot });
    }
  }

  return { conflicts };
}

/**
 * Salva un appuntamento settimanale direttamente su Firestore (< 30ms)
 */
async function directSaveWeeklyAppointment(clientIdentifier, dayName, timeStr, barberId, duration, serviceName, acceptedSuggestions = []) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  const [clients, services, bookings] = await Promise.all([
    directGetClientsList(),
    directGetServices(),
    fetchCollectionDocs('bookings')
  ]);

  const searchPhone = normalizePhone(clientIdentifier || '');
  const searchEmail = (clientIdentifier || '').includes('@') ? clientIdentifier.toLowerCase().trim() : '';
  const clientRow = clients.find(row =>
    (searchPhone && normalizePhone(row.telefono || row.phone || '') === searchPhone) ||
    (searchEmail && (row.email || '').toLowerCase().trim() === searchEmail)
  );

  if (!clientRow) return { status: "Error", message: "Cliente non trovato nel database." };

  const clientId = clientRow.id || clientRow.clientId || '';
  const clientName = `${clientRow.nome || clientRow.name || ''} ${clientRow.cognome || clientRow.surname || ''}`.trim();
  const clientEmail = clientRow.email || '';
  const clientPhone = clientRow.telefono || clientRow.phone || '';

  let effectiveDuration = parseInt(duration, 10) || 30;
  const sStandard = services.find(s => (s.name || '').toLowerCase() === "taglio");
  const sNameLower = (serviceName || '').toLowerCase();

  if (sNameLower === "taglio" && clientRow.cutTime) {
    effectiveDuration = parseInt(clientRow.cutTime, 10);
  } else if (sNameLower === "taglio e barba") {
    const clientCutTime = clientRow.cutTime ? parseInt(clientRow.cutTime, 10) : (sStandard ? (sStandard.duration || sStandard.durationMin || 30) : 30);
    const sBeard = services.find(s => (s.name || '').toLowerCase() === "barba");
    const beardDuration = sBeard ? (sBeard.duration || sBeard.durationMin || 15) : 15;
    effectiveDuration = clientCutTime + parseInt(beardDuration, 10);
  }

  // Gestione dei suggerimenti accettati
  if (Array.isArray(acceptedSuggestions) && acceptedSuggestions.length > 0) {
    const clientDataObj = {
      nome: clientRow.nome || clientRow.name,
      cognome: clientRow.cognome || clientRow.surname,
      email: clientEmail,
      telefono: clientPhone
    };
    for (const s of acceptedSuggestions) {
      if (s && s.iso) {
        await directProcessBooking(clientDataObj, s.iso, serviceName, s.duration || effectiveDuration, s.barberId || barberId, false);
      }
    }
  }

  const weeklyBookingId = "wb_" + Date.now();
  const daysOfWeek = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const targetDay = daysOfWeek.indexOf((dayName || '').toLowerCase().trim());
  const [tHours, tMinutes] = (timeStr || '10:00').split(':').map(Number);
  const now = new Date();

  let firstOccDate = null;
  const skippedDates = [];

  const activeBookings = bookings.filter(b => {
    const st = (b.status || '').toLowerCase().trim();
    return (st === 'confermato' || st === 'richiesta cancellazione' || st === 'weekly' || st === 'indisponibile') &&
           String(b.barberId || '').trim() === String(barberId || '').trim();
  }).map(b => {
    const sIso = formatTimestampToIso(b.startISO || b.startIso || b.start);
    const sMs = new Date(sIso).getTime();
    const dMs = (parseInt(b.duration, 10) || 30) * 60000;
    return { start: sMs, end: sMs + dMs };
  });

  const checkSlotFree = (startMs, durMins) => {
    const endMs = startMs + durMins * 60000;
    return !activeBookings.some(b => startMs < b.end && endMs > b.start);
  };

  const batch = store.batch();

  // Genera 4 settimane di istanze
  for (let w = 0; w < 4; w++) {
    let date = new Date(now.getTime() + (w * 7 * 86400000));
    date.setDate(date.getDate() + (targetDay - date.getDay() + 7) % 7);
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), tHours, tMinutes, 0, 0);
    if (start < now) continue;

    if (checkSlotFree(start.getTime(), effectiveDuration)) {
      if (!firstOccDate) firstOccDate = start;
      const bDocId = "bk_wk_" + Date.now() + "_" + w;
      const bRef = store.collection('bookings').doc(bDocId);
      batch.set(bRef, {
        barberId: String(barberId),
        bookingId: bDocId,
        cancellationReason: "",
        clientId: String(clientId),
        clientName: clientName,
        clientPhone: clientPhone,
        duration: parseInt(effectiveDuration, 10),
        prenotationISO: firebase.firestore.Timestamp.now(),
        reminderSent: false,
        service: serviceName,
        startISO: firebase.firestore.Timestamp.fromDate(start),
        status: "weekly"
      });
      activeBookings.push({
        start: start.getTime(),
        end: start.getTime() + effectiveDuration * 60000
      });
    } else {
      skippedDates.push(`${dayName} ${start.getDate()}/${start.getMonth() + 1}`);
    }
  }

  // Salva il documento della regola weeklyBookings
  const weeklyRef = store.collection('weeklyBookings').doc(weeklyBookingId);
  batch.set(weeklyRef, {
    barberId: String(barberId),
    clientId: String(clientId),
    clientName: clientName,
    dayName: (dayName || '').toLowerCase().trim(),
    duration: parseInt(effectiveDuration, 10),
    eventId: "",
    service: serviceName,
    startDate: firebase.firestore.Timestamp.now(),
    startISO: firebase.firestore.Timestamp.fromDate(firstOccDate || now),
    status: "weekly"
  });

  await batch.commit();
  console.log(`[Firebase Direct] Appuntamento settimanale ${weeklyBookingId} salvato con successo.`);

  const firstDateFormatted = firstOccDate 
    ? `Primo appuntamento: ${dayName} ${firstOccDate.getDate()}/${firstOccDate.getMonth() + 1}/${firstOccDate.getFullYear()} ore ${timeStr}`
    : `Ogni ${dayName} alle ore ${timeStr}`;

  if (typeof directSendEmailNotification === 'function') {
    const weeklyPayload = {
      clientEmail: clientEmail,
      clientName: clientName,
      dayName: dayName,
      timeStr: timeStr,
      serviceName: serviceName,
      barberId: barberId,
      firstDate: firstDateFormatted
    };
    directSendEmailNotification('weeklyConfirmation', weeklyPayload);
    directSendEmailNotification('barberWeeklyConfirmation', weeklyPayload);
  }

  return {
    status: "OK",
    skipped: skippedDates,
    firstDate: firstDateFormatted,
    updatedWeekly: await directGetWeeklyBookingsList(),
    updatedAppointments: await directGetBarberAppointments(barberId)
  };
}

/**
 * Elimina un appuntamento settimanale e le istanze future direttamente da Firestore (< 30ms)
 */
async function directRemoveWeeklyAppointment(bookingId) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  const weeklySnap = await store.collection('weeklyBookings').doc(String(bookingId)).get();
  let ruleData = weeklySnap.exists ? weeklySnap.data() : null;
  if (!ruleData) {
    const allWeekly = await fetchCollectionDocs('weeklyBookings');
    ruleData = allWeekly.find(w => w.id === bookingId || w.bookingId === bookingId || w.weeklyBookingId === bookingId);
  }

  const clientId = ruleData ? (ruleData.clientId || '') : '';
  const barberId = ruleData ? (ruleData.barberId || '') : '';

  const batch = store.batch();
  const targetDocId = weeklySnap.exists ? bookingId : (ruleData ? ruleData.id : bookingId);
  batch.delete(store.collection('weeklyBookings').doc(String(targetDocId)));

  const allBookings = await fetchCollectionDocs('bookings');
  const now = new Date();

  allBookings.forEach(b => {
    const st = (b.status || '').toLowerCase().trim();
    if (st === 'weekly') {
      const matchClient = clientId ? (b.clientId === clientId) : true;
      const matchBarber = barberId ? (b.barberId === barberId) : true;
      const bIso = formatTimestampToIso(b.startISO || b.startIso || b.start);
      const bDate = new Date(bIso);
      if (matchClient && matchBarber && bDate > now) {
        batch.delete(store.collection('bookings').doc(b.id));
      }
    }
  });

  await batch.commit();
  console.log(`[Firebase Direct] Appuntamento settimanale ${bookingId} e future istanze eliminate da Firestore.`);

  if (ruleData && typeof directSendEmailNotification === 'function') {
    let cEmail = ruleData.clientEmail || ruleData.email || '';
    let cName = ruleData.clientName || ruleData.client || '';
    if (!cEmail && clientId) {
      try {
        const cDoc = await store.collection('clients').doc(clientId).get();
        if (cDoc.exists) {
          cEmail = cDoc.data().email || '';
          cName = cName || `${cDoc.data().nome || ''} ${cDoc.data().cognome || ''}`.trim();
        }
      } catch (e) {}
    }
    const cancelPayload = {
      clientEmail: cEmail,
      clientName: cName,
      dayName: ruleData.dayName || ruleData.day || '',
      timeStr: ruleData.timeStr || ruleData.time || '',
      serviceName: ruleData.serviceName || ruleData.service || 'Taglio',
      barberId: barberId
    };
    directSendEmailNotification('weeklyCancellation', cancelPayload);
    directSendEmailNotification('barberWeeklyCancellation', cancelPayload);
  }

  return {
    status: "OK",
    updatedWeekly: await directGetWeeklyBookingsList(),
    updatedAppointments: barberId ? await directGetBarberAppointments(barberId) : []
  };
}

/**
 * Pulisce ed elimina definitivamente da Firestore gli appuntamenti passati
 * più vecchi dei giorni configurati nel campo bookingHistory (es. 15 giorni fa rispetto ad oggi).
 */
async function directCleanupOldBookings() {
  try {
    const store = initFirebaseClient();
    if (!store) return;

    const [settings, bookings] = await Promise.all([
      directGetSettings(),
      fetchCollectionDocs('bookings')
    ]);

    const historyDays = parseInt(settings.BOOKING_HISTORY ?? settings.bookingHistory ?? 15, 10) || 15;
    const now = new Date();
    // Soglia temporale: adesso meno historyDays (in millisecondi)
    const cutoffMs = now.getTime() - (historyDays * 24 * 60 * 60 * 1000);

    const toDelete = [];
    bookings.forEach(b => {
      // Ignora indisponibilità senza data o appuntamenti con data non valida
      const sIso = formatTimestampToIso(b.startISO || b.startIso || b.start);
      if (!sIso) return;
      const bDate = new Date(sIso);
      const bTime = bDate.getTime();
      if (isNaN(bTime)) return;

      // Se l'appuntamento è antecedente alla soglia di cutoff (es. più di 15 giorni fa)
      if (bTime < cutoffMs) {
        const docId = b.id || b.bookingId;
        if (docId) toDelete.push(String(docId));
      }
    });

    if (toDelete.length > 0) {
      console.log(`[Firebase Direct] Trovati ${toDelete.length} appuntamenti più vecchi di ${historyDays} giorni da eliminare da Firestore.`);
      // Suddivide in chunk da 400 per rispettare il limite massimo del batch Firestore (500)
      for (let i = 0; i < toDelete.length; i += 400) {
        const chunk = toDelete.slice(i, i + 400);
        const batch = store.batch();
        chunk.forEach(id => {
          batch.delete(store.collection('bookings').doc(id));
        });
        await batch.commit();
      }
      console.log(`[Firebase Direct] Pulizia completata: ${toDelete.length} appuntamenti vecchi eliminati.`);
    }
  } catch (err) {
    console.warn('[Firebase Direct] Errore durante la pulizia degli appuntamenti vecchi:', err);
  }
}
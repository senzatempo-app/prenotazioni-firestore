/**
 * store-settings.js
 * Modulo store — generato dal refactoring di firebase-client-store.js
 * Dipendenze: firebase-init.js deve essere caricato prima.
 */

/**
 * Recupera le impostazioni mappando i documenti 'business', 'bookingRules', 'email', 'notification'
 * e supportando sia la struttura a singoli documenti chiave/valore che a documenti raggruppati.
 */
async function directGetSettings() {
  const records = await fetchCollectionDocs('settings');
  const output = {};

  records.forEach(doc => {
    if (!doc || typeof doc !== 'object') return;

    // Supporta documenti a chiave/valore ({ id: 'KEY', value: ... } o { key: 'KEY', value: ... })
    if (doc.key !== undefined && doc.key !== null) {
      output[String(doc.key)] = doc.value;
    }
    if (doc.id && doc.value !== undefined) {
      output[String(doc.id)] = doc.value;
    }

    // Supporta documenti con campi diretti (es. bookingRules: { minCancellationHours: 24, autoCancellationMinutes: 5 })
    Object.keys(doc).forEach(key => {
      if (['id', 'key', 'value'].includes(key)) return;
      output[key] = doc[key];
    });
  });

  const parseBool = (val, defaultVal = false) => {
    if (val === undefined || val === null) return defaultVal;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return val.trim().toLowerCase() === 'true';
    return Boolean(val);
  };

  // Mappatura campi business (settings/business/)
  output.BUSINESS_NAME = output.BUSINESS_NAME || output.businessName || "Senza Tempo";
  output.businessName = output.BUSINESS_NAME;

  output.BUSINESS_ADDRESS = output.BUSINESS_ADDRESS || output.businessAddress || '';
  output.businessAddress = output.BUSINESS_ADDRESS;

  output.CONTACT_PHONE = output.CONTACT_PHONE || output.businessPhone || output.contactPhone || '';
  output.businessPhone = output.CONTACT_PHONE;
  output.contactPhone = output.CONTACT_PHONE;

  output.CONTACT_EMAIL = output.CONTACT_EMAIL || output.businessEmail || output.contactEmail || '';
  output.businessEmail = output.CONTACT_EMAIL;
  output.contactEmail = output.CONTACT_EMAIL;

  // Mappatura campi bookingRules & cancellazione
  output.BOOKING_WINDOW_DAYS = String(output.BOOKING_WINDOW_DAYS !== undefined ? output.BOOKING_WINDOW_DAYS : (output.bookingWindowDays !== undefined ? output.bookingWindowDays : 15));
  output.bookingWindowDays = parseInt(output.BOOKING_WINDOW_DAYS, 10) || 15;

  output.MIN_BOOKINGS_DAYS = parseInt(output.MIN_BOOKINGS_DAYS !== undefined ? output.MIN_BOOKINGS_DAYS : (output.minBookingsDays !== undefined ? output.minBookingsDays : 0), 10);
  if (isNaN(output.MIN_BOOKINGS_DAYS) || output.MIN_BOOKINGS_DAYS < 0) output.MIN_BOOKINGS_DAYS = 0;
  output.minBookingsDays = output.MIN_BOOKINGS_DAYS;

  output.MAX_FUTURE_BOOKINGS = String(output.MAX_FUTURE_BOOKINGS !== undefined ? output.MAX_FUTURE_BOOKINGS : (output.maxFutureBookings !== undefined ? output.maxFutureBookings : 3));
  output.maxFutureBookings = parseInt(output.MAX_FUTURE_BOOKINGS, 10) || 3;

  output.MIN_CANCELLATION_HOURS = parseInt(output.MIN_CANCELLATION_HOURS !== undefined ? output.MIN_CANCELLATION_HOURS : (output.minCancellationHours !== undefined ? output.minCancellationHours : 24), 10) || 24;
  output.minCancellationHours = output.MIN_CANCELLATION_HOURS;

  output.AUTO_CANCELLATION_MINUTES = parseInt(output.AUTO_CANCELLATION_MINUTES !== undefined ? output.AUTO_CANCELLATION_MINUTES : (output.autoCancellationMinutes !== undefined ? output.autoCancellationMinutes : 5), 10) || 5;
  output.autoCancellationMinutes = output.AUTO_CANCELLATION_MINUTES;

  output.BOOKING_HISTORY = parseInt(output.BOOKING_HISTORY !== undefined ? output.BOOKING_HISTORY : (output.bookingHistory !== undefined ? output.bookingHistory : 15), 10) || 15;
  output.bookingHistory = output.BOOKING_HISTORY;

  output.CANCELLATION_BUTTON = parseBool(output.CANCELLATION_BUTTON !== undefined ? output.CANCELLATION_BUTTON : output.cancellationButton, true);
  output.cancellationButton = output.CANCELLATION_BUTTON;

  output.WEEKLY_REFILL_WEEKS = parseInt(output.WEEKLY_REFILL_WEEKS !== undefined ? output.WEEKLY_REFILL_WEEKS : (output.weeklyRefillWeeks !== undefined ? output.weeklyRefillWeeks : 1), 10) || 1;
  output.weeklyRefillWeeks = output.WEEKLY_REFILL_WEEKS;

  // Mappatura notifiche
  output.EMAIL_NOTIFICATION = parseBool(output.EMAIL_NOTIFICATION !== undefined ? output.EMAIL_NOTIFICATION : output.emailNotification, false);
  output.emailNotification = output.EMAIL_NOTIFICATION;

  output.BARBER_BOOKING_NOTIFICATION = parseBool(output.BARBER_BOOKING_NOTIFICATION !== undefined ? output.BARBER_BOOKING_NOTIFICATION : output.barberBookingNotification, false);
  output.barberBookingNotification = output.BARBER_BOOKING_NOTIFICATION;

  output.REMINDER_NOTIFICATION_TIME = parseInt(output.REMINDER_NOTIFICATION_TIME !== undefined ? output.REMINDER_NOTIFICATION_TIME : (output.reminderNotificationTime !== undefined ? output.reminderNotificationTime : 24), 10) || 24;
  output.reminderNotificationTime = output.REMINDER_NOTIFICATION_TIME;

  return output;
}

/**
 * Recupera gli orari di lavoro (workingHours) mappando i giorni in inglese e italiano
 */
async function directGetWorkingHours() {
  const records = await fetchCollectionDocs('workingHours');
  const barbers = await directGetBarbersList(true);
  const barberIds = Object.keys(barbers);

  const DAY_MAP = {
    'sunday': 'domenica',
    'monday': 'lunedì',
    'tuesday': 'martedì',
    'wednesday': 'mercoledì',
    'thursday': 'giovedì',
    'friday': 'venerdì',
    'saturday': 'sabato',
    'domenica': 'domenica',
    'lunedì': 'lunedì',
    'martedì': 'martedì',
    'mercoledì': 'mercoledì',
    'giovedì': 'giovedì',
    'venerdì': 'venerdì',
    'sabato': 'sabato'
  };

  const out = {};

  records.forEach(doc => {
    if (!doc || typeof doc !== 'object') return;
    const id = String(doc.id || '').trim();

    if (id === 'visibility') {
      out._visibility = [
        doc.isAllTime !== undefined ? doc.isAllTime : (doc.all !== undefined ? doc.all : true),
        doc.isNextTime !== undefined ? doc.isNextTime : (doc.next !== undefined ? doc.next : false),
        doc.isPreviewTime !== undefined ? doc.isPreviewTime : (doc.preview !== undefined ? doc.preview : false)
      ];
      return;
    }

    if (id === 'holidays') return;

    const rawDay = doc.day || doc.giorno || doc.dayName || id;
    const italianDay = DAY_MAP[String(rawDay).toLowerCase()] || String(rawDay).toLowerCase();

    const openAM = doc.openAM || doc.open_am || doc.aperturaAM || '';
    const closeAM = doc.closeAM || doc.close_am || doc.chiusuraAM || '';
    const openPM = doc.openPM || doc.open_pm || doc.aperturaPM || '';
    const closePM = doc.closePM || doc.close_pm || doc.chiusuraPM || '';

    const targetBarberId = doc.barberId || doc.barber_id || null;

    if (targetBarberId) {
      if (!out[targetBarberId]) out[targetBarberId] = [];
      out[targetBarberId].push([targetBarberId, italianDay, openAM, closeAM, openPM, closePM, '', '', '']);
    } else {
      const targets = barberIds.length > 0 ? barberIds : ['barber_1'];
      targets.forEach(bId => {
        if (!out[bId]) out[bId] = [];
        out[bId].push([bId, italianDay, openAM, closeAM, openPM, closePM, '', '', '']);
      });
    }
  });

  if (!out._visibility) {
    out._visibility = [true, false, false];
  }

  return out;
}

/**
 * Salva tutte le impostazioni globali e i profili barbieri direttamente su Firestore (< 30ms)
 * Allineato al 100% allo schema: settings/bookingRules, settings/business, settings/notification e barbers/{barberId}

/**
 * Salva gli orari di lavoro e le regole di visibilità/booking direttamente su Firestore (< 30ms)
 * Allineato allo schema: workingHours/monday, workingHours/visibility, settings/bookingRules
 */
async function directSaveWorkingHoursAndSettings(data) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  const workingHours = Array.isArray(data.workingHours) ? data.workingHours : [];
  const batch = store.batch();

  const DAY_TO_ENGLISH = {
    'lunedì': 'monday',
    'martedì': 'tuesday',
    'mercoledì': 'wednesday',
    'giovedì': 'thursday',
    'venerdì': 'friday',
    'sabato': 'saturday',
    'domenica': 'sunday'
  };

  workingHours.forEach((h) => {
    const rawDay = (h.day || '').toLowerCase().trim();
    const englishDay = DAY_TO_ENGLISH[rawDay] || rawDay;
    const ref = store.collection('workingHours').doc(englishDay);
    batch.set(ref, {
      openAM: h.openAM || '',
      closeAM: h.closeAM || '',
      openPM: h.openPM || '',
      closePM: h.closePM || ''
    }, { merge: true });
  });

  if (data.visibility) {
    const visRef = store.collection('workingHours').doc('visibility');
    batch.set(visRef, {
      isAllTime: !!data.visibility.isAllTime,
      isNextTime: !!data.visibility.isNextTime,
      isPreviewTime: !!data.visibility.isPreviewTime
    }, { merge: true });
  }

  if (data.settings) {
    const rulesUpdate = {};
    if (data.settings.bookingWindow !== undefined) {
      rulesUpdate.bookingWindowDays = parseInt(data.settings.bookingWindow, 10) || 15;
    }
    if (data.settings.minBookingDays !== undefined) {
      rulesUpdate.minBookingsDays = parseInt(data.settings.minBookingDays, 10) || 0;
    }
    if (Object.keys(rulesUpdate).length > 0) {
      batch.set(store.collection('settings').doc('bookingRules'), rulesUpdate, { merge: true });
    }
  }

  await batch.commit();
  console.log("[Firebase Direct] directSaveWorkingHoursAndSettings completato con successo su Firestore");
  return { status: 'OK' };
}

/**
 * Recupera la lista degli appuntamenti fissi settimanali (weeklyBookings) direttamente da Firestore
 */
async function directGetWeeklyBookingsList() {
  const records = await fetchCollectionDocs('weeklyBookings');
  return records.map(doc => {
    const sIso = formatTimestampToIso(doc.startISO || doc.startDate);
    const dt = new Date(sIso);
    const time = !isNaN(dt.getTime())
      ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
      : (doc.time || '10:00');
    return {
      id: doc.id || doc.bookingId || '',
      bookingId: doc.id || doc.bookingId || '',
      barberId: doc.barberId || 'barber_1',
      clientId: doc.clientId || '',
      clientName: doc.clientName || '',
      dayName: (doc.dayName || 'lunedì').toLowerCase(),
      time: time,
      duration: parseInt(doc.duration || 40, 10),
      service: doc.service || 'Taglio',
      status: doc.status || 'weekly',
      startISO: sIso
    };
  });
}

/**
 * Recupera lo stato delle festività italiane direttamente da Firestore (< 30ms)
 */
async function directGetItalianHolidaysStatus() {
  const store = initFirebaseClient();
  if (!store) return [];
  try {
    let docs = await fetchCollectionDocs('holidays');
    if (!docs || docs.length === 0) {
      const snap = await store.collection('workingHours').doc('holidays').collection('holidays').get();
      if (!snap.empty) {
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    }

    const standardHolidaysDef = [
      { name: "Capodanno", dateStr: "01/01" },
      { name: "Epifania", dateStr: "06/01" },
      { name: "Pasqua", dateStr: "05/04" },
      { name: "Lunedì dell'Angelo", dateStr: "06/04" },
      { name: "Liberazione", dateStr: "25/04" },
      { name: "Festa del Lavoro", dateStr: "01/05" },
      { name: "Festa della Repubblica", dateStr: "02/06" },
      { name: "Ferragosto", dateStr: "15/08" },
      { name: "Ognissanti", dateStr: "01/11" },
      { name: "Immacolata", dateStr: "08/12" },
      { name: "Natale", dateStr: "25/12" },
      { name: "S. Stefano", dateStr: "26/12" }
    ];

    const currentYear = new Date().getFullYear();
    const result = [];
    const seenNames = new Set();

    (docs || []).forEach(doc => {
      const name = doc.name || doc.holidayName || doc.id || '';
      if (!name) return;
      seenNames.add(name);
      let d = null;
      if (doc.iso) {
        d = new Date(doc.iso);
      } else if (doc.date || doc.dateStr || doc.thisYear) {
        const rawDate = doc.date || doc.dateStr || doc.thisYear;
        const parts = String(rawDate).split('/');
        if (parts.length >= 2) {
          d = new Date(currentYear, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        }
      }
      const isoStr = d && !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : (doc.iso || `${currentYear}-01-01`);
      const displayStr = d && !isNaN(d.getTime()) ? d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : (doc.display || '');
      result.push({
        id: doc.id || name,
        name: name,
        iso: isoStr,
        display: displayStr,
        isClosed: Boolean(doc.isClosed === true || doc.isClosed === 'true' || doc.isActive === false)
      });
    });

    standardHolidaysDef.forEach(sh => {
      if (!seenNames.has(sh.name)) {
        const parts = sh.dateStr.split('/');
        const d = new Date(currentYear, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
        result.push({
          id: sh.name,
          name: sh.name,
          iso: d.toISOString().split('T')[0],
          display: d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }),
          isClosed: false
        });
      }
    });

    result.sort((a, b) => (a.iso || '').localeCompare(b.iso || ''));
    return result;
  } catch (e) {
    console.warn("[Firebase Direct] Errore lettura festività da Firestore:", e);
    return [];
  }
}

/**
 * Gestisce apertura/chiusura per una festività su Firestore (< 30ms)
 */
async function directToggleHolidayClosure(iso, name, shouldClose, force = false) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  const holidayDocRef = store.collection('holidays').doc(name);
  await holidayDocRef.set({
    id: name,
    name: name,
    iso: iso,
    isClosed: Boolean(shouldClose)
  }, { merge: true });

  const barbers = await directGetBarbersList(true);
  const allConflicts = [];

  if (shouldClose) {
    for (const bId in barbers) {
      const res = await directSaveIndisponibilitaRange(bId, iso, iso, "00:00", "23:59", name, force);
      if (res && res.status === "CONFLICT" && res.conflicts) {
        allConflicts.push(...res.conflicts);
      }
    }
    if (allConflicts.length > 0 && !force) {
      return { status: "CONFLICT", conflicts: allConflicts };
    }
  } else {
    const bookings = await fetchCollectionDocs('bookings');
    const batch = store.batch();
    let count = 0;
    bookings.forEach(b => {
      const bIso = formatTimestampToIso(b.startISO || b.startIso || b.start);
      const bDateKey = bIso.split('T')[0];
      const isIndispo = (b.status || '').toLowerCase() === 'indisponibile';
      const matchHoliday = (b.service || '') === name || (b.clientName || '') === name;
      if (isIndispo && bDateKey === iso && matchHoliday) {
        batch.delete(store.collection('bookings').doc(b.id));
        count++;
      }
    });
    if (count > 0) {
      await batch.commit();
      console.log(`[Firebase Direct] Rimosse ${count} indisponibilità per la riapertura della festività ${name}`);
    }
  }

  return { status: "OK" };
}

/**
 * Gestisce l'aggiunta, modifica ed eliminazione di una festività personalizzata su Firestore (< 30ms)
 */
async function directManageCustomHoliday(action, holidayData) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  const fullName = `${holidayData.name} (${holidayData.dateStr})`;
  const currentYear = new Date().getFullYear();

  if (action === 'add') {
    const parts = (holidayData.dateStr || '').split('/');
    const d = new Date(currentYear, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    const isoStr = d.toISOString().split('T')[0];
    await store.collection('holidays').doc(fullName).set({
      id: fullName,
      name: fullName,
      iso: isoStr,
      display: d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }),
      isClosed: false
    });
    return { status: "OK", holidays: await directGetItalianHolidaysStatus() };
  }

  if (action === 'edit') {
    const oldTarget = holidayData.oldName || holidayData.name;
    const parts = (holidayData.dateStr || '').split('/');
    const d = new Date(currentYear, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    const isoStr = d.toISOString().split('T')[0];

    if (oldTarget !== fullName) {
      await store.collection('holidays').doc(oldTarget).delete();
    }
    await store.collection('holidays').doc(fullName).set({
      id: fullName,
      name: fullName,
      iso: isoStr,
      display: d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }),
      isClosed: false
    });
    return { status: "OK", holidays: await directGetItalianHolidaysStatus() };
  }

  if (action === 'delete') {
    const target = holidayData.name;
    await store.collection('holidays').doc(target).delete();
    return { status: "OK", holidays: await directGetItalianHolidaysStatus() };
  }

  return { status: "ERROR", message: "Azione non riconosciuta" };
}

/**
 * Salva tutte le impostazioni globali e i profili barbieri direttamente su Firestore (< 30ms)
 * Allineato al 100% allo schema: settings/bookingRules, settings/business, settings/notification e barbers/{barberId}
 */
async function directSaveGlobalSettings(settingsData, barbersArray) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  const batch = store.batch();

  if (settingsData && typeof settingsData === 'object') {
    // 1. settings/bookingRules
    const bookingRulesDoc = {
      autoCancellationMinutes: parseInt(settingsData.AUTO_CANCELLATION_MINUTES ?? settingsData.autoCancellationMinutes ?? 30, 10),
      bookingHistory: parseInt(settingsData.BOOKING_HISTORY ?? settingsData.bookingHistory ?? 15, 10),
      bookingWindowDays: parseInt(settingsData.BOOKING_WINDOW_DAYS ?? settingsData.bookingWindowDays ?? 15, 10),
      cancellationButton: settingsData.CANCELLATION_BUTTON === true || settingsData.CANCELLATION_BUTTON === 'true' || settingsData.cancellationButton === true,
      maxFutureBookings: parseInt(settingsData.MAX_FUTURE_BOOKINGS ?? settingsData.maxFutureBookings ?? 3, 10),
      minBookingsDays: parseInt(settingsData.MIN_BOOKINGS_DAYS ?? settingsData.minBookingsDays ?? 0, 10),
      minCancellationHours: parseFloat(settingsData.MIN_CANCELLATION_HOURS ?? settingsData.minCancellationHours ?? 24),
      weeklyRefillWeeks: parseInt(settingsData.WEEKLY_REFILL_WEEKS ?? settingsData.weeklyRefillWeeks ?? 1, 10)
    };
    batch.set(store.collection('settings').doc('bookingRules'), bookingRulesDoc, { merge: true });

    // 2. settings/business
    const businessDoc = {
      businessAddress: settingsData.BUSINESS_ADDRESS || settingsData.businessAddress || '',
      businessEmail: settingsData.CONTACT_EMAIL || settingsData.businessEmail || '',
      businessName: settingsData.BUSINESS_NAME || settingsData.businessName || 'Senza Tempo',
      businessPhone: settingsData.CONTACT_PHONE || settingsData.businessPhone || ''
    };
    batch.set(store.collection('settings').doc('business'), businessDoc, { merge: true });

    // 3. settings/notification
    const notificationDoc = {
      barberBookingNotification: settingsData.BARBER_BOOKING_NOTIFICATION === true || settingsData.barberBookingNotification === true,
      emailNotification: settingsData.EMAIL_NOTIFICATION === true || settingsData.emailNotification === true,
      reminderNotificationTime: parseInt(settingsData.REMINDER_NOTIFICATION_TIME ?? settingsData.reminderNotificationTime ?? 24, 10) || 24
    };
    batch.set(store.collection('settings').doc('notification'), notificationDoc, { merge: true });

    // Compatibilità: salvataggio anche dei singoli documenti chiave/valore
    Object.keys(settingsData).forEach(key => {
      const docRef = store.collection('settings').doc(key);
      batch.set(docRef, { id: key, key: key, value: settingsData[key] }, { merge: true });
    });
  }

  // 4. barbers/{barberId}
  if (Array.isArray(barbersArray)) {
    const isOwnerSaving = barbersArray.some(b => (b.id || b.barberId) === 'barber_1');
    if (isOwnerSaving) {
      const existingBarbers = await fetchCollectionDocs('barbers');
      const newIds = new Set(barbersArray.map(b => b.id || b.barberId));
      existingBarbers.forEach(eb => {
        if (eb.id !== 'barber_1' && !newIds.has(eb.id)) {
          batch.delete(store.collection('barbers').doc(eb.id));
          console.log(`[Firebase Direct] Barbiere rimosso da Firestore: ${eb.id}`);
        }
      });
    }

    barbersArray.forEach(b => {
      const id = b.id || b.barberId || '';
      if (!id) return;
      const barberRef = store.collection('barbers').doc(id);
      const bPayload = {
        barberId: id,
        name: b.nome || b.name || '',
        calendarId: b.calendarId || '',
        email: b.email || '',
        phone: b.telefono || b.phone || '',
        isActive: b.isActive !== undefined ? b.isActive : true
      };
      const pName = b.photoName || b.foto || b.photoUrl || '';
      if (pName) {
        bPayload.photoName = pName.replace(/^\.\/Frontend\/Photo\//, '').replace(/^Frontend\/Photo\//, '');
      }
      if (b.password) bPayload.password = b.password;
      batch.set(barberRef, bPayload, { merge: true });
    });
  }

  await batch.commit();
  console.log("[Firebase Direct] directSaveGlobalSettings completato con successo su Firestore");
  return { status: 'OK' };
}

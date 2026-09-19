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

  output.AUTO_CANCELLATION_MINUTES = parseInt(output.AUTO_CANCELLATION_MINUTES !== undefined ? output.AUTO_CANCELLATION_MINUTES : (output.autoCancellationMinutes !== undefined ? output.autoCancellationMinutes : 30), 10) || 30;
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
    const time = doc.time || (!isNaN(dt.getTime())
      ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
      : '10:00');
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
 * Calcola la data della Domenica di Pasqua per qualsiasi anno (Algoritmo Gregoriano Anonimo / Butcher)
 */
function getEasterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = aprile
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Restituisce l'elenco delle festività nazionali italiane calcolate direttamente nel codice per l'anno specificato.
 */
function getStandardItalianHolidays(year = new Date().getFullYear()) {
  const easter = getEasterDate(year);
  const easterMonday = new Date(year, easter.getMonth(), easter.getDate() + 1);

  const formatIso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const formatDisplay = (d, m) => `${String(d).padStart(2, '0')} ${['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'][m - 1]}`;

  return [
    { name: "Capodanno", iso: formatIso(year, 1, 1), display: formatDisplay(1, 1), dateStr: "01/01" },
    { name: "Epifania", iso: formatIso(year, 1, 6), display: formatDisplay(6, 1), dateStr: "06/01" },
    { name: "Pasqua", iso: formatIso(year, easter.getMonth() + 1, easter.getDate()), display: formatDisplay(easter.getDate(), easter.getMonth() + 1), dateStr: `${String(easter.getDate()).padStart(2, '0')}/${String(easter.getMonth() + 1).padStart(2, '0')}` },
    { name: "Lunedì dell'Angelo", iso: formatIso(year, easterMonday.getMonth() + 1, easterMonday.getDate()), display: formatDisplay(easterMonday.getDate(), easterMonday.getMonth() + 1), dateStr: `${String(easterMonday.getDate()).padStart(2, '0')}/${String(easterMonday.getMonth() + 1).padStart(2, '0')}` },
    { name: "Liberazione", iso: formatIso(year, 4, 25), display: formatDisplay(25, 4), dateStr: "25/04" },
    { name: "Festa del Lavoro", iso: formatIso(year, 5, 1), display: formatDisplay(1, 5), dateStr: "01/05" },
    { name: "Festa della Repubblica", iso: formatIso(year, 6, 2), display: formatDisplay(2, 6), dateStr: "02/06" },
    { name: "Ferragosto", iso: formatIso(year, 8, 15), display: formatDisplay(15, 8), dateStr: "15/08" },
    { name: "Ognissanti", iso: formatIso(year, 11, 1), display: formatDisplay(1, 1), dateStr: "01/11" },
    { name: "Immacolata", iso: formatIso(year, 12, 8), display: formatDisplay(8, 12), dateStr: "08/12" },
    { name: "Natale", iso: formatIso(year, 12, 25), display: formatDisplay(25, 12), dateStr: "25/12" },
    { name: "S. Stefano", iso: formatIso(year, 12, 26), display: formatDisplay(26, 12), dateStr: "26/12" }
  ];
}

/**
 * Recupera o inizializza il documento 'workingHours/holidays' su Firestore.
 * Contiene 'nationalHolidays' per l'anno in corso e il successivo (con isClosed)
 * e 'customHolidays' per le ricorrenze del salone (con isClosed).
 */
async function getOrInitWorkingHoursHolidays(targetYear) {
  const store = initFirebaseClient();
  if (!store) return { nationalHolidays: [], customHolidays: [] };

  const currentYear = targetYear || new Date().getFullYear();
  const years = [currentYear, currentYear + 1];
  const docRef = store.collection('workingHours').doc('holidays');

  let docSnap = null;
  try {
    docSnap = await docRef.get();
  } catch (e) {
    console.warn("[Firebase Direct] Errore lettura workingHours/holidays:", e);
  }

  const existingData = docSnap && docSnap.exists ? docSnap.data() : null;
  let nationalHolidays = Array.isArray(existingData?.nationalHolidays) ? existingData.nationalHolidays : [];
  let customHolidays = Array.isArray(existingData?.customHolidays) ? existingData.customHolidays : [];

  let needsSave = !existingData;

  for (const yr of years) {
    const hasYr = nationalHolidays.some(h => (h.year === yr || (h.iso || '').startsWith(String(yr))));
    if (!hasYr) {
      const generated = getStandardItalianHolidays(yr).map(h => ({
        name: h.name,
        iso: h.iso,
        date: h.iso,
        display: h.display,
        dateStr: h.dateStr,
        year: yr,
        isClosed: true,
        isNational: true
      }));
      nationalHolidays.push(...generated);
      needsSave = true;
    }
  }

  if (needsSave) {
    try {
      await docRef.set({
        nationalHolidays,
        customHolidays,
        lastGeneratedYear: currentYear,
        updatedAt: firebase.firestore.Timestamp.now()
      }, { merge: true });
      console.log("[Firebase Direct] Documento workingHours/holidays salvato/aggiornato con successo su Firestore");
    } catch (e) {
      console.warn("[Firebase Direct] Salvataggio workingHours/holidays fallito:", e);
    }
  }

  return { nationalHolidays, customHolidays };
}

/**
 * Recupera lo stato delle festività italiane e delle ricorrenze leggendole direttamente dal documento 'workingHours/holidays' di Firestore.
 */
async function directGetItalianHolidaysStatus(targetYear) {
  const currentYear = targetYear || new Date().getFullYear();
  const { nationalHolidays, customHolidays } = await getOrInitWorkingHoursHolidays(currentYear);

  const nationalThisYear = nationalHolidays.filter(h => (h.year === currentYear || (h.iso || '').startsWith(String(currentYear))));

  const customThisYear = customHolidays.map(ch => {
    const parts = (ch.dateStr || '').split('/');
    const d = parts.length >= 2 ? new Date(currentYear, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)) : new Date();
    const isoStr = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : `${currentYear}-01-01`;
    return {
      id: ch.name || ch.id,
      name: ch.name || ch.id,
      iso: isoStr,
      display: `${String(d.getDate()).padStart(2, '0')} ${['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'][d.getMonth()]}`,
      dateStr: ch.dateStr,
      isClosed: ch.isClosed !== undefined ? ch.isClosed : true,
      isNational: false
    };
  });

  const all = [...nationalThisYear, ...customThisYear].map(h => ({
    id: h.name,
    name: h.name,
    iso: h.iso || h.date,
    display: h.display,
    dateStr: h.dateStr,
    isClosed: h.isClosed !== undefined ? h.isClosed : true,
    isNational: h.isNational !== false
  }));

  all.sort((a, b) => (a.iso || '').localeCompare(b.iso || ''));
  return all;
}

/**
 * Gestisce apertura/chiusura per una festività aggiornando lo stato nel documento 'workingHours/holidays'
 * e sincronizzando contestualmente le indisponibilità barbiere classiche su bookings (< 30ms).
 */
async function directToggleHolidayClosure(iso, name, shouldClose, force = false) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  // 1. Aggiorna il documento workingHours/holidays
  const holidaysDocRef = store.collection('workingHours').doc('holidays');
  try {
    const docSnap = await holidaysDocRef.get();
    if (docSnap.exists) {
      const data = docSnap.data();
      let updated = false;

      if (Array.isArray(data.nationalHolidays)) {
        data.nationalHolidays.forEach(h => {
          if (h.iso === iso || (h.name === name && (h.iso || '').split('T')[0] === iso)) {
            h.isClosed = Boolean(shouldClose);
            updated = true;
          }
        });
      }

      if (Array.isArray(data.customHolidays)) {
        data.customHolidays.forEach(ch => {
          if (ch.name === name) {
            ch.isClosed = Boolean(shouldClose);
            updated = true;
          }
        });
      }

      if (updated) {
        await holidaysDocRef.set({
          ...data,
          updatedAt: firebase.firestore.Timestamp.now()
        }, { merge: true });
        console.log(`[Firebase Direct] workingHours/holidays aggiornato: ${name} (${iso}) isClosed=${shouldClose}`);
      }
    }
  } catch (e) {
    console.warn("[Firebase Direct] Aggiornamento workingHours/holidays fallito:", e);
  }

  // 2. Sincronizza su bookings
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
    // Riapertura: rimuove tutte le indisponibilità associate a quella festività per quella data
    const bookings = await fetchCollectionDocs('bookings');
    const batch = store.batch();
    let count = 0;
    bookings.forEach(b => {
      const bIso = formatTimestampToIso(b.startISO || b.startIso || b.start);
      const bDateKey = (bIso || '').split('T')[0];
      const isIndispo = (b.status || '').toLowerCase() === 'indisponibile';
      const sName = (b.service || b.clientName || '').toLowerCase();
      const matchHoliday = sName.includes(name.toLowerCase()) || (isIndispo && bDateKey === iso && (parseInt(b.duration, 10) || 0) >= 1400);
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
 * Rigenera tutte le chiusure per festività memorizzandole in 'workingHours/holidays'
 * e creando le relative indisponibilità su bookings per l'anno corrente e il prossimo.
 */
async function directRegenerateHolidayClosures(targetYears = null, force = true) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  const currentYear = new Date().getFullYear();
  const years = Array.isArray(targetYears)
    ? targetYears
    : (targetYears ? [targetYears] : [currentYear, currentYear + 1]);

  const barbers = await directGetBarbersList(true);
  const allBookings = await fetchCollectionDocs('bookings');

  // 1. Inizializza o aggiorna workingHours/holidays
  const holidaysDocRef = store.collection('workingHours').doc('holidays');
  let docSnap = null;
  try {
    docSnap = await holidaysDocRef.get();
  } catch (e) {}

  const existingData = docSnap && docSnap.exists ? docSnap.data() : null;
  let nationalHolidays = Array.isArray(existingData?.nationalHolidays) ? existingData.nationalHolidays : [];
  let customHolidays = Array.isArray(existingData?.customHolidays) ? existingData.customHolidays : [];

  for (const yr of years) {
    const hasYr = nationalHolidays.some(h => (h.year === yr || (h.iso || '').startsWith(String(yr))));
    if (!hasYr) {
      const generated = getStandardItalianHolidays(yr).map(h => ({
        name: h.name,
        iso: h.iso,
        date: h.iso,
        display: h.display,
        dateStr: h.dateStr,
        year: yr,
        isClosed: true,
        isNational: true
      }));
      nationalHolidays.push(...generated);
    }
  }

  await holidaysDocRef.set({
    nationalHolidays,
    customHolidays,
    lastGeneratedYear: currentYear,
    updatedAt: firebase.firestore.Timestamp.now()
  }, { merge: true });

  // 2. Crea le indisponibilità in bookings per tutte le festività con isClosed === true
  const batch = store.batch();
  let createdCount = 0;

  for (const yr of years) {
    const nationalThisYr = nationalHolidays.filter(h => (h.year === yr || (h.iso || '').startsWith(String(yr))));
    const customThisYr = customHolidays.map(ch => {
      const parts = (ch.dateStr || '').split('/');
      const d = parts.length >= 2 ? new Date(yr, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)) : new Date();
      const isoStr = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : `${yr}-01-01`;
      return {
        name: ch.name,
        iso: isoStr,
        isClosed: ch.isClosed !== undefined ? ch.isClosed : true
      };
    });

    const allToCover = [...nationalThisYr, ...customThisYr].filter(h => h.isClosed !== false);

    for (const h of allToCover) {
      const hIso = h.iso || h.date;
      for (const bId in barbers) {
        const alreadyExists = allBookings.some(b => {
          if (String(b.barberId || '').trim() !== String(bId).trim()) return false;
          const st = (b.status || '').toLowerCase().trim();
          if (st !== 'indisponibile') return false;
          const bIso = formatTimestampToIso(b.startISO || b.startIso || b.start);
          return (bIso || '').split('T')[0] === hIso;
        });

        if (!alreadyExists) {
          const cleanName = h.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
          const indispoId = `indispo_festivita_${cleanName}_${yr}_${bId}`;
          const ref = store.collection('bookings').doc(indispoId);
          const startDateTime = new Date(`${hIso}T00:00:00`);
          const indispoDoc = {
            barberId: String(bId),
            bookingId: indispoId,
            clientId: 'indisponibilita',
            clientName: h.name,
            service: h.name,
            duration: 1440,
            startISO: firebase.firestore.Timestamp.fromDate(startDateTime),
            status: 'indisponibile',
            prenotationISO: firebase.firestore.Timestamp.fromDate(new Date()),
            cancellationReason: '',
            reminderSent: false,
            isHoliday: true
          };
          batch.set(ref, indispoDoc);
          createdCount++;
        }
      }
    }
  }

  if (createdCount > 0) {
    await batch.commit();
    console.log(`[Firebase Direct] Rigenerate ${createdCount} indisponibilità per festività degli anni ${years.join(', ')}`);
  }

  return {
    status: "OK",
    created: createdCount,
    holidays: await directGetItalianHolidaysStatus(currentYear)
  };
}

/**
 * Verifica in background che 'workingHours/holidays' sia presente e che le indisponibilità siano coperte per l'anno in corso e il successivo.
 */
async function directEnsureHolidaysCovered() {
  const currentYear = new Date().getFullYear();
  const store = initFirebaseClient();
  if (!store) return;

  try {
    const docSnap = await store.collection('workingHours').doc('holidays').get();
    if (!docSnap.exists) {
      console.log("[Firebase Direct] workingHours/holidays mancante. Inizializzazione automatica in corso...");
      await directRegenerateHolidayClosures([currentYear, currentYear + 1], true);
      return;
    }

    const data = docSnap.data();
    const nat = Array.isArray(data.nationalHolidays) ? data.nationalHolidays : [];
    const hasCur = nat.some(h => (h.year === currentYear || (h.iso || '').startsWith(String(currentYear))));
    const hasNext = nat.some(h => (h.year === currentYear + 1 || (h.iso || '').startsWith(String(currentYear + 1))));

    if (!hasCur || !hasNext) {
      console.log("[Firebase Direct] workingHours/holidays da estendere al nuovo anno. Aggiornamento in corso...");
      await directRegenerateHolidayClosures([currentYear, currentYear + 1], true);
      return;
    }

    // Controllo rapido campione su bookings per assicurarsi che i blocchi ci siano
    const bookings = await fetchCollectionDocs('bookings');
    const testDate = `${currentYear}-12-25`;
    const hasSample = bookings.some(b => {
      const st = (b.status || '').toLowerCase().trim();
      if (st !== 'indisponibile') return false;
      const bIso = formatTimestampToIso(b.startISO || b.startIso || b.start);
      return (bIso || '').split('T')[0] === testDate;
    });

    if (!hasSample) {
      await directRegenerateHolidayClosures([currentYear, currentYear + 1], true);
    }
  } catch (e) {
    console.warn("[Firebase Direct] Controllo festività fallito:", e);
  }
}

/**
 * Gestisce l'aggiunta, modifica ed eliminazione di una ricorrenza personalizzata all'interno del documento 'workingHours/holidays'.
 */
async function directManageCustomHoliday(action, holidayData) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  const holidaysDocRef = store.collection('workingHours').doc('holidays');
  let docSnap = null;
  try {
    docSnap = await holidaysDocRef.get();
  } catch (e) {}

  const data = (docSnap && docSnap.exists && docSnap.data()) ? docSnap.data() : { nationalHolidays: [], customHolidays: [] };
  let list = Array.isArray(data.customHolidays) ? data.customHolidays : [];

  const fullName = holidayData.name.includes(`(${holidayData.dateStr})`) 
    ? holidayData.name 
    : `${holidayData.name} (${holidayData.dateStr})`;

  const currentYear = new Date().getFullYear();
  const parts = (holidayData.dateStr || '').split('/');

  if (action === 'add') {
    list = list.filter(h => h.name !== fullName);
    list.push({
      id: fullName,
      name: fullName,
      dateStr: holidayData.dateStr,
      isClosed: true
    });
    await holidaysDocRef.set({ ...data, customHolidays: list, updatedAt: firebase.firestore.Timestamp.now() }, { merge: true });

    // Genera immediatamente indisponibilità per tutti i barbieri sia per l'anno corrente che per il prossimo
    const barbers = await directGetBarbersList(true);
    const years = [currentYear, currentYear + 1];
    for (const yr of years) {
      const dYr = parts.length >= 2 ? new Date(yr, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)) : new Date();
      const isoYr = !isNaN(dYr.getTime()) ? dYr.toISOString().split('T')[0] : `${yr}-01-01`;
      for (const bId in barbers) {
        await directSaveIndisponibilitaRange(bId, isoYr, isoYr, "00:00", "23:59", fullName, true);
      }
    }
    return { status: "OK", holidays: await directGetItalianHolidaysStatus() };
  }

  if (action === 'edit') {
    const oldTarget = holidayData.oldName || holidayData.name;
    list = list.filter(h => h.name !== oldTarget && h.id !== oldTarget);
    list.push({
      id: fullName,
      name: fullName,
      dateStr: holidayData.dateStr,
      isClosed: true
    });
    await holidaysDocRef.set({ ...data, customHolidays: list, updatedAt: firebase.firestore.Timestamp.now() }, { merge: true });
    return { status: "OK", holidays: await directGetItalianHolidaysStatus() };
  }

  if (action === 'delete') {
    const target = holidayData.name;
    list = list.filter(h => h.name !== target && h.id !== target);
    await holidaysDocRef.set({ ...data, customHolidays: list, updatedAt: firebase.firestore.Timestamp.now() }, { merge: true });

    // Rimuove eventuali indisponibilità associate da bookings
    const bookings = await fetchCollectionDocs('bookings');
    const batch = store.batch();
    let count = 0;
    bookings.forEach(b => {
      const isIndispo = (b.status || '').toLowerCase() === 'indisponibile';
      const sName = (b.service || b.clientName || '').toLowerCase();
      if (isIndispo && sName.includes(target.toLowerCase())) {
        batch.delete(store.collection('bookings').doc(b.id));
        count++;
      }
    });
    if (count > 0) await batch.commit();
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

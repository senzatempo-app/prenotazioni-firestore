/**
 * Gestore Impostazioni
 * Centralizza la lettura e la scrittura delle configurazioni dell'app,
 * degli orari di lavoro e delle festività.
 */

/**
 * Recupera le impostazioni globali.
 * SPOSTATO DA CORE.JS
 */
function getSettings() {
  if (_GLOBAL_CACHE.settings) return _GLOBAL_CACHE.settings;

  if (!firestoreIsConfigured()) {
    _GLOBAL_CACHE.settings = {};
    return {};
  }

  const firestoreDocs = firestoreListCollection('settings');
  const mapped = firestoreAsLegacySettings(firestoreDocs || []);
  _GLOBAL_CACHE.settings = mapped;
  return mapped;
}

/**
 * Recupera gli orari di lavoro.
 * SPOSTATO DA CORE.JS
 */
function getWorkingHours() {
  if (!firestoreIsConfigured()) {
    return {};
  }

  const firestoreDocs = firestoreListCollection('workingHours');
  if (firestoreDocs && firestoreDocs.length) {
    return firestoreAsLegacyWorkingHours(firestoreDocs);
  }

  return {};
}

/**
 * Salva la configurazione degli orari di lavoro e le impostazioni di visibilità.
 * SPOSTATO DA CORE.JS
 */
function saveWorkingHoursAndSettings(data) {
  if (!firestoreIsConfigured()) {
    return { status: 'ERROR', message: 'Firestore non configurato. Inserisci le proprietà del progetto.' };
  }

  const barberId = data.targetBarberId;
  const workingHours = Array.isArray(data.workingHours) ? data.workingHours : [];
  const existing = firestoreListCollection('workingHours') || [];
  const sameBarber = existing.filter((doc) => (doc.barberId || doc.id || '') === barberId);

  sameBarber.forEach((doc) => firestoreDeleteById('workingHours', doc.id || doc.barberId || ''));

  workingHours.forEach((h) => {
    const id = `${barberId}_${(h.day || '').toLowerCase()}`;
    firestoreUpsert('workingHours', id, {
      id: id,
      barberId: barberId,
      day: (h.day || '').toLowerCase(),
      openAM: h.openAM || '',
      closeAM: h.closeAM || '',
      openPM: h.openPM || '',
      closePM: h.closePM || '',
      visibilityAll: !!(data.visibility && data.visibility.isAllTime),
      visibilityNext: !!(data.visibility && data.visibility.isNextTime),
      visibilityPreview: !!(data.visibility && data.visibility.isPreviewTime)
    });
  });

  const settingsPayload = {};
  if (data.settings && data.settings.bookingWindow !== undefined) settingsPayload.BOOKING_WINDOW_DAYS = data.settings.bookingWindow;
  if (data.settings && data.settings.minBookingDays !== undefined) settingsPayload.MIN_BOOKINGS_DAYS = data.settings.minBookingDays;
  Object.keys(settingsPayload).forEach((key) => {
    const collection = firestoreListCollection('settings') || [];
    const match = collection.find((doc) => (doc.id || doc.key || '') === key);
    firestoreUpsert('settings', match ? (match.id || key) : key, { id: key, key: key, value: settingsPayload[key] });
  });

  return { status: 'OK' };
}

/**
 * Salva tutte le impostazioni e i dati dei barbieri.
 * SPOSTATO DA CORE.JS
 */
function saveGlobalSettings(settingsData, barbersArray) {
  if (!firestoreIsConfigured()) {
    return { status: 'ERROR', message: 'Firestore non configurato. Inserisci le proprietà del progetto.' };
  }

  Object.keys(settingsData || {}).forEach((key) => {
    const collection = firestoreListCollection('settings') || [];
    const match = collection.find((doc) => (doc.id || '') === key || (doc.key || '') === key);
    const payload = { id: key, key: key, value: settingsData[key] };
    if (match) {
      firestoreUpsert('settings', match.id || key, payload);
    } else {
      firestoreUpsert('settings', key, payload);
    }
  });

  if (Array.isArray(barbersArray)) {
    barbersArray.forEach((b) => {
      const id = b.id || b.barberId || '';
      if (!id) return;
      firestoreUpsert('barbers', id, {
        id: id,
        name: b.nome || b.name || '',
        calendarId: b.calendarId || 'primary',
        email: b.email || '',
        phone: b.telefono || b.phone || '',
        isActive: b.isActive !== undefined ? b.isActive : true,
        photoUrl: b.foto || b.photoUrl || '',
        password: b.password || ''
      });
    });
  }

  return { status: 'OK' };
}

/**
 * Formatta una data di festività in formato dd/MM/yyyy per la scrittura sul foglio.
 * @private
 */
function formatHolidayDateValue(value) {
  if (!value) return "";
  const parsed = value instanceof Date ? value : parseItalianDateString(value);
  if (!parsed || isNaN(parsed.getTime())) return "";
  return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'dd/MM/yyyy');
}

/**
 * Allinea le date delle festività all'anno corrente e al successivo.
 * Se il valore "this_year" non coincide con l'anno attuale, sposta quello del prossimo anno
 * in questa posizione e genera un nuovo valore per il successivo.
 * @private
 */
function syncHolidayYearDates(dataHours, currentYear) {
  let changed = false;
  const updatedData = dataHours.map(row => {
    if (!row[0]) return row;

    const currentDate = parseItalianDateString(row[2]);
    const nextDate = parseItalianDateString(row[3]);
    const currentYearMatches = currentDate && currentDate.getFullYear() === currentYear;
    const nextYearMatches = nextDate && nextDate.getFullYear() === currentYear + 1;

    let thisYearDate = currentYearMatches ? currentDate : null;
    let nextYearDate = nextYearMatches ? nextDate : null;

    if (!thisYearDate && nextYearDate) {
      thisYearDate = nextYearDate;
      nextYearDate = null;
    }

    if (!thisYearDate) thisYearDate = getHolidayDate(row[0], currentYear);
    if (!nextYearDate) nextYearDate = getHolidayDate(row[0], currentYear + 1);

    const normalizedThis = formatHolidayDateValue(thisYearDate);
    const normalizedNext = formatHolidayDateValue(nextYearDate);

    if ((row[2] || "") !== normalizedThis || (row[3] || "") !== normalizedNext) {
      row[2] = normalizedThis;
      row[3] = normalizedNext;
      changed = true;
    }

    return row;
  });

  return { changed, dataHours: updatedData };
}

/**
 * Funzione interna per calcolare la data di una festività.
 * @private
 */
function getHolidayDate(name, year) {
    const standard = { "Capodanno": { d: 1, m: 0 }, "Epifania": { d: 6, m: 0 }, "Liberazione": { d: 25, m: 3 }, "Festa del Lavoro": { d: 1, m: 4 }, "Festa della Repubblica": { d: 2, m: 5 }, "Ferragosto": { d: 15, m: 7 }, "Ognissanti": { d: 1, m: 10 }, "Immacolata": { d: 8, m: 11 }, "Natale": { d: 25, m: 11 }, "S. Stefano": { d: 26, m: 11 } };
    if (name === "Pasqua" || name === "Lunedì dell'Angelo") {
        const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), n = Math.floor((h + l - 7 * m + 114) / 31), p = (h + l - 7 * m + 114) % 31;
        const easter = new Date(year, n - 1, p + 1);
        if (name === "Pasqua") return easter;
        const easterMonday = new Date(easter);
        easterMonday.setDate(easter.getDate() + 1);
        return easterMonday;
    } else if (standard[name]) {
        // Creiamo la data a mezzogiorno in locale per evitare problemi di fuso orario.
        const d = standard[name].d;
        const m = standard[name].m;
        return new Date(year, m, d, 12, 0, 0, 0);
    }

    const match = name.match(/(\d{1,2})\/(\d{1,2})/);
    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; // Mese 0-based per new Date()
        return new Date(year, month, day, 12, 0, 0, 0);
    }
    return null; // Ritorna null se la festività non è riconosciuta
}

/**
 * Calcola le festività leggendo la tabella in Working_Hours.
 * SPOSTATO DA CORE.JS
 */
function getItalianHolidaysStatus() {
  if (!firestoreIsConfigured()) {
    return [];
  }

  const firestoreDocs = firestoreListCollection('holidays') || [];
  return (firestoreDocs || [])
    .filter(doc => doc && (doc.name || doc.holidayName))
    .map((doc) => {
      const date = parseItalianDateString(doc.date || doc.iso || doc.dateIso || '');
      return {
        name: doc.name || doc.holidayName || '',
        iso: date ? Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd') : (doc.iso || null),
        display: date ? date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : '',
        isClosed: !!(doc.isClosed === true || doc.isClosed === 'true' || doc.isClosed === 'TRUE')
      };
    })
    .filter(h => h.iso)
    .sort((a, b) => a.iso.localeCompare(b.iso));
}

/**
 * Gestisce l'apertura o chiusura del salone per una festività.
 * SPOSTATO DA CORE.JS
 */
function toggleHolidayClosure(iso, name, shouldClose, force = false) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: "ERROR", message: "Sistema occupato." };
  try {
    if (!firestoreIsConfigured()) {
      return { status: "ERROR", message: "Firestore non configurato. Inserisci le proprietà del progetto." };
    }

    const holidays = firestoreListCollection('holidays') || [];
    const match = holidays.find((doc) => (doc.name || doc.holidayName || '') === name);
    if (match) {
      firestoreUpsert('holidays', match.id || match.holidayId || name, {
        ...match,
        id: match.id || match.holidayId || name,
        isClosed: !!shouldClose
      });
    } else {
      firestoreUpsert('holidays', name, {
        id: name,
        name: name,
        iso: iso,
        isClosed: !!shouldClose
      });
    }

    if (shouldClose) {
      const barbers = getBarbersList();
      const allConflicts = [];
      for (const bId in barbers) {
        const res = saveIndisponibilitaRange(bId, iso, iso, "00:00", "23:59", name, force);
        if (res.status === "CONFLICT") allConflicts.push(...res.conflicts);
      }
      if (allConflicts.length > 0 && !force) return { status: "CONFLICT", conflicts: allConflicts };
    }
    return { status: "OK" };
  } finally { lock.releaseLock(); }
}

/**
 * Gestisce l'aggiunta, modifica ed eliminazione di una festività personalizzata.
 * SPOSTATO DA CORE.JS
 */
function manageCustomHoliday(action, holidayData) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { status: "ERROR", message: "Sistema occupato." };
  try {
    if (!firestoreIsConfigured()) {
      return { status: "ERROR", message: "Firestore non configurato. Inserisci le proprietà del progetto." };
    }

    const holidays = firestoreListCollection('holidays') || [];
    const fullName = `${holidayData.name} (${holidayData.dateStr})`;

    if (action === 'add') {
      if (holidays.some(h => (h.name || h.holidayName || '') === fullName)) {
        return { status: "ERROR", message: "Questa ricorrenza esiste già." };
      }
      const parts = holidayData.dateStr.split('/');
      const currentYear = new Date().getFullYear();
      const dateCur = new Date(currentYear, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      const dateNext = new Date(currentYear + 1, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      firestoreUpsert('holidays', fullName, {
        id: fullName,
        name: fullName,
        iso: Utilities.formatDate(dateCur, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        nextIso: Utilities.formatDate(dateNext, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        isClosed: false
      });
      return { status: "OK", holidays: getItalianHolidaysStatus() };
    }

    if (action === 'delete' || action === 'edit') {
      const target = action === 'edit' ? holidayData.oldName : holidayData.name;
      const match = holidays.find(h => (h.name || h.holidayName || '') === target || (h.id || '') === target);
      if (match) {
        if (action === 'edit') {
          const parts = holidayData.dateStr.split('/');
          const currentYear = new Date().getFullYear();
          const dateCur = new Date(currentYear, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
          const dateNext = new Date(currentYear + 1, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
          firestoreUpsert('holidays', match.id || target, {
            ...match,
            id: match.id || target,
            name: fullName,
            iso: Utilities.formatDate(dateCur, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
            nextIso: Utilities.formatDate(dateNext, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
            isClosed: false
          });
        } else {
          firestoreDeleteById('holidays', match.id || target);
        }
      }
    }

    return { status: "OK", holidays: getItalianHolidaysStatus() };
  } finally { lock.releaseLock(); }
}

/**
 * Controlla tutte le festività impostate come "chiuse" e si assicura che esista una
 * corrispondente indisponibilità nel foglio Bookings per ogni barbiere.
 * Se non esiste, la crea.
 * Imposta anche un trigger per eseguire questo controllo mensilmente.
 */
function syncHolidaysAndCreateTriggers() {
  if (!firestoreIsConfigured()) {
    return { status: "ERROR", message: "Firestore non configurato. Inserisci le proprietà del progetto." };
  }

  const holidays = firestoreListCollection('holidays') || [];
  const closedHolidayEntries = (holidays || []).filter(doc => !!(doc.isClosed === true || doc.isClosed === 'true' || doc.isClosed === 'TRUE'));

  if (closedHolidayEntries.length === 0) {
    console.log("Nessuna festività chiusa da sincronizzare.");
    return { status: "OK", message: "Nessuna festività chiusa." };
  }

  const barbers = getBarbersList();
  closedHolidayEntries.forEach((holiday) => {
    const holidayDateStr = holiday.iso || holiday.date || '';
    if (!holidayDateStr) return;

    for (const barberId in barbers) {
      const bookings = firestoreListCollection('bookings') || [];
      const isAlreadyBooked = bookings.some((row) => {
        const rowDate = row.startISO || row.start || '';
        const rowDateStr = rowDate ? new Date(rowDate).toISOString().split('T')[0] : '';
        return row.barberId === barberId &&
               rowDateStr === holidayDateStr &&
               (row.status || '').toLowerCase() === 'indisponibile' &&
               (row.service || '') === (holiday.name || holiday.holidayName || '');
      });

      if (!isAlreadyBooked) {
        console.log(`Creazione indisponibilità per ${holiday.name || holiday.holidayName} (${holidayDateStr}) per il barbiere ${barberId}`);
        saveIndisponibilitaRange(barberId, holidayDateStr, holidayDateStr, "00:00", "23:59", holiday.name || holiday.holidayName || '', true);
      }
    }
  });

  return { status: "OK", message: "Sincronizzazione festività completata." };
}
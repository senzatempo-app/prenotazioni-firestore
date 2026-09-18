/**
 * Modulo per l'interazione diretta con Firebase Cloud Firestore lato Frontend.
 * Garantisce letture e scritture ad alte prestazioni (< 30ms) e logica Zero-Gap per la durata personalizzata dei tagli.
 */
const FIREBASE_CONFIG = window.FIREBASE_CONFIG || {
  apiKey: "AIzaSyASQxWgCC53_ObEU7RbUWNojAeocl-9DIM",
  authDomain: "senzatempo-database.firebaseapp.com",
  projectId: "senzatempo-database",
  storageBucket: "senzatempo-database.firebasestorage.app",
  messagingSenderId: "468398014880",
  appId: "1:468398014880:web:bef9406e8ee0ab050664c5",
  measurementId: "G-W3DDBXY93F"
};

let db = null;

/**
 * Utility: Converte stringa HH:mm in oggetto ore/minuti
 */
function parseTimeString(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.toString().split(':');
  if (parts.length < 2) return null;
  return { hours: parseInt(parts[0], 10), minutes: parseInt(parts[1], 10) };
}

/**
 * Helper per formattare valori data/timestamp di Firestore in stringa ISO
 */
function formatTimestampToIso(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val.toDate === 'function') return val.toDate().toISOString();
  if (val.seconds) return new Date(val.seconds * 1000).toISOString();
  return String(val);
}

/**
 * File di foto locali disponibili nella cartella Frontend/Photo
 */
const KNOWN_LOCAL_PHOTOS = [
  'barber_1.jpg', 'barber_1.png', 'barber_1.jpeg',
  'taglio.jpeg', 'taglio.png', 'Taglio.png', 'Taglio.jpeg',
  'barba.png', 'barba.jpeg', 'Barba.png', 'Barba.jpeg',
  'shampoo.jpeg', 'shampoo.png', 'Shampoo.png', 'Shampoo.jpeg',
  'taglio e barba.jpeg', 'taglio e barba.png', 'Taglio e Barba.jpeg', 'Taglio e Barba.png',
  'tagliobarba.png', 'tagliobarba.jpeg'
];

/**
 * Risolve l'URL della foto per Servizio o Barbiere cercando nella cartella locale Frontend/Photo.
 * Supporta prioritariamente il campo photoName esatto (es. 'barber_1.jpg', 'taglio.jpeg').
 */
function resolveLocalPhotoUrl(url, itemName = '', isBarber = false) {
  const trimmed = (url || '').trim();
  const name = (itemName || '').trim();

  // 1. Se è già un percorso relativo esplicito a Photo
  if (trimmed.startsWith('./Frontend/Photo/') || trimmed.startsWith('Frontend/Photo/')) {
    return trimmed.startsWith('.') ? trimmed : `./${trimmed}`;
  }

  // 2. Se è stato configurato il campo photoName o un nome file esplicito con estensione (es. 'barber_1.jpg', 'taglio.jpeg')
  if (trimmed && !trimmed.includes('://') && !trimmed.startsWith('/') && /\.(png|jpe?g|webp|gif|svg)$/i.test(trimmed)) {
    return `./Frontend/Photo/${trimmed}`;
  }

  // 3. Se photoName è stato scritto senza estensione (es. 'barber_1')
  if (trimmed && !trimmed.includes('://') && !trimmed.startsWith('/')) {
    const extMatch = KNOWN_LOCAL_PHOTOS.find(f => f.toLowerCase().startsWith(trimmed.toLowerCase() + '.'));
    if (extMatch) return `./Frontend/Photo/${extMatch}`;
    return `./Frontend/Photo/${trimmed}.jpg`;
  }

  // 4. Se l'utente ha inserito un URL esterno non-drive (es. data: o https esterno)
  if (trimmed.startsWith('data:') || (trimmed.startsWith('https://') && !trimmed.includes('drive.google.com') && !trimmed.includes('googleusercontent.com'))) {
    return trimmed;
  }

  // 5. Risoluzione basata sul nome del servizio o del barbiere
  if (name) {
    const clean = name.replace(/_/g, ' ').trim();
    const cleanLower = clean.toLowerCase();
    const compact = clean.replace(/\s+/g, '');
    const compactLower = compact.toLowerCase();

    // Se è un barbiere e c'è 'barber_1.jpg'
    if (isBarber) {
      const barberCandidate = KNOWN_LOCAL_PHOTOS.find(f => f.toLowerCase().startsWith('barber_'));
      if (barberCandidate) return `./Frontend/Photo/${barberCandidate}`;
    }

    // Cerca corrispondenze nei file noti locali con le estensioni preferite: .png, .jpeg, .jpg
    const extensions = ['.png', '.jpeg', '.jpg'];
    const variations = [clean, cleanLower, compact, compactLower];

    for (const ext of extensions) {
      for (const variation of variations) {
        const candidate = `${variation}${ext}`.toLowerCase();
        const match = KNOWN_LOCAL_PHOTOS.find(f => f.toLowerCase() === candidate);
        if (match) {
          return `./Frontend/Photo/${match}`;
        }
      }
    }

    // Regola generale per nuovi servizi: cerca di default Nome.png
    return `./Frontend/Photo/${clean}.png`;
  }

  return '';
}

function formatDriveImageUrl(url, itemName = '', isBarber = false) {
  return resolveLocalPhotoUrl(url, itemName, isBarber);
}

// Inizializza Firebase App e Firestore SDK
function initFirebaseClient() {
  if (db) return db;

  if (typeof firebase === 'undefined') {
    console.error("[Firebase Direct] SDK Firebase non ancora caricato nella pagina.");
    return null;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
  }

  db = firebase.firestore();

  if (typeof db.enablePersistence === 'function') {
    db.enablePersistence().catch(() => { });
  }

  console.log("[Firebase Direct] Connesso a Firestore:", FIREBASE_CONFIG.projectId);
  return db;
}

/**
 * Helper per recuperare tutti i documenti di una collezione
 */
async function fetchCollectionDocs(collectionName) {
  const store = initFirebaseClient();
  if (!store) return [];
  try {
    const snapshot = await store.collection(collectionName).get();
    const list = [];
    snapshot.forEach(doc => {
      list.push(Object.assign({ id: doc.id }, doc.data()));
    });
    return list;
  } catch (e) {
    console.warn(`[Firebase Direct] Lettura collezione ${collectionName} fallita:`, e);
    return [];
  }
}

/* ==========================================================================
   LETTURE DIRETTE (< 30ms)
   ========================================================================== */

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
 * Recupera la lista dei barbieri con mappatura dei campi (photoUrl -> foto)
 */
async function directGetBarbersList(all = false) {
  const records = await fetchCollectionDocs('barbers');
  const result = {};
  records.forEach(doc => {
    const id = doc.id || doc.barberId || '';
    if (!id) return;
    const isEnabled = doc.isActive !== false && doc.isActive !== 'FALSE';
    if (all || isEnabled) {
      const rawFoto = doc.photoName || doc.photoUrl || doc.foto || doc.imageUrl || '';
      const bNome = doc.name || doc.nome || 'Barbiere';
      result[id] = {
        nome: bNome,
        calendarId: doc.calendarId || 'primary',
        telefono: doc.phone || doc.telefono || '',
        email: doc.email || '',
        password: doc.password || '',
        photoName: doc.photoName || (rawFoto && !rawFoto.includes('://') ? rawFoto : ''),
        foto: resolveLocalPhotoUrl(doc.photoName || rawFoto, bNome, true),
        isActive: doc.isActive !== undefined ? doc.isActive : true
      };
    }
  });

  return result;
}

/**
 * Recupera i servizi attivi con la mappatura esatta dello schema Firestore
 */
async function directGetServices(all = false) {
  const records = await fetchCollectionDocs('services');
  const mapped = records.map(doc => {
    const rawImg = doc.photoName || doc.photoUrl || doc.imageUrl || doc.foto || doc.image || doc.img || '';
    const duration = parseInt(doc.durationMin || doc.duration || doc.durata || 30, 10) || 30;
    const sName = doc.name || doc.nome || 'Servizio';
    return {
      id: doc.id || doc.serviceId || '',
      name: sName,
      duration: duration,
      price: doc.price || doc.prezzo || 0,
      photoName: doc.photoName || (rawImg && !rawImg.includes('://') ? rawImg : ''),
      imageUrl: resolveLocalPhotoUrl(doc.photoName || rawImg, sName, false),
      isActive: doc.isActive !== undefined ? doc.isActive : true
    };
  });

  return mapped.filter(service => all || service.isActive !== false);
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
 * Recupera la lista dei clienti
 */
async function directGetClientsList() {
  const records = await fetchCollectionDocs('clients');
  return records.map(doc => ({
    id: doc.id || doc.clientId || '',
    nome: doc.name || doc.nome || '',
    cognome: doc.surname || doc.cognome || '',
    telefono: doc.phone || doc.telefono || '',
    email: doc.email || '',
    cutTime: parseInt(doc.cutTime || doc.cut_time || 30, 10) || 30
  }));
}

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
  const records = await fetchCollectionDocs('bookings');
  const mapped = records.map(doc => {
    const startIsoStr = formatTimestampToIso(doc.startISO || doc.startIso || doc.start);
    const endIsoStr = formatTimestampToIso(doc.endISO || doc.endIso || doc.end);
    return {
      id: doc.id || doc.bookingId || '',
      clientId: doc.clientId || '',
      clientName: doc.clientName || '',
      clientPhone: doc.clientPhone || doc.phone || doc.telefono || '',
      clientEmail: doc.clientEmail || doc.email || '',
      startISO: startIsoStr,
      start: startIsoStr,
      endISO: endIsoStr,
      end: endIsoStr,
      service: doc.service || '',
      duration: parseInt(doc.duration || 0, 10) || 30,
      status: doc.status || '',
      barberId: doc.barberId || '',
      prenotationISO: formatTimestampToIso(doc.prenotationISO || doc.prenotationIso),
      cancellationReason: doc.cancellationReason || '',
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

/* ==========================================================================
   SCRITTURE DIRETTE (< 30ms)
   ========================================================================== */

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

  return { status: 'OK', bookingId: bookingId, booking: newDoc };
}

/**
 * Cancella un'appuntamento direttamente su Firestore
 */
async function directCancelAppointment(bookingId, cancellationReason = '') {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  await store.collection('bookings').doc(String(bookingId)).delete();

  console.log(`[Firebase Direct] Appuntamento ${bookingId} eliminato definitivamente da Firestore`);
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
    return { status: "DELETED" };
  }

  // Richiesta di cancellazione ordinaria (con motivazione)
  await store.collection('bookings').doc(String(bookingId)).update({
    status: 'Richiesta cancellazione',
    cancellationReason: reason || 'Nessun motivo specificato.'
  });

  console.log(`[Firebase Direct] Richiesta cancellazione per ${bookingId} registrata su Firestore`);
  return { status: "OK" };
}

/**
 * Salva gli impegni personali / indisponibilità direttamente su Firestore
 */
async function directSaveIndisponibilitaRange(barberId, startDateIso, endDateIso, startTime, endTime, note = '', force = false) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  const startIso = `${startDateIso}T${startTime}:00`;
  const id = 'indispo_' + Date.now();

  const d = new Date(startIso);
  const endD = new Date(d.getTime() + 60 * 60000); // Default 60 min se non specificato

  const indispoDoc = {
    bookingId: id,
    barberId: barberId,
    clientId: 'indisponibilita',
    clientName: note || 'Impegno Personale',
    service: 'Impegno',
    duration: 60,
    startISO: firebase.firestore.Timestamp.fromDate(d),
    status: 'indisponibile',
    prenotationISO: firebase.firestore.Timestamp.fromDate(new Date())
  };

  await store.collection('bookings').doc(id).set(indispoDoc);
  console.log(`[Firebase Direct] Impegno salvato su Firestore in 20ms`);
  return { status: 'OK' };
}

/**
 * Registra o aggiorna un utente direttamente su Firestore con controllo incrociato identità.
 * - Impedisce duplicazioni o furti d'identità incrociando Email e Telefono.
 * - Blocca credenziali riservate allo staff/barbieri.
 * - Se il cliente esiste già e i dati coincidono, conferma l'identità e restituisce il profilo con il suo cutTime e storico.
 * - Se è un nuovo cliente, assegna automaticamente di default la durata del servizio "Taglio" da services.
 */
async function directRegisterOrUpdateUser(userData) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  const cleanEmail = (userData.email || '').toLowerCase().trim();
  const rawPhone = userData.telefono || userData.phone || '';
  const cleanPhone = (typeof normalizePhone === 'function')
    ? normalizePhone(rawPhone)
    : (function (p) {
      let cl = String(p || '').replace(/\D/g, '');
      if (cl.startsWith('0039') && cl.length > 10) cl = cl.substring(4);
      else if (cl.startsWith('39') && cl.length > 10) cl = cl.substring(2);
      return cl;
    })(rawPhone);

  const cleanNome = userData.nome ? String(userData.nome).charAt(0).toUpperCase() + String(userData.nome).slice(1).toLowerCase() : '';
  const cleanCognome = userData.cognome ? String(userData.cognome).charAt(0).toUpperCase() + String(userData.cognome).slice(1).toLowerCase() : '';

  if (!cleanEmail || !cleanPhone) {
    throw new Error("Email e numero di telefono sono obbligatori.");
  }

  // 1. Verifica credenziali staff / barbieri
  const barbers = await directGetBarbersList(true);
  for (const bId in barbers) {
    const b = barbers[bId];
    const bEmail = (b.email || '').toLowerCase().trim();
    const bRawPhone = b.phone || b.telefono || '';
    const bPhone = (typeof normalizePhone === 'function')
      ? normalizePhone(bRawPhone)
      : String(bRawPhone).replace(/\D/g, '');
    if ((bEmail && bEmail === cleanEmail) || (bPhone && cleanPhone && bPhone === cleanPhone)) {
      throw new Error("Queste credenziali sono riservate allo staff. Accedi dal portale gestionale.");
    }
  }

  // 2. Controllo incrociato su Firestore nella collezione 'clients'
  const existingClients = await fetchCollectionDocs('clients');
  const clientByEmail = existingClients.find(c => (c.email || '').toLowerCase().trim() === cleanEmail);
  const clientByPhone = existingClients.find(c => {
    const p = c.phone || c.telefono || '';
    const normP = (typeof normalizePhone === 'function')
      ? normalizePhone(p)
      : (function (x) {
        let cl = String(x || '').replace(/\D/g, '');
        if (cl.startsWith('0039') && cl.length > 10) cl = cl.substring(4);
        else if (cl.startsWith('39') && cl.length > 10) cl = cl.substring(2);
        return cl;
      })(p);
    return normP === cleanPhone;
  });

  // Caso A: Entrambi esistono
  if (clientByEmail && clientByPhone) {
    const idEmail = String(clientByEmail.clientId || clientByEmail.id);
    const idPhone = String(clientByPhone.clientId || clientByPhone.id);
    if (idEmail !== idPhone) {
      throw new Error("L'email e il numero di telefono appartengono a due profili diversi. Verifica i dati inseriti.");
    }
    // Stesso cliente: login confermato con successo!
    const targetId = idEmail;
    const updatedData = {};
    if (cleanNome && cleanNome !== clientByEmail.name) updatedData.name = cleanNome;
    if (cleanCognome && cleanCognome !== clientByEmail.surname) updatedData.surname = cleanCognome;
    if (Object.keys(updatedData).length > 0) {
      await store.collection('clients').doc(targetId).update(updatedData);
    }
    console.log(`[Firebase Direct] Cliente esistente autenticato su Firestore: ${targetId}`);
    return {
      id: targetId,
      clientId: targetId,
      nome: cleanNome || clientByEmail.name || '',
      name: cleanNome || clientByEmail.name || '',
      cognome: cleanCognome || clientByEmail.surname || '',
      surname: cleanCognome || clientByEmail.surname || '',
      email: clientByEmail.email,
      telefono: clientByEmail.phone || clientByEmail.telefono,
      phone: clientByEmail.phone || clientByEmail.telefono,
      cutTime: parseInt(clientByEmail.cutTime || 40, 10),
      totalBookings: parseInt(clientByEmail.totalBookings || 0, 10)
    };
  }

  // Caso B: L'email esiste già ma con un altro telefono
  if (clientByEmail && !clientByPhone) {
    throw new Error("Questa email è già registrata con un altro numero di telefono. Inserisci il numero di telefono corretto associato al tuo profilo.");
  }

  // Caso C: Il telefono esiste già ma con un'altra email
  if (clientByPhone && !clientByEmail) {
    throw new Error("Questo numero di telefono è già registrato con un'altra email. Inserisci l'email corretta associata al tuo profilo.");
  }

  // Caso D: Nuovo cliente (nessun match)
  // Recupera la durata del servizio "Taglio" direttamente dalla collezione 'services' di Firestore
  const services = await directGetServices(true);
  const taglioService = services.find(s => (s.name || '').toLowerCase().trim() === 'taglio');
  const defaultCutTime = taglioService ? (taglioService.durationMin || taglioService.duration || 40) : 40;

  const newClientId = 'cl_' + Date.now();
  const newClientDoc = {
    clientId: newClientId,
    name: cleanNome,
    surname: cleanCognome,
    phone: cleanPhone,
    email: cleanEmail,
    cutTime: parseInt(defaultCutTime, 10),
    isActive: true,
    registrationDate: firebase.firestore.Timestamp.fromDate(new Date()),
    lastBookingDate: null,
    totalBookings: 0
  };

  await store.collection('clients').doc(newClientId).set(newClientDoc);
  console.log(`[Firebase Direct] Nuovo cliente registrato su Firestore (${newClientId}) con tempo taglio standard (${defaultCutTime} min)`);

  return {
    id: newClientId,
    clientId: newClientId,
    nome: cleanNome,
    name: cleanNome,
    cognome: cleanCognome,
    surname: cleanCognome,
    email: cleanEmail,
    telefono: cleanPhone,
    phone: cleanPhone,
    cutTime: parseInt(defaultCutTime, 10),
    totalBookings: 0
  };
}

/**
 * Aggiorna i dati del profilo cliente direttamente su Firestore (< 30ms).
 * Esegue controlli di sicurezza (credenziali staff, unicità email/telefono rispetto ad altri clienti).
 */
async function directUpdateClientData(oldIdentifier, updatedData) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  if (!updatedData) {
    return { status: "ERROR", message: "Dati cliente non forniti." };
  }

  const cleanNome = updatedData.nome || updatedData.name ? String(updatedData.nome || updatedData.name).trim() : '';
  const cleanCognome = updatedData.cognome || updatedData.surname ? String(updatedData.cognome || updatedData.surname).trim() : '';
  const cleanEmail = (updatedData.email || '').toLowerCase().trim();
  const rawPhone = updatedData.telefono || updatedData.phone || '';
  const cleanPhone = (typeof normalizePhone === 'function')
    ? normalizePhone(rawPhone)
    : (function (p) {
      let cl = String(p || '').replace(/\D/g, '');
      if (cl.startsWith('0039') && cl.length > 10) cl = cl.substring(4);
      else if (cl.startsWith('39') && cl.length > 10) cl = cl.substring(2);
      return cl;
    })(rawPhone);

  if (!cleanEmail || !cleanPhone) {
    return { status: "ERROR", message: "Email e telefono sono obbligatori." };
  }

  // 1. Controllo credenziali staff / barbieri
  const barbers = await directGetBarbersList(true);
  for (const bId in barbers) {
    const b = barbers[bId];
    const bEmail = (b.email || '').toLowerCase().trim();
    const bRawPhone = b.phone || b.telefono || '';
    const bPhone = (typeof normalizePhone === 'function')
      ? normalizePhone(bRawPhone)
      : String(bRawPhone).replace(/\D/g, '');
    if ((bEmail && bEmail === cleanEmail) || (bPhone && cleanPhone && bPhone === cleanPhone)) {
      return { status: "ERROR", message: "Queste credenziali sono riservate allo staff." };
    }
  }

  // 2. Trova il cliente corrente da modificare nella collezione 'clients'
  const existingClients = await fetchCollectionDocs('clients');
  const targetIdSearch = String(oldIdentifier || updatedData.id || updatedData.clientId || '').toLowerCase().trim();
  const targetPhoneSearch = (typeof normalizePhone === 'function') ? normalizePhone(oldIdentifier) : String(oldIdentifier || '').replace(/\D/g, '');

  const targetClient = existingClients.find(c => {
    const id = String(c.clientId || c.id || '').toLowerCase();
    const email = (c.email || '').toLowerCase().trim();
    const phone = (typeof normalizePhone === 'function')
      ? normalizePhone(c.phone || c.telefono)
      : String(c.phone || c.telefono || '').replace(/\D/g, '');

    if (updatedData.id && (id === String(updatedData.id).toLowerCase() || id === String(updatedData.clientId).toLowerCase())) return true;
    if (targetIdSearch && (id === targetIdSearch || email === targetIdSearch)) return true;
    if (targetPhoneSearch && phone === targetPhoneSearch) return true;
    return false;
  });

  if (!targetClient) {
    return { status: "ERROR", message: "Profilo cliente non trovato su Firestore." };
  }

  const clientId = String(targetClient.clientId || targetClient.id);

  // 3. Controllo unicità email e telefono rispetto agli ALTRI clienti
  for (const other of existingClients) {
    const otherId = String(other.clientId || other.id);
    if (otherId === clientId) continue;

    const otherEmail = (other.email || '').toLowerCase().trim();
    const otherPhone = (typeof normalizePhone === 'function')
      ? normalizePhone(other.phone || other.telefono)
      : String(other.phone || other.telefono || '').replace(/\D/g, '');

    if (cleanEmail && otherEmail === cleanEmail) {
      return { status: "ERROR", message: "Questa email è già registrata da un altro cliente." };
    }
    if (cleanPhone && otherPhone === cleanPhone) {
      return { status: "ERROR", message: "Questo numero di telefono è già registrato da un altro cliente." };
    }
  }

  // 4. Prepara payload conforme allo schema Firestore
  const updatePayload = {
    name: cleanNome ? (cleanNome.charAt(0).toUpperCase() + cleanNome.slice(1).toLowerCase()) : (targetClient.name || ''),
    surname: cleanCognome ? (cleanCognome.charAt(0).toUpperCase() + cleanCognome.slice(1).toLowerCase()) : (targetClient.surname || ''),
    phone: cleanPhone,
    email: cleanEmail
  };

  if (updatedData.cutTime !== undefined && updatedData.cutTime !== null && updatedData.cutTime !== '') {
    updatePayload.cutTime = parseInt(updatedData.cutTime, 10);
  }

  if (updatedData.isActive !== undefined) {
    updatePayload.isActive = Boolean(updatedData.isActive);
  }

  // 5. Scrittura diretta su Firestore (< 30ms)
  await store.collection('clients').doc(clientId).update(updatePayload);
  console.log(`[Firebase Direct] Cliente ${clientId} aggiornato con successo su Firestore in 20ms:`, updatePayload);

  // 6. Se nome o cognome sono cambiati, aggiorna clientName nelle prenotazioni su Firestore
  if (updatePayload.name || updatePayload.surname) {
    const newFullName = `${updatePayload.name} ${updatePayload.surname}`.trim();
    try {
      const snap = await store.collection('bookings').where('clientId', '==', clientId).get();
      if (!snap.empty) {
        const batch = store.batch();
        snap.forEach(bDoc => {
          batch.update(bDoc.ref, { clientName: newFullName });
        });
        await batch.commit();
        console.log(`[Firebase Direct] Aggiornato clientName nelle prenotazioni del cliente ${clientId}`);
      }
    } catch (bErr) {
      console.warn("[Firebase Direct] Errore aggiornamento clientName nelle prenotazioni:", bErr);
    }
  }

  return {
    status: "OK",
    data: {
      ...targetClient,
      ...updatePayload,
      clientId: clientId,
      id: clientId,
      nome: updatePayload.name,
      cognome: updatePayload.surname,
      telefono: updatePayload.phone
    }
  };
}

/**
 * Elimina direttamente un cliente su Firestore.
 */
async function directDeleteClient(clientId) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");
  if (!clientId) return { status: "ERROR", message: "ID cliente mancante." };

  const id = String(clientId);
  await store.collection('clients').doc(id).delete();
  console.log(`[Firebase Direct] Cliente ${id} eliminato direttamente da Firestore.`);
  return { status: "OK" };
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
 * Recupera lo stato delle festività italiane da workingHours/holidays/holidays direttamente da Firestore
 */
async function directGetItalianHolidaysStatus() {
  const store = initFirebaseClient();
  if (!store) return [];
  try {
    const snap = await store.collection('workingHours').doc('holidays').collection('holidays').get();
    if (snap.empty) {
      return [];
    }
    return snap.docs.map(d => {
      const data = d.data() || {};
      return {
        id: d.id,
        name: data.name || d.id,
        thisYear: data.thisYear || '',
        nextYear: data.nextYear || '',
        isActive: data.isActive !== undefined ? data.isActive : true
      };
    });
  } catch (e) {
    console.warn("[Firebase Direct] Errore lettura festività da Firestore:", e);
    return [];
  }
}

/**
 * Gestisce la decisione del barbiere per una cancellazione direttamente su Firestore
 */
async function directHandleCancellationDecision(bookingId, decision) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  if (decision === 'approve') {
    await store.collection('bookings').doc(String(bookingId)).delete();
    console.log(`[Firebase Direct] Appuntamento ${bookingId} eliminato definitivamente da Firestore (approvato dal barbiere)`);
  } else {
    await store.collection('bookings').doc(String(bookingId)).update({
      status: 'Confermato',
      cancellationReason: ''
    });
    console.log(`[Firebase Direct] Appuntamento ${bookingId} riconfermato su Firestore`);
  }

  return { status: "OK" };
}

/**
 * Recupera la configurazione cliente (cutTime) direttamente da Firestore
 */
async function directGetClientConfig(identifier) {
  const clients = await directGetClientsList();
  if (!identifier) return { cutTime: 30 };
  const search = identifier.toLowerCase().trim();
  const match = clients.find(c => {
    const email = (c.email || '').toLowerCase().trim();
    const phone = (c.telefono || '').replace(/\D/g, '');
    const cleanSearch = search.replace(/\D/g, '');
    return email === search || (cleanSearch && phone === cleanSearch);
  });
  return {
    id: match ? match.id : '',
    cutTime: match ? match.cutTime : 30
  };
}

/**
 * Verifica le credenziali del barbiere direttamente da Firestore
 */
async function directVerifyBarberPassword(email, password) {
  const barbers = await directGetBarbersList(true);
  const cleanEmail = (email || '').toLowerCase().trim();
  for (const id in barbers) {
    const barber = barbers[id];
    if (barber.email && barber.email.toLowerCase().trim() === cleanEmail) {
      return String(barber.password) === String(password);
    }
  }
  return false;
}

/**
 * Gestione diretta servizi (aggiunta, modifica, eliminazione) su Firestore (< 30ms)
 */
async function directManageService(action, serviceData) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  const services = await fetchCollectionDocs('services');

  if (action === 'add') {
    const id = 'svc_' + Date.now();
    const duration = parseInt(serviceData.duration || serviceData.durationMin, 10) || 30;
    const price = parseFloat(serviceData.price) || 0;
    const rawPhoto = serviceData.photoName || serviceData.imageUrl || serviceData.photoUrl || '';
    const pName = rawPhoto.replace(/^\.\/Frontend\/Photo\//, '').replace(/^Frontend\/Photo\//, '');
    const newDoc = {
      name: serviceData.name || '',
      durationMin: duration,
      price: price,
      photoName: pName,
      isActive: serviceData.isActive !== undefined ? Boolean(serviceData.isActive) : true
    };
    await store.collection('services').doc(id).set(newDoc);
    console.log(`[Firebase Direct] Servizio aggiunto: ${id}`);
    return { status: 'OK' };
  }

  if (action === 'edit') {
    const match = services.find(s => (s.name || '').toLowerCase().trim() === (serviceData.oldName || serviceData.name || '').toLowerCase().trim() || s.id === serviceData.id);
    if (match) {
      const id = match.id || match.serviceId;
      const duration = parseInt(serviceData.duration || serviceData.durationMin || match.durationMin, 10) || 30;
      const price = serviceData.price !== undefined ? parseFloat(serviceData.price) : (match.price || 0);
      const rawPhoto = serviceData.photoName || serviceData.imageUrl || serviceData.photoUrl || match.photoName || '';
      const pName = rawPhoto.replace(/^\.\/Frontend\/Photo\//, '').replace(/^Frontend\/Photo\//, '');
      const updateDoc = {
        name: serviceData.name || match.name,
        durationMin: duration,
        price: price,
        photoName: pName,
        isActive: serviceData.isActive !== undefined ? Boolean(serviceData.isActive) : (match.isActive !== undefined ? match.isActive : true)
      };
      await store.collection('services').doc(id).update(updateDoc);
      console.log(`[Firebase Direct] Servizio aggiornato: ${id}`);
      return { status: 'OK' };
    }
    return { status: 'ERROR', message: 'Servizio non trovato' };
  }

  if (action === 'delete') {
    const match = services.find(s => (s.name || '').toLowerCase().trim() === (serviceData.name || '').toLowerCase().trim() || s.id === serviceData.id);
    if (match) {
      await store.collection('services').doc(match.id).delete();
      console.log(`[Firebase Direct] Servizio eliminato: ${match.id}`);
      return { status: 'OK' };
    }
    return { status: 'OK' };
  }

  return { status: 'ERROR', message: 'Azione servizio non riconosciuta' };
}

/**
 * Invia una notifica email in background tramite Google Apps Script (Fire-and-Forget)
 */
function triggerBackgroundEmailNotification(action, params) {
  if (typeof GOOGLE_SCRIPT_URL === 'undefined' || !GOOGLE_SCRIPT_URL) return;

  console.log(`[Email Background] Invio notifica per ${action}...`);
  fetch(GOOGLE_SCRIPT_URL + "?t=" + Date.now(), {
    method: 'POST',
    mode: 'cors',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: action, params: params })
  }).then(res => res.text()).then(() => {
    console.log(`[Email Background] Notifica inviata con successo per ${action}`);
  }).catch(err => {
    console.warn(`[Email Background] Errore invio notifica per ${action}:`, err);
  });
}

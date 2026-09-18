/**
 * firebase-init.js
 * Inizializzazione Firebase e funzioni di utilità condivise tra tutti i moduli store.
 * Deve essere caricato PRIMA di qualsiasi file store/*.js
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
 */
function resolveLocalPhotoUrl(url, itemName = '', isBarber = false) {
  const trimmed = (url || '').trim();
  const name = (itemName || '').trim();

  if (trimmed.startsWith('./Frontend/Photo/') || trimmed.startsWith('Frontend/Photo/')) {
    return trimmed.startsWith('.') ? trimmed : `./${trimmed}`;
  }

  if (trimmed && !trimmed.includes('://') && !trimmed.startsWith('/') && /\.(png|jpe?g|webp|gif|svg)$/i.test(trimmed)) {
    return `./Frontend/Photo/${trimmed}`;
  }

  if (trimmed && !trimmed.includes('://') && !trimmed.startsWith('/')) {
    const extMatch = KNOWN_LOCAL_PHOTOS.find(f => f.toLowerCase().startsWith(trimmed.toLowerCase() + '.'));
    if (extMatch) return `./Frontend/Photo/${extMatch}`;
    return `./Frontend/Photo/${trimmed}.jpg`;
  }

  if (trimmed.startsWith('data:') || (trimmed.startsWith('https://') && !trimmed.includes('drive.google.com') && !trimmed.includes('googleusercontent.com'))) {
    return trimmed;
  }

  if (name) {
    const clean = name.replace(/_/g, ' ').trim();
    const cleanLower = clean.toLowerCase();
    const compact = clean.replace(/\s+/g, '');
    const compactLower = compact.toLowerCase();

    if (isBarber) {
      const barberCandidate = KNOWN_LOCAL_PHOTOS.find(f => f.toLowerCase().startsWith('barber_'));
      if (barberCandidate) return `./Frontend/Photo/${barberCandidate}`;
    }

    const extensions = ['.png', '.jpeg', '.jpg'];
    const variations = [clean, cleanLower, compact, compactLower];

    for (const ext of extensions) {
      for (const variation of variations) {
        const candidate = `${variation}${ext}`.toLowerCase();
        const match = KNOWN_LOCAL_PHOTOS.find(f => f.toLowerCase() === candidate);
        if (match) return `./Frontend/Photo/${match}`;
      }
    }

    return `./Frontend/Photo/${clean}.png`;
  }

  return '';
}

function formatDriveImageUrl(url, itemName = '', isBarber = false) {
  return resolveLocalPhotoUrl(url, itemName, isBarber);
}

/**
 * Inizializza Firebase App e Firestore SDK
 */
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

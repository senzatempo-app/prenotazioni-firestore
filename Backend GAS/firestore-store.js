/**
 * Firestore migration layer for Apps Script.
 *
 * This adapter keeps the legacy Sheets contract intact while allowing the app to
 * read and write the same logical entities from Firestore whenever the project is
 * configured with Firebase values.
 *
 * Setup required in Apps Script Project Properties:
 * - FIREBASE_PROJECT_ID
 * - FIREBASE_API_KEY
 * - FIREBASE_DATABASE_ID (optional, default: (default))
 *
 * Questo layer è il punto unico di connessione al database Firestore
 * e sostituisce la vecchia dipendenza da SpreadsheetApp / Google Sheet.
 */


function firestoreGetProjectSettings() {
  const props = PropertiesService.getScriptProperties();
  const projectId = props.getProperty('FIREBASE_PROJECT_ID') || 'senzatempo-database';
  const apiKey = props.getProperty('FIREBASE_API_KEY') || 'AIzaSyASQxWgCC53_ObEU7RbUWNojAeocl-9DIM';
  return {
    projectId: projectId,
    apiKey: apiKey,
    databaseId: props.getProperty('FIREBASE_DATABASE_ID') || '(default)',
    enabled: !!projectId
  };
}

function getFirestore() {
  return FirestoreApp.getFirestore(
    "senzatempo-bottega-barbiere@senzatempo-508820.iam.gserviceaccount.com", 
    "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDSljwNmRq8TwwS\n4Ss8d3X/bi6CYZLfUL5hFub8ZVN7QakhjRiYtul8OGfjSDIbDb7EgrbHamlhbWwV\nbrXbEoJmyCZZ625sI+v9WfDaOIqkGATyr4V+nuqUo6dv+LMm6h2/ROsOQ/sCaHll\n/BEdyzOHPbdgYPFsvNc4LtaK3FBhrjkekYvZzla2y/Oyc5nw4qcZebdor9GGYE3d\nFB7LBGnXziEUuhXYlvhjOvjjS8PQrdZItT1B/PeFl4fNKXdvlzSgR7c3HlVIvklr\nMi3j1nG3Y8broDA3zSuxn8PnI7eEt31N9BzlTqcJA57Pc7J2LQkliOYvsfNBJmTW\nmgYixIFnAgMBAAECggEAUfPOdhpFuc/nand/bH4vCRM3fVz8m/Sfykfv53yFUvvY\nFqsCzfetAL8wytYfTcD5Ix+dgxip3xUG0YZutk1LOzWcGzVQmTwXjFaSsVH8vmRs\nlIdzI7Yzo1nXAO/fxH6qyfNHqJsTFbpTuDky7g3UxUZi1VqUydTpyr8LlimsDH7c\nhzTY++dICTPwYsU4SvX3NmRr2E+Cu/IBquN7LnuSsbamCVUc7IuuOmQSZRH12XeY\nz2VrsP4V9bOuusy/5Z2P4LKkNei8tEbrkVSP/53LAyb1eqfHss3hZjDl5nEQhXPT\n3r59I/oXufMo0Uqyh+PXrlSJyA7mtlQIQDWwbRtaDQKBgQDvDQfodT5daBYWif69\nh9XR0Sd72tZLJ+eOV7BHlLew+frt5VofFMGmJhEmixAFcYNfQ4NpiHYveZCtQEy/\nVcQQ8GvgbmKsCB5w2+AJMFUUVmC1IC9IMwO++lQ32o/3cUTCbXzeM/gLg5nh/xr6\nNVMxZ++2UJ4pnQajv/9hSac2jQKBgQDhhI7XO9PptFRqG1OSN34fwHFoE++1Cd+p\nMZ2yH8Xq4AzEZufQKhVsMe2vOONMrF6ST+qD4LHgr57hrAdWDnUwYbeQiVtuV7Bv\nMwUu15yzUKlJzCauTrylHFQ7ypTQjBhBFjZ0UCdHZuPrsbjgDlGWt2DD8VvRlBOk\nrg3+LarEwwKBgQDVM1gEONzgTb61Z2ms/AL1WIbQbcKF0Rcx2n87uCWET88+cTlJ\nUyfK2VSefZRSZoT2Z65CZxSRDui7vAc29nUhbmuoBIs4Rx1vJorPZy3aL5ecsxG4\nYNdMctK95c5Ur87VYPTm8I6fJkYOS4lx8jE6dSpT/d6x2nxbexd3W0so2QKBgEWO\n01gDtgshed/4acBxqU811kTZ0VevofLXwOIN9sfJL2bsrpeAQ3dJtxwSmdkuWUUb\nrSPcDEFXKdRFcUXT08WGfk3wb+kK1vqVbAXUrxqHyI9gjpW452qt4DVI+LmSXHDG\n3yjlCBh33dj2yiUhhXzNNuV47m8oEx76KIq7ny5tAoGABMjNb0W32OqFxzpwF3JB\nLFK72KMl6VFdZTOhvrrELoCoS2SY6bIeM4Bdk957+KundsdeovRMFC0gVgBIpKfT\nrCyH5+jUecvhD55VzbTVrAzdtZkrD6faph82shq6dLbeOhO3uOcNOKFo4SEOGHP4\nF/MYdfXEOQ3bpTEOW+Bwvrw=\n-----END PRIVATE KEY-----\n", 
    "senzatempo-508820"
  );
}

function doGet(e) {
  // Questo serve per gestire le chiamate GET dal frontend
  const data = getDataFromFirestore();
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function firestoreIsConfigured() {
  const cfg = firestoreGetProjectSettings();
  return cfg.enabled;
}

function firestoreNormalizeValue(value) {
  if (!value || typeof value !== 'object') return value;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.booleanValue !== undefined) return value.booleanValue === true || value.booleanValue === 'true';
  if (value.integerValue !== undefined) return parseInt(value.integerValue, 10);
  if (value.doubleValue !== undefined) return parseFloat(value.doubleValue);
  if (value.timestampValue !== undefined) return new Date(value.timestampValue);
  if (value.arrayValue && Array.isArray(value.arrayValue.values)) {
    return value.arrayValue.values.map(firestoreNormalizeValue);
  }
  if (value.mapValue && value.mapValue.fields) return firestoreMapToObject(value.mapValue.fields);
  if (value.nullValue !== undefined) return null;
  return value;
}

function firestoreMapToObject(fields) {
  const out = {};
  if (!fields || typeof fields !== 'object') return out;
  Object.keys(fields).forEach((key) => {
    out[key] = firestoreNormalizeValue(fields[key]);
  });
  return out;
}

function firestoreDocumentToObject(doc) {
  if (!doc) return {};
  if (doc.fields) return firestoreMapToObject(doc.fields);
  if (doc.data && doc.data.fields) return firestoreMapToObject(doc.data.fields);
  return doc;
}

function firestoreGetBaseUrl() {
  const cfg = firestoreGetProjectSettings();
  return `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.databaseId}/documents`;
}

function firestoreGetHeaders() {
  return {
    Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
    'Content-Type': 'application/json'
  };
}

function firestoreListCollection(collectionName) {
  if (!firestoreIsConfigured()) return null;

  try {
    if (typeof FirestoreApp !== 'undefined') {
      const fs = getFirestore();
      const docs = fs.getDocuments(collectionName);
      if (Array.isArray(docs)) {
        return docs.map(doc => {
          const fields = doc.fields || doc.obj || doc;
          const id = doc.name ? doc.name.split('/').pop() : (doc.id || '');
          return Object.assign({ id: id }, fields);
        });
      }
    }
  } catch (fsErr) {
    console.warn('FirestoreApp library fetch failed, falling back to REST API: ' + fsErr.toString());
  }

  try {
    const cfg = firestoreGetProjectSettings();
    let url = `${firestoreGetBaseUrl()}/${collectionName}`;
    if (cfg.apiKey) {
      url += (url.includes('?') ? '&' : '?') + 'key=' + cfg.apiKey;
    }
    const response = UrlFetchApp.fetch(url, { 
      method: 'GET', 
      headers: firestoreGetHeaders(),
      muteHttpExceptions: true
    });
    const text = response.getContentText();
    if (!text) return [];
    const data = JSON.parse(text);
    if (!data.documents) return [];
    return data.documents.map((doc) => {
      const obj = firestoreDocumentToObject(doc);
      const id = (doc.name || '').split('/').pop();
      return Object.assign({ id: id }, obj);
    });
  } catch (error) {
    console.warn('Firestore list failed for ' + collectionName + ': ' + error.toString());
    return null;
  }
}

function firestoreGetDocument(path) {
  if (!firestoreIsConfigured()) return null;
  try {
    const url = `${firestoreGetBaseUrl()}/${path}`;
    const response = UrlFetchApp.fetch(url, { method: 'GET', headers: firestoreGetHeaders() });
    const text = response.getContentText();
    if (!text) return null;
    const doc = JSON.parse(text);
    const obj = firestoreDocumentToObject(doc);
    const id = (doc.name || '').split('/').pop();
    return Object.assign({ id: id }, obj);
  } catch (error) {
    console.warn('Firestore get failed for ' + path + ': ' + error.toString());
    return null;
  }
}

function firestoreSetDocument(path, data) {
  if (!firestoreIsConfigured()) return false;
  try {
    const url = `${firestoreGetBaseUrl()}/${path}`;
    const payload = JSON.stringify({ fields: firestoreObjectToMap(data) });
    UrlFetchApp.fetch(url, {
      method: 'PATCH',
      headers: firestoreGetHeaders(),
      payload: payload,
      muteHttpExceptions: true
    });
    return true;
  } catch (error) {
    console.warn('Firestore set failed for ' + path + ': ' + error.toString());
    return false;
  }
}

function firestoreCreateDocument(collectionName, id, data) {
  if (!firestoreIsConfigured()) return false;
  try {
    const url = `${firestoreGetBaseUrl()}/${collectionName}${id ? `?documentId=${encodeURIComponent(id)}` : ''}`;
    const payload = JSON.stringify({ fields: firestoreObjectToMap(data) });
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: firestoreGetHeaders(),
      payload: payload,
      muteHttpExceptions: true
    });
    return response.getResponseCode() >= 200 && response.getResponseCode() < 300;
  } catch (error) {
    console.warn('Firestore create failed for ' + collectionName + ': ' + error.toString());
    return false;
  }
}

function firestoreDeleteDocument(path) {
  if (!firestoreIsConfigured()) return false;
  try {
    const url = `${firestoreGetBaseUrl()}/${path}`;
    const response = UrlFetchApp.fetch(url, {
      method: 'DELETE',
      headers: firestoreGetHeaders(),
      muteHttpExceptions: true
    });
    return response.getResponseCode() >= 200 && response.getResponseCode() < 300;
  } catch (error) {
    console.warn('Firestore delete failed for ' + path + ': ' + error.toString());
    return false;
  }
}

function firestoreUpsert(collectionName, id, data) {
  const safeId = String(id || '').trim();
  if (!firestoreIsConfigured()) return false;
  try {
    if (safeId) {
      return firestoreSetDocument(`${collectionName}/${safeId}`, data);
    }
    return firestoreCreateDocument(collectionName, '', data);
  } catch (error) {
    console.warn('Firestore upsert failed for ' + collectionName + ': ' + error.toString());
    return false;
  }
}

function firestoreDeleteById(collectionName, id) {
  if (!firestoreIsConfigured() || !id) return false;
  return firestoreDeleteDocument(`${collectionName}/${id}`);
}

function firestoreFindOneByField(collectionName, fieldName, fieldValue) {
  if (!firestoreIsConfigured()) return null;
  const docs = firestoreListCollection(collectionName);
  if (!docs || !Array.isArray(docs)) return null;
  return docs.find((doc) => {
    const value = doc[fieldName];
    return value !== undefined && value !== null && String(value) === String(fieldValue);
  }) || null;
}

function firestoreObjectToMap(obj) {
  const map = {};
  if (!obj || typeof obj !== 'object') return map;
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    if (value === null || value === undefined) {
      map[key] = { nullValue: null };
    } else if (typeof value === 'string') {
      map[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      map[key] = Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    } else if (typeof value === 'boolean') {
      map[key] = { booleanValue: value };
    } else if (value instanceof Date) {
      map[key] = { timestampValue: value.toISOString() };
    } else if (Array.isArray(value)) {
      map[key] = { arrayValue: { values: value.map((item) => firestoreObjectToMapSingle(item)) } };
    } else if (typeof value === 'object') {
      map[key] = { mapValue: { fields: firestoreObjectToMap(value) } };
    }
  });
  return map;
}

function firestoreObjectToMapSingle(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreObjectToMapSingle) } };
  if (typeof value === 'object') return { mapValue: { fields: firestoreObjectToMap(value) } };
  return { stringValue: String(value) };
}

function firestoreAsLegacyBarbers(records) {
  if (!Array.isArray(records)) return {};
  const result = {};
  records.forEach((doc) => {
    const id = doc.id || doc.barberId || doc.clientId || '';
    if (!id) return;
    result[id] = {
      nome: doc.name || doc.nome || '',
      calendarId: doc.calendarId || 'primary',
      telefono: doc.phone || doc.telefono || '',
      email: doc.email || '',
      password: doc.password || '',
      foto: doc.photoUrl || doc.foto || '',
      isActive: doc.isActive !== undefined ? doc.isActive : true
    };
  });
  return result;
}

function firestoreAsLegacyServices(records) {
  if (!Array.isArray(records)) return [];
  return records.map((doc) => ({
    id: doc.id || doc.serviceId || '',
    name: doc.name || doc.nome || '',
    duration: parseInt(doc.durationMin || doc.duration || doc.durata || 30, 10) || 30,
    price: doc.price || doc.prezzo || 0,
    imageUrl: doc.photoUrl || doc.imageUrl || doc.foto || '',
    isActive: doc.isActive !== undefined ? doc.isActive : true
  }));
}

function firestoreAsLegacySettings(records) {
  const output = {};
  if (!Array.isArray(records)) return output;
  records.forEach((doc) => {
    if (!doc || typeof doc !== 'object') return;

    if (doc.key !== undefined && doc.key !== null) {
      const key = String(doc.key);
      if (doc.value !== undefined) {
        output[key] = doc.value;
      }
      return;
    }

    const id = doc.id;
    if (id && doc.value !== undefined) {
      output[String(id)] = doc.value;
      return;
    }

    Object.keys(doc).forEach((key) => {
      if (['id', 'key', 'value'].includes(key)) return;
      output[key] = doc[key];
    });
  });
  return output;
}

function firestoreAsLegacyWorkingHours(records) {
  const out = {};
  if (!Array.isArray(records)) return out;
  records.forEach((doc) => {
    if (!doc || typeof doc !== 'object') return;

    const id = doc.id || '';
    if (id === 'visibility') {
      out._visibility = [
        doc.all !== undefined ? doc.all : (doc.isAllTime !== undefined ? doc.isAllTime : false),
        doc.next !== undefined ? doc.next : (doc.isNextTime !== undefined ? doc.isNextTime : false),
        doc.preview !== undefined ? doc.preview : (doc.isPreviewTime !== undefined ? doc.isPreviewTime : false)
      ];
      return;
    }

    const barberId = doc.barberId || id;
    if (!barberId) return;
    if (!out[barberId]) out[barberId] = [];

    const row = [
      barberId,
      doc.day || '',
      doc.openAM || '',
      doc.closeAM || '',
      doc.openPM || '',
      doc.closePM || '',
      doc.visibilityAll || '',
      doc.visibilityNext || '',
      doc.visibilityPreview || ''
    ];
    out[barberId].push(row);
  });
  return out;
}

function firestoreAsLegacyClients(records) {
  if (!Array.isArray(records)) return [];
  return records.map((doc) => ({
    id: doc.id || doc.clientId || '',
    nome: doc.name || doc.nome || '',
    cognome: doc.surname || doc.cognome || '',
    telefono: doc.phone || doc.telefono || '',
    email: doc.email || '',
    cutTime: parseInt(doc.cutTime || doc.cut_time || 30, 10) || 30
  }));
}

function firestoreAsLegacyWeeklyBookings(records) {
  if (!Array.isArray(records)) return [];
  return records.map((doc) => ({
    id: doc.id || doc.weeklyBookingId || '',
    clientId: doc.clientId || '',
    clientName: doc.clientName || '',
    dayName: doc.dayName || '',
    time: doc.time || (doc.startTime || ''),
    service: doc.service || '',
    barberId: doc.barberId || '',
    duration: doc.duration || 0,
    startDate: doc.startDate || ''
  }));
}

function firestoreAsLegacyBookings(records) {
  if (!Array.isArray(records)) return [];
  return records.map((doc) => ({
    id: doc.id || doc.bookingId || '',
    clientId: doc.clientId || '',
    clientName: doc.clientName || '',
    startISO: doc.startISO || doc.startIso || doc.start || '',
    service: doc.service || '',
    duration: doc.duration || 0,
    status: doc.status || '',
    barberId: doc.barberId || '',
    prenotationISO: doc.prenotationISO || doc.prenotationIso || '',
    cancellationReason: doc.cancellationReason || '',
    reminderSent: doc.reminderSent || false
  }));
}

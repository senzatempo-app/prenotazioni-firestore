/**
 * store-clients.js
 * Modulo store — generato dal refactoring di firebase-client-store.js
 * Dipendenze: firebase-init.js deve essere caricato prima.
 */

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
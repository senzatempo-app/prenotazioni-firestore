
/**
 * Gestione Anagrafica Clienti.
 * Contiene tutta la logica per creare, leggere, aggiornare ed eliminare i clienti.
 */

/**
 * Registra o aggiorna un utente usando il numero di telefono come chiave primaria.
 */
function registerOrUpdateUser(clientData) {
  if (!firestoreIsConfigured()) {
    return { status: 'ERROR', message: 'Firestore non configurato. Inserisci le proprietà del progetto.' };
  }

  const barbers = getBarbersList(true);
  const email = (clientData.email || "").toLowerCase();
  const normPhone = normalizePhone(clientData.telefono);

  for (const id in barbers) {
    const b = barbers[id];
    if ((b.email && b.email.toLowerCase() === email) || (b.telefono && normalizePhone(b.telefono) === normPhone)) {
      throw new Error("Queste credenziali sono riservate allo staff. Accedi dal portale gestionale.");
    }
  }

  const existing = firestoreListCollection('clients');
  const matches = (existing || []).filter((doc) => {
    const phone = normalizePhone(doc.phone || doc.telefono || '');
    const emailCheck = (doc.email || '').toLowerCase();
    return (email && emailCheck === email) || (normPhone && phone === normPhone);
  });

  if (matches.length > 0) {
    const doc = matches[0];
    const id = doc.id || doc.clientId || '';
    return {
      id: id,
      nome: doc.name || doc.nome || '',
      cognome: doc.surname || doc.cognome || '',
      telefono: doc.phone || doc.telefono || '',
      email: doc.email || '',
      cutTime: parseInt(doc.cutTime || doc.cut_time || getDefaultCutTime(), 10) || getDefaultCutTime()
    };
  }

  const newId = 'cl_' + Date.now();
  const payload = {
    id: newId,
    name: capitalizeFirst(clientData.nome),
    surname: capitalizeFirst(clientData.cognome),
    phone: normPhone,
    email: clientData.email,
    cutTime: getDefaultCutTime(),
    registrationDate: new Date().toISOString(),
    lastBookingDate: '',
    totalBookings: 0,
    isActive: true
  };
  firestoreUpsert('clients', newId, payload);
  return { ...clientData, telefono: normPhone, nome: capitalizeFirst(clientData.nome), cognome: capitalizeFirst(clientData.cognome), id: newId, cutTime: getDefaultCutTime() };
}

/**
 * Aggiorna i dati del cliente.
 */
function updateClientData(oldIdentifier, updatedData) {
  if (!firestoreIsConfigured()) {
    return { status: 'ERROR', message: 'Firestore non configurato. Inserisci le proprietà del progetto.' };
  }

  const clients = firestoreListCollection('clients') || [];
  const match = clients.find((doc) => {
    const id = doc.id || doc.clientId || '';
    const email = (doc.email || '').toLowerCase();
    const phone = normalizePhone(doc.phone || doc.telefono || '');
    const target = (oldIdentifier || '').toLowerCase();
    const oldPhone = normalizePhone(oldIdentifier);
    return id === (updatedData.id || '') || email === target || phone === oldPhone || phone === normalizePhone(updatedData.telefono || '');
  });

  if (!match) return { status: "ERROR", message: "Cliente non trovato" };
  const clientId = match.id || match.clientId || updatedData.id;
  const payload = {
    id: clientId,
    name: capitalizeFirst(updatedData.nome),
    surname: capitalizeFirst(updatedData.cognome),
    phone: normalizePhone(updatedData.telefono),
    email: (updatedData.email || '').toLowerCase(),
    cutTime: parseInt(updatedData.cutTime, 10) || getDefaultCutTime(),
    isActive: match.isActive !== undefined ? match.isActive : true
  };
  if (match.registrationDate) payload.registrationDate = match.registrationDate;
  if (match.lastBookingDate) payload.lastBookingDate = match.lastBookingDate;
  if (match.totalBookings !== undefined) payload.totalBookings = match.totalBookings;
  firestoreUpsert('clients', clientId, payload);
  return { status: "OK" };
}

/**
 * Recupera la configurazione specifica di un cliente (es. tempo di taglio).
 */
function getClientConfig(identifier) {
  const defaultCutTime = getDefaultCutTime();
  if (!identifier) return { cutTime: defaultCutTime };

  if (!firestoreIsConfigured()) {
    return { cutTime: defaultCutTime };
  }

  const clients = firestoreListCollection('clients') || [];
  const search = identifier.includes('@') ? identifier.toLowerCase() : normalizePhone(identifier);
  const match = clients.find((doc) => {
    const email = (doc.email || '').toLowerCase();
    const phone = normalizePhone(doc.phone || doc.telefono || '');
    return email === search || phone === search;
  });
  if (match) {
    return {
      id: match.id || match.clientId || '',
      cutTime: parseInt(match.cutTime || match.cut_time || defaultCutTime, 10) || defaultCutTime
    };
  }
  return { cutTime: defaultCutTime };
}

/**
 * Aggiorna le statistiche del cliente dopo una prenotazione.
 */
function updateClientStats(clientId, bookingDate) {
  if (!firestoreIsConfigured()) {
    return;
  }

  const clients = firestoreListCollection('clients') || [];
  const match = clients.find((doc) => (doc.id || doc.clientId || '') === clientId);
  if (!match) return;

  const payload = {
    ...match,
    lastBookingDate: new Date(bookingDate).toISOString(),
    totalBookings: (parseInt(match.totalBookings, 10) || 0) + 1
  };

  firestoreUpsert('clients', clientId, payload);
}

/**
 * Recupera la lista completa dei clienti per la dashboard.
 */
function getClientsList() {
  if (!firestoreIsConfigured()) {
    return [];
  }

  const firestoreDocs = firestoreListCollection('clients');
  if (firestoreDocs && firestoreDocs.length) {
    const mapped = firestoreAsLegacyClients(firestoreDocs);
    return mapped.sort((a, b) => {
      const fullA = (a.nome + " " + a.cognome).toLowerCase();
      const fullB = (b.nome + " " + b.cognome).toLowerCase();
      return fullA.localeCompare(fullB);
    });
  }

  return [];
}

/**
 * Elimina un cliente dal database.
 */
function deleteClient(clientId) {
  if (!firestoreIsConfigured()) {
    return { status: "ERROR", message: "Firestore non configurato. Inserisci le proprietà del progetto." };
  }

  const clients = firestoreListCollection('clients') || [];
  const match = clients.find((doc) => (doc.id || doc.clientId || '') === clientId);

  if (!match) {
    return { status: "ERROR", message: "Cliente non trovato" };
  }

  firestoreDeleteById('clients', match.id || match.clientId || clientId);
  return { status: "OK" };
}

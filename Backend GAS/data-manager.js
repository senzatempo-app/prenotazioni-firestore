/**
 * Gestore Dati Entità
 * Centralizza la lettura e la scrittura dei dati principali come Barbieri e Servizi.
 */

/**
 * Recupera la lista dei barbieri attivi dal foglio 'Barbers'.
 * SPOSTATO DA CORE.JS
 */
function getBarbersList(all = false) {
  if (!all && _GLOBAL_CACHE.barbers) return _GLOBAL_CACHE.barbers;

  if (!firestoreIsConfigured()) {
    const empty = {};
    if (!all) _GLOBAL_CACHE.barbers = empty;
    return empty;
  }

  const firestoreDocs = firestoreListCollection('barbers');
  if (firestoreDocs && firestoreDocs.length) {
    const mapped = firestoreAsLegacyBarbers(firestoreDocs);
    const filtered = {};
    Object.keys(mapped).forEach((id) => {
      const barber = mapped[id];
      const isEnabled = barber.isActive !== false && barber.isActive !== 'FALSE';
      if (all || isEnabled) filtered[id] = barber;
    });
    if (!all) _GLOBAL_CACHE.barbers = filtered;
    return filtered;
  }

  const empty = {};
  if (!all) _GLOBAL_CACHE.barbers = empty;
  return empty;
}

/**
 * Recupera la lista dei servizi.
 * SPOSTATO DA CORE.JS
 */
function getServices(all = false) {
  if (!all && _GLOBAL_CACHE.services) return _GLOBAL_CACHE.services;

  if (!firestoreIsConfigured()) {
    const empty = [];
    if (!all) _GLOBAL_CACHE.services = empty;
    return empty;
  }

  const firestoreDocs = firestoreListCollection('services');
  if (firestoreDocs && firestoreDocs.length) {
    const mapped = firestoreAsLegacyServices(firestoreDocs);
    const filtered = mapped.filter((service) => all || service.isActive !== false);
    if (!all) _GLOBAL_CACHE.services = filtered;
    return filtered;
  }

  const empty = [];
  if (!all) _GLOBAL_CACHE.services = empty;
  return empty;
}

/**
 * Gestisce la lista dei servizi (Aggiungi, Modifica, Elimina).
 * SPOSTATO DA CORE.JS
 */
function manageService(action, serviceData) {
  if (!firestoreIsConfigured()) {
    return { status: 'ERROR', message: 'Firestore non configurato. Inserisci le proprietà del progetto.' };
  }

  const services = firestoreListCollection('services') || [];
  if (action === 'add') {
    const id = 'svc_' + Date.now();
    firestoreUpsert('services', id, {
      id: id,
      name: serviceData.name,
      duration: parseInt(serviceData.duration, 10) || 30,
      price: serviceData.price || 0,
      imageUrl: serviceData.imageUrl || '',
      isActive: serviceData.isActive !== undefined ? serviceData.isActive : true
    });
    return { status: 'OK' };
  }

  if (action === 'edit') {
    const match = services.find((doc) => (doc.name || doc.nome || '') === serviceData.oldName || (doc.id || '') === serviceData.id);
    if (match) {
      const id = match.id || match.serviceId || serviceData.id;
      firestoreUpsert('services', id, {
        id: id,
        name: serviceData.name,
        duration: parseInt(serviceData.duration, 10) || 30,
        price: serviceData.price || 0,
        imageUrl: serviceData.imageUrl || '',
        isActive: serviceData.isActive !== undefined ? serviceData.isActive : true
      });
      return { status: 'OK' };
    }
  }

  if (action === 'delete') {
    const match = services.find((doc) => (doc.name || doc.nome || '') === serviceData.name);
    if (match) {
      firestoreDeleteById('services', match.id || match.serviceId || '');
    }
    return { status: 'OK' };
  }

  return { status: 'ERROR', message: 'Azione servizio non riconosciuta' };
}

/**
 * Propaga il cambio della durata di default del servizio "Taglio".
 * SPOSTATO DA CORE.JS
 */
function propagateCutTimeChange(oldDuration, newDuration) {
  if (!firestoreIsConfigured()) {
    return;
  }

  const clients = firestoreListCollection('clients') || [];
  clients.forEach((client) => {
    if (parseInt(client.cutTime || client.cut_time, 10) === parseInt(oldDuration, 10)) {
      firestoreUpsert('clients', client.id || client.clientId || '', {
        ...client,
        cutTime: parseInt(newDuration, 10) || 30
      });
    }
  });
}

/**
 * Verifica la password del barbiere.
 * SPOSTATO DA CORE.JS
 */
function verifyBarberPassword(email, password) {
  const barbers = getBarbersList();
  for (const id in barbers) {
    const barber = barbers[id];
    if (barber.email && barber.email.toLowerCase() === email.toLowerCase()) {
      return String(barber.password) === String(password);
    }
  }
  return false;
}
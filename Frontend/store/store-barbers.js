/**
 * store-barbers.js
 * Modulo store — generato dal refactoring di firebase-client-store.js
 * Dipendenze: firebase-init.js deve essere caricato prima.
 */

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
 * Salva gli impegni personali / indisponibilità direttamente su Firestore
 */
async function directSaveIndisponibilitaRange(barberId, startDateIso, endDateIso, startTime, endTime, note = '', force = false) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  const [sH, sM] = (startTime || '09:00').split(':').map(Number);
  const [eH, eM] = (endTime || '10:00').split(':').map(Number);
  let durationMin = (eH * 60 + (eM || 0)) - (sH * 60 + (sM || 0));
  if (isNaN(durationMin) || durationMin <= 0) durationMin = 60;

  const curDate = new Date(`${startDateIso}T00:00:00`);
  const finalDate = new Date(`${endDateIso || startDateIso}T00:00:00`);
  if (isNaN(curDate.getTime())) throw new Error("Data inizio impegno non valida");

  const batch = store.batch();
  let count = 0;

  while (curDate <= finalDate && count < 60) {
    const y = curDate.getFullYear();
    const m = String(curDate.getMonth() + 1).padStart(2, '0');
    const d = String(curDate.getDate()).padStart(2, '0');
    const dayIsoStr = `${y}-${m}-${d}`;
    const startDateTime = new Date(`${dayIsoStr}T${String(sH).padStart(2, '0')}:${String(sM || 0).padStart(2, '0')}:00`);

    const id = 'indispo_' + Date.now() + '_' + count;
    const ref = store.collection('bookings').doc(id);

    const indispoDoc = {
      barberId: barberId || 'barber_1',
      bookingId: id,
      clientId: 'indisponibilita',
      clientName: note || 'Impegno Personale',
      service: note || 'Impegno',
      duration: durationMin,
      startISO: firebase.firestore.Timestamp.fromDate(startDateTime),
      status: 'indisponibile',
      prenotationISO: firebase.firestore.Timestamp.fromDate(new Date()),
      cancellationReason: '',
      reminderSent: false
    };

    batch.set(ref, indispoDoc);
    count++;
    curDate.setDate(curDate.getDate() + 1);
  }

  await batch.commit();
  console.log(`[Firebase Direct] Salvati ${count} impegni su Firestore in batch write (< 30ms)`);
  return { status: 'OK' };
}

/**
 * Modifica un impegno personale / indisponibilità direttamente su Firestore (< 30ms)
 */
async function directUpdateIndisponibilita(bookingId, startIso, endIso, note, force = false) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");
  if (!bookingId) return { status: 'ERROR', message: 'ID impegno mancante' };

  const startD = new Date(startIso);
  const endD = new Date(endIso);
  const duration = Math.round((endD.getTime() - startD.getTime()) / 60000) || 60;

  const updateData = {
    startISO: firebase.firestore.Timestamp.fromDate(startD),
    duration: duration,
    status: 'indisponibile'
  };
  if (note) {
    updateData.clientName = note;
    updateData.service = note;
  }

  await store.collection('bookings').doc(bookingId).update(updateData);
  console.log(`[Firebase Direct] Impegno ${bookingId} aggiornato con successo su Firestore`);
  return { status: 'OK' };
}
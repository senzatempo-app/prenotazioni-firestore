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
 * Gestisce i conflitti con appuntamenti esistenti (confermati, richiesta cancellazione, weekly)
 * Se force = false: restituisce l'elenco dei conflitti da mostrare nel popup
 * Se force = true: elimina definitivamente gli appuntamenti in conflitto e salva l'impegno
 */
async function directSaveIndisponibilitaRange(barberId, startDateIso, endDateIso, startTime, endTime, note = '', force = false) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");

  const effectiveBarberId = String(barberId || 'barber_1').trim();
  const [sH, sM] = (startTime || '09:00').split(':').map(Number);
  const [eH, eM] = (endTime || '10:00').split(':').map(Number);
  let durationMin = (eH * 60 + (eM || 0)) - (sH * 60 + (sM || 0));
  if (isNaN(durationMin) || durationMin <= 0) durationMin = 60;

  const curDate = new Date(`${startDateIso}T00:00:00`);
  const finalDate = new Date(`${endDateIso || startDateIso}T00:00:00`);
  if (isNaN(curDate.getTime())) throw new Error("Data inizio impegno non valida");

  // Calcola tutti gli intervalli temporali dell'impegno
  const targetRanges = [];
  let count = 0;
  const loopDate = new Date(curDate);
  while (loopDate <= finalDate && count < 60) {
    const y = loopDate.getFullYear();
    const m = String(loopDate.getMonth() + 1).padStart(2, '0');
    const d = String(loopDate.getDate()).padStart(2, '0');
    const dayIsoStr = `${y}-${m}-${d}`;
    const startDateTime = new Date(`${dayIsoStr}T${String(sH).padStart(2, '0')}:${String(sM || 0).padStart(2, '0')}:00`);
    const startMs = startDateTime.getTime();
    const endMs = startMs + durationMin * 60000;

    targetRanges.push({
      startMs,
      endMs,
      startDateTime,
      dayIsoStr,
      id: 'indispo_' + Date.now() + '_' + count
    });
    count++;
    loopDate.setDate(loopDate.getDate() + 1);
  }

  // 1. Recupera tutte le prenotazioni per verificare i conflitti
  const allBookings = await fetchCollectionDocs('bookings');
  const conflictingBookings = allBookings.filter(b => {
    const bBarberId = String(b.barberId || '').trim();
    if (bBarberId && bBarberId !== effectiveBarberId) return false;

    const st = (b.status || '').toLowerCase().trim();
    // Appuntamenti che vanno in conflitto: confermati, in richiesta cancellazione o weekly
    const isConflictingStatus = st === 'confermato' || st === 'richiesta cancellazione' || st === 'weekly';
    if (!isConflictingStatus) return false;

    const bIso = formatTimestampToIso(b.startISO || b.startIso || b.start);
    if (!bIso) return false;
    const bStart = new Date(bIso).getTime();
    if (isNaN(bStart)) return false;
    const bDur = (parseInt(b.duration, 10) || 30) * 60000;
    const bEnd = bStart + bDur;

    return targetRanges.some(tr => bStart < tr.endMs && bEnd > tr.startMs);
  });

  // 2. Se ci sono conflitti e force è false, restituisci l'elenco dei conflitti da mostrare nel popup
  if (conflictingBookings.length > 0 && !force) {
    const conflicts = conflictingBookings.map(b => {
      const bIso = formatTimestampToIso(b.startISO || b.startIso || b.start);
      const bDate = new Date(bIso);
      const dayStr = bDate.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' });
      const startH = String(bDate.getHours()).padStart(2, '0');
      const startM = String(bDate.getMinutes()).padStart(2, '0');
      const bDur = parseInt(b.duration, 10) || 30;
      const bEndDate = new Date(bDate.getTime() + bDur * 60000);
      const endH = String(bEndDate.getHours()).padStart(2, '0');
      const endM = String(bEndDate.getMinutes()).padStart(2, '0');
      const statusLabel = b.status === 'weekly' ? ' [Fisso]' : (b.status === 'Richiesta cancellazione' ? ' [In Canc.]' : '');
      return {
        id: b.id || b.bookingId,
        time: `${dayStr} ${startH}:${startM} - ${endH}:${endM}${statusLabel}`,
        name: b.clientName || 'Cliente',
        service: b.service || 'Taglio',
        status: b.status || ''
      };
    });
    return { status: "CONFLICT", conflicts: conflicts };
  }

  // 3. Se force è true (o non ci sono conflitti): esegui l'inserimento ed elimina i conflitti
  const batch = store.batch();

  // Elimina realmente tutti gli appuntamenti in conflitto
  conflictingBookings.forEach(b => {
    const docId = String(b.id || b.bookingId);
    batch.delete(store.collection('bookings').doc(docId));
  });

  // Crea i nuovi documenti di indisponibilità
  targetRanges.forEach(tr => {
    const ref = store.collection('bookings').doc(tr.id);
    const indispoDoc = {
      barberId: effectiveBarberId,
      bookingId: tr.id,
      clientId: 'indisponibilita',
      clientName: note || 'Impegno Personale',
      service: note || 'Impegno',
      duration: durationMin,
      startISO: firebase.firestore.Timestamp.fromDate(tr.startDateTime),
      status: 'indisponibile',
      prenotationISO: firebase.firestore.Timestamp.fromDate(new Date()),
      cancellationReason: '',
      reminderSent: false
    };
    batch.set(ref, indispoDoc);
  });

  await batch.commit();
  console.log(`[Firebase Direct] Salvati ${targetRanges.length} impegni su Firestore. Eliminati ${conflictingBookings.length} appuntamenti in conflitto.`);

  // Invia notifiche email di cancellazione ai clienti degli appuntamenti eliminati
  if (conflictingBookings.length > 0 && typeof directSendEmailNotification === 'function') {
    conflictingBookings.forEach(b => {
      const cEmail = b.clientEmail || b.email || '';
      if (cEmail) {
        directSendEmailNotification('bookingCancellation', {
          booking: b,
          reason: note ? `Impegno barbiere: ${note}` : 'Impegno personale del barbiere'
        });
      }
    });
  }

  return { status: 'OK' };
}

/**
 * Modifica un impegno personale / indisponibilità direttamente su Firestore (< 30ms)
 * Gestisce i conflitti con appuntamenti esistenti (confermati, richiesta cancellazione, weekly)
 */
async function directUpdateIndisponibilita(bookingId, startIso, endIso, note, force = false) {
  const store = initFirebaseClient();
  if (!store) throw new Error("Firestore SDK non disponibile");
  if (!bookingId) return { status: 'ERROR', message: 'ID impegno mancante' };

  const startD = new Date(startIso);
  const endD = new Date(endIso);
  const duration = Math.round((endD.getTime() - startD.getTime()) / 60000) || 60;
  const rangeStart = startD.getTime();
  const rangeEnd = rangeStart + duration * 60000;

  const allBookings = await fetchCollectionDocs('bookings');
  const currentIndispo = allBookings.find(b => (b.id || b.bookingId) === bookingId);
  const barberId = currentIndispo ? String(currentIndispo.barberId || 'barber_1').trim() : 'barber_1';

  // Trova appuntamenti in conflitto (escludendo l'impegno stesso che stiamo modificando)
  const conflictingBookings = allBookings.filter(b => {
    const docId = b.id || b.bookingId;
    if (docId === bookingId) return false;

    const bBarberId = String(b.barberId || '').trim();
    if (bBarberId && bBarberId !== barberId) return false;

    const st = (b.status || '').toLowerCase().trim();
    const isConflictingStatus = st === 'confermato' || st === 'richiesta cancellazione' || st === 'weekly';
    if (!isConflictingStatus) return false;

    const bIso = formatTimestampToIso(b.startISO || b.startIso || b.start);
    if (!bIso) return false;
    const bStart = new Date(bIso).getTime();
    if (isNaN(bStart)) return false;
    const bDur = (parseInt(b.duration, 10) || 30) * 60000;
    const bEnd = bStart + bDur;

    return bStart < rangeEnd && bEnd > rangeStart;
  });

  if (conflictingBookings.length > 0 && !force) {
    const conflicts = conflictingBookings.map(b => {
      const bIso = formatTimestampToIso(b.startISO || b.startIso || b.start);
      const bDate = new Date(bIso);
      const dayStr = bDate.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' });
      const startH = String(bDate.getHours()).padStart(2, '0');
      const startM = String(bDate.getMinutes()).padStart(2, '0');
      const bDur = parseInt(b.duration, 10) || 30;
      const bEndDate = new Date(bDate.getTime() + bDur * 60000);
      const endH = String(bEndDate.getHours()).padStart(2, '0');
      const endM = String(bEndDate.getMinutes()).padStart(2, '0');
      const statusLabel = b.status === 'weekly' ? ' [Fisso]' : (b.status === 'Richiesta cancellazione' ? ' [In Canc.]' : '');
      return {
        id: b.id || b.bookingId,
        time: `${dayStr} ${startH}:${startM} - ${endH}:${endM}${statusLabel}`,
        name: b.clientName || 'Cliente',
        service: b.service || 'Taglio',
        status: b.status || ''
      };
    });
    return { status: "CONFLICT", conflicts: conflicts };
  }

  const batch = store.batch();

  // Elimina gli appuntamenti in conflitto
  conflictingBookings.forEach(b => {
    const docId = String(b.id || b.bookingId);
    batch.delete(store.collection('bookings').doc(docId));
  });

  const updateRef = store.collection('bookings').doc(bookingId);
  const updateData = {
    startISO: firebase.firestore.Timestamp.fromDate(startD),
    duration: duration,
    status: 'indisponibile'
  };
  if (note) {
    updateData.clientName = note;
    updateData.service = note;
  }
  batch.update(updateRef, updateData);

  await batch.commit();
  console.log(`[Firebase Direct] Impegno ${bookingId} aggiornato su Firestore. Eliminati ${conflictingBookings.length} appuntamenti in conflitto.`);

  if (conflictingBookings.length > 0 && typeof directSendEmailNotification === 'function') {
    conflictingBookings.forEach(b => {
      const cEmail = b.clientEmail || b.email || '';
      if (cEmail) {
        directSendEmailNotification('bookingCancellation', {
          booking: b,
          reason: note ? `Impegno barbiere: ${note}` : 'Impegno personale del barbiere'
        });
      }
    });
  }

  return { status: 'OK' };
}
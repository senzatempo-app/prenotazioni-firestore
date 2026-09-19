/**
 * store-email.js
 * Modulo store — generato dal refactoring di firebase-client-store.js
 * Dipendenze: firebase-init.js deve essere caricato prima.
 */

// Cache per debouncing/deduplicazione invii email entro 60 secondi
const sentEmailDebounceMap = new Set();

function shouldDebounceEmail(key) {
  if (sentEmailDebounceMap.has(key)) return true;
  sentEmailDebounceMap.add(key);
  setTimeout(() => sentEmailDebounceMap.delete(key), 60000);
  return false;
}

/**
 * Valida un indirizzo email cliente/barbiere
 */
function isValidClientEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const cleaned = email.trim().toLowerCase();
  if (cleaned.includes('@barber.it') || cleaned.endsWith('.local') || cleaned === 'no email') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned);
}

/**
 * Formatta una data in formato esteso italiano per le notifiche email
 * Es: "Lunedì 21 Settembre 2026 alle ore 15:30"
 */
function formatEmailDateItalian(dateInput, includeTime = true) {
  if (!dateInput) return '';
  let d;
  if (dateInput instanceof Date) {
    d = dateInput;
  } else if (typeof dateInput === 'object' && typeof dateInput.toDate === 'function') {
    d = dateInput.toDate();
  } else if (typeof dateInput === 'object' && dateInput.seconds) {
    d = new Date(dateInput.seconds * 1000);
  } else if (typeof dateInput === 'string') {
    d = new Date(dateInput);
  } else {
    d = new Date(dateInput);
  }
  if (isNaN(d.getTime())) return String(dateInput);

  const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

  const dayName = days[d.getDay()];
  const dayNum = String(d.getDate()).padStart(2, '0');
  const monthName = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');

  let res = `${dayName} ${dayNum} ${monthName} ${year}`;
  if (includeTime) {
    res += ` alle ore ${hours}:${minutes}`;
  }
  return res;
}

/**
 * Genera il footer con i dati del salone
 */
function getSalonContactFooter(settings) {
  const template = settings.EMAIL_FOOTER_TEMPLATE || settings.emailFooterTemplate || "";
  const name = settings.BUSINESS_NAME || settings.businessName || "Senza Tempo";
  const addr = settings.BUSINESS_ADDRESS || settings.businessAddress || "";
  const phone = settings.CONTACT_PHONE || settings.contactPhone || "";
  const email = settings.CONTACT_EMAIL || settings.contactEmail || "";

  if (template && template.trim()) {
    return template
      .replace(/\$\{BUSINESS_NAME\}|\{BUSINESS_NAME\}/gi, name)
      .replace(/\$\{BUSINESS_ADDRESS\}|\{BUSINESS_ADDRESS\}/gi, addr)
      .replace(/\$\{CONTACT_PHONE\}|\{CONTACT_PHONE\}/gi, phone)
      .replace(/\$\{CONTACT_EMAIL\}|\{CONTACT_EMAIL\}/gi, email);
  }

  return `<br><br><hr style="border:none;border-top:1px solid #e0e0e0;margin:25px 0 15px 0;"><div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#777;line-height:1.6;"><strong>${name}</strong>${addr ? '<br>' + addr : ''}${phone ? '<br>Tel: ' + phone : ''}${email ? '<br>Email: ' + email : ''}</div>`;
}

/**
 * Converte HTML in testo semplice per client email senza rendering HTML
 */
function htmlToPlainText(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/**
 * Interpolazione sicura delle variabili nel template (supporta sia ${chiave} che {chiave})
 */
function interpolateEmailTemplate(template, vars) {
  if (!template || typeof template !== 'string') return '';
  let result = template;
  Object.keys(vars).forEach(key => {
    const val = vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : '';
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexWithDollar = new RegExp('\\$\\{' + escapedKey + '\\}', 'gi');
    const regexWithoutDollar = new RegExp('\\{' + escapedKey + '\\}', 'gi');
    result = result.replace(regexWithDollar, val).replace(regexWithoutDollar, val);
  });
  return result;
}

/**
 * ============================================================================
 * CONFIGURAZIONE TEMPLATE EMAIL (Oggetto e Corpo)
 * ============================================================================
 * Tutti i template delle email sono gestiti direttamente qui nel codice.
 * Non serve alcuna collezione o impostazione Firestore per i testi delle email.
 * 
 * VARIABILI DISPONIBILI NEI TEMPLATE (usabili come ${chiave} o {chiave}):
 *  - ${clientName}      : Nome del cliente (es: Mario)
 *  - ${clientSurname}   : Cognome del cliente (es: Rossi)
 *  - ${clientFullName}  : Nome e cognome del cliente (es: Mario Rossi)
 *  - ${clientPhone}     : Telefono del cliente
 *  - ${clientEmail}     : Indirizzo email del cliente
 *  - ${serviceName}     : Nome del servizio (es: Taglio, Barba)
 *  - ${barberName}      : Nome del barbiere selezionato (es: Francesco)
 *  - ${fullDate}        : Data e ora in italiano (es: Lunedì 21 Settembre 2026 alle ore 15:30)
 *  - ${oldFullDate}     : Vecchia data/ora (per modifiche appuntamento)
 *  - ${newFullDate}     : Nuova data/ora (per modifiche appuntamento)
 *  - ${dayName}         : Giorno fisso (es: Lunedì)
 *  - ${timeStr}         : Orario fisso (es: 15:30)
 *  - ${firstDate}       : Prima data per appuntamenti fissi
 *  - ${reason}          : Motivo della cancellazione o della richiesta
 *  - ${businessName}    : Nome del salone (es: Senza Tempo)
 *  - ${businessAddress} : Indirizzo del salone
 *  - ${contactPhone}    : Telefono del salone
 *  - ${contactEmail}    : Email di contatto del salone
 *  - ${emailFooter}     : Footer preformattato con recapiti del salone
 * ============================================================================
 */
const EMAIL_TEMPLATES = {
  // 1. Conferma prenotazione inviata al cliente
  bookingConfirmation: {
    subject: "Conferma Appuntamento - ${businessName}",
    body: `<p>Ciao <strong>\${clientName}</strong>,</p>
<p>il tuo appuntamento per <strong>\${serviceName}</strong> è confermato per:</p>
<p style="font-size: 16px; margin: 12px 0;"><strong>📅 \${fullDate}</strong><br>💈 con <strong>\${barberName}</strong></p>
<p>Ti aspettiamo in salone!</p>`
  },

  // 2. Notifica nuova prenotazione inviata al barbiere
  barberBookingNotification: {
    subject: "Nuova prenotazione: \${clientFullName} - \${serviceName}",
    body: `<p>Ciao <strong>\${barberName}</strong>,</p>
<p>hai una nuova prenotazione in agenda:</p>
<ul style="line-height: 1.8; margin: 10px 0; padding-left: 20px;">
  <li><strong>Cliente:</strong> \${clientFullName}</li>
  <li><strong>Servizio:</strong> \${serviceName}</li>
  <li><strong>Data e ora:</strong> \${fullDate}</li>
  <li><strong>Telefono:</strong> \${clientPhone}</li>
  <li><strong>Email:</strong> \${clientEmail}</li>
</ul>`
  },

  // 3. Cancellazione appuntamento inviata al cliente
  bookingCancellation: {
    subject: "Annullamento Appuntamento - \${businessName}",
    body: `<p>Ciao <strong>\${clientName}</strong>,</p>
<p>il tuo appuntamento per <strong>\${serviceName}</strong> previsto per <strong>\${fullDate}</strong> con <strong>\${barberName}</strong> è stato annullato.</p>
<p>Se desideri prenotare un nuovo appuntamento, visita il nostro sito.</p>`
  },

  // 4. Modifica / spostamento appuntamento inviata al cliente
  bookingModification: {
    subject: "Modifica Appuntamento - \${businessName}",
    body: `<p>Ciao <strong>\${clientName}</strong>,</p>
<p>il tuo appuntamento per <strong>\${serviceName}</strong> con <strong>\${barberName}</strong> è stato spostato:</p>
<p style="margin: 12px 0;">
  <strong>Precedente:</strong> <del>\${oldFullDate}</del><br>
  <strong>Nuova data:</strong> <strong style="color: #1a73e8;">\${newFullDate}</strong>
</p>`
  },

  // 5. Richiesta cancellazione dal cliente inviata al barbiere
  cancellationRequest: {
    subject: "Richiesta Annullamento da \${clientFullName}",
    body: `<p>Ciao <strong>\${barberName}</strong>,</p>
<p>il cliente <strong>\${clientFullName}</strong> ha richiesto l'annullamento dell'appuntamento del <strong>\${fullDate}</strong> per <strong>\${serviceName}</strong>.</p>
<p><strong>Motivo specificato:</strong> \${reason}</p>
<p>Accedi alla dashboard per verificare e approvare o rifiutare la richiesta.</p>`
  },

  // 6. Riconferma appuntamento (richiesta rifiutata) inviata al cliente
  reconfirmation: {
    subject: "Appuntamento Riconfermato - \${businessName}",
    body: `<p>Ciao <strong>\${clientName}</strong>,</p>
<p>la tua richiesta di cancellazione per l'appuntamento del <strong>\${fullDate}</strong> (\${serviceName}) non è stata accolta.</p>
<p>L'appuntamento rimane pertanto <strong>confermato</strong> con <strong>\${barberName}</strong>.</p>`
  },

  // 7. Conferma appuntamento fisso settimanale inviata al cliente
  weeklyConfirmation: {
    subject: "Conferma Appuntamento Fisso - \${businessName}",
    body: `<p>Ciao <strong>\${clientName}</strong>,</p>
<p>il tuo appuntamento fisso per <strong>\${serviceName}</strong> ogni <strong>\${dayName}</strong> alle ore <strong>\${timeStr}</strong> con <strong>\${barberName}</strong> è stato registrato con successo.</p>
<p><strong>Prima seduta:</strong> \${firstDate}</p>`
  },

  // 8. Cancellazione appuntamento fisso settimanale inviata al cliente
  weeklyCancellation: {
    subject: "Cancellazione Appuntamento Fisso - \${businessName}",
    body: `<p>Ciao <strong>\${clientName}</strong>,</p>
<p>ti confermiamo la cancellazione del tuo appuntamento fisso per <strong>\${serviceName}</strong> del <strong>\${dayName}</strong> alle ore <strong>\${timeStr}</strong> con <strong>\${barberName}</strong>.</p>`
  },

  // 9. Promemoria appuntamento inviato al cliente
  reminder: {
    subject: "Promemoria Appuntamento - \${businessName}",
    body: `<p>Ciao <strong>\${clientName}</strong>,</p>
<p>ti ricordiamo il tuo appuntamento per <strong>\${serviceName}</strong>:</p>
<p style="font-size: 16px; margin: 12px 0;"><strong>⏰ \${fullDate}</strong><br>💈 con <strong>\${barberName}</strong></p>
<p>A presto!</p>`
  }
};

/**
 * Motore principale invio email direttamente dal frontend.
 * Oggetto e body sono definiti localmente in EMAIL_TEMPLATES.
 * L'invio avviene tramite Google Apps Script (GOOGLE_SCRIPT_URL).
 * Nessuna scrittura o lettura su Firestore per i template o per la raccolta 'mail'.
 */
async function directSendEmailNotification(type, payload = {}) {

  // Esecuzione totalmente non bloccante in background
  (async () => {
    try {
      const templateConfig = EMAIL_TEMPLATES[type];
      if (!templateConfig) {
        console.warn(`[Email Frontend] Tipo notifica sconosciuto: ${type}`);
        return;
      }

      // Recupera impostazioni generali salone e lista barbieri per i dati di contesto
      let settings = {};
      let barbers = {};
      try {
        if (typeof directGetSettings === 'function') settings = (await directGetSettings()) || {};
        if (typeof directGetBarbersList === 'function') barbers = (await directGetBarbersList(true)) || {};
      } catch (e) {
        console.warn('[Email Frontend] Warning recupero impostazioni o barbieri:', e);
      }

      const isClientEmailEnabled = settings.EMAIL_NOTIFICATION === true ||
        String(settings.EMAIL_NOTIFICATION).toLowerCase() === 'true' ||
        settings.emailNotification === true;
      const isBarberEmailEnabled = settings.BARBER_BOOKING_NOTIFICATION === true ||
        String(settings.BARBER_BOOKING_NOTIFICATION).toLowerCase() === 'true' ||
        settings.barberBookingNotification === true;

      // Risoluzione dati barbiere
      const barberId = String(payload.barberId || payload.booking?.barberId || 'barber_1');
      const barber = barbers[barberId] || { nome: 'Barbiere', email: '' };

      // Risoluzione dati cliente
      const clientData = payload.clientData || {};
      let clientNameFull = payload.clientName || clientData.nome || payload.booking?.clientName || 'Cliente';
      let clientFirstName = (clientNameFull || '').split(' ')[0] || 'Cliente';
      let clientLastName = clientData.cognome || (clientNameFull.split(' ').slice(1).join(' ')) || '';
      let clientPhone = clientData.telefono || clientData.phone || payload.booking?.clientPhone || 'N/D';
      let clientEmail = (payload.clientEmail || clientData.email || payload.booking?.clientEmail || '').trim();

      // Fallback: se clientEmail non è presente nel payload o nel booking, recuperala dall'archivio clienti
      if (!clientEmail) {
        const cId = String(payload.clientId || payload.booking?.clientId || clientData.id || clientData.clientId || '').trim();
        const cPh = (typeof normalizePhone === 'function')
          ? normalizePhone(clientPhone)
          : String(clientPhone).replace(/\D/g, '');
        try {
          if (typeof directGetClientsList === 'function') {
            const allClients = await directGetClientsList();
            const found = allClients.find(c => {
              const cp = (typeof normalizePhone === 'function')
                ? normalizePhone(c.telefono || c.phone || '')
                : String(c.telefono || c.phone || '').replace(/\D/g, '');
              return (cId && String(c.id || c.clientId) === cId) || (cPh && cp && cp === cPh);
            });
            if (found) {
              if (found.email) clientEmail = (found.email || '').trim();
              if (clientNameFull === 'Cliente' && (found.nome || found.name)) {
                clientNameFull = `${found.nome || found.name || ''} ${found.cognome || found.surname || ''}`.trim();
                clientFirstName = (clientNameFull || '').split(' ')[0] || 'Cliente';
                clientLastName = found.cognome || (clientNameFull.split(' ').slice(1).join(' ')) || '';
              }
              if (clientPhone === 'N/D' && (found.telefono || found.phone)) {
                clientPhone = found.telefono || found.phone;
              }
            }
          }
        } catch (eCl) {
          console.warn('[Email Frontend] Fallback recupero email cliente fallito:', eCl);
        }
      }

      const serviceName = (payload.serviceName || payload.booking?.service || 'Taglio').replace(/_/g, ' ');
      const rawStart = payload.startDate || payload.booking?.startISO || payload.booking?.start || new Date();
      const fullDate = formatEmailDateItalian(rawStart, true);
      const barberEmailRaw = (barber.email || '').trim();
      const salonContactEmail = (settings.CONTACT_EMAIL || settings.contactEmail || settings.businessEmail || 'senzatempo.milazzo@gmail.com').trim();
      const barberRecipient = isValidClientEmail(barberEmailRaw) ? barberEmailRaw : salonContactEmail;

      let recipient = '';
      let isEnabled = true;

      switch (type) {
        // Notifiche indirizzate ESCLUSIVAMENTE al Cliente (1 email)
        case 'bookingConfirmation':
        case 'bookingCancellation':
        case 'bookingModification':
        case 'cancellationRequestClient':
        case 'reconfirmation':
        case 'weeklyConfirmation':
        case 'weeklyCancellation':
        case 'reminder':
          recipient = clientEmail;
          isEnabled = isClientEmailEnabled;
          break;

        // Notifiche indirizzate ESCLUSIVAMENTE al Barbiere (1 email)
        case 'barberBookingNotification':
        case 'barberCancellationNotification':
        case 'barberModificationNotification':
        case 'cancellationRequest':
        case 'barberReconfirmation':
        case 'barberWeeklyConfirmation':
        case 'barberWeeklyCancellation':
        case 'barberReminder':
          recipient = barberRecipient;
          isEnabled = isBarberEmailEnabled;
          break;

        default:
          recipient = clientEmail;
          isEnabled = isClientEmailEnabled;
          break;
      }

      // Verifica abilitazione e validità indirizzo
      if (!isEnabled) {
        console.log(`[Email Frontend] Notifiche email per '${type}' disabilitate nelle impostazioni.`);
        return;
      }

      if (!isValidClientEmail(recipient)) {
        console.log(`[Email Frontend] Indirizzo email destinatario non valido o assente per '${type}': "${recipient}"`);
        return;
      }

      // Deduplicazione invii identici entro 60s
      const dedupId = payload.bookingId || payload.booking?.bookingId || payload.booking?.id || payload.dayName || fullDate;
      const dedupKey = `${type}_${recipient}_${dedupId}`;
      if (shouldDebounceEmail(dedupKey)) {
        console.log(`[Email Frontend] Invio duplicato saltato per ${dedupKey}`);
        return;
      }

      const businessName = settings.BUSINESS_NAME || settings.businessName || 'Senza Tempo';
      const businessAddress = settings.BUSINESS_ADDRESS || settings.businessAddress || '';
      const contactPhone = settings.CONTACT_PHONE || settings.contactPhone || '';
      const contactEmailVal = salonContactEmail;

      const templateVars = {
        clientName: clientFirstName,
        clientFullName: clientNameFull,
        clientSurname: clientLastName,
        clientPhone: clientPhone,
        clientEmail: clientEmail,
        fullDate: fullDate,
        serviceName: serviceName,
        barberName: barber.nome || 'Barbiere',
        businessName: businessName,
        businessAddress: businessAddress,
        contactPhone: contactPhone,
        contactEmail: contactEmailVal,
        businessPhone: contactPhone,
        businessEmail: contactEmailVal,
        reason: payload.reason || payload.booking?.cancellationReason || payload.booking?.reason || 'Nessun motivo specificato',
        dayName: payload.dayName || payload.booking?.dayName || '',
        timeStr: payload.timeStr || payload.booking?.timeStr || '',
        firstDate: String(payload.firstDate || payload.booking?.firstDate || '')
          .replace(/^Primo appuntamento:\s*/i, '')
          .replace(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g, (_, d, m, y) => y ? `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}` : `${d.padStart(2, '0')}/${m.padStart(2, '0')}`)
          .trim(),
        oldFullDate: payload.oldStart ? formatEmailDateItalian(payload.oldStart, true) : (payload.oldBooking?.startISO ? formatEmailDateItalian(payload.oldBooking.startISO, true) : ''),
        newFullDate: payload.newStart ? formatEmailDateItalian(payload.newStart, true) : fullDate,
        BUSINESS_NAME: businessName,
        BUSINESS_ADDRESS: businessAddress,
        CONTACT_PHONE: contactPhone,
        CONTACT_EMAIL: contactEmailVal,
        BUSINESS_PHONE: contactPhone,
        BUSINESS_EMAIL: contactEmailVal
      };

      // Genera il footer
      const footerHtml = getSalonContactFooter(settings);
      templateVars.emailFooter = footerHtml;

      // Normalizzazione automatica a 2 cifre per qualsiasi data numerica con slash (es. 29/9/2026 -> 29/09/2026, 1/9/2026 -> 01/09/2026)
      const formatSlashDates = (str) => {
        if (!str || typeof str !== 'string') return str;
        return str.replace(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g, (_, d, m, y) => {
          return y ? `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}` : `${d.padStart(2, '0')}/${m.padStart(2, '0')}`;
        });
      };

      // Interpola subject e body direttamente da EMAIL_TEMPLATES
      const finalSubject = formatSlashDates(interpolateEmailTemplate(templateConfig.subject, templateVars));
      let rawBody = interpolateEmailTemplate(templateConfig.body, templateVars);
      if (!rawBody.includes('<p>') && !rawBody.includes('<br>') && !rawBody.includes('<div>')) {
        rawBody = rawBody.split('\n').join('<br>');
      }

      // Auto-append del footer SOLO se il body template non gestisce già il footer
      const templateHandlesFooter = (
        templateConfig.body.includes('BUSINESS_NAME') ||
        templateConfig.body.includes('emailFooter') ||
        templateConfig.body.includes('businessName') ||
        templateConfig.body.includes('<hr>') ||
        templateConfig.body.includes('<hr/')
      );
      const autoFooter = templateHandlesFooter ? '' : footerHtml;

      const finalHtml = formatSlashDates(`<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#222;line-height:1.6;">${rawBody}${autoFooter}</div>`);
      const finalText = htmlToPlainText(finalHtml);

      console.log(`[Email Frontend] Invio '${type}' a ${recipient} | Oggetto: "${finalSubject}"`);

      // Legge l'URL del Google Apps Script da api-bridge.js o dalle impostazioni
      const gasUrl = (typeof GOOGLE_SCRIPT_URL !== 'undefined' ? GOOGLE_SCRIPT_URL : '')
        || settings.EMAIL_WEBHOOK_URL
        || settings.WEBHOOK_URL
        || '';

      if (!gasUrl) {
        console.warn(`[Email Frontend] GOOGLE_SCRIPT_URL non configurato. Impossibile inviare email a ${recipient}.`);
        return;
      }

      // Invio diretto a Google Apps Script (MailApp)
      fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'sendEmailNotification',
          type: type,
          recipient: recipient,
          subject: finalSubject,
          htmlBody: finalHtml,
          textBody: finalText
        })
      }).catch(err => console.warn('[Email Frontend] Invio GAS non riuscito:', err));

      console.log(`[Email Frontend] Richiesta email inviata a Google Apps Script per ${recipient}`);

    } catch (err) {
      console.warn(`[Email Frontend] Errore durante l'invio della notifica ${type}:`, err);
    }
  })();
}

/**
 * Adapter legacy: neutralizzato per evitare invii doppi di email.
 * Tutte le notifiche sono già inviate puntualmente da store-bookings.js.
 */
function triggerBackgroundEmailNotification(action, params) {
  // No-op intenzionale: le email sono già inviate all'origine in store-bookings.js
}

/**
 * Controllo e invio promemoria appuntamenti direttamente dal frontend
 */
async function directCheckAndSendReminders() {
  try {
    const store = initFirebaseClient();
    if (!store) return;
    const [settings, bookings, clients] = await Promise.all([
      directGetSettings(),
      fetchCollectionDocs('bookings'),
      directGetClientsList()
    ]);

    const isEmailEnabled = settings.EMAIL_NOTIFICATION === true ||
      String(settings.EMAIL_NOTIFICATION).toLowerCase() === 'true' ||
      settings.emailNotification === true;
    if (!isEmailEnabled) return;

    const clientsMap = new Map((clients || []).map(c => [c.id || c.clientId || '', c]));
    const now = new Date();
    const reminderHours = parseInt(settings.REMINDER_NOTIFICATION_TIME ?? settings.reminderNotificationTime ?? 24, 10) || 24;
    const triggerIntervalHours = 6;

    for (const booking of bookings) {
      const st = (booking.status || '').toLowerCase().trim();
      const reminderSent = !!booking.reminderSent;
      const bIso = formatTimestampToIso(booking.startISO || booking.startIso || booking.start);
      const start = new Date(bIso);

      if ((st === 'confermato' || st === 'weekly' || st === 'richiesta cancellazione') && !reminderSent && start > now) {
        const hoursUntil = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (hoursUntil <= reminderHours && hoursUntil > (reminderHours - triggerIntervalHours)) {
          const client = clientsMap.get(booking.clientId || '') || {};
          const clientEmail = booking.clientEmail || client.email || '';
          if (isValidClientEmail(clientEmail)) {
            directSendEmailNotification('reminder', {
              booking: booking,
              clientData: client,
              clientEmail: clientEmail,
              startDate: start,
              barberId: booking.barberId,
              serviceName: booking.service
            });
            await store.collection('bookings').doc(booking.id || booking.bookingId).update({ reminderSent: true });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Email Reminders] Errore verifica promemoria:', err);
  }
}
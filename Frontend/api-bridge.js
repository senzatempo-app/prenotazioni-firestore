/**
 * Bridge per la comunicazione diretta del Frontend.
 * 100% DIRETTO SU FIRESTORE (< 30ms).
 * Connessione a Google Sheet / Google Apps Script Web App completamente eliminata.
 */
const GOOGLE_SCRIPT_URL = "";
const APP_API_BASE = "";

(function () {
  const isNativeGas = typeof google !== 'undefined' && google.script && google.script.run && !google.script.run._isBridge;
  if (isNativeGas) {
    console.log("[Bridge API] Rilevato ambiente nativo Google Apps Script. Il bridge fetch è disattivato.");
    return;
  }

  // Mappatura delle azioni con risposte istantanee dirette da Firestore (<30ms)
  const DIRECT_ACTIONS = {
    // LEZIONI DIRETTE
    'getAppInitData': (args) => typeof directGetAppInitData === 'function' ? directGetAppInitData(...args) : null,
    'getServices': (args) => typeof directGetServices === 'function' ? directGetServices(...args) : null,
    'getBarbersList': (args) => typeof directGetBarbersList === 'function' ? directGetBarbersList(...args) : null,
    'getSettings': (args) => typeof directGetSettings === 'function' ? directGetSettings(...args) : null,
    'getWorkingHours': (args) => typeof directGetWorkingHours === 'function' ? directGetWorkingHours(...args) : null,
    'getUserBookings': (args) => typeof directGetUserBookings === 'function' ? directGetUserBookings(...args) : null,
    'getClientsList': (args) => typeof directGetClientsList === 'function' ? directGetClientsList(...args) : null,
    'getBarberAppointments': (args) => typeof directGetBarberAppointments === 'function' ? directGetBarberAppointments(...args) : null,
    'getAvailableSlots': (args) => typeof directGetAvailableSlots === 'function' ? directGetAvailableSlots(...args) : null,
    'getWeeklyBookingsList': (args) => typeof directGetWeeklyBookingsList === 'function' ? directGetWeeklyBookingsList(...args) : null,
    'getItalianHolidaysStatus': (args) => typeof directGetItalianHolidaysStatus === 'function' ? directGetItalianHolidaysStatus(...args) : null,

    // SCRITTURE DIRETTE + NOTIFICA BACKGROUND
    'processBooking': async (args) => {
      if (typeof directProcessBooking !== 'function') return null;
      const res = await directProcessBooking(...args);
      // Avvia notifica email in background senza far attendere l'utente
      triggerBackgroundEmailNotification('processBooking', args);
      return res;
    },
    'cancelAppointment': async (args) => {
      if (typeof directCancelAppointment !== 'function') return null;
      const res = await directCancelAppointment(...args);
      triggerBackgroundEmailNotification('cancelAppointment', args);
      return res;
    },
    'requestCancellation': async (args) => {
      if (typeof directRequestCancellation !== 'function') return null;
      // args[0] è eventId/bookingId, args[1] è calendarId, args[2] è reason
      const res = await directRequestCancellation(args[0], args[1], args[2]);
      triggerBackgroundEmailNotification('requestCancellation', args);
      return res;
    },
    'handleCancellationDecision': async (args) => {
      if (typeof directHandleCancellationDecision !== 'function') return null;
      const res = await directHandleCancellationDecision(args[0], args[1]);
      triggerBackgroundEmailNotification('handleCancellationDecision', args);
      return res;
    },
    'saveGlobalSettings': async (args) => {
      if (typeof directSaveGlobalSettings !== 'function') return null;
      return await directSaveGlobalSettings(args[0], args[1]);
    },
    'saveWorkingHoursAndSettings': async (args) => {
      if (typeof directSaveWorkingHoursAndSettings !== 'function') return null;
      return await directSaveWorkingHoursAndSettings(args[0]);
    },
    'getClientConfig': (args) => {
      return typeof directGetClientConfig === 'function' ? directGetClientConfig(args[0]) : null;
    },
    'saveIndisponibilitaRange': async (args) => {
      if (typeof directSaveIndisponibilitaRange !== 'function') return null;
      return await directSaveIndisponibilitaRange(...args);
    },
    'registerOrUpdateUser': async (args) => {
      if (typeof directRegisterOrUpdateUser !== 'function') return null;
      return await directRegisterOrUpdateUser(...args);
    },
    'updateClientData': async (args) => {
      if (typeof directUpdateClientData !== 'function') return null;
      return await directUpdateClientData(args[0], args[1]);
    },
    'deleteClient': async (args) => {
      if (typeof directDeleteClient !== 'function') return null;
      return await directDeleteClient(args[0]);
    },
    'verifyBarberPassword': async (args) => {
      if (typeof directVerifyBarberPassword !== 'function') return null;
      return await directVerifyBarberPassword(args[0], args[1]);
    },
    'manageService': async (args) => {
      if (typeof directManageService !== 'function') return null;
      return await directManageService(args[0], args[1]);
    }
  };

  const ACTIONS = [
    'getAppInitData', 'getDefaultCutTime',
    'getBarbersList', 'getServices', 'manageService', 'verifyBarberPassword',
    'getSettings', 'getWorkingHours', 'saveWorkingHoursAndSettings', 'saveGlobalSettings', 
    'getItalianHolidaysStatus', 'toggleHolidayClosure', 'manageCustomHoliday',
    'registerOrUpdateUser', 'updateClientData', 'getClientConfig', 'getClientsList', 'deleteClient',
    'processBooking', 'getUserBookings', 'cancelAppointment', 'updateAppointment', 
    'handleCancellationDecision', 'saveIndisponibilita', 'updateIndisponibilita', 
    'saveIndisponibilitaRange', 'saveWeeklyAppointment', 'removeWeeklyAppointment', 
    'getWeeklyBookingsList', 'getBarberAppointments', 'requestCancellation', 'getWeeklyConflictsPreview',
    'getAvailableSlots'
  ];

  function createRunner() {
    let successHandler = null;
    let failureHandler = null;

    const runner = {
      _isBridge: true,
      withSuccessHandler: function (callback) {
        successHandler = callback;
        return runner;
      },
      withFailureHandler: function (callback) {
        failureHandler = callback;
        return runner;
      }
    };

    ACTIONS.forEach(action => {
      runner[action] = async function (...args) {
        const currentSuccess = successHandler;
        const currentFailure = failureHandler;

        // Se esiste un gestore diretto (Firestore SDK)
        if (DIRECT_ACTIONS[action]) {
          try {
            const directResult = await DIRECT_ACTIONS[action](args);
            if (directResult !== null && directResult !== undefined) {
              if (currentSuccess) currentSuccess(directResult);
              return;
            }
          } catch (directErr) {
            console.error(`[Bridge API] Errore nell'operazione diretta ${action}:`, directErr);
            const errMsg = (directErr && directErr.message) ? directErr.message : String(directErr);
            if (currentFailure) {
              currentFailure(errMsg);
            }
            return;
          }
        }

        if (!APP_API_BASE) {
          const errText = `[Bridge API] Operazione '${action}' bloccata: la connessione a Google Sheet è stata completamente rimossa. Questa operazione deve essere gestita direttamente su Firestore.`;
          console.error(errText);
          if (currentFailure) currentFailure(errText);
          return;
        }

        console.log(`[Bridge API] Esecuzione Web App Backend: ${action}`, args);

        try {
          const timestamp = Date.now();
          const fetchUrl = APP_API_BASE + (APP_API_BASE.includes('?') ? '&' : '?') + "t=" + timestamp;

          const response = await fetch(fetchUrl, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: action, params: args })
          });

          if (!response.ok) {
            throw new Error(`Errore HTTP: ${response.status}`);
          }

          const text = await response.text();
          let result;
          try {
            result = JSON.parse(text);
          } catch (e) {
            throw new Error("Risposta non JSON dal server: " + text.substring(0, 100));
          }

          if (result.status === 'success') {
            if (currentSuccess) currentSuccess(result.data);
          } else {
            console.error(`[Bridge API] Errore Backend per ${action}:`, result.message);
            if (currentFailure) currentFailure(result.message);
          }
        } catch (error) {
          console.error(`[Bridge API] Errore di connessione per ${action}:`, error);
          if (currentFailure) currentFailure(error.message || error);
        }
      };
    });

    return runner;
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};

  Object.defineProperty(window.google.script, 'run', {
    get: function () {
      return createRunner();
    },
    configurable: true,
    enumerable: true
  });

  console.log("[Bridge API] Inizializzato in modalità Scrittura Istantanea Firestore + Mail Asincrone.");
})();
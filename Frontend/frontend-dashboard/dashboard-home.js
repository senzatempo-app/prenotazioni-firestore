/**
 * Logica e Rendering della Dashboard del Barbiere
 */
let currentBarberId = null; // ID del barbiere loggato
let currentCalendarWeekStart = new Date(); // Inizio della settimana visualizzata nel calendario
let currentDisplayedBarberId = null; // ID del barbiere attualmente visualizzato nella dashboard
let currentCalendarView = localStorage.getItem('barber_calendar_view') || 'day';
let cachedBarberAppointments = null; // Cache locale per tutti gli appuntamenti del barbiere
let isCalendarExpanded = currentCalendarView === 'week';
let dashboardCalendarScrollPosition = null; // Memorizza la posizione di scroll del calendario tra le viste
let editAppState = {}; // Stato per la modifica appuntamento nel popup
let dashboardAutoRefreshInterval = null; // Timer per il refresh automatico

/**
 * Renderizza la pagina di richiesta password per il barbiere.
 */
function renderBarberPasswordPage(skipPush = false) {
    window.scrollTo(0, 0);
    if (!skipPush) pushView('barber-password');

    const renderForm = () => {
        appContainer.innerHTML = `
            <div id="barber-password-screen" class="full-screen">
                <div class="registration-content">
                    <img src="./Frontend/assets/logo-full-maskable.png" alt="Logo" style="width: 280px; margin: 0 auto 20px; display: block;">
                    <p style="text-align: center; color: #666; margin-bottom: 20px;">Inserisci le tue credenziali per accedere alla dashboard.</p>
                    <input type="email" id="barberEmail" placeholder="Email" required onkeydown="if(event.key === 'Enter') handleBarberPasswordSubmit()">
                    <input type="password" id="barberPassword" placeholder="Password" required onkeydown="if(event.key === 'Enter') handleBarberPasswordSubmit()">
                    <button class="login-button" onclick="handleBarberPasswordSubmit()">Accedi</button>
                    <p id="passwordError" style="color: #dc3545; text-align: center; margin-top: 10px; display: none;">Email o Password errata. Riprova.</p>
                </div>
            </div>
        `;
    };

    // Se le impostazioni non sono in cache, mostra lo spinner e caricale
    if (!cachedAppData || !cachedAppData.settings) {
        appContainer.innerHTML = `<div class="loading-container"><div class="spinner"></div></div>`;
        google.script.run.withSuccessHandler(settings => {
            if (!cachedAppData) cachedAppData = {};
            cachedAppData.settings = settings;
            renderForm();
        }).getSettings();
    } else {
        renderForm();
    }
}

/**
 * Mostra un messaggio di errore nel form di login del barbiere e ripristina il pulsante.
 * @param {string} message - Il messaggio da visualizzare.
 */
function showLoginError(message) {
    const errorDisplay = document.getElementById('passwordError');
    const btn = document.querySelector('#barber-password-screen button');
    const passwordInput = document.getElementById('barberPassword');

    if (errorDisplay) {
        errorDisplay.innerText = message;
        errorDisplay.style.display = 'block';
    }
    // Usa la funzione globale per nascondere lo spinner e ripristinare il pulsante
    if (btn) hideButtonSpinner(btn);
    if (passwordInput) passwordInput.value = '';
}

/**
 * Gestisce l'invio della password del barbiere.
 */
function handleBarberPasswordSubmit() {
    const email = document.getElementById('barberEmail').value.trim();
    const password = document.getElementById('barberPassword').value.trim();
    const btn = document.querySelector('#barber-password-screen button');

    if (!email || !password) return showLoginError("Inserisci sia email che password.");

    showButtonSpinner(btn); // Mostra lo spinner nel pulsante

    google.script.run
        .withSuccessHandler(isCorrect => {
            if (isCorrect) {
                localStorage.setItem('barber_authenticated', 'true'); // Marca l'utente come autenticato in modo persistente

                // Salviamo temporaneamente l'email per caricare i dati corretti
                userData = { email: email };
                localStorage.setItem('barber_user', JSON.stringify(userData));

                // Mostra lo spinner a schermo intero durante il caricamento dei dati
                appContainer.innerHTML = `<div class="loading-container"><div class="spinner"></div></div>`;

                // Carichiamo i dati iniziali del barbiere prima di mostrare la dashboard
                google.script.run.withSuccessHandler(data => {
                    cachedAppData = data;
                    document.title = (data.settings.BUSINESS_NAME || 'Business') + " - Gestionale";
                    // Cerchiamo i dettagli completi del barbiere per aggiornare userData
                    const barberInfo = Object.values(data.barbers || {}).find(b => b.email && b.email.toLowerCase() === email.toLowerCase());
                    if (barberInfo) {
                        userData.nome = barberInfo.nome || barberInfo.name || 'Barbiere';
                        localStorage.setItem('barber_user', JSON.stringify(userData));
                    }
                    initBarberDashboard();
                }).withFailureHandler(showNetworkError).getAppInitData(email, null, true); // Esegui un full-load all'accesso

            } else {
                showLoginError("Credenziali non valide. Riprova.");
            }
        })
        .withFailureHandler(err => {
            showLoginError("Errore di verifica: " + err);
        })
        .verifyBarberPassword(email, password);
}

/**
 * Inizializza la dashboard del barbiere, recuperando l'ID del barbiere loggato.
 */
function initBarberDashboard() {
    // Se i dati non sono ancora in cache, mostra lo spinner corretto e avvia il caricamento.
    if (!cachedAppData) {
        appContainer.innerHTML = `<div class="loading-container"><div class="spinner"></div></div>`;
        google.script.run.withSuccessHandler(data => {
            cachedAppData = data;
            initBarberDashboard(); // Richiama se stessa con i dati ora in cache
        }).withFailureHandler(showNetworkError).getAppInitData(userData.email, null, false); // Caricamento iniziale "leggero"
        return; // Esce per attendere il caricamento
    }

    // Trova l'ID del barbiere loggato
    const barberEntries = Object.entries(cachedAppData.barbers || {});
    const foundBarber = barberEntries.find(([id, b]) => b && b.email && b.email.toLowerCase() === (userData.email || '').toLowerCase());
    if (foundBarber) {
        currentBarberId = foundBarber[0]; // Salva l'ID del barbiere
    } else {
        showCustomAlert("Errore", "Impossibile trovare il barbiere associato a questa email.");
        resetUserAndReload();
        return;
    }

    // Imposta la data di riferimento a oggi a mezzanotte
    const today = new Date();
    currentCalendarWeekStart.setHours(0, 0, 0, 0);

    currentDisplayedBarberId = currentBarberId;

    // Utilizziamo i dati già presenti nel caricamento iniziale (cachedAppData)
    // Questo evita la seconda chiamata getAppInitData all'apertura
    cachedBarberAppointments = cachedAppData.barberAppointments || [];

    renderBarberDashboardPage();
    startDashboardAutoRefresh();
    if (typeof directCheckAndSendReminders === 'function') {
        directCheckAndSendReminders();
    }
    if (typeof directCleanupOldBookings === 'function') {
        directCleanupOldBookings();
    }
}

function renderBarberDashboardPage(skipPush = false, isSilent = false) {
    window.scrollTo(0, 0);
    // Assicurati che l'utente sia autenticato come barbiere per vedere questa pagina
    if (!localStorage.getItem('barber_authenticated')) {
        renderBarberPasswordPage(skipPush); // Reindirizza alla pagina di password se non autenticato
        return;
    }
    if (!skipPush) pushView('dashboard');

    // Salva la posizione di scroll del calendario prima di ridisegnare la pagina
    const oldCalendarBody = document.querySelector('.calendar-body');
    const savedScrollTop = oldCalendarBody ? oldCalendarBody.scrollTop : dashboardCalendarScrollPosition;

    // Recupera i dati del barbiere attualmente visualizzato
    const displayedBarber = (cachedAppData.barbers && cachedAppData.barbers[currentDisplayedBarberId]) || {};
    const displayedBarberName = displayedBarber.nome || displayedBarber.name || 'Barbiere';
    // Sicurezza: controlla se barber_1 esiste prima di accedere alla mail
    const isOwner = (cachedAppData.barbers && cachedAppData.barbers.barber_1 && cachedAppData.barbers.barber_1.email)
        ? ((userData.email || '').toLowerCase() === cachedAppData.barbers.barber_1.email.toLowerCase())
        : false;

    const layoutClass = isCalendarExpanded ? 'dashboard-layout expanded' : 'dashboard-layout';
    const animClass = isSilent ? '' : 'fade-in';
    const headerClass = isCalendarExpanded ? `barber-display-header ${animClass} expanded` : `barber-display-header ${animClass}`;

    // Calcola se ci sono richieste di cancellazione pendenti (case-insensitive)
    const pendingCount = cachedBarberAppointments ?
        cachedBarberAppointments.filter(a => String(a.status || '').trim().toLowerCase() === 'richiesta cancellazione').length : 0;

    const cancelCardStyle = pendingCount > 0
        ? "background-color: #dc3545; color: white; border: none; box-shadow: 0 4px 15px rgba(220, 53, 69, 0.4);"
        : "background-color: white; color: #1a1a1a;";

    appContainer.innerHTML = `
        <div id="barber-dashboard-screen" class="full-screen">
            <div class="fixed-header">
                <img src="./Frontend/assets/logo-name-maskable.png" alt="Logo" style="height: 45px; width: auto;">
                <button class="logout-header-btn" onclick="confirmLogout(renderBarberDashboardPage)" title="Logout">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc3545" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>
            </div>
            <div class="home-content">
                <div class="${layoutClass}">
                    <!-- Colonna Sinistra: Calendario -->
                    <div class="calendar-section">
                        <div class="calendar-unified-container ${animClass}">
                            <div class="calendar-controls">
                                <!-- Sezione Sinistra: Nome Barbiere -->
                                <div class="calendar-controls-left">
                                    <div class="calendar-barber-name">
                                        <h2>${displayedBarberName}</h2>
                                    </div>
                                </div>

                                <!-- Sezione Centrale: Dati Periodo, Freccia <, Freccia >, Tasto OGGI -->
                                <div class="calendar-controls-center">
                                    <span id="current-period-label"></span>
                                    <div class="calendar-nav-arrows">
                                        <button onclick="changeCalendarPeriod(-1)" class="nav-arrow" title="Precedente">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                                        </button>
                                        <button onclick="changeCalendarPeriod(1)" class="nav-arrow" title="Successivo">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                        </button>
                                    </div>
                                    <button onclick="goToToday()" class="today-btn">OGGI</button>
                                </div>

                                <!-- Sezione Destra: Switch Giorno/Settimana e Refresh -->
                                <div class="calendar-controls-right">
                                    <div class="view-selector">
                                        <button class="${currentCalendarView === 'day' ? 'active' : ''}" onclick="setCalendarView('day')">Giorno</button>
                                        <button class="${currentCalendarView === 'week' ? 'active' : ''}" onclick="setCalendarView('week')">Settimana</button>
                                    </div>
                                    <button class="calendar-refresh-btn" onclick="refreshDashboardData(false)" title="Sincronizza">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                                    </button>
                                </div>
                            </div>

                            <div id="custom-barber-calendar" class="custom-calendar">
                                <!-- Contenuto generato da renderCustomCalendar -->
                                <div class="spinner" style="margin: 50px auto;"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Colonna Destra: Barra Azioni Rapide a Icone -->
                    <div class="info-section quick-actions-sidebar ${animClass}">
                        <button class="quick-action-btn" data-tooltip="Aggiungi Appuntamento" onclick="saveDashboardScroll(); renderBarberAddAppointmentPage();" aria-label="Aggiungi Appuntamento" title="Aggiungi Appuntamento">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        </button>
                        
                        <button class="quick-action-btn" data-tooltip="Appuntamenti Settimanali" onclick="saveDashboardScroll(); renderBarberWeeklyAppointmentsListPage();" aria-label="Appuntamenti Settimanali" title="Appuntamenti Settimanali">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15.61V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"></path><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h18"></path><path d="M19 22l2-2-2-2"></path><path d="M21 20H15a2 2 0 0 1-2-2"></path></svg>
                        </button>

                        <button class="quick-action-btn" data-tooltip="Lista Appuntamenti" onclick="saveDashboardScroll(); renderBarberAppointmentsListPage();" aria-label="Lista Appuntamenti" title="Lista Appuntamenti">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        </button>                            

                        <button class="quick-action-btn" data-tooltip="Lista Clienti" onclick="saveDashboardScroll(); renderBarberClientsListPage();" aria-label="Lista Clienti" title="Lista Clienti">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                        </button>

                        <button class="quick-action-btn ${pendingCount > 0 ? 'has-pending' : ''}" data-tooltip="Richieste Cancellazione" onclick="saveDashboardScroll(); renderBarberCancellationsPage();" aria-label="Richieste Cancellazione" title="Richieste Cancellazione">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${pendingCount > 0 ? '#dc3545' : 'currentColor'}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                            ${pendingCount > 0 ? `<span class="quick-action-badge">${pendingCount}</span>` : ''}
                        </button>

                        <button class="quick-action-btn" data-tooltip="Orari e Servizi" onclick="saveDashboardScroll(); renderBarberWorkingHoursPage();" aria-label="Orari e Servizi" title="Orari e Servizi">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        </button>

                        <button class="quick-action-btn" data-tooltip="Indisponibilità Barbiere" onclick="saveDashboardScroll(); renderPersonalCommitmentsListPage();" aria-label="Indisponibilità Barbiere" title="Indisponibilità Barbiere">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                        </button>

                        <button class="quick-action-btn" data-tooltip="Impostazioni" onclick="saveDashboardScroll(); renderBarberSettingsPage();" aria-label="Impostazioni" title="Impostazioni">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Se abbiamo i dati in cache, renderizziamo subito il calendario, altrimenti mostriamo lo spinner
    if (cachedBarberAppointments) {
        renderCustomCalendar(cachedBarberAppointments, isSilent, savedScrollTop);
    } else {
        const calendarContainer = document.getElementById('custom-barber-calendar');
        if (calendarContainer) calendarContainer.innerHTML = '<div class="spinner" style="margin: 50px auto;"></div>';
    }
}

function saveDashboardScroll() {
    const calendarBody = document.querySelector('.calendar-body');
    if (calendarBody) dashboardCalendarScrollPosition = calendarBody.scrollTop;
}


/**
 * Esempio di implementazione di una Sotto-Pagina: Richieste Cancellazione
 */
function renderBarberCancellations() {
    window.scrollTo(0, 0);
    const displayedBarber = (cachedAppData.barbers && cachedAppData.barbers[currentDisplayedBarberId]) || {};
    const displayedBarberName = displayedBarber.nome || displayedBarber.name || 'Barbiere';

    appContainer.innerHTML = `
        <div id="cancellations-screen" class="full-screen">
            <div class="fixed-header" onclick="saveDashboardScroll()">
                <button onclick="renderBarberDashboardPage();" class="header-back-btn">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <h2>RICHIESTE CANCELLAZIONE</h2>
            </div>
            <div class="home-content">
                <div class="booking-container">
                    <h2 style="margin-top: 20px;">Richieste per ${displayedBarberName}</h2>
                    <p style="text-align: center; color: #666; margin-bottom: 20px;">Qui appariranno le richieste pendenti.</p>
                    
                    <!-- Area per la lista delle richieste (da popolare con una fetch) -->
                    <div id="cancellations-list">
                         <p style="text-align: center; color: #aaa; font-style: italic; margin-top: 50px;">Nessuna richiesta al momento.</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Placeholder per le altre pagine
 */
function renderBarberAddAppointment() { showCustomAlert("Info", "Pagina Aggiungi Appuntamento in costruzione"); }
function renderBarberClientsList() { showCustomAlert("Info", "Pagina Lista Clienti in costruzione"); }
function renderBarberAppointmentsList() { showCustomAlert("Info", "Pagina Elenco Appuntamenti in costruzione"); }
function renderBarberSettings() { showCustomAlert("Info", "Pagina Impostazioni in costruzione"); }

/**
 * Cambia la visualizzazione del calendario.
 */
function setCalendarView(view) {
    if (currentCalendarView === view) return;

    currentCalendarView = view;
    isCalendarExpanded = (view === 'week');
    localStorage.setItem('barber_calendar_view', view);

    const layout = document.querySelector('.dashboard-layout');
    if (layout) {
        layout.classList.toggle('expanded', isCalendarExpanded);
    }

    document.querySelectorAll('.view-selector button').forEach(btn => {
        const isSettimana = btn.textContent.toLowerCase().includes('settimana');
        btn.classList.toggle('active', (view === 'week' && isSettimana) || (view === 'day' && !isSettimana));
    });

    fetchAndRenderBarberAppointments();
}

/**
 * Riporta il calendario alla data odierna.
 */
function goToToday() {
    currentCalendarWeekStart = new Date();
    currentCalendarWeekStart.setHours(0, 0, 0, 0);
    fetchAndRenderBarberAppointments(); // Utilizza la cache
}

/**
 * Cambia il periodo visualizzato (giorno o settimana) nel calendario.
 * @param {number} offset - Numero di periodi da aggiungere/sottrarre.
 */
function changeCalendarPeriod(offset) {
    const step = currentCalendarView === 'week' ? 7 : 1;
    const newDate = new Date(currentCalendarWeekStart);
    newDate.setDate(newDate.getDate() + (offset * step));
    currentCalendarWeekStart = newDate;

    // Passiamo l'offset a fetchAndRender per gestire l'animazione
    fetchAndRenderBarberAppointments(false, true, null, offset);
}

/**
 * Posiziona lo scroll del calendario in modo che l'ora corrente sia a 1/4 dell'altezza.
 */
function scrollToCurrentTime(calendarBodyEl) {
    if (!calendarBodyEl) return;

    requestAnimationFrame(() => {
        const now = new Date();
        const hourHeight = 100;
        const currentPixels = (now.getHours() * hourHeight) + (now.getMinutes() * (hourHeight / 60));
        const targetScroll = currentPixels - (calendarBodyEl.clientHeight / 4);
        calendarBodyEl.scrollTop = targetScroll > 0 ? targetScroll : 0;
    });
}

/**
 * Avvia o resetta il timer per il refresh automatico dei dati ogni 10 minuti.
 */
function startDashboardAutoRefresh() {
    if (dashboardAutoRefreshInterval) clearInterval(dashboardAutoRefreshInterval);
    dashboardAutoRefreshInterval = setInterval(() => {
        console.log("[Dashboard] Sync automatico (5 min)...");
        refreshDashboardData(true); // Esegue il refresh in modalità "silenziosa"
        if (typeof directCheckAndSendReminders === 'function') {
            directCheckAndSendReminders();
        }
        if (typeof directCleanupOldBookings === 'function') {
            directCleanupOldBookings();
        }
    }, 5 * 60 * 1000); // Portato a 5 minuti
}

/**
 * Esegue un refresh completo di tutti i dati (globali e del barbiere visualizzato).
 * @param {boolean} isSilent - Se true, non mostra lo spinner di caricamento.
 */
function refreshDashboardData(isSilent = false, callback = null) {
    if (!userData || !userData.email || !currentDisplayedBarberId) return;

    const calendarContainer = document.getElementById('custom-barber-calendar');

    // Se il refresh è manuale (non silenzioso), mostriamo lo spinner solo nel calendario
    if (!isSilent) {
        if (calendarContainer) {
            calendarContainer.innerHTML = '<div class="spinner" style="margin: 50px auto;"></div>';
        }
    }

    google.script.run
        .withSuccessHandler(data => {
            cachedAppData = data;
            cachedBarberAppointments = data.barberAppointments || [];

            // Se è stato passato un callback (es. dopo aver salvato un impegno), lo eseguiamo.
            if (callback && typeof callback === 'function') {
                callback();
            } else if (document.getElementById('barber-dashboard-screen')) {
                if (isSilent) {
                    // Aggiornamento silenzioso: aggiorna solo il calendario preservando esattamente la posizione di scroll
                    const currentBody = document.querySelector('.calendar-body');
                    const savedScroll = currentBody ? currentBody.scrollTop : dashboardCalendarScrollPosition;
                    // Aggiorna eventuale stile del pulsante richieste di cancellazione
                    const pendingBtn = document.querySelector('.cancellation-requests-btn');
                    if (pendingBtn) {
                        const pendingCount = cachedBarberAppointments.filter(a => String(a.status || '').trim().toLowerCase() === 'richiesta cancellazione').length;
                        pendingBtn.style.cssText = pendingCount > 0
                            ? "background-color: #dc3545; color: white; border: none; box-shadow: 0 4px 15px rgba(220, 53, 69, 0.4);"
                            : "background-color: white; color: #1a1a1a;";
                    }
                    renderCustomCalendar(cachedBarberAppointments, true, savedScroll, 0);
                } else {
                    renderBarberDashboardPage(true, false);
                }
            } else {
                // Fallback: aggiorna solo il calendario se non siamo in nessuna delle condizioni precedenti.
                const currentBody = document.querySelector('.calendar-body');
                const savedScroll = currentBody ? currentBody.scrollTop : dashboardCalendarScrollPosition;
                renderCustomCalendar(cachedBarberAppointments, true, savedScroll, 0);
            }
        })
        .getAppInitData(userData.email, currentDisplayedBarberId, false); // Esegui sempre un caricamento "leggero" al refresh
}

/**
 * Recupera gli appuntamenti del barbiere dal backend e li renderizza nel calendario.
 * @param {boolean} forceRefresh - Se true, ignora la cache e interroga il server.
 * @param {boolean} isSilent - Se true, non mostra lo spinner di caricamento.
 */
function fetchAndRenderBarberAppointments(forceRefresh = false, isSilent = false, savedScrollTop = null, slideDirection = 0) {
    if (!currentDisplayedBarberId) {
        console.error("Nessun barbiere selezionato per il caricamento dati.");
        return;
    }

    // Salva la posizione di scroll corrente se stiamo per avviare un'animazione
    const currentBody = document.querySelector('.calendar-sliding-content.active .calendar-body');
    const scrollPos = savedScrollTop !== null ? savedScrollTop : (currentBody ? currentBody.scrollTop : null);

    // Se abbiamo i dati in cache e non è richiesto un refresh forzato, renderizziamo istantaneamente
    if (cachedBarberAppointments && !forceRefresh) {
        console.log("[Dashboard] Rendering da cache locale...");
        renderCustomCalendar(cachedBarberAppointments, isSilent, scrollPos, slideDirection);
        return;
    }

    const calendarContainer = document.getElementById('custom-barber-calendar');
    // Se stiamo facendo uno slide, non mostrare lo spinner principale
    if (slideDirection !== 0) isSilent = true;

    if (calendarContainer && !isSilent) {
        calendarContainer.innerHTML = '<div class="spinner" style="margin: 50px auto;"></div>'; // Mostra spinner
    }

    google.script.run
        .withSuccessHandler(appointments => { // Questo handler viene chiamato per currentDisplayedBarberId
            console.log("[Dashboard] Dati ricevuti dal server e salvati in cache.");
            cachedBarberAppointments = appointments; // Popola la cache

            // Se siamo nella dashboard principale e non è un refresh silenzioso (background),
            // rinfreschiamo l'intera pagina per aggiornare i colori delle card e il testo bianco
            if (document.getElementById('barber-dashboard-screen') && !isSilent) {
                renderBarberDashboardPage();
            } else {
                renderCustomCalendar(appointments, isSilent, scrollPos, slideDirection);
            }
        })
        .withFailureHandler(err => {
            console.error("Errore nel recupero appuntamenti barbiere:", err);
            if (calendarContainer) {
                calendarContainer.innerHTML = `<p style="text-align:center; color:#dc3545;">Errore caricamento appuntamenti: ${err}</p>`;
            }
        })
        .getBarberAppointments(currentDisplayedBarberId);
}

/**
 * Renderizza il calendario personalizzato con gli appuntamenti.
 * @param {Array} appointments - Lista degli appuntamenti del barbiere.
 */
function renderCustomCalendar(appointments, isSilent = false, savedScrollTop = null, slideDirection = 0) {
    const calendarContainer = document.getElementById('custom-barber-calendar');
    if (!calendarContainer) return;

    const hourHeight = 100;
    calendarContainer.classList.toggle('calendar-view-week', currentCalendarView === 'week');
    calendarContainer.classList.toggle('daily-view-full-height', currentCalendarView === 'day');

    const daysOfWeek = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    const monthsFull = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

    let viewStart = new Date(currentCalendarWeekStart);
    let numDays = currentCalendarView === 'week' ? 7 : 1;

    // Se vista settimanale, calcoliamo sempre il lunedì della settimana di riferimento
    if (currentCalendarView === 'week') {
        const day = viewStart.getDay();
        const diff = viewStart.getDate() - day + (day === 0 ? -6 : 1);
        viewStart = new Date(viewStart.setDate(diff));
    }

    const viewEnd = new Date(viewStart);
    viewEnd.setDate(viewEnd.getDate() + (numDays - 1));

    // Aggiorna il label del periodo corrente
    const periodLabel = document.getElementById('current-period-label');
    if (periodLabel) {
        if (currentCalendarView === 'week') {
            periodLabel.innerText = `${viewStart.getDate()} ${months[viewStart.getMonth()]} - ${viewEnd.getDate()} ${months[viewEnd.getMonth()]}`;
        } else {
            periodLabel.innerText = `${monthsFull[viewStart.getMonth()]}`;
        }
    }

    let headerHtml = '';
    let daysColumnWrapperHtml = '';
    let viewContainsToday = false;

    // Genera la colonna degli orari con l'altezza dinamica
    const timeColumnHtml = Array.from({ length: 24 }, (_, h) =>
        `<div class="time-label" style="height: ${hourHeight}px;">${String(h).padStart(2, '0')}</div>`
    ).join('');

    for (let i = 0; i < numDays; i++) {
        const day = new Date(viewStart);
        day.setDate(viewStart.getDate() + i);
        const now = new Date();
        const isToday = day.toDateString() === now.toDateString();
        if (isToday) viewContainsToday = true;

        const colYear = day.getFullYear();
        const colMonth = String(day.getMonth() + 1).padStart(2, '0');
        const colDayNum = String(day.getDate()).padStart(2, '0');
        const colDateKey = `${colYear}-${colMonth}-${colDayNum}`;

        const dayName = daysOfWeek[day.getDay() === 0 ? 6 : day.getDay() - 1];
        headerHtml += `<div class="day-header ${isToday ? 'today' : ''}">${currentCalendarView === 'week' ? dayName.substring(0, 3) : dayName}<br>${day.getDate()}</div>`;

        let dayAppointmentsHtml = '';
        if (isToday) {
            // Linea del tempo corrente proporzionata
            const lineTop = (now.getHours() * hourHeight) + (now.getMinutes() * (hourHeight / 60));
            dayAppointmentsHtml += `<div class="current-time-line" style="top: ${lineTop}px;"></div>`;
        }

        const dayAppointments = appointments.filter(app => {
            if (!app.start) return false;
            const appDate = new Date(app.start);
            return !isNaN(appDate.getTime()) && appDate.toDateString() === day.toDateString();
        });

        dayAppointments.forEach(app => {
            const appStart = new Date(app.start);
            const durationMin = parseInt(app.duration, 10) || 30;
            const appEnd = app.end ? new Date(app.end) : new Date(appStart.getTime() + durationMin * 60000);
            const startHour = appStart.getHours();
            const startMinute = appStart.getMinutes();
            const endHour = !isNaN(appEnd.getTime()) ? appEnd.getHours() : startHour;
            const endMinute = !isNaN(appEnd.getTime()) ? appEnd.getMinutes() : startMinute + durationMin;

            // Calcolo proporzionale: 1 ora = hourHeight pixel
            const top = (startHour * hourHeight) + (startMinute * (hourHeight / 60));
            const calculatedHeight = ((endHour * hourHeight) + (endMinute * (hourHeight / 60))) - top;
            const height = Math.max(!isNaN(calculatedHeight) && calculatedHeight > 0 ? calculatedHeight : (durationMin * (hourHeight / 60)), 24);

            const statusNormalized = String(app.status || '').trim().toLowerCase();
            const isPendingCancel = statusNormalized === 'richiesta cancellazione';
            const isWeekly = statusNormalized === 'weekly';
            const isIndispo = statusNormalized === 'indisponibile';
            const isPast = appStart < now;
            const statusClass = isIndispo ? 'appointment-indisponibile' : (isPendingCancel ? 'appointment-pending' : 'appointment-confirmed');
            const cancelStyle = isPendingCancel ? 'background-color: #dc3545 !important; color: white !important; border-left: 3px solid rgba(0,0,0,0.2);' : '';
            const weeklyStyle = isWeekly ? 'background-color: #3498db !important; color: white !important; border-left: 3px solid rgba(0,0,0,0.2);' : '';
            const cancelReason = app.cancelReason || app.cancellationReason || '';

            const safeClientName = String(app.clientName || '').replace(/'/g, "\\'");
            const safeService = String(app.service || '').replace(/'/g, "\\'");
            const safeCancelReason = String(cancelReason).replace(/'/g, "\\'");

            dayAppointmentsHtml += `
                <div class="appointment-item ${statusClass} ${isPast ? 'past-appointment' : ''}" style="top: ${top}px; height: ${height}px; --appointment-height: ${height}px; ${cancelStyle} ${weeklyStyle}"
                    data-app-id="${app.id}"
                    data-client-name="${safeClientName}"
                    data-service="${safeService}"
                    data-start="${app.start}"
                    data-end="${app.end || appEnd.toISOString()}"
                    data-duration="${durationMin}"
                    data-phone="${app.clientPhone || ''}"
                    data-barber-id="${app.barberId || currentDisplayedBarberId}"
                    data-status="${app.status || ''}"
                    data-cancel-reason="${safeCancelReason}"
                    onpointerdown="initAppointmentDrag(event, this)"
                    onclick="showAppointmentDetailsPopup('${app.id}', '${safeClientName}', '${safeService}', '${app.start}', '${app.end || appEnd.toISOString()}', '${app.clientPhone || ''}', '${app.barberId || currentDisplayedBarberId}', '${app.status || ''}', '${safeCancelReason}', this)">
                    <div class="appointment-header">
                        <span class="appointment-time">${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}</span>
                        <span class="appointment-service">${(app.service || '').replace(/_/g, ' ')}</span>
                    </div>
                    <span class="appointment-client">${app.clientName || ''}</span>
                </div>
            `;
        });

        // Applica stili dinamici alla colonna del giorno
        const dayColumnStyle = `
            min-height: ${24 * hourHeight}px;
            background-size: 100% ${hourHeight}px;
        `;
        daysColumnWrapperHtml += `<div class="day-column ${isToday ? 'today' : ''}" data-date="${colDateKey}" style="${dayColumnStyle}">${dayAppointmentsHtml}</div>`;
    }

    // Calcolo del padding per l'allineamento verticale
    const verticalPadding = hourHeight / 2;
    const newContentHtml = `
        <div class="calendar-header"><div class="time-column-header"></div>${headerHtml}</div>
        <div class="calendar-body">
            <div class="time-column" style="padding-top: ${verticalPadding}px;">
                ${timeColumnHtml}
            </div>
            <div class="days-column-wrapper" style="padding-top: ${verticalPadding}px;">${daysColumnWrapperHtml}</div>
        </div>
    `;

    if (slideDirection === 0) {
        const activeContent = calendarContainer.querySelector('.calendar-sliding-content.active');
        const currentBody = calendarContainer.querySelector('.calendar-body');
        const targetScroll = (savedScrollTop !== null && savedScrollTop !== undefined)
            ? savedScrollTop
            : (currentBody ? currentBody.scrollTop : dashboardCalendarScrollPosition);

        if (activeContent) {
            // Aggiornamento in-place silenzioso: non distrugge il container scroll né genera lampeggi
            activeContent.innerHTML = newContentHtml;
            const newBody = activeContent.querySelector('.calendar-body');
            if (newBody && targetScroll !== null && targetScroll !== undefined) {
                newBody.scrollTop = targetScroll;
            } else if (newBody && !isSilent && viewContainsToday) {
                scrollToCurrentTime(newBody);
            }
            const firstTimeLabel = activeContent.querySelector('.time-label:first-child');
            if (firstTimeLabel) firstTimeLabel.style.marginTop = `-${verticalPadding}px`;
        } else {
            calendarContainer.innerHTML = `
                <div class="calendar-scroll-container">
                    <div class="calendar-sliding-content active">${newContentHtml}</div>
                </div>
            `;
            const newBody = calendarContainer.querySelector('.calendar-body');
            if (newBody && targetScroll !== null && targetScroll !== undefined) {
                newBody.scrollTop = targetScroll;
            } else if (newBody && !isSilent && viewContainsToday) {
                scrollToCurrentTime(newBody);
            }
            addSwipeNavigation(calendarContainer.querySelector('.calendar-scroll-container'));

            const firstTimeLabel = calendarContainer.querySelector('.time-label:first-child');
            if (firstTimeLabel) firstTimeLabel.style.marginTop = `-${verticalPadding}px`;
        }

    } else {
        const scrollContainer = calendarContainer.querySelector('.calendar-scroll-container');
        const oldContent = scrollContainer.querySelector('.calendar-sliding-content.active');

        const newSlidingContent = document.createElement('div');
        newSlidingContent.className = 'calendar-sliding-content';
        newSlidingContent.innerHTML = newContentHtml;

        // Imposta la posizione di partenza per l'animazione in entrata
        newSlidingContent.classList.add(slideDirection > 0 ? 'slide-in-from-right' : 'slide-in-from-left');
        scrollContainer.appendChild(newSlidingContent);

        // Ripristina lo scroll sul nuovo elemento PRIMA che l'animazione parta
        const newBody = newSlidingContent.querySelector('.calendar-body');
        if (savedScrollTop !== null) newBody.scrollTop = savedScrollTop;

        // Applica il margine negativo al primo time-label del nuovo contenuto
        const firstTimeLabel = newSlidingContent.querySelector('.time-label:first-child');
        if (firstTimeLabel) firstTimeLabel.style.marginTop = `-${verticalPadding}px`;

        // Aggiungi la navigazione swipe al nuovo contenuto
        addSwipeNavigation(scrollContainer);

        // Avvia l'animazione
        requestAnimationFrame(() => {
            if (oldContent) {
                oldContent.classList.remove('active');
                oldContent.classList.add(slideDirection > 0 ? 'slide-out-left' : 'slide-out-right');
            }
            newSlidingContent.classList.remove('slide-in-from-right', 'slide-in-from-left');
            newSlidingContent.classList.add('active');
        });

        setTimeout(() => oldContent?.remove(), 400);
    }
}

let isCalendarAnimating = false; // Flag per prevenire animazioni sovrapposte (debouncing)
let activeSwipeElement = null; // Riferimento all'elemento con i listener attivi
let calendarTouchStartX = null;
let calendarTouchStartY = null;

function isCalendarDragActive() {
    return Boolean(
        window.appointmentDragState && (
            window.appointmentDragState.dragStarted ||
            window.appointmentDragState.isDragging ||
            window.appointmentDragState.justFinishedDrag
        )
    );
}

function handleCalendarTouchStart(event) {
    // Se c'è un drag in corso, un popup/popover aperto o se il tocco è su un appuntamento/controlli, NON avviare swipe
    if (isCalendarDragActive() ||
        document.getElementById('appointment-details-overlay') ||
        event.target.closest('.appointment-card, .appointment-popover-card, #appointment-details-overlay, .calendar-controls, .calendar-header, button, input')) {
        calendarTouchStartX = null;
        calendarTouchStartY = null;
        return;
    }

    if (event.changedTouches && event.changedTouches.length > 0) {
        calendarTouchStartX = event.changedTouches[0].screenX;
        calendarTouchStartY = event.changedTouches[0].screenY;
    }
}

function handleCalendarTouchEnd(event) {
    if (calendarTouchStartX === null || calendarTouchStartY === null) {
        calendarTouchStartX = null;
        calendarTouchStartY = null;
        return;
    }

    // Se un drag è attivo, se c'è un'animazione in corso o un popup aperto, azzera e ignora
    if (isCalendarDragActive() || isCalendarAnimating || document.getElementById('appointment-details-overlay')) {
        calendarTouchStartX = null;
        calendarTouchStartY = null;
        return;
    }

    // Se il rilascio avviene su una card appuntamento o popup, non interpretare mai come swipe
    if (event.target.closest('.appointment-card, .appointment-popover-card, #appointment-details-overlay, button, input')) {
        calendarTouchStartX = null;
        calendarTouchStartY = null;
        return;
    }

    const touchEndX = event.changedTouches[0].screenX;
    const touchEndY = event.changedTouches[0].screenY;
    const diffX = touchEndX - calendarTouchStartX;
    const diffY = touchEndY - calendarTouchStartY;

    calendarTouchStartX = null;
    calendarTouchStartY = null;

    // Attiva solo se lo swipe è nettamente orizzontale e supera una soglia definita (75px)
    if (Math.abs(diffX) > Math.abs(diffY) * 1.5 && Math.abs(diffX) > 75) {
        isCalendarAnimating = true;
        if (diffX < 0) {
            changeCalendarPeriod(1);
        } else {
            changeCalendarPeriod(-1);
        }
        setTimeout(() => { isCalendarAnimating = false; }, 500);
    }
}

function handleCalendarWheel(event) {
    if (isCalendarDragActive()) return;
    if (isCalendarAnimating) return;
    if (document.getElementById('appointment-details-overlay')) return;
    // Ignora se il cursore è sopra una card appuntamento, popup o controlli
    if (event.target.closest('.appointment-card, .appointment-popover-card, #appointment-details-overlay, button, input')) return;

    // Ignora qualsiasi scroll che abbia componente verticale predominante (non bloccare lo scorrimento orario del calendario)
    if (Math.abs(event.deltaX) < Math.abs(event.deltaY) * 1.5) return;

    // Soglia solida (75px) per evitare attivazioni involontarie da micro-movimenti o inerzia del trackpad al click/tap su Mac
    if (Math.abs(event.deltaX) > 75) {
        event.preventDefault();
        isCalendarAnimating = true;
        if (event.deltaX > 0) {
            changeCalendarPeriod(1); // Scroll a destra -> periodo successivo
        } else {
            changeCalendarPeriod(-1); // Scroll a sinistra -> periodo precedente
        }
        setTimeout(() => { isCalendarAnimating = false; }, 500);
    }
}

/**
 * Abilita la navigazione swipe orizzontale per il calendario.
 * @param {HTMLElement} element - L'elemento contenitore a cui applicare gli eventi.
 */
function addSwipeNavigation(element) {
    if (!element) return;
    if (activeSwipeElement === element) return; // Se l'elemento è già registrato, non duplicare i listener

    if (activeSwipeElement) {
        activeSwipeElement.removeEventListener('touchstart', handleCalendarTouchStart);
        activeSwipeElement.removeEventListener('touchend', handleCalendarTouchEnd);
        activeSwipeElement.removeEventListener('wheel', handleCalendarWheel);
    }

    activeSwipeElement = element;
    element.addEventListener('touchstart', handleCalendarTouchStart, { passive: true });
    element.addEventListener('touchend', handleCalendarTouchEnd, { passive: true });
    element.addEventListener('wheel', handleCalendarWheel, { passive: false });
}

/**
 * Mostra un popup/popover con i dettagli dell'appuntamento e le opzioni di modifica/eliminazione.
 */
function showAppointmentDetailsPopup(bookingId, clientName, service, startIso, endIso, clientPhone, barberId, status, cancelReason = "", anchorEl = null) {
    if (window.appointmentDragState && window.appointmentDragState.suppressNextClick) {
        window.appointmentDragState.suppressNextClick = false;
        return;
    }

    // Se esiste già un popover o popup di dettagli aperto, chiudilo per evitare duplicazioni
    const existingOldOverlay = document.getElementById('appointment-details-overlay');
    if (existingOldOverlay) {
        existingOldOverlay.remove();
        document.querySelectorAll('.appointment-card.popover-active').forEach(el => el.classList.remove('popover-active'));
    }

    // Identifica la card ancorata nel calendario se disponibile
    let targetCardEl = anchorEl;
    if (!targetCardEl && bookingId) {
        targetCardEl = document.querySelector(`.appointment-card[data-app-id="${bookingId}"]`);
    }

    const initialDate = new Date(startIso);
    let initialEndDate = endIso ? new Date(endIso) : null;
    if (!initialEndDate || isNaN(initialEndDate.getTime())) {
        initialEndDate = new Date(initialDate.getTime() + 30 * 60000);
    }
    const initialDuration = Math.round((initialEndDate.getTime() - initialDate.getTime()) / 60000) || 30;
    const statusNormalized = String(status || '').trim().toLowerCase();
    const isIndispo = statusNormalized === 'indisponibile';
    const isPendingCancel = statusNormalized === 'richiesta cancellazione';

    // Trova email cliente da cachedAppData.clients
    let clientEmail = 'Nessuna Email';
    if (cachedAppData && cachedAppData.clients) {
        const foundClient = cachedAppData.clients.find(c => {
            if (clientPhone && (c.telefono || c.phone)) {
                return normalizePhone(c.telefono || c.phone) === normalizePhone(clientPhone);
            }
            return false;
        });
        if (foundClient && foundClient.email) clientEmail = foundClient.email;
    }

    editAppState = {
        bookingId: bookingId,
        startIso: startIso,
        initialDuration: initialDuration,
        serviceDuration: initialDuration,
        clientPhone: clientPhone,
        clientEmail: clientEmail,
        barberId: barberId,
        isIndispo: isIndispo,
        currentDate: formatDateToItalian(initialDate.toISOString().split('T')[0]),
        currentTime: initialDate.getHours().toString().padStart(2, '0') + ":" + initialDate.getMinutes().toString().padStart(2, '0'),
        clientName: isIndispo ? ((cachedAppData.settings && (cachedAppData.settings.INDISPO_CLIENT_NAME || cachedAppData.settings.indispoClientName)) || "IMPEGNO PERSONALE") : clientName,
        serviceName: isIndispo ? ((cachedAppData.settings && (cachedAppData.settings.INDISPO_SERVICE_NAME || cachedAppData.settings.indispoServiceName)) || "Indisponibilità") : service,
        cancelReason: cancelReason || '',
        allSlots: null,
        selectedSlot: null,
        isWeekly: statusNormalized === 'weekly'
    };

    const formattedDate = initialDate.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    const formattedTime = initialDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const formattedEndTime = initialEndDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

    const overlay = document.createElement('div');
    overlay.id = 'appointment-details-overlay';
    const isPopoverMode = Boolean(targetCardEl);
    overlay.className = isPopoverMode ? 'appointment-popover-overlay' : 'popup-overlay';

    if (targetCardEl) {
        targetCardEl.classList.add('popover-active');
    }

    overlay.innerHTML = `
        <div class="appointment-popover-card appointment-detail-popup" style="${isPopoverMode ? 'opacity: 0; pointer-events: none;' : 'position: relative; max-width: 400px;'}">
            ${isPopoverMode ? '<div class="appointment-popover-caret" id="popover-caret"></div>' : ''}
            
            <!-- Header Fisso -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-shrink: 0;">
                <h3 style="margin: 0; font-size: 1.08em; font-weight: 700; color: #1e293b;">${isIndispo ? 'Dettagli Impegno' : 'Dettagli Appuntamento'}</h3>
                <div style="display: flex; align-items: center; gap: 4px;">
                    <button type="button" id="popover-btn-trash" style="border: none; background: none; color: #dc3545; padding: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 8px;" title="Cancella appuntamento">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                    <button type="button" class="btn-popover-close" style="border: none; background: none; color: #94a3b8; padding: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 8px;" title="Chiudi">
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>

            <!-- Banner di conferma cancellazione inline -->
            <div id="popover-delete-confirm" class="hidden" style="background: #fff5f5; border: 1.5px solid #fecaca; border-radius: 12px; padding: 10px 12px; margin-bottom: 10px; text-align: center; flex-shrink: 0;">
                <p style="margin: 0 0 8px 0; font-size: 0.85em; font-weight: 600; color: #991b1b; line-height: 1.35;">
                    Vuoi davvero cancellare questo ${isIndispo ? 'impegno' : 'appuntamento'}?
                </p>
                <div style="display: flex; gap: 8px; justify-content: center;">
                    <button type="button" id="btn-cancel-delete" style="flex: 1; background: transparent; border: none; color: #64748b; font-size: 0.8em; font-weight: 700; text-transform: uppercase; cursor: pointer; padding: 6px;">Annulla</button>
                    <button type="button" id="btn-confirm-delete" style="flex: 1; background: transparent; border: none; color: #dc3545; font-size: 0.8em; font-weight: 700; text-transform: uppercase; cursor: pointer; padding: 6px;">Elimina</button>
                </div>
            </div>

            <!-- Corpo Scrollabile del Popover -->
            <div class="popover-scrollable-body">
                <!-- Informazioni Cliente Compatte -->
                <div class="compact-client-card" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 9px 12px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 6px;">
                    ${isIndispo ? `
                        <div style="font-weight: 700; font-size: 0.92em; color: #1e293b;">${editAppState.clientName}</div>
                        <div style="font-size: 0.82em; color: #64748b;">${service}</div>
                    ` : `
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                            <span style="font-weight: 700; font-size: 0.94em; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${clientName}</span>
                            ${clientPhone ? `
                                <a href="tel:${clientPhone}" style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.8em; color: #8A9A5B; font-weight: 600; text-decoration: none; background: #ffffff; border: 1px solid #d1dbbd; padding: 2px 7px; border-radius: 6px; flex-shrink: 0;" title="Chiama cliente">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                    ${clientPhone}
                                </a>
                            ` : ''}
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82em; color: #64748b; gap: 8px;">
                            <span style="color: #334155; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                ${service.replace(/_/g, ' ')}
                            </span>
                            ${editAppState.clientEmail && editAppState.clientEmail !== 'Nessuna Email' ? `
                                <a href="mailto:${editAppState.clientEmail}" style="color: #94a3b8; text-decoration: none; font-size: 0.82em; overflow: hidden; text-overflow: ellipsis; max-width: 135px; white-space: nowrap;" title="${editAppState.clientEmail}">
                                    ${editAppState.clientEmail}
                                </a>
                            ` : ''}
                        </div>
                    `}
                </div>

                ${isPendingCancel ? `
                    <div style="background: #fff5f5; border: 1px solid #feb2b2; border-radius: 12px; padding: 10px 12px; margin-bottom: 10px; text-align: left;">
                        <span class="detail-label" style="color: #999; font-size: 0.75em;">Motivo richiesta annullamento:</span>
                        <p style="font-size: 0.88em; color: #666; font-weight: 600; margin-top: 3px; line-height: 1.35;">${cancelReason || 'Nessuna motivazione fornita.'}</p>
                        <div id="cancellation-decision-buttons" style="display: flex; width: 100%; margin-top: 10px; border-top: 1px solid rgba(220, 53, 69, 0.1); padding-top: 6px;">
                            <button onclick="processBarberDecision('${bookingId}', 'reject', this)" style="flex: 1; background: transparent; border: none; color: #999; font-size: 0.75em; padding: 6px; font-weight: 700; text-transform: uppercase;">Rifiuta</button>
                            <button onclick="processBarberDecision('${bookingId}', 'approve', this)" style="flex: 1; background: transparent; color: #dc3545; border: none; font-size: 0.75em; padding: 6px; font-weight: 700; text-transform: uppercase;">Conferma</button>
                        </div>
                    </div>
                ` : ''}

                <!-- Box Data, Orario e Modifica Durata -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div>
                            <div style="font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; font-weight: 700;">Data e Orario</div>
                            <div id="popover-time-display" style="font-size: 0.88em; font-weight: 700; color: #1e293b; margin-top: 1px;">
                                ${formattedDate} &bull; <span id="popover-time-range">${formattedTime} - ${formattedEndTime}</span>
                            </div>
                        </div>
                        <button id="edit-time-btn" type="button" style="border: 1px solid #e2e8f0; background: white; border-radius: 8px; color: #475569; padding: 4px 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-size: 0.75em; font-weight: 700;" title="Sposta giorno / orario">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            Sposta
                        </button>
                    </div>

                    <!-- Selettore rapido Durata +- 5 min -->
                    <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #edf2f7; padding-top: 8px;">
                        <span style="font-size: 0.78em; color: #64748b; font-weight: 600;">Durata appuntamento:</span>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <button type="button" id="btn-duration-minus" class="duration-step-btn" title="Riduci di 5 min">- 5m</button>
                            <span id="popover-duration-badge" style="font-size: 0.82em; font-weight: 800; color: #8A9A5B; background: #f4f6f0; border: 1px solid #d1dbbd; padding: 2px 8px; border-radius: 6px; min-width: 44px; text-align: center;">${initialDuration} min</span>
                            <button type="button" id="btn-duration-plus" class="duration-step-btn" title="Aumenta di 5 min">+ 5m</button>
                        </div>
                    </div>
                </div>

                <!-- Sezione selezione nuovi slot (aperta da pulsante Sposta) -->
                <div id="edit-slots-section" class="hidden" style="margin-top: 10px; border-top: 1.5px dashed #e2e8f0; padding-top: 10px;">
                    ${isIndispo ? `
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <span class="detail-label" style="color: #8A9A5B; font-weight: 700;">Modifica Impegno:</span>
                            <div>
                                <label class="detail-label">Giorno</label>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <input type="text" id="edit-indispo-date" class="date-mask" value="${editAppState.currentDate}" onfocus="handleInputFocus(this)" onblur="handleInputBlur(this)" oninput="handleMaskInput(this, 'date')" placeholder="--/--/----" style="flex-grow: 1;">
                                    <div style="position: relative; width: 42px; height: 42px; flex-shrink: 0;">
                                        <input type="date" id="edit-indispo-date-picker" value="${formatDateToIso(editAppState.currentDate)}" style="position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer; z-index: 2;" onchange="syncPickerToMask(this, 'edit-indispo-date')">
                                        <button type="button" style="width: 100%; height: 100%; padding: 0; display: flex; align-items: center; justify-content: center; border: 1px solid #cbd5e1; background: white; border-radius: 8px; color: #8A9A5B; position: absolute; top:0; left:0; z-index: 1;">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="16" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 10px;">
                                <div style="flex: 1;">
                                    <label class="detail-label">Dalle ore</label>
                                    <input type="text" id="edit-indispo-start" class="h-inp" value="${editAppState.currentTime}" onfocus="handleInputFocus(this)" onblur="handleInputBlur(this)" oninput="handleMaskInput(this, 'time')" placeholder="--:--">
                                </div>
                                <div style="flex: 1;">
                                    <label class="detail-label">Alle ore</label>
                                    <input type="text" id="edit-indispo-end" class="h-inp" value="${initialEndDate.getHours().toString().padStart(2, '0')}:${initialEndDate.getMinutes().toString().padStart(2, '0')}" onfocus="handleInputFocus(this)" onblur="handleInputBlur(this)" oninput="handleMaskInput(this, 'time')" placeholder="--:--">
                                </div>
                            </div>
                            <div>
                                <label class="detail-label">Nota / Descrizione</label>
                                <input type="text" id="edit-indispo-note" value="${service}" placeholder="Descrizione">
                            </div>
                        </div>
                    ` : `
                        <span class="detail-label" style="margin-bottom: 8px; display: block; color: #8A9A5B; font-weight: 700;">Nuova disponibilità:</span>
                        <div id="edit-days-row" class="days-scroll" style="margin-bottom: 10px; padding: 4px 0;"></div>
                        <div style="width: 100%; padding-right: 2px;">
                            <div id="edit-barbers-columns" class="barbers-grid">
                                <div class="spinner" style="width:22px; height:22px;"></div>
                            </div>
                        </div>
                    `}
                </div>

                ${editAppState.isWeekly ? `<p style="font-size:0.78em; color:#3498db; text-align:center; margin:8px 0; font-style:italic;">* Stai modificando una singola data di un appuntamento fisso.</p>` : ''}
            </div>

            <!-- Footer Fisso con Pulsanti Chiudi e Salva Minimal -->
            <div class="popover-fixed-footer">
                <button type="button" class="btn-cancel" style="flex: 1;">Chiudi</button>
                <button type="button" class="btn-save" id="save-appointment-changes" disabled onclick="saveAppointmentChanges()" style="flex: 1;">Salva</button>
            </div>
        </div>
    `;

    let popoverResizeObserver = null;

    function closePopover() {
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        document.querySelectorAll('.appointment-card.popover-active').forEach(el => el.classList.remove('popover-active'));
        window.removeEventListener('keydown', handleEsc);
        window.removeEventListener('resize', updatePos);
        if (popoverResizeObserver) {
            popoverResizeObserver.disconnect();
            popoverResizeObserver = null;
        }
        if (typeof window.updateAppointmentPopoverPos !== 'undefined') {
            window.updateAppointmentPopoverPos = null;
        }
        if (typeof openPopupStack !== 'undefined') {
            const idx = openPopupStack.indexOf('appointment-details-overlay');
            if (idx !== -1) openPopupStack.splice(idx, 1);
            if (openPopupStack.length === 0) {
                document.body.classList.remove('body-popup-open');
            }
        }
    }

    function handleEsc(e) {
        if (e.key === 'Escape') closePopover();
    }

    if (typeof openPopupStack !== 'undefined') {
        openPopupStack.push('appointment-details-overlay');
    }

    // Chiudi cliccando sul backdrop trasparente fuori dal popover
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
            closePopover();
        }
    });

    // Pulsanti di chiusura
    overlay.querySelectorAll('.btn-cancel, .btn-popover-close').forEach(btn => {
        btn.addEventListener('click', closePopover);
    });

    window.addEventListener('keydown', handleEsc);

    // Gestione inline cancellazione appuntamento
    const trashBtn = overlay.querySelector('#popover-btn-trash');
    const deleteConfirmBox = overlay.querySelector('#popover-delete-confirm');
    if (trashBtn && deleteConfirmBox) {
        trashBtn.addEventListener('click', () => {
            deleteConfirmBox.classList.remove('hidden');
            if (isPopoverMode) setTimeout(updatePos, 30);
        });

        const cancelDeleteBtn = deleteConfirmBox.querySelector('#btn-cancel-delete');
        if (cancelDeleteBtn) {
            cancelDeleteBtn.addEventListener('click', () => {
                deleteConfirmBox.classList.add('hidden');
                if (isPopoverMode) setTimeout(updatePos, 30);
            });
        }

        const confirmDeleteBtn = deleteConfirmBox.querySelector('#btn-confirm-delete');
        if (confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', () => {
                showButtonSpinner(confirmDeleteBtn);
                google.script.run
                    .withSuccessHandler(res => {
                        if (res && res.status === "OK") {
                            if (cachedBarberAppointments) {
                                cachedBarberAppointments = cachedBarberAppointments.filter(a => a.id !== bookingId && a.bookingId !== bookingId);
                            }
                            closePopover();
                            showCustomAlert("Cancellato", isIndispo ? "Impegno rimosso correttamente." : "Appuntamento rimosso correttamente.");
                            refreshDashboardData(true, true);
                        } else {
                            hideButtonSpinner(confirmDeleteBtn);
                            showCustomAlert("Errore", (res && res.message) || "Impossibile cancellare l'appuntamento.");
                        }
                    })
                    .withFailureHandler(err => {
                        hideButtonSpinner(confirmDeleteBtn);
                        showCustomAlert("Errore", "Errore di connessione: " + err);
                    })
                    .cancelAppointment(bookingId);
            });
        }
    }

    // Gestione modifica durata +- 5 minuti
    let currentDuration = initialDuration;
    function updateDuration(delta) {
        const nextDuration = currentDuration + delta;
        if (nextDuration < 5) return;
        currentDuration = nextDuration;
        editAppState.serviceDuration = currentDuration;

        const currentStart = editAppState.selectedSlot ? new Date(editAppState.selectedSlot.iso) : initialDate;
        const newEndTime = new Date(currentStart.getTime() + currentDuration * 60000);
        const newEndFormatted = newEndTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

        const badge = overlay.querySelector('#popover-duration-badge');
        if (badge) badge.innerText = `${currentDuration} min`;

        const timeRange = overlay.querySelector('#popover-time-range');
        if (timeRange) {
            const startStr = currentStart.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            timeRange.innerText = `${startStr} - ${newEndFormatted}`;
        }

        const indispoEndInput = overlay.querySelector('#edit-indispo-end');
        if (indispoEndInput) {
            indispoEndInput.value = `${newEndTime.getHours().toString().padStart(2, '0')}:${newEndTime.getMinutes().toString().padStart(2, '0')}`;
        }

        const saveBtn = overlay.querySelector('#save-appointment-changes');
        if (saveBtn) {
            const hasChanged = (currentDuration !== initialDuration) || Boolean(editAppState.selectedSlot);
            saveBtn.disabled = !hasChanged;
        }

        if (isPopoverMode) setTimeout(updatePos, 30);
    }

    const btnMinus = overlay.querySelector('#btn-duration-minus');
    if (btnMinus) btnMinus.addEventListener('click', () => updateDuration(-5));
    const btnPlus = overlay.querySelector('#btn-duration-plus');
    if (btnPlus) btnPlus.addEventListener('click', () => updateDuration(5));

    document.body.appendChild(overlay);

    const popoverCard = overlay.querySelector('.appointment-popover-card');

    function updatePos() {
        if (!isPopoverMode || !targetCardEl || !popoverCard) return;

        const cardRect = targetCardEl.getBoundingClientRect();
        const calEl = document.querySelector('.calendar-unified-container') ||
            document.getElementById('custom-barber-calendar') ||
            document.querySelector('.calendar-section') ||
            document.querySelector('.calendar-scroll-container') ||
            document.querySelector('.custom-calendar');
        const calRect = calEl ? calEl.getBoundingClientRect() : {
            top: 0,
            left: 0,
            right: window.innerWidth,
            bottom: window.innerHeight,
            width: window.innerWidth,
            height: window.innerHeight
        };

        const slotsSection = overlay.querySelector('#edit-slots-section');
        const isSlotsOpen = slotsSection && !slotsSection.classList.contains('hidden');

        // Allarga il popover quando la sezione disponibilità è aperta per contenere comodamente le colonne dei barbieri
        const baseWidth = isSlotsOpen ? 500 : 380;
        const calLeft = Math.max(calRect ? calRect.left + 8 : 8, 8);
        const calRight = Math.min(calRect ? calRect.right - 8 : window.innerWidth - 8, window.innerWidth - 8);
        const calTop = Math.max(calRect ? calRect.top + 8 : 8, 8);
        const calBottom = Math.min(calRect ? calRect.bottom - 8 : window.innerHeight - 8, window.innerHeight - 8);
        const availableCalHeight = calBottom - calTop;

        const popWidth = Math.min(baseWidth, Math.max(320, (calRight - calLeft)), window.innerWidth - 16);
        popoverCard.style.width = `${popWidth}px`;

        // Rimuoviamo momentaneamente maxHeight per misurare l'altezza naturale necessaria a mostrare tutto
        popoverCard.style.maxHeight = 'none';
        const naturalHeight = popoverCard.scrollHeight || popoverCard.offsetHeight || 380;
        const gap = 12;

        const spaceRight = calRight - cardRect.right - gap;
        const spaceLeft = cardRect.left - calLeft - gap;

        let targetLeft = 0;
        let arrowSide = 'none';
        let targetTop = 0;

        const isSmallScreen = window.innerWidth <= 768 || (calRight - calLeft < 600);
        const isNarrowScreen = isSmallScreen || (calRight - calLeft < (popWidth + 40)) || (window.innerWidth < (popWidth + 40));

        if (isSmallScreen) {
            // Su schermo piccolo, posiziona sempre il popup in alto al calendario:
            // in questo modo può espandersi verso il basso senza doversi spostare o saltare
            targetLeft = Math.max(calLeft, Math.round((window.innerWidth - popWidth) / 2));
            arrowSide = 'none';
            targetTop = calTop;
        } else if (isNarrowScreen) {
            targetLeft = Math.max(calLeft, Math.min(cardRect.left + (cardRect.width - popWidth) / 2, calRight - popWidth));
            arrowSide = 'none';
            targetTop = cardRect.top;
            if (targetTop + naturalHeight > calBottom) {
                targetTop = calBottom - naturalHeight;
            }
            if (targetTop < calTop) {
                targetTop = calTop;
            }
        } else if (spaceRight >= popWidth) {
            targetLeft = cardRect.right + gap;
            arrowSide = 'left';
            targetTop = cardRect.top;
            if (targetTop + naturalHeight > calBottom) {
                targetTop = calBottom - naturalHeight;
            }
            if (targetTop < calTop) {
                targetTop = calTop;
            }
        } else if (spaceLeft >= popWidth) {
            targetLeft = cardRect.left - popWidth - gap;
            arrowSide = 'right';
            targetTop = cardRect.top;
            if (targetTop + naturalHeight > calBottom) {
                targetTop = calBottom - naturalHeight;
            }
            if (targetTop < calTop) {
                targetTop = calTop;
            }
        } else {
            if (spaceRight >= spaceLeft) {
                targetLeft = Math.min(cardRect.right + gap, calRight - popWidth);
            } else {
                targetLeft = Math.max(calLeft, cardRect.left - popWidth - gap);
            }
            arrowSide = 'none';
            targetTop = cardRect.top;
            if (targetTop + naturalHeight > calBottom) {
                targetTop = calBottom - naturalHeight;
            }
            if (targetTop < calTop) {
                targetTop = calTop;
            }
        }

        targetLeft = Math.max(calLeft, Math.min(targetLeft, calRight - popWidth));

        if (naturalHeight > availableCalHeight) {
            popoverCard.style.maxHeight = `${availableCalHeight}px`;
        } else {
            popoverCard.style.maxHeight = 'none';
        }

        popoverCard.style.left = `${Math.round(targetLeft)}px`;
        popoverCard.style.top = `${Math.round(targetTop)}px`;

        const caretEl = popoverCard.querySelector('#popover-caret');
        popoverCard.classList.remove('arrow-left', 'arrow-right');
        if (caretEl) {
            if (arrowSide === 'left') {
                popoverCard.classList.add('arrow-left');
                const cardCenterY = cardRect.top + (cardRect.height / 2);
                let caretTop = cardCenterY - targetTop - 6;
                caretTop = Math.max(16, Math.min(caretTop, (popoverCard.offsetHeight || naturalHeight) - 24));
                caretEl.style.top = `${Math.round(caretTop)}px`;
                caretEl.style.display = 'block';
            } else if (arrowSide === 'right') {
                popoverCard.classList.add('arrow-right');
                const cardCenterY = cardRect.top + (cardRect.height / 2);
                let caretTop = cardCenterY - targetTop - 6;
                caretTop = Math.max(16, Math.min(caretTop, (popoverCard.offsetHeight || naturalHeight) - 24));
                caretEl.style.top = `${Math.round(caretTop)}px`;
                caretEl.style.display = 'block';
            } else {
                caretEl.style.display = 'none';
            }
        }
    }

    window.updateAppointmentPopoverPos = updatePos;

    if (isPopoverMode) {
        requestAnimationFrame(() => {
            updatePos();
            popoverCard.style.opacity = '1';
            popoverCard.style.pointerEvents = 'auto';
            setTimeout(() => {
                popoverCard.style.transition = 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1), top 0.2s cubic-bezier(0.16, 1, 0.3, 1), left 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
            }, 160);
        });
        window.addEventListener('resize', updatePos);

        if (typeof ResizeObserver !== 'undefined' && popoverCard) {
            popoverResizeObserver = new ResizeObserver(() => {
                updatePos();
            });
            popoverResizeObserver.observe(popoverCard);
        }
    } else {
        if (typeof openPopup === 'function') {
            openPopup(overlay);
        }
    }

    document.getElementById('edit-time-btn').addEventListener('click', function () {
        this.style.display = 'none';
        const slotsSec = document.getElementById('edit-slots-section');
        if (slotsSec) slotsSec.classList.remove('hidden');

        if (editAppState.isIndispo) {
            document.getElementById('save-appointment-changes').disabled = false;
        } else {
            generateEditDayPills();
            const currentDayPill = document.querySelector(`#edit-days-row .day-pill[data-iso="${editAppState.currentDate}"]`);
            if (currentDayPill) currentDayPill.classList.add('active');
            refreshEditSlots();
        }

        if (isPopoverMode) {
            updatePos();
            setTimeout(updatePos, 40);
            setTimeout(updatePos, 120);
        }
    });
}

function generateEditDayPills() {
    const container = document.getElementById('edit-days-row');
    const availableDates = getBookingDays(cachedAppData.settings, cachedAppData.workingHours);
    container.innerHTML = availableDates.map(d => {
        const isoDate = d.toISOString().split('T')[0];
        return getDayPillHtml(d, 'selectEditDay').replace('data-label', `data-iso="${isoDate}" data-label`);
    }).join('');
}

function selectEditDay(el, isoDate) {
    document.querySelectorAll('#edit-days-row .day-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    editAppState.currentDate = isoDate;
    editAppState.selectedSlot = null;
    document.getElementById('save-appointment-changes').disabled = true;
    renderEditBarberColumns();
    if (typeof window.updateAppointmentPopoverPos === 'function') {
        setTimeout(window.updateAppointmentPopoverPos, 30);
    }
}

function refreshEditSlots() {
    const container = document.getElementById('edit-barbers-columns');
    container.innerHTML = '<div class="spinner" style="margin: 20px auto; width:25px; height:25px; border-width:3px;"></div>';
    if (typeof window.updateAppointmentPopoverPos === 'function') {
        setTimeout(window.updateAppointmentPopoverPos, 30);
    }
    google.script.run
        .withSuccessHandler(res => {
            editAppState.allSlots = Array.isArray(res) ? res : (res && res.slots ? res.slots : []);
            renderEditBarberColumns();
            if (typeof window.updateAppointmentPopoverPos === 'function') {
                setTimeout(window.updateAppointmentPopoverPos, 50);
            }
        })
        .withFailureHandler(err => {
            console.error("Errore slot modifica:", err);
            document.getElementById('edit-barbers-columns').innerHTML = `<p style="color:red; font-size:0.8em;">Errore caricamento orari.</p>`;
            if (typeof window.updateAppointmentPopoverPos === 'function') {
                setTimeout(window.updateAppointmentPopoverPos, 30);
            }
        })
        .getAvailableSlots(editAppState.serviceDuration, editAppState.serviceName, editAppState.clientEmail);
}

function renderEditBarberColumns() {
    const container = document.getElementById('edit-barbers-columns');
    if (!editAppState.allSlots || !editAppState.currentDate) return;
    const filteredSlots = editAppState.allSlots.filter(s => s.dateKey === editAppState.currentDate);
    container.innerHTML = getBarberColumnsHtml(
        filteredSlots,
        editAppState.currentDate,
        cachedAppData.barbers,
        'selectEditSlot'
    );
    if (typeof window.updateAppointmentPopoverPos === 'function') {
        window.updateAppointmentPopoverPos();
        setTimeout(window.updateAppointmentPopoverPos, 40);
        setTimeout(window.updateAppointmentPopoverPos, 120);
    }
}

function selectEditSlot(el, iso, barberId, formatted, time, barberName) {
    document.querySelectorAll('#edit-barbers-columns .time-slot').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
    editAppState.selectedSlot = { iso, barberId, formatted, time, barberName };
    document.getElementById('save-appointment-changes').disabled = false;
}


function saveAppointmentChanges(force = false, conflictPayload = null) {
    const btn = document.getElementById('save-appointment-changes');

    if (editAppState.isIndispo) {
        let startIso, endIso, note;

        if (conflictPayload) {
            startIso = conflictPayload.startIso;
            endIso = conflictPayload.endIso;
            note = conflictPayload.note;
        } else {
            const dateInput = document.getElementById('edit-indispo-date');
            const startInput = document.getElementById('edit-indispo-start');
            const endInput = document.getElementById('edit-indispo-end');
            const noteInput = document.getElementById('edit-indispo-note');

            if (dateInput && startInput && endInput) {
                const date = dateInput.value;
                const start = startInput.value;
                const end = endInput.value;
                note = (noteInput ? noteInput.value : '').trim();
                if (!date || !start || !end) { showCustomAlert("Attenzione", "Compila tutti i campi."); return; }
                startIso = new Date(`${formatDateToIso(date)}T${start.trim()}:00`).toISOString();
                endIso = new Date(`${formatDateToIso(date)}T${end.trim()}:00`).toISOString();
            } else {
                const baseStart = new Date(editAppState.startIso || (formatDateToIso(editAppState.currentDate) + 'T' + editAppState.currentTime + ':00'));
                startIso = baseStart.toISOString();
                endIso = new Date(baseStart.getTime() + (editAppState.serviceDuration || 30) * 60000).toISOString();
                note = editAppState.serviceName || '';
            }
        }

        if (btn && !force) showButtonSpinner(btn);
        google.script.run.withSuccessHandler(res => {
            if (res.status === "OK") {
                showCustomAlert("Fatto", "Impegno modificato correttamente.");
                closeAllPopupsAndRedirect(refreshDashboardData, true);
            } else if (res.status === "CONFLICT") {
                btn.innerText = "Salva"; btn.disabled = false;
                const conflictPayload = {
                    startIso: startIso,
                    endIso: endIso,
                    note: note
                };
                showIndispoConflictPopup(res.conflicts, () => saveAppointmentChanges(true, conflictPayload));
            } else {
                if (btn && !force) hideButtonSpinner(btn);
                showCustomAlert("Errore", res.message || "Impossibile salvare l'impegno.");
            }
        }).updateIndisponibilita(editAppState.bookingId, startIso, endIso, note, force);
        return;
    }

    // Appuntamenti standard: supporta sia cambio slot che cambio sola durata
    if (!editAppState.selectedSlot && editAppState.serviceDuration === editAppState.initialDuration) {
        return;
    }
    if (btn) showButtonSpinner(btn);

    const newStart = editAppState.selectedSlot
        ? new Date(editAppState.selectedSlot.iso)
        : new Date(editAppState.startIso);
    const newEnd = new Date(newStart.getTime() + (editAppState.serviceDuration || 30) * 60000);
    const targetBarberId = editAppState.selectedSlot
        ? editAppState.selectedSlot.barberId
        : (editAppState.barberId || currentDisplayedBarberId);

    google.script.run
        .withSuccessHandler(res => {
            if (res && res.status === "OK") {
                showCustomAlert("Aggiornato", "Appuntamento aggiornato correttamente.");
                closeAllPopupsAndRedirect(refreshDashboardData, true);
            } else {
                if (btn) hideButtonSpinner(btn);
                showCustomAlert("Errore", res.message || "Impossibile salvare.");
            }
        })
        .withFailureHandler(err => { if (btn) hideButtonSpinner(btn); showCustomAlert("Errore", "Errore di connessione: " + err); })
        .updateAppointment(
            editAppState.bookingId,
            newStart.toISOString(),
            newEnd.toISOString(),
            editAppState.serviceName,
            editAppState.clientEmail,
            targetBarberId
        );
}

/* ==========================================================================
   DRAG AND DROP APPOINTMENTS & EDGE NAVIGATION
   ========================================================================== */

let appointmentDragState = {
    dragStarted: false,
    isDragging: false,
    startX: 0,
    startY: 0,
    lastPointerX: 0,
    lastPointerY: 0,
    element: null,
    ghostEl: null,
    appData: null,
    activeTargetSlot: null,
    suppressNextClick: false,
    edgeScrollCooldown: false,
    autoScrollSpeed: 0,
    autoScrollRaf: null
};
window.appointmentDragState = appointmentDragState;

/**
 * Inizializza il drag di un appuntamento via Pointer Events (mouse/touch/stylus)
 */
function initAppointmentDrag(e, element) {
    if (e.button !== undefined && e.button !== 0) return;

    const ds = element.dataset;
    const elRect = element.getBoundingClientRect();
    const rawGrabY = e.clientY - elRect.top;
    const rawGrabX = e.clientX - elRect.left;

    appointmentDragState.dragStarted = true;
    appointmentDragState.isDragging = false;
    appointmentDragState.startX = e.clientX;
    appointmentDragState.startY = e.clientY;
    appointmentDragState.lastPointerX = e.clientX;
    appointmentDragState.lastPointerY = e.clientY;
    appointmentDragState.grabOffsetY = (rawGrabY >= 0 && rawGrabY <= elRect.height) ? rawGrabY : 15;
    appointmentDragState.grabOffsetX = (rawGrabX >= 0 && rawGrabX <= elRect.width) ? rawGrabX : 50;
    appointmentDragState.element = element;
    appointmentDragState.activeTargetSlot = null;
    appointmentDragState.suppressNextClick = false;
    appointmentDragState.autoScrollSpeed = 0;

    appointmentDragState.appData = {
        appId: ds.appId,
        clientName: ds.clientName || 'Cliente',
        service: ds.service || 'Servizio',
        start: ds.start,
        end: ds.end,
        duration: parseInt(ds.duration, 10) || 30,
        phone: ds.phone || '',
        barberId: ds.barberId || currentDisplayedBarberId,
        status: ds.status || '',
        cancelReason: ds.cancelReason || ''
    };

    window.addEventListener('pointermove', onAppointmentPointerMove, { passive: false });
    window.addEventListener('pointerup', onAppointmentPointerUp, { passive: false });
    window.addEventListener('pointercancel', onAppointmentPointerUp, { passive: false });
}

/**
 * Gestione movimento puntatore durante il drag
 */
function onAppointmentPointerMove(e) {
    if (!appointmentDragState.dragStarted) return;

    appointmentDragState.lastPointerX = e.clientX;
    appointmentDragState.lastPointerY = e.clientY;

    const dx = e.clientX - appointmentDragState.startX;
    const dy = e.clientY - appointmentDragState.startY;

    // Soglia minima aumentata a 14px per separare un semplice click da un drag effettivo ed evitare attivazioni accidentali
    if (!appointmentDragState.isDragging) {
        if (Math.hypot(dx, dy) < 14) return;

        appointmentDragState.isDragging = true;
        appointmentDragState.suppressNextClick = true;

        if (appointmentDragState.element) {
            appointmentDragState.element.classList.add('is-dragging');
        }

        // Crea ghost flottante che segue il puntatore
        const ghost = document.createElement('div');
        ghost.className = 'appointment-drag-ghost';
        const formattedStart = formatTimeSimple(appointmentDragState.appData.start);
        ghost.innerHTML = `
            <span class="ghost-badge">${formattedStart}</span>
            <span class="ghost-client">${appointmentDragState.appData.clientName}</span>
            <span class="ghost-service">${(appointmentDragState.appData.service || '').replace(/_/g, ' ')} (${appointmentDragState.appData.duration} min)</span>
        `;
        document.body.appendChild(ghost);
        appointmentDragState.ghostEl = ghost;

        // Renderizza le guide degli slot disponibili coerenti
        renderDropSlotGuides(appointmentDragState.appData);
        ensureCalendarEdgeIndicators();
    }

    if (!appointmentDragState.isDragging) return;
    if (e.cancelable) e.preventDefault();

    // Posiziona il ghost allineato con il punto di presa dell'appuntamento
    if (appointmentDragState.ghostEl) {
        const grabX = appointmentDragState.grabOffsetX || 50;
        const grabY = appointmentDragState.grabOffsetY || 15;
        appointmentDragState.ghostEl.style.left = `${e.clientX - grabX}px`;
        appointmentDragState.ghostEl.style.top = `${e.clientY - grabY - 35}px`;
    }

    // Rileva e aggiorna la guida slot (continuo a scatti di 5 minuti + anti-collisione)
    updateHoveredSlotGuide(e.clientX, e.clientY);

    // Controllo auto-scorrimento verticale (in alto / in basso)
    checkCalendarVerticalAutoScroll(e.clientX, e.clientY);

    // Controllo bordi laterali per cambio settimana
    checkCalendarLateralEdges(e.clientX, e.clientY);
}

/**
 * Individua la colonna del giorno su cui si trova il puntatore
 */
function findDayColumnAt(clientX, clientY) {
    const elementsUnder = document.elementsFromPoint(clientX, clientY) || [];
    for (const el of elementsUnder) {
        if (el.classList && el.classList.contains('day-column') && el.dataset.date) {
            return el;
        }
    }

    const allCols = Array.from(document.querySelectorAll('.calendar-sliding-content.active .day-column[data-date], .calendar-body .day-column[data-date]'));
    if (allCols.length === 0) return null;

    let closestCol = null;
    let minDistance = Infinity;
    for (const col of allCols) {
        const rect = col.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right) {
            return col;
        }
        const dist = Math.min(Math.abs(clientX - rect.left), Math.abs(clientX - rect.right));
        if (dist < minDistance) {
            minDistance = dist;
            closestCol = col;
        }
    }
    return minDistance < 50 ? closestCol : null;
}

/**
 * Verifica se un intervallo orario entra in collisione con un appuntamento esistente per lo stesso barbiere
 */
function checkAppointmentCollision(candidateStartMs, candidateEndMs, targetDateKey, excludeAppId, barberId) {
    const appointments = cachedBarberAppointments || [];
    const targetBarber = barberId || currentDisplayedBarberId;

    return appointments.find(b => {
        // Non collidere con se stesso (l'appuntamento che si sta spostando)
        if (String(b.id) === String(excludeAppId)) return false;

        // Se l'appuntamento appartiene a un altro barbiere, non entra in conflitto
        if (b.barberId && targetBarber && String(b.barberId) !== String(targetBarber)) return false;

        const st = String(b.status || '').toLowerCase().trim();
        // Escludi solo gli appuntamenti cancellati o rifiutati
        if (st === 'cancellato' || st === 'rifiutato' || st === 'annullato') return false;

        if (!b.start) return false;
        const bStart = new Date(b.start);
        const bStartMs = bStart.getTime();
        if (isNaN(bStartMs)) return false;

        // Verifica che appartenga alla stessa data
        const bYear = bStart.getFullYear();
        const bMonth = String(bStart.getMonth() + 1).padStart(2, '0');
        const bDay = String(bStart.getDate()).padStart(2, '0');
        const bDateKey = `${bYear}-${bMonth}-${bDay}`;
        if (bDateKey !== targetDateKey) return false;

        const bDur = parseInt(b.duration, 10) || 30;
        const bEndMs = b.end ? new Date(b.end).getTime() : (bStartMs + bDur * 60000);

        // Sovrapposizione temporale: nuovoInizio < fineEsistente && nuovaFine > inizioEsistente
        return (candidateStartMs < bEndMs && candidateEndMs > bStartMs);
    });
}

/**
 * Rileva lo slot a scatti continui di 5 minuti, previene qualsiasi sovrapposizione con appuntamenti esistenti
 * e aggancia gli slot consigliati Zero-Gap se l'orario coincide esattamente.
 */
function updateHoveredSlotGuide(clientX, clientY) {
    const targetCol = findDayColumnAt(clientX, clientY);
    if (!targetCol) {
        document.querySelectorAll('.drop-slot-guide').forEach(g => g.classList.remove('active-hover'));
        document.querySelectorAll('.free-slot-preview').forEach(p => p.remove());
        appointmentDragState.activeTargetSlot = null;
        return;
    }

    const dateKey = targetCol.dataset.date;
    const colRect = targetCol.getBoundingClientRect();
    const grabOffset = appointmentDragState.grabOffsetY || 15;
    // relativeY calcolato precisamente in corrispondenza del bordo superiore dell'appuntamento trascinato
    const relativeY = (clientY - grabOffset) - colRect.top;
    const hourHeight = 100;
    const durationMin = appointmentDragState.appData?.duration || 30;

    // 1. Calcolo granulare continuo ogni 5 minuti (ovunque, dentro o fuori dagli slot)
    const rawMinutes = (relativeY / hourHeight) * 60;
    const snappedMinutes = Math.round(rawMinutes / 5) * 5;
    const maxStartMin = (24 * 60) - durationMin;
    const clampedMinutes = Math.max(0, Math.min(maxStartMin, snappedMinutes));
    const hours = Math.floor(clampedMinutes / 60);
    const minutes = clampedMinutes % 60;
    const padH = String(hours).padStart(2, '0');
    const padM = String(minutes).padStart(2, '0');
    const timeFormatted = `${padH}:${padM}`;

    const [yStr, mStr, dStr] = dateKey.split('-');
    const candidateStartDate = new Date(parseInt(yStr, 10), parseInt(mStr, 10) - 1, parseInt(dStr, 10), hours, minutes, 0, 0);
    const candidateStartMs = candidateStartDate.getTime();
    const candidateEndMs = candidateStartMs + (durationMin * 60000);

    // 2. Controllo anti-sovrapposizione RIGOROSO con tutti gli appuntamenti esistenti
    const collidingApp = checkAppointmentCollision(
        candidateStartMs,
        candidateEndMs,
        dateKey,
        appointmentDragState.appData.appId,
        appointmentDragState.appData.barberId
    );

    // Rimuovi eventuali anteprime su altre colonne
    document.querySelectorAll('.free-slot-preview').forEach(p => {
        if (p.parentElement !== targetCol) p.remove();
    });

    const guidesInCol = Array.from(targetCol.querySelectorAll('.drop-slot-guide'));

    if (collidingApp) {
        // --- CASO COLLISIONE: SLOT OCCUPATO (DIVIETO DI SPOSTAMENTO) ---
        document.querySelectorAll('.drop-slot-guide').forEach(g => g.classList.remove('active-hover'));

        let preview = targetCol.querySelector('.free-slot-preview');
        if (!preview) {
            preview = document.createElement('div');
            targetCol.appendChild(preview);
        }
        preview.className = 'free-slot-preview is-conflict';
        const previewTop = (clampedMinutes / 60) * hourHeight;
        const previewHeight = Math.max((durationMin / 60) * hourHeight, 24);
        preview.style.top = `${previewTop}px`;
        preview.style.height = `${previewHeight}px`;
        preview.innerHTML = `<span class="preview-time-tag">⛔ ${timeFormatted} Occupato</span>`;

        appointmentDragState.activeTargetSlot = {
            iso: candidateStartDate.toISOString(),
            time: timeFormatted,
            dateKey: dateKey,
            barberId: appointmentDragState.appData.barberId,
            isPresetSlot: false,
            isConflict: true,
            conflictWith: collidingApp.clientName || 'Altro appuntamento'
        };

        const badge = appointmentDragState.ghostEl?.querySelector('.ghost-badge');
        if (badge) {
            badge.innerText = `⛔ ${timeFormatted} Occupato`;
            badge.style.background = '#dc3545';
        }
    } else {
        // --- CASO VALIDO: NESSUNA COLLISIONE ---
        // Verifica se l'orario dei 5 minuti coincide con l'inizio di uno slot consigliato Zero-Gap
        const matchingGuide = guidesInCol.find(g => g.dataset.slotTime === timeFormatted);

        if (matchingGuide) {
            // Coincide con uno slot consigliato: evidenzia la guida verde
            guidesInCol.forEach(g => {
                if (g === matchingGuide) g.classList.add('active-hover');
                else g.classList.remove('active-hover');
            });
            document.querySelectorAll('.free-slot-preview').forEach(p => p.remove());

            appointmentDragState.activeTargetSlot = {
                iso: matchingGuide.dataset.slotIso,
                time: matchingGuide.dataset.slotTime,
                dateKey: matchingGuide.dataset.date,
                barberId: matchingGuide.dataset.barberId,
                isPresetSlot: true,
                isConflict: false
            };

            const badge = appointmentDragState.ghostEl?.querySelector('.ghost-badge');
            if (badge) {
                badge.innerText = `★ ${timeFormatted} Consigliato`;
                badge.style.background = '#2e7d32';
            }
        } else {
            // Orario libero continuo ogni 5 minuti (es. 11:05, 11:10 o extra-orario)
            document.querySelectorAll('.drop-slot-guide').forEach(g => g.classList.remove('active-hover'));

            let preview = targetCol.querySelector('.free-slot-preview');
            if (!preview) {
                preview = document.createElement('div');
                targetCol.appendChild(preview);
            }
            preview.className = 'free-slot-preview';
            const previewTop = (clampedMinutes / 60) * hourHeight;
            const previewHeight = Math.max((durationMin / 60) * hourHeight, 24);
            preview.style.top = `${previewTop}px`;
            preview.style.height = `${previewHeight}px`;
            preview.innerHTML = `<span class="preview-time-tag">${timeFormatted}</span>`;

            appointmentDragState.activeTargetSlot = {
                iso: candidateStartDate.toISOString(),
                time: timeFormatted,
                dateKey: dateKey,
                barberId: appointmentDragState.appData.barberId,
                isPresetSlot: false,
                isConflict: false
            };

            const badge = appointmentDragState.ghostEl?.querySelector('.ghost-badge');
            if (badge) {
                badge.innerText = `${timeFormatted}`;
                badge.style.background = '#64748b';
            }
        }
    }
}

/**
 * Gestisce l'auto-scorrimento verticale del corpo del calendario quando il cursore si avvicina al bordo superiore o inferiore
 */
function checkCalendarVerticalAutoScroll(clientX, clientY) {
    const calBody = document.querySelector('.calendar-sliding-content.active .calendar-body') || document.querySelector('.calendar-body');
    if (!calBody) {
        stopAutoScrollLoop();
        return;
    }

    const bRect = calBody.getBoundingClientRect();
    const zoneHeight = 75; // 75px di soglia vicino al top e al bottom

    // Controlla se il cursore è orizzontalmente all'interno della vista del calendario
    if (clientX >= bRect.left - 30 && clientX <= bRect.right + 30) {
        if (clientY < bRect.top + zoneHeight && clientY >= bRect.top - 60) {
            // Vicino al bordo superiore: scorri verso l'alto
            const dist = bRect.top + zoneHeight - clientY;
            const factor = Math.min(1.5, Math.max(0.15, dist / zoneHeight));
            appointmentDragState.autoScrollSpeed = -Math.round(factor * 18);
        } else if (clientY > bRect.bottom - zoneHeight && clientY <= bRect.bottom + 60) {
            // Vicino al bordo inferiore: scorri verso il basso
            const dist = clientY - (bRect.bottom - zoneHeight);
            const factor = Math.min(1.5, Math.max(0.15, dist / zoneHeight));
            appointmentDragState.autoScrollSpeed = Math.round(factor * 18);
        } else {
            appointmentDragState.autoScrollSpeed = 0;
        }
    } else {
        appointmentDragState.autoScrollSpeed = 0;
    }

    if (appointmentDragState.autoScrollSpeed !== 0) {
        startAutoScrollLoop();
    } else {
        stopAutoScrollLoop();
    }
}

/**
 * Ciclo requestAnimationFrame per scorrere continuamente mentre il cursore è tenuto fermo ai bordi
 */
function startAutoScrollLoop() {
    if (appointmentDragState.autoScrollRaf) return;

    function step() {
        if (!appointmentDragState.isDragging || appointmentDragState.autoScrollSpeed === 0) {
            appointmentDragState.autoScrollRaf = null;
            return;
        }

        const calBody = document.querySelector('.calendar-sliding-content.active .calendar-body') || document.querySelector('.calendar-body');
        if (calBody) {
            const prevScroll = calBody.scrollTop;
            calBody.scrollTop += appointmentDragState.autoScrollSpeed;

            // Aggiorna lo slot sotto il puntatore durante lo scorrimento
            if (calBody.scrollTop !== prevScroll && appointmentDragState.lastPointerX !== undefined) {
                updateHoveredSlotGuide(appointmentDragState.lastPointerX, appointmentDragState.lastPointerY);
            }
        }

        appointmentDragState.autoScrollRaf = requestAnimationFrame(step);
    }

    appointmentDragState.autoScrollRaf = requestAnimationFrame(step);
}

function stopAutoScrollLoop() {
    appointmentDragState.autoScrollSpeed = 0;
    if (appointmentDragState.autoScrollRaf) {
        cancelAnimationFrame(appointmentDragState.autoScrollRaf);
        appointmentDragState.autoScrollRaf = null;
    }
}

/**
 * Assicura la presenza degli indicatori luminosi per il passaggio settimana
 */
function ensureCalendarEdgeIndicators() {
    const calendarContainer = document.querySelector('.calendar-unified-container') || document.getElementById('custom-barber-calendar');
    if (!calendarContainer) return;

    if (!calendarContainer.querySelector('.calendar-edge-indicator.left')) {
        const leftInd = document.createElement('div');
        leftInd.className = 'calendar-edge-indicator left';
        leftInd.innerHTML = `
            <div class="edge-arrow">&larr;</div>
            <span class="edge-text">Sett. Prec.</span>
        `;
        calendarContainer.appendChild(leftInd);
    }

    if (!calendarContainer.querySelector('.calendar-edge-indicator.right')) {
        const rightInd = document.createElement('div');
        rightInd.className = 'calendar-edge-indicator right';
        rightInd.innerHTML = `
            <div class="edge-arrow">&rarr;</div>
            <span class="edge-text">Sett. Succ.</span>
        `;
        calendarContainer.appendChild(rightInd);
    }
}

/**
 * Controlla l'avvicinamento ai bordi laterali del calendario durante il drag.
 * Richiede una sosta continua (dwell time di 650ms) su una striscia di soli 22px dal bordo
 * per evitare tassativamente cambi involontari di settimana quando si rilascia l'appuntamento.
 */
function checkCalendarLateralEdges(clientX, clientY) {
    const calendarContainer = document.querySelector('.calendar-unified-container') || document.getElementById('custom-barber-calendar');
    if (!calendarContainer) return;

    const rect = calendarContainer.getBoundingClientRect();
    const leftInd = calendarContainer.querySelector('.calendar-edge-indicator.left');
    const rightInd = calendarContainer.querySelector('.calendar-edge-indicator.right');

    // Se fuori dai limiti verticali del calendario, cancella qualsiasi timer e nascondi indicatori
    if (clientY < rect.top || clientY > rect.bottom) {
        leftInd?.classList.remove('active');
        rightInd?.classList.remove('active');
        clearEdgeDwellTimer();
        return;
    }

    // Zona di bordo estremamente stretta (22px) per non toccare le colonne dei giorni
    const edgeZoneWidth = 22;
    const isNearLeft = clientX >= rect.left && clientX <= (rect.left + edgeZoneWidth);
    const isNearRight = clientX <= rect.right && clientX >= (rect.right - edgeZoneWidth);

    if (isNearLeft) {
        leftInd?.classList.add('active');
        rightInd?.classList.remove('active');
        startEdgeDwellTimer(-1);
    } else if (isNearRight) {
        rightInd?.classList.add('active');
        leftInd?.classList.remove('active');
        startEdgeDwellTimer(1);
    } else {
        leftInd?.classList.remove('active');
        rightInd?.classList.remove('active');
        clearEdgeDwellTimer();
    }
}

/**
 * Avvia il timer di sosta prolungata sul bordo: il cambio settimana avviene SOLO dopo 650ms continui di sosta
 */
function startEdgeDwellTimer(direction) {
    if (appointmentDragState.edgeDwellDirection === direction && appointmentDragState.edgeDwellTimeout) {
        return;
    }
    clearEdgeDwellTimer();
    appointmentDragState.edgeDwellDirection = direction;
    appointmentDragState.edgeDwellTimeout = setTimeout(() => {
        if (appointmentDragState.isDragging) {
            triggerCalendarEdgeNavigation(direction);
        }
        clearEdgeDwellTimer();
    }, 650);
}

/**
 * Annulla immediatamente il timer di sosta laterale
 */
function clearEdgeDwellTimer() {
    if (appointmentDragState.edgeDwellTimeout) {
        clearTimeout(appointmentDragState.edgeDwellTimeout);
        appointmentDragState.edgeDwellTimeout = null;
    }
    appointmentDragState.edgeDwellDirection = null;
}

/**
 * Cambia settimana se ci si avvicina al bordo laterale con debouncing / cooldown
 */
function triggerCalendarEdgeNavigation(direction) {
    if (appointmentDragState.edgeScrollCooldown) return;
    appointmentDragState.edgeScrollCooldown = true;

    changeCalendarPeriod(direction);

    // Cooldown per evitare avanzamenti a raffica
    setTimeout(() => {
        appointmentDragState.edgeScrollCooldown = false;
    }, 850);

    // Quando la nuova vista è renderizzata, ricalcola e disegna le guide per la nuova settimana
    setTimeout(() => {
        if (appointmentDragState.isDragging && appointmentDragState.appData) {
            renderDropSlotGuides(appointmentDragState.appData);
        }
    }, 420);
}

/**
 * Gestione rilascio puntatore (drop)
 */
function onAppointmentPointerUp(e) {
    window.removeEventListener('pointermove', onAppointmentPointerMove);
    window.removeEventListener('pointerup', onAppointmentPointerUp);
    window.removeEventListener('pointercancel', onAppointmentPointerUp);

    // Annulla subito qualsiasi sosta o scorrimento
    clearEdgeDwellTimer();
    stopAutoScrollLoop();

    const wasDragging = appointmentDragState.isDragging;
    const targetSlot = appointmentDragState.activeTargetSlot;
    const appData = appointmentDragState.appData;

    // Rimuovi ghost
    if (appointmentDragState.ghostEl) {
        appointmentDragState.ghostEl.remove();
        appointmentDragState.ghostEl = null;
    }

    // Rimuovi stile drag dall'elemento originario
    if (appointmentDragState.element) {
        appointmentDragState.element.classList.remove('is-dragging');
    }

    // Nascondi indicatori laterali e rimuovi anteprime libere
    document.querySelectorAll('.calendar-edge-indicator').forEach(ind => ind.classList.remove('active'));
    document.querySelectorAll('.free-slot-preview').forEach(p => p.remove());

    // Rimuovi guide slot
    clearDropSlotGuides();

    // Reset stato
    appointmentDragState.dragStarted = false;
    appointmentDragState.isDragging = false;
    appointmentDragState.element = null;
    appointmentDragState.activeTargetSlot = null;

    // Mantieni suppressNextClick per 250ms per non innescare il popup dettaglio
    setTimeout(() => {
        appointmentDragState.suppressNextClick = false;
    }, 250);

    // Se rilasciato su uno slot valido, controlla se è davvero un nuovo orario/giorno
    if (wasDragging && targetSlot && appData) {
        // Blocco se lo slot selezionato è in conflitto con un altro appuntamento
        if (targetSlot.isConflict) {
            showCustomAlert("Orario Non Disponibile", `Non puoi spostare l'appuntamento qui: alle ${targetSlot.time} c'è già un appuntamento (${targetSlot.conflictWith || 'occupato'}).`);
            return;
        }

        const originalStartMs = new Date(appData.start).getTime();
        const targetStartMs = new Date(targetSlot.iso).getTime();
        const diffMinutes = Math.round(Math.abs(targetStartMs - originalStartMs) / 60000);

        // Mostra il popup di conferma SOLO se l'orario o la data sono effettivamente diversi!
        if (diffMinutes > 0) {
            showAppointmentMoveConfirmPopup(appData, targetSlot);
        }
    }
}

/**
 * Calcola e renderizza le guide per gli slot disponibili su tutte le colonne giorno visibili
 */
function renderDropSlotGuides(appData) {
    clearDropSlotGuides();

    const hourHeight = 100;
    const dayColumns = document.querySelectorAll('.calendar-sliding-content.active .day-column[data-date], .calendar-body .day-column[data-date]');
    if (!dayColumns || dayColumns.length === 0) return;

    dayColumns.forEach(col => {
        const dateKey = col.dataset.date;
        if (!dateKey) return;

        const targetDate = new Date(dateKey + 'T00:00:00');
        const slots = calculateLiveAvailableSlots(
            targetDate,
            appData.duration,
            appData.service,
            appData.phone,
            appData.appId,
            appData.barberId
        );

        slots.forEach(slot => {
            const slotDate = new Date(slot.iso);
            const startHour = slotDate.getHours();
            const startMinute = slotDate.getMinutes();
            const top = (startHour * hourHeight) + (startMinute * (hourHeight / 60));
            const height = Math.max(appData.duration * (hourHeight / 60), 24);

            const guide = document.createElement('div');
            guide.className = 'drop-slot-guide';
            guide.style.top = `${top}px`;
            guide.style.height = `${height}px`;
            guide.dataset.slotIso = slot.iso;
            guide.dataset.slotTime = slot.time;
            guide.dataset.date = slot.dateKey;
            guide.dataset.barberId = slot.barberId;
            guide.innerHTML = `<span class="slot-guide-time">${slot.time}</span>`;

            col.appendChild(guide);
        });
    });
}

/**
 * Rimuove tutte le guide slot e le anteprime
 */
function clearDropSlotGuides() {
    document.querySelectorAll('.drop-slot-guide').forEach(g => g.remove());
    document.querySelectorAll('.free-slot-preview').forEach(p => p.remove());
}

/**
 * Calcolo live slot disponibili con algoritmo Zero-Gap coerente
 */
function calculateLiveAvailableSlots(targetDate, durationMin, serviceName, clientPhone, excludeAppId, barberId) {
    const now = new Date();
    const effectiveDuration = parseInt(durationMin, 10) || 30;
    const durMs = effectiveDuration * 60000;
    const bId = barberId || currentDisplayedBarberId;

    const daysNames = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
    const dayOfWeek = daysNames[targetDate.getDay()];

    const workingHours = cachedAppData?.workingHours || {};
    const barberHours = workingHours[bId] || [];
    const config = barberHours.find(row => row[1] && row[1].toLowerCase() === dayOfWeek);
    if (!config) return [];

    const shifts = [];
    const parseFn = typeof parseTimeString === 'function' ? parseTimeString : (str) => {
        if (!str || !str.includes(':')) return null;
        const [h, m] = str.split(':').map(Number);
        return isNaN(h) || isNaN(m) ? null : { hours: h, minutes: m };
    };

    const openAM = parseFn(config[2]);
    const closeAM = parseFn(config[3]);
    const openPM = parseFn(config[4]);
    const closePM = parseFn(config[5]);

    if (openAM && closeAM) shifts.push({ start: openAM, end: closeAM });
    if (openPM && closePM) shifts.push({ start: openPM, end: closePM });

    if (shifts.length === 0) {
        const startShift = openAM || openPM;
        const endShift = closePM || closeAM;
        if (startShift && endShift) {
            shifts.push({ start: startShift, end: endShift });
        }
    }
    if (shifts.length === 0) return [];

    const appointments = cachedBarberAppointments || [];
    const activeBookings = appointments.filter(b => {
        if (String(b.id) === String(excludeAppId)) return false;
        const st = String(b.status || '').toLowerCase().trim();
        return st === 'confermato' || st === 'richiesta cancellazione' || st === 'weekly' || st === 'indisponibile';
    }).filter(b => {
        if (!b.start) return false;
        const bDate = new Date(b.start);
        return !isNaN(bDate.getTime()) && bDate.toDateString() === targetDate.toDateString();
    }).map(b => {
        const startMs = new Date(b.start).getTime();
        const bDur = parseInt(b.duration, 10) || 30;
        const endMs = b.end ? new Date(b.end).getTime() : (startMs + bDur * 60000);
        return { start: startMs, end: endMs };
    });

    activeBookings.sort((a, b) => a.start - b.start);

    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dayNum = String(targetDate.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${dayNum}`;

    const slots = [];

    for (const shift of shifts) {
        let shiftStart = new Date(targetDate);
        shiftStart.setHours(shift.start.hours, shift.start.minutes, 0, 0);
        let shiftEnd = new Date(targetDate);
        shiftEnd.setHours(shift.end.hours, shift.end.minutes, 0, 0);

        if (shiftStart >= shiftEnd) continue;

        let pointer = new Date(shiftStart);
        // Evita orari passati
        if (pointer < now) {
            pointer = new Date(now.getTime() + 10 * 60000);
            pointer.setMinutes(Math.ceil(pointer.getMinutes() / 5) * 5, 0, 0);
            if (pointer.getTime() + durMs > shiftEnd.getTime()) continue;
        }

        while (pointer.getTime() + durMs <= shiftEnd.getTime()) {
            const slotEndMs = pointer.getTime() + durMs;
            const overlapEvent = activeBookings.find(ev => pointer.getTime() < ev.end && slotEndMs > ev.start);

            if (!overlapEvent) {
                const hStr = String(pointer.getHours()).padStart(2, '0');
                const mStr = String(pointer.getMinutes()).padStart(2, '0');
                slots.push({
                    iso: pointer.toISOString(),
                    dateKey: dateKey,
                    time: `${hStr}:${mStr}`,
                    barberId: bId
                });
                pointer = new Date(pointer.getTime() + durMs);
            } else {
                pointer = new Date(overlapEvent.end);
            }
        }
    }

    return slots;
}

/**
 * Mostra il popup di conferma spostamento con lo stile e i pulsanti dei popup generici dell'app
 */
function showAppointmentMoveConfirmPopup(appData, targetSlot) {
    const isIndispo = String(appData.status || '').toLowerCase().trim() === 'indisponibile';
    const titleText = isIndispo ? 'Sposta Impegno' : 'Sposta Appuntamento';

    const oldDateObj = new Date(appData.start);
    let currentStartMs = new Date(targetSlot.iso).getTime();
    const durationMin = appData.duration || 30;
    const targetDateKey = targetSlot.dateKey;
    const barberId = targetSlot.barberId || appData.barberId;

    const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    const formatFullDate = (d) => {
        const dayName = days[d.getDay()];
        const dayNum = d.getDate();
        const monthName = months[d.getMonth()];
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return `${dayName} ${dayNum} ${monthName} ore ${h}:${m}`;
    };

    // Trova orari consigliati per questo giorno
    const dayDate = new Date(targetDateKey + 'T00:00:00');
    const recommendedSlots = calculateLiveAvailableSlots(
        dayDate,
        durationMin,
        appData.service,
        appData.phone,
        appData.appId,
        barberId
    ) || [];
    const recommendedTimes = new Set(recommendedSlots.map(s => s.time));

    const contentHtml = `
        <div style="text-align: center; margin-bottom: 12px;">
            <p style="font-size: 1.15em; font-weight: 700; color: #1a1a1a; margin: 0 0 4px 0;">${appData.clientName}</p>
            ${!isIndispo ? `<p style="font-size: 0.9em; color: #666; margin: 0;">${(appData.service || '').replace(/_/g, ' ')} (${durationMin} min)</p>` : ''}
        </div>

        <div style="background: #f8f9fa; border: 1px solid #eee; border-radius: 15px; padding: 14px; text-align: left; margin: 10px 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 0.85em; font-weight: 600; color: #888;">Orario Attuale:</span>
                <span style="font-size: 0.9em; font-weight: 700; color: #2b303a;">${formatFullDate(oldDateObj)}</span>
            </div>
            <div style="text-align: center; color: #8A9A5B; font-size: 1.2em; line-height: 1; margin: 2px 0;">&darr;</div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
                <span style="font-size: 0.85em; font-weight: 600; color: #888;">Nuovo Orario:</span>
                <div style="text-align: right;">
                    <span id="popup-new-date-display" style="font-size: 0.95em; font-weight: 700; color: #2e7d32;"></span>
                    <span id="popup-new-slot-tag"></span>
                </div>
            </div>

            <!-- REGOLAZIONE FINE OGNI 5 MINUTI -->
            <div class="move-popup-fine-tune">
                <div class="fine-tune-label">
                    <span>Regola orario</span>
                    <span style="color: #8A9A5B; font-weight: 600;">Scatti di 5 min</span>
                </div>
                <div class="move-popup-stepper">
                    <button type="button" class="time-adjust-btn" id="btn-adjust-minus-5">&minus; 5 min</button>
                    <span class="time-adjust-display" id="time-adjust-display">--:--</span>
                    <button type="button" class="time-adjust-btn" id="btn-adjust-plus-5">&plus; 5 min</button>
                </div>
                <div id="confirm-collision-warning" style="display: none; margin-top: 8px; color: #dc3545; font-size: 0.82em; font-weight: 700; text-align: center;">
                    ⛔ Orario occupato da un altro appuntamento
                </div>
            </div>
        </div>
        <p style="font-size: 0.85em; color: #888; margin: 5px 0 0 0;">Vuoi confermare lo spostamento?</p>
    `;

    const actionsHtml = `
        <button id="btn-cancel-move-action" class="popup-action-secondary">Annulla</button>
        <button id="btn-confirm-move-action" class="popup-action-main" style="color: #8A9A5B;">Sposta</button>
    `;

    createPopup('confirm-move-popup-overlay', titleText, contentHtml, actionsHtml);

    const newDateDisplay = document.getElementById('popup-new-date-display');
    const newSlotTag = document.getElementById('popup-new-slot-tag');
    const timeDisplay = document.getElementById('time-adjust-display');
    const collisionWarning = document.getElementById('confirm-collision-warning');
    const confirmBtn = document.getElementById('btn-confirm-move-action');

    function renderPopupState() {
        const currentDateObj = new Date(currentStartMs);
        const curH = String(currentDateObj.getHours()).padStart(2, '0');
        const curM = String(currentDateObj.getMinutes()).padStart(2, '0');
        const curTimeFormatted = `${curH}:${curM}`;
        const currentEndMs = currentStartMs + durationMin * 60000;

        // Controllo collisione in tempo reale
        const collision = checkAppointmentCollision(
            currentStartMs,
            currentEndMs,
            targetDateKey,
            appData.appId,
            barberId
        );

        const isRecommended = recommendedTimes.has(curTimeFormatted);

        if (collision) {
            newDateDisplay.innerText = formatFullDate(currentDateObj);
            newDateDisplay.style.color = '#dc3545';
            newSlotTag.innerHTML = `<span style="font-size: 0.78em; background: #dc3545; color: white; padding: 2px 7px; border-radius: 6px; margin-left: 6px; font-weight: 700;">Occupato</span>`;
            timeDisplay.innerText = curTimeFormatted;
            timeDisplay.style.borderColor = '#dc3545';
            timeDisplay.style.color = '#dc3545';
            collisionWarning.style.display = 'block';
            collisionWarning.innerText = `⛔ Orario occupato (${collision.clientName || 'Altro appuntamento'})`;
            confirmBtn.disabled = true;
            confirmBtn.style.opacity = '0.4';
            confirmBtn.style.cursor = 'not-allowed';
        } else {
            newDateDisplay.innerText = formatFullDate(currentDateObj);
            newDateDisplay.style.color = isRecommended ? '#2e7d32' : '#475569';
            newSlotTag.innerHTML = isRecommended
                ? `<span style="font-size: 0.78em; background: #2e7d32; color: white; padding: 2px 7px; border-radius: 6px; margin-left: 6px; font-weight: 700;">Consigliato</span>`
                : `<span style="font-size: 0.78em; background: #64748b; color: white; padding: 2px 7px; border-radius: 6px; margin-left: 6px; font-weight: 700;">Libero 5m</span>`;
            timeDisplay.innerText = curTimeFormatted;
            timeDisplay.style.borderColor = isRecommended ? '#2e7d32' : '#64748b';
            timeDisplay.style.color = '#1e293b';
            collisionWarning.style.display = 'none';
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
            confirmBtn.style.cursor = 'pointer';
        }
    }

    renderPopupState();

    document.getElementById('btn-adjust-minus-5').onclick = () => {
        currentStartMs -= 5 * 60000;
        renderPopupState();
    };

    document.getElementById('btn-adjust-plus-5').onclick = () => {
        currentStartMs += 5 * 60000;
        renderPopupState();
    };

    document.getElementById('btn-cancel-move-action').onclick = () => {
        closeTopPopup();
    };

    document.getElementById('btn-confirm-move-action').onclick = function () {
        const currentDateObj = new Date(currentStartMs);
        const curEndMs = currentStartMs + durationMin * 60000;
        const collision = checkAppointmentCollision(
            currentStartMs,
            curEndMs,
            targetDateKey,
            appData.appId,
            barberId
        );
        if (collision) {
            showCustomAlert("Orario Non Disponibile", "Questo orario entra in conflitto con un altro appuntamento.");
            return;
        }

        const btn = this;
        showButtonSpinner(btn);

        const newStartIso = currentDateObj.toISOString();
        const newEndObj = new Date(curEndMs);
        const newEndIso = newEndObj.toISOString();
        const finalTimeStr = `${String(currentDateObj.getHours()).padStart(2, '0')}:${String(currentDateObj.getMinutes()).padStart(2, '0')}`;

        if (isIndispo) {
            google.script.run
                .withSuccessHandler(res => {
                    closeTopPopup();
                    if (res && res.status === "OK") {
                        if (cachedBarberAppointments) {
                            const found = cachedBarberAppointments.find(a => a.id === appData.appId);
                            if (found) {
                                found.start = newStartIso;
                                found.end = newEndIso;
                            }
                        }
                        showCustomAlert("Fatto", "Impegno spostato correttamente.");
                        const currentBody = document.querySelector('.calendar-body');
                        const savedScroll = currentBody ? currentBody.scrollTop : dashboardCalendarScrollPosition;
                        renderCustomCalendar(cachedBarberAppointments, true, savedScroll, 0);
                    } else {
                        showCustomAlert("Errore", res?.message || "Impossibile spostare l'impegno.");
                    }
                })
                .withFailureHandler(err => {
                    closeTopPopup();
                    showCustomAlert("Errore", "Errore durante lo spostamento: " + err);
                })
                .updateIndisponibilita(appData.appId, newStartIso, newEndIso, appData.cancelReason || '', false);
        } else {
            let clientEmail = 'Nessuna Email';
            if (cachedAppData && cachedAppData.clients) {
                const foundClient = cachedAppData.clients.find(c => {
                    if (appData.phone && (c.telefono || c.phone)) {
                        return normalizePhone(c.telefono || c.phone) === normalizePhone(appData.phone);
                    }
                    return false;
                });
                if (foundClient && foundClient.email) clientEmail = foundClient.email;
            }

            google.script.run
                .withSuccessHandler(res => {
                    closeTopPopup();
                    if (res && res.status === "OK") {
                        if (cachedBarberAppointments) {
                            const found = cachedBarberAppointments.find(a => a.id === appData.appId);
                            if (found) {
                                found.start = newStartIso;
                                found.end = newEndIso;
                            }
                        }
                        showCustomAlert("Aggiornato", "Appuntamento spostato con successo alle " + finalTimeStr + ".");
                        const currentBody = document.querySelector('.calendar-body');
                        const savedScroll = currentBody ? currentBody.scrollTop : dashboardCalendarScrollPosition;
                        renderCustomCalendar(cachedBarberAppointments, true, savedScroll, 0);
                    } else {
                        showCustomAlert("Errore", res?.message || "Impossibile spostare l'appuntamento.");
                    }
                })
                .withFailureHandler(err => {
                    closeTopPopup();
                    showCustomAlert("Errore", "Errore durante lo spostamento: " + err);
                })
                .updateAppointment(
                    appData.appId,
                    newStartIso,
                    newEndIso,
                    appData.service,
                    clientEmail,
                    barberId
                );
        }
    };
}

function formatTimeSimple(isoString) {
    if (!isoString) return '--:--';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '--:--';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
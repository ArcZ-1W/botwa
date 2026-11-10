/**
 * Client-Side JavaScript untuk WhatsApp Bot Dashboard & Webhook
 * Cloudflare Tunnel + WebSocket Keep-Alive + Password-Only Auth ("x") + Service Master Controls
 */

document.addEventListener('DOMContentLoaded', () => {
    let ws = null;
    let currentLogs = [];
    let uptimeSeconds = 0;
    let uptimeInterval = null;
    let isTunnelRunning = false;
    let currentDomain = 'api.revicshop.web.id';
    let authToken = localStorage.getItem('ea_auth_token') || '';

    // DOM Elements - Auth & Screen
    const loginScreen = document.getElementById('loginScreen');
    const appLayout = document.getElementById('appLayout');
    const loginForm = document.getElementById('loginForm');
    const loginPassword = document.getElementById('loginPassword');
    const loginError = document.getElementById('loginError');
    const btnLoginSubmit = document.getElementById('btnLoginSubmit');
    const btnLogout = document.getElementById('btnLogout');
    const btnTogglePassword = document.getElementById('btnTogglePassword');

    // DOM Elements - Header & Cards
    const brandName = document.getElementById('brandName');
    const statusPill = document.getElementById('statusPill');
    const statusLabel = document.getElementById('statusLabel');
    const cardStatus = document.getElementById('cardStatus');
    const cardMode = document.getElementById('cardMode');
    const cardUptime = document.getElementById('cardUptime');
    const cardCommands = document.getElementById('cardCommands');
    const btnHeaderMode = document.getElementById('btnHeaderMode');

    // Services Master Bar
    const serviceSubBot = document.getElementById('serviceSubBot');
    const serviceSubTunnel = document.getElementById('serviceSubTunnel');
    const btnQuickStartBot = document.getElementById('btnQuickStartBot');
    const btnQuickStopBot = document.getElementById('btnQuickStopBot');
    const btnToggleTunnel = document.getElementById('btnToggleTunnel');
    const txtTunnelDomain = document.getElementById('txtTunnelDomain');

    // Pairing
    const pairingBanner = document.getElementById('pairingBanner');
    const displayPairingCode = document.getElementById('displayPairingCode');
    const btnCopyCode = document.getElementById('btnCopyCode');

    // Action Buttons
    const btnStart = document.getElementById('btnStart');
    const btnStop = document.getElementById('btnStop');
    const btnRestart = document.getElementById('btnRestart');
    const btnClearSession = document.getElementById('btnClearSession');

    // Terminal
    const terminalLogs = document.getElementById('terminalLogs');
    const logCounter = document.getElementById('logCounter');
    const logFilter = document.getElementById('logFilter');
    const btnClearLogs = document.getElementById('btnClearLogs');

    // Webhook Elements
    const endpointSample = document.getElementById('endpointSample');
    const btnCopyEndpoint = document.getElementById('btnCopyEndpoint');
    const webhookForm = document.getElementById('webhookForm');
    const webTarget = document.getElementById('webTarget');
    const webCode = document.getElementById('webCode');
    const btnTestWebhook = document.getElementById('btnTestWebhook');
    const cooldownBadge = document.getElementById('cooldownBadge');
    const webhookResultBox = document.getElementById('webhookResultBox');
    const webhookResultText = document.getElementById('webhookResultText');

    // Settings Elements
    const settingsForm = document.getElementById('settingsForm');
    const inputBotName = document.getElementById('inputBotName');
    const inputPrefix = document.getElementById('inputPrefix');
    const selectMode = document.getElementById('selectMode');
    const inputPackname = document.getElementById('inputPackname');
    const inputAuthor = document.getElementById('inputAuthor');
    const inputBotNumber = document.getElementById('inputBotNumber');
    const inputTunnelDomain = document.getElementById('inputTunnelDomain');
    const inputTunnelToken = document.getElementById('inputTunnelToken');
    const inputDelaySec = document.getElementById('inputDelaySec');
    const saveStatus = document.getElementById('saveStatus');

    // Auto-Start Checkboxes
    const checkAutoStartServer = document.getElementById('checkAutoStartServer');
    const checkAutoStartBot = document.getElementById('checkAutoStartBot');
    const checkAutoStartTunnel = document.getElementById('checkAutoStartTunnel');
    const checkWindowsStartup = document.getElementById('checkWindowsStartup');

    // Guide Search
    const guideSearchInput = document.getElementById('guideSearchInput');
    const guideGrid = document.getElementById('guideGrid');

    const toast = document.getElementById('toast');

    // ==========================================
    // AUTHENTICATION LOGIC (Password Only: "x")
    // ==========================================

    function showLoginScreen() {
        if (loginScreen) loginScreen.classList.remove('hidden');
        if (appLayout) appLayout.classList.add('hidden');
        if (loginPassword) {
            loginPassword.value = '';
            setTimeout(() => loginPassword.focus(), 120);
        }
        if (loginError) loginError.classList.add('hidden');
    }

    function hideLoginScreen() {
        if (loginScreen) loginScreen.classList.add('hidden');
        if (appLayout) appLayout.classList.remove('hidden');
        if (loginError) loginError.classList.add('hidden');
    }

    if (btnTogglePassword && loginPassword) {
        btnTogglePassword.addEventListener('click', () => {
            const isPass = loginPassword.type === 'password';
            loginPassword.type = isPass ? 'text' : 'password';
            btnTogglePassword.textContent = isPass ? '🙈' : '👁️';
        });
    }

    async function apiFetch(url, options = {}) {
        const headers = options.headers || {};
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        options.headers = headers;

        try {
            const res = await fetch(url, options);
            if (res.status === 401) {
                authToken = '';
                localStorage.removeItem('ea_auth_token');
                showLoginScreen();
                throw new Error('Sesi login telah habis. Masukkan password kembali.');
            }
            return res;
        } catch (err) {
            throw err;
        }
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = loginPassword ? loginPassword.value.trim() : '';
            if (!password) return;

            if (btnLoginSubmit) {
                btnLoginSubmit.disabled = true;
                btnLoginSubmit.textContent = 'Memverifikasi...';
            }
            if (loginError) loginError.classList.add('hidden');

            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });

                const data = await res.json();
                if (res.status === 200 && data.success && data.token) {
                    authToken = data.token;
                    localStorage.setItem('ea_auth_token', authToken);
                    hideLoginScreen();
                    showToast('Login berhasil! Selamat datang di Dashboard.', 'success');
                    connectWebSocket();
                    fetchInitialStatus();
                } else {
                    if (loginError) {
                        loginError.textContent = data.message || '⚠️ Password salah! Coba lagi.';
                        loginError.classList.remove('hidden');
                    }
                    if (loginPassword) {
                        loginPassword.select();
                        loginPassword.focus();
                    }
                }
            } catch (err) {
                if (loginError) {
                    loginError.textContent = `Error: ${err.message}`;
                    loginError.classList.remove('hidden');
                }
            } finally {
                if (btnLoginSubmit) {
                    btnLoginSubmit.disabled = false;
                    btnLoginSubmit.textContent = 'Masuk ke Dashboard ➔';
                }
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                    }
                });
            } catch (e) {}

            authToken = '';
            localStorage.removeItem('ea_auth_token');
            if (ws) {
                ws.close();
                ws = null;
            }
            showToast('Anda telah logout.', 'info');
            showLoginScreen();
        });
    }

    async function checkAuthStatus() {
        if (!authToken) {
            showLoginScreen();
            return;
        }

        try {
            const headers = { 'Authorization': `Bearer ${authToken}` };
            const res = await fetch('/api/auth/check', { headers });
            const data = await res.json();

            if (data.authenticated) {
                hideLoginScreen();
                connectWebSocket();
                fetchInitialStatus();
            } else {
                showLoginScreen();
            }
        } catch (e) {
            showLoginScreen();
        }
    }

    async function fetchInitialStatus() {
        try {
            const res = await apiFetch('/api/status');
            const data = await res.json();
            if (data) {
                updateStatusUI(data.status, data.pairingCode);
                if (cardCommands) cardCommands.textContent = data.totalCommands || 0;
                uptimeSeconds = data.uptime || 0;
                if (cardUptime) cardUptime.textContent = formatUptime(uptimeSeconds);
                if (data.tunnel) updateTunnelUI(data.tunnel);
                if (data.config) applyConfigUI(data.config, data.isStartupEnabled);
                currentLogs = data.logs || [];
                renderLogs();
            }
        } catch (e) {
            console.error('fetchInitialStatus error:', e);
        }
    }

    // ==========================================
    // UI HELPERS
    // ==========================================

    function updateModeUI(mode) {
        const isPrivate = mode === 'private';
        if (btnHeaderMode) {
            btnHeaderMode.textContent = isPrivate ? '🔒 Private Mode' : '🌐 Open Mode';
            btnHeaderMode.style.borderColor = isPrivate ? '#f59e0b' : '#38bdf8';
            btnHeaderMode.style.color = isPrivate ? '#fef3c7' : '#bae6fd';
        }
        if (cardMode) {
            cardMode.textContent = isPrivate ? '🔒 Khusus Owner' : '🌐 Publik (Semua)';
            cardMode.style.color = isPrivate ? '#f59e0b' : '#38bdf8';
        }
        if (selectMode) {
            selectMode.value = isPrivate ? 'private' : 'public';
        }
    }

    if (btnHeaderMode) {
        btnHeaderMode.addEventListener('click', async () => {
            const isPrivateNow = btnHeaderMode.textContent.includes('Private');
            const targetMode = isPrivateNow ? 'public' : 'private';
            try {
                const res = await apiFetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: targetMode })
                });
                const d = await res.json();
                if (d.success) {
                    updateModeUI(targetMode);
                    showToast(`Mode diubah ke ${targetMode === 'private' ? '🔒 Private Mode' : '🌐 Open Mode'}`, 'success');
                }
            } catch (e) {
                showToast(`Gagal: ${e.message}`, 'error');
            }
        });
    }

    function showToast(message, type = 'info') {
        if (!toast) return;
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        setTimeout(() => {
            toast.className = 'toast';
        }, 3200);
    }

    function formatUptime(seconds) {
        if (!seconds || seconds <= 0) return '0d';
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor((seconds % (3600 * 24)) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;

        const parts = [];
        if (d > 0) parts.push(`${d}h`);
        if (h > 0 || d > 0) parts.push(`${h}j`);
        if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
        parts.push(`${s}d`);
        return parts.join(' ');
    }

    function updateStatusUI(status, pairingCode) {
        if (!statusPill) return;
        statusPill.className = 'status-pill';

        if (status === 'open') {
            statusPill.classList.add('status-online');
            statusLabel.textContent = 'Terhubung (Online)';
            if (cardStatus) cardStatus.textContent = '🟢 Online';
            if (serviceSubBot) serviceSubBot.innerHTML = '<span style="color:#10b981;font-weight:700;">🟢 Online (Terhubung)</span>';
            if (pairingBanner) pairingBanner.classList.add('hidden');
        } else if (status === 'waiting_pairing') {
            statusPill.classList.add('status-waiting');
            statusLabel.textContent = 'Menunggu Pairing';
            if (cardStatus) cardStatus.textContent = '🔑 Menunggu Pairing';
            if (serviceSubBot) serviceSubBot.innerHTML = '<span style="color:#f59e0b;font-weight:700;">🔑 Menunggu Pairing</span>';

            if (pairingBanner && displayPairingCode) {
                pairingBanner.classList.remove('hidden');
                displayPairingCode.textContent = pairingCode || 'MEMINTA KODE...';
            }
        } else if (status === 'connecting') {
            statusPill.classList.add('status-connecting');
            statusLabel.textContent = 'Menghubungkan...';
            if (cardStatus) cardStatus.textContent = '🟡 Menghubungkan';
            if (serviceSubBot) serviceSubBot.innerHTML = '<span style="color:#f59e0b;font-weight:700;">🟡 Menghubungkan...</span>';
            if (pairingBanner) pairingBanner.classList.add('hidden');
        } else {
            statusPill.classList.add('status-offline');
            statusLabel.textContent = 'Terputus (Offline)';
            if (cardStatus) cardStatus.textContent = '🔴 Offline';
            if (serviceSubBot) serviceSubBot.innerHTML = '<span style="color:#fb7185;font-weight:700;">🔴 Offline (Mati)</span>';
            if (pairingBanner) pairingBanner.classList.add('hidden');
        }
    }

    function updateTunnelUI(tunnelData) {
        if (!tunnelData) return;
        isTunnelRunning = !!tunnelData.isRunning;
        currentDomain = tunnelData.domain || currentDomain;

        if (txtTunnelDomain) txtTunnelDomain.textContent = currentDomain;
        if (endpointSample) endpointSample.textContent = `https://${currentDomain}/api/v1?number=1010&code=123456`;

        if (serviceSubTunnel) {
            if (isTunnelRunning) {
                serviceSubTunnel.innerHTML = `<span style="color:#10b981;font-weight:700;">🟢 Aktif</span> (${currentDomain})`;
            } else {
                serviceSubTunnel.innerHTML = `<span style="color:#fb7185;font-weight:700;">🔴 Mati</span> (${currentDomain})`;
            }
        }

        if (btnToggleTunnel) {
            btnToggleTunnel.textContent = isTunnelRunning ? '⏹ Stop Tunnel' : '🌐 Mulai Tunnel';
            btnToggleTunnel.className = isTunnelRunning ? 'btn btn-xs btn-danger' : 'btn btn-xs btn-primary';
        }
    }

    function applyConfigUI(cfg, isStartup) {
        if (!cfg) return;
        if (brandName) brandName.textContent = cfg.botName || 'EndLess Academy Bot';
        if (inputBotName) inputBotName.value = cfg.botName || '';
        if (inputPrefix) inputPrefix.value = cfg.prefix || '.';
        updateModeUI(cfg.mode || 'public');
        if (inputPackname) inputPackname.value = cfg.packname || '';
        if (inputAuthor) inputAuthor.value = cfg.author || '';
        if (inputBotNumber) inputBotNumber.value = cfg.botNumber || '';
        if (inputTunnelDomain) inputTunnelDomain.value = cfg.tunnelDomain || 'api.revicshop.web.id';
        if (inputTunnelToken) inputTunnelToken.value = cfg.tunnelToken || '';
        if (inputDelaySec) inputDelaySec.value = cfg.webhookDelaySeconds || 60;

        // Auto-start checkboxes
        if (checkAutoStartBot) checkAutoStartBot.checked = cfg.autoStartBot !== false;
        if (checkAutoStartTunnel) checkAutoStartTunnel.checked = cfg.autoStartTunnel !== false;
        if (checkWindowsStartup && isStartup !== undefined) checkWindowsStartup.checked = !!isStartup;
    }

    function renderLogs() {
        if (!terminalLogs) return;
        const filter = logFilter ? logFilter.value : 'all';
        terminalLogs.innerHTML = '';

        const filtered = currentLogs.filter((log) => {
            if (filter === 'command') return log.type === 'command';
            if (filter === 'error') return log.type === 'warn' || log.type === 'error';
            return true;
        });

        if (filtered.length === 0) {
            terminalLogs.innerHTML = '<div class="log-empty">Menunggu aktivitas bot &amp; webhook... Log aktivitas akan tampil di sini secara real-time.</div>';
            if (logCounter) logCounter.textContent = '0 pesan';
            return;
        }

        if (logCounter) logCounter.textContent = `${filtered.length} pesan`;

        filtered.forEach((log) => {
            const item = document.createElement('div');
            item.className = `log-item type-${log.type}`;

            let tagClass = 'tag-info';
            let tagText = 'INFO';
            if (log.type === 'command') { tagClass = 'tag-command'; tagText = 'CMD'; }
            else if (log.type === 'success') { tagClass = 'tag-success'; tagText = 'OK'; }
            else if (log.type === 'warn') { tagClass = 'tag-warn'; tagText = 'WARN'; }
            else if (log.type === 'error') { tagClass = 'tag-error'; tagText = 'ERR'; }

            item.innerHTML = `
                <span class="log-time">${log.time || ''}</span>
                <span class="log-tag ${tagClass}">${tagText}</span>
                <span class="log-message">${log.text || ''}</span>
            `;

            terminalLogs.appendChild(item);
        });

        terminalLogs.scrollTop = terminalLogs.scrollHeight;
    }

    function addLogEntry(log) {
        currentLogs.push(log);
        if (currentLogs.length > 300) currentLogs.shift();
        renderLogs();
    }

    // ==========================================
    // WEBSOCKET (WSS Compatible + Tunnel Token)
    // ==========================================

    function connectWebSocket() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const tokenQuery = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
        const wsUrl = `${protocol}//${location.host}${tokenQuery}`;

        try {
            ws = new WebSocket(wsUrl);
        } catch (e) {
            console.error('Failed to create WebSocket:', e);
            return;
        }

        ws.onopen = () => {
            console.log('WebSocket tersambung ke backend.');
        };

        ws.onmessage = (event) => {
            try {
                const { type, data } = JSON.parse(event.data);

                if (type === 'auth_required') {
                    showLoginScreen();
                    return;
                }

                if (type === 'init') {
                    updateStatusUI(data.status, data.pairingCode);
                    if (cardCommands) cardCommands.textContent = data.totalCommands || 0;
                    uptimeSeconds = data.uptime || 0;
                    if (cardUptime) cardUptime.textContent = formatUptime(uptimeSeconds);
                    if (data.tunnel) updateTunnelUI(data.tunnel);
                    if (data.config) applyConfigUI(data.config, data.isStartupEnabled);

                    currentLogs = data.logs || [];
                    renderLogs();
                } else if (type === 'status') {
                    updateStatusUI(data.status, data.pairingCode);
                    if (data.uptime !== undefined) uptimeSeconds = data.uptime;
                    if (data.totalCommands !== undefined && cardCommands) cardCommands.textContent = data.totalCommands;
                } else if (type === 'tunnel_status') {
                    updateTunnelUI(data);
                } else if (type === 'log') {
                    addLogEntry(data);
                } else if (type === 'stats') {
                    if (data.totalCommands !== undefined && cardCommands) cardCommands.textContent = data.totalCommands;
                } else if (type === 'config') {
                    applyConfigUI(data);
                }
            } catch (err) {
                console.error('Error parsing WS message:', err);
            }
        };

        ws.onclose = (event) => {
            if (event.code === 4401) {
                showLoginScreen();
            } else {
                setTimeout(() => {
                    if (loginScreen && loginScreen.classList.contains('hidden')) {
                        connectWebSocket();
                    }
                }, 3000);
            }
        };

        ws.onerror = (err) => {
            console.warn('WebSocket connection warning:', err);
        };
    }

    // Uptime ticker
    uptimeInterval = setInterval(() => {
        if (cardStatus && cardStatus.textContent.includes('Online')) {
            uptimeSeconds++;
            if (cardUptime) cardUptime.textContent = formatUptime(uptimeSeconds);
        }
    }, 1000);

    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));

            btn.classList.add('active');
            const target = btn.getAttribute('data-tab');
            const targetEl = document.getElementById(target);
            if (targetEl) targetEl.classList.add('active');
        });
    });

    // Copy Pairing Code
    if (btnCopyCode) {
        btnCopyCode.addEventListener('click', () => {
            const code = displayPairingCode.textContent.trim();
            if (code && code !== 'MEMUAT...' && code !== 'MEMINTA KODE...') {
                navigator.clipboard.writeText(code).then(() => {
                    showToast(`Kode ${code} disalin ke clipboard!`, 'success');
                });
            }
        });
    }

    // Copy Endpoint URL
    if (btnCopyEndpoint) {
        btnCopyEndpoint.addEventListener('click', () => {
            const url = endpointSample.textContent.trim();
            navigator.clipboard.writeText(url).then(() => {
                showToast('Contoh URL Webhook disalin ke clipboard!', 'success');
            });
        });
    }

    // Action Controls
    async function sendAction(action, extra = {}) {
        try {
            const res = await apiFetch('/api/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, ...extra })
            });
            const result = await res.json();
            showToast(result.message || 'Perintah dieksekusi', result.success ? 'success' : 'error');
        } catch (err) {
            showToast(`Gagal: ${err.message}`, 'error');
        }
    }

    if (btnStart) btnStart.addEventListener('click', () => sendAction('start'));
    if (btnStop) btnStop.addEventListener('click', () => sendAction('stop'));
    if (btnRestart) btnRestart.addEventListener('click', () => sendAction('restart'));
    if (btnQuickStartBot) btnQuickStartBot.addEventListener('click', () => sendAction('start'));
    if (btnQuickStopBot) btnQuickStopBot.addEventListener('click', () => sendAction('stop'));

    if (btnClearSession) {
        btnClearSession.addEventListener('click', () => {
            if (confirm('Yakin ingin mereset sesi WhatsApp? Anda harus menautkan perangkat (pairing) ulang.')) {
                sendAction('clear_session');
            }
        });
    }

    // Tunnel Toggle
    if (btnToggleTunnel) {
        btnToggleTunnel.addEventListener('click', async () => {
            const endpoint = isTunnelRunning ? '/api/tunnel/stop' : '/api/tunnel/start';
            try {
                const res = await apiFetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: inputTunnelToken.value.trim() })
                });
                const result = await res.json();
                showToast(result.message || 'Proses tunnel diperbarui', result.success ? 'success' : 'error');
            } catch (err) {
                showToast(`Error tunnel: ${err.message}`, 'error');
            }
        });
    }

    // Webhook Simulator Form (Public endpoint /api/v1)
    if (webhookForm) {
        webhookForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const number = webTarget.value.trim();
            const code = webCode.value.trim();

            if (!number || !code) return;

            webhookResultBox.classList.remove('hidden');
            webhookResultText.innerHTML = '<span style="color:#38bdf8;">⏳ Mengirim permintaan verifikasi via webhook...</span>';
            btnTestWebhook.disabled = true;

            try {
                const res = await fetch(`/api/v1?number=${encodeURIComponent(number)}&code=${encodeURIComponent(code)}`);
                const data = await res.json();

                if (res.status === 200 && data.success) {
                    webhookResultText.innerHTML = `
                        <div style="color: #10b981; font-weight: bold; margin-bottom: 4px;">✅ Kode Verifikasi Berhasil Terkirim!</div>
                        <div>Target: <strong>${data.target}</strong></div>
                        <div>Kode: <strong>${data.code}</strong></div>
                        <div>⏱️ Waktu Respon Sampai: <strong>${data.elapsedSec} detik (${data.elapsedMs}ms)</strong></div>
                    `;
                    showToast(`Kode ${code} terkirim dalam ${data.elapsedSec}s!`, 'success');
                } else if (res.status === 429) {
                    webhookResultText.innerHTML = `
                        <div style="color: #f59e0b; font-weight: bold; margin-bottom: 4px;">⚠️ Jeda Delay Cooldown 60 Detik Aktif</div>
                        <div>${data.message}</div>
                        <div>Sisa Waktu Menunggu: <strong>${data.remainingSeconds} detik</strong></div>
                    `;
                    cooldownBadge.classList.remove('hidden');
                    cooldownBadge.textContent = `⏳ Sisa Delay: ${data.remainingSeconds}s`;
                    showToast(`Nomor ${number} masih cooldown (${data.remainingSeconds}s)`, 'warn');
                } else {
                    webhookResultText.innerHTML = `<div style="color: #ef4444;">❌ Gagal: ${data.message}</div>`;
                    showToast(data.message, 'error');
                }
            } catch (err) {
                webhookResultText.innerHTML = `<div style="color: #ef4444;">❌ Error: ${err.message}</div>`;
                showToast(err.message, 'error');
            } finally {
                btnTestWebhook.disabled = false;
            }
        });
    }

    // Settings Submit
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            saveStatus.textContent = 'Menyimpan...';

            try {
                const payload = {
                    botName: inputBotName.value.trim(),
                    prefix: inputPrefix.value.trim(),
                    mode: selectMode ? selectMode.value : 'public',
                    packname: inputPackname.value.trim(),
                    author: inputAuthor.value,
                    botNumber: inputBotNumber.value.trim(),
                    tunnelDomain: inputTunnelDomain.value.trim(),
                    tunnelToken: inputTunnelToken.value.trim(),
                    webhookDelaySeconds: Number(inputDelaySec.value) || 60,
                    autoStartServer: true,
                    autoStartBot: checkAutoStartBot ? checkAutoStartBot.checked : true,
                    autoStartTunnel: checkAutoStartTunnel ? checkAutoStartTunnel.checked : true
                };

                const res = await apiFetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                // Update Windows Startup jika diubah
                if (checkWindowsStartup) {
                    await apiFetch('/api/startup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ enable: checkWindowsStartup.checked })
                    });
                }

                const result = await res.json();
                if (result.success) {
                    saveStatus.textContent = '✅ Berhasil disimpan!';
                    showToast('Pengaturan bot & auto-start berhasil disimpan!', 'success');
                    if (txtTunnelDomain) txtTunnelDomain.textContent = payload.tunnelDomain;
                    if (endpointSample) endpointSample.textContent = `https://${payload.tunnelDomain}/api/v1?number=1010&code=123456`;
                    setTimeout(() => { saveStatus.textContent = ''; }, 3000);
                } else {
                    saveStatus.textContent = '❌ Gagal menyimpan';
                    showToast(result.message || 'Gagal menyimpan', 'error');
                }
            } catch (err) {
                saveStatus.textContent = `❌ ${err.message}`;
                showToast(err.message, 'error');
            }
        });
    }

    // Live Guide Search Filter
    if (guideSearchInput && guideGrid) {
        guideSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const items = guideGrid.querySelectorAll('.guide-item');
            items.forEach((item) => {
                const text = item.textContent.toLowerCase();
                if (!query || text.includes(query)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    // Filter Logs & Clear View
    if (logFilter) logFilter.addEventListener('change', renderLogs);
    if (btnClearLogs) {
        btnClearLogs.addEventListener('click', () => {
            currentLogs = [];
            renderLogs();
        });
    }

    // Start Check Auth & WS
    checkAuthStatus();
});

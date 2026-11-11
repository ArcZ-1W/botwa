/**
 * Application Entry Point (Web Dashboard UI + Bot Manager + Tunnel + Webhook API)
 */

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const config = require('./config');
const botManager = require('./lib/botManager');
const tunnelManager = require('./lib/tunnelManager');
const { isStartupEnabled, enableStartup, disableStartup } = require('./lib/startup');
const { color, info, success, warn, error } = require('./lib/color');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || config.port || 2979;

// Cloudflare Tunnel & Reverse Proxy Support
app.set('trust proxy', true);

// CORS Middleware untuk Web Client (Chat Place & Combo Management)
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token, x-desktop-app');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Anti-cache header agar browser/Cloudflare tidak menyimpan cache CSS/JS lama
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ success: false, message: 'Format data JSON tidak valid' });
    }
    next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/uploads', express.static(path.join(__dirname, 'data', 'uploads')));

const ChatManager = require('./lib/chatManager');

// Sesi login aktif (Password Only: 'x')
const activeSessions = new Set();

// Helper untuk deteksi koneksi lokal (Desktop App polling di loopback)
function isLoopback(req) {
    const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.includes('127.0.0.1');
}

// Verifikasi auth token
function verifyAuthToken(req) {
    const authHeader = req.headers['authorization'] || '';
    let token = '';
    if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
    } else if (req.query && req.query.token) {
        token = req.query.token.toString().trim();
    } else if (req.headers['x-auth-token']) {
        token = req.headers['x-auth-token'].toString().trim();
    }

    // Jika token valid di session aktif
    if (token && activeSessions.has(token)) {
        return true;
    }

    // Bypass khusus untuk Desktop Python Controller (loopback polling internal)
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    if (isLoopback(req) && (userAgent.includes('python-requests') || req.headers['x-desktop-app'])) {
        return true;
    }

    return false;
}

// Middleware proteksi route Dashboard
function requireAuth(req, res, next) {
    if (verifyAuthToken(req)) {
        return next();
    }
    return res.status(401).json({
        status: 'unauthorized',
        authenticated: false,
        message: 'Akses ditolak. Silakan login dengan password dashboard.'
    });
}

// In-memory Cooldown Map untuk Webhook Verification (Default 60 detik per nomor)
const verificationCooldowns = new Map();

// In-memory Anti-Spam Maps untuk Chat Place: Tanpa jeda biasa, freeze 10s jika spam
const chatMessageTimestamps = new Map(); // username -> [t1, t2, ...]
const chatFrozenUntil = new Map();       // username -> timestamp akhir freeze
const PREMIUM_USERS_FILE = path.join(__dirname, 'data', 'premium_users.json');
const DELETED_COMBOS_FILE = path.join(__dirname, 'data', 'deleted_combos.json');
const DELETED_USERS_FILE = path.join(__dirname, 'data', 'deleted_users.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const SESSIONS_FILE = path.join(__dirname, 'data', 'sessions.json');

function getDeletedUsers() {
    try {
        if (!fs.existsSync(DELETED_USERS_FILE)) return { ids: [], usernames: [], phones: [] };
        const content = fs.readFileSync(DELETED_USERS_FILE, 'utf8');
        return JSON.parse(content || '{"ids":[],"usernames":[],"phones":[]}');
    } catch(e) {
        return { ids: [], usernames: [], phones: [] };
    }
}

function saveDeletedUsers(data) {
    try {
        const dir = path.dirname(DELETED_USERS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DELETED_USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch(e) {
        return false;
    }
}

function getPremiumUsers() {
    try {
        if (!fs.existsSync(PREMIUM_USERS_FILE)) return [];
        const content = fs.readFileSync(PREMIUM_USERS_FILE, 'utf8');
        return JSON.parse(content || '[]');
    } catch(e) {
        return [];
    }
}

function savePremiumUsers(list) {
    try {
        const dir = path.dirname(PREMIUM_USERS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(PREMIUM_USERS_FILE, JSON.stringify(list, null, 2), 'utf8');
        return true;
    } catch(e) {
        return false;
    }
}

function getDeletedCombos() {
    try {
        if (!fs.existsSync(DELETED_COMBOS_FILE)) return { ids: [], statuses: [] };
        const content = fs.readFileSync(DELETED_COMBOS_FILE, 'utf8');
        return JSON.parse(content || '{"ids":[],"statuses":[]}');
    } catch(e) {
        return { ids: [], statuses: [] };
    }
}

function saveDeletedCombos(data) {
    try {
        const dir = path.dirname(DELETED_COMBOS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DELETED_COMBOS_FILE, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch(e) {
        return false;
    }
}

// Broadcast data ke semua klien WebSocket aktif yang terautentikasi
function broadcast(data) {
    const payload = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === 1 && client.isAuthenticated) { // OPEN & Authenticated
            client.send(payload);
        }
    });
}

// Hubungkan botManager & tunnelManager event ke WebSocket broadcast
botManager.on('status', (data) => broadcast({ type: 'status', data }));
botManager.on('log', (data) => broadcast({ type: 'log', data }));
botManager.on('stats', (data) => broadcast({ type: 'stats', data }));
tunnelManager.on('status', (data) => broadcast({ type: 'tunnel_status', data }));
tunnelManager.on('log', (text) => botManager.addLog('info', text));

// WebSocket Client Connection Handler dengan Keep-Alive Heartbeat (Cloudflare Tunnel 25s ping)
wss.on('connection', (ws, req) => {
    let clientIp = req.socket.remoteAddress || '';
    if (req.headers['x-forwarded-for']) {
        clientIp = req.headers['x-forwarded-for'].split(',')[0].trim();
    }
    const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.includes('127.0.0.1');
    const urlObj = new URL(req.url, 'http://localhost');
    const token = urlObj.searchParams.get('token');
    const authenticated = isLocal || (token && activeSessions.has(token));

    if (!authenticated) {
        ws.isAuthenticated = false;
        ws.send(JSON.stringify({ type: 'auth_required' }));
        setTimeout(() => {
            if (ws.readyState === 1) ws.close(4401, 'Unauthorized');
        }, 1000);
        return;
    }

    ws.isAuthenticated = true;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.send(JSON.stringify({
        type: 'init',
        data: {
            ...botManager.getStatus(),
            tunnel: tunnelManager.getStatus(),
            config: {
                botName: config.botName,
                prefix: config.prefix,
                mode: config.mode || 'public',
                packname: config.packname,
                author: config.author,
                botNumber: config.botNumber,
                tunnelDomain: config.tunnelDomain || 'api.revicshop.web.id',
                tunnelToken: config.tunnelToken || '',
                webhookDelaySeconds: config.webhookDelaySeconds || 60,
                autoStartServer: config.autoStartServer !== false,
                autoStartBot: config.autoStartBot !== false,
                autoStartTunnel: config.autoStartTunnel !== false
            },
            isStartupEnabled: isStartupEnabled()
        }
    }));
});

// Cloudflare Tunnel Keep-Alive Heartbeat (mencegah timeout 100s idle Cloudflare)
const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        try {
            ws.ping();
        } catch (e) {}
    });
}, 25000);

wss.on('close', () => clearInterval(heartbeatInterval));

// ==========================================
// AUTH REST API ENDPOINTS (Password Only: "x")
// ==========================================

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/auth/check', (req, res) => {
    const authHeader = req.headers['authorization'] || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : (req.query?.token || '');
    const isAuthed = Boolean(token && activeSessions.has(token));
    res.json({
        authenticated: isAuthed
    });
});

app.post('/api/auth/login', (req, res) => {
    const { password } = req.body || {};
    const correctPassword = config.dashboardPassword || 'x';

    if (password === correctPassword) {
        const token = crypto.randomBytes(32).toString('hex');
        activeSessions.add(token);
        return res.json({
            success: true,
            authenticated: true,
            token,
            message: 'Login berhasil!'
        });
    }

    return res.status(401).json({
        success: false,
        authenticated: false,
        message: 'Password salah! Silakan coba lagi.'
    });
});

app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers['authorization'] || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : req.body?.token;
    if (token && activeSessions.has(token)) {
        activeSessions.delete(token);
    }
    res.json({ success: true, message: 'Berhasil logout' });
});

// Middleware Proteksi untuk Route Dashboard Selanjutnya
app.use(['/api/status', '/api/action', '/api/tunnel', '/api/send-message', '/api/settings', '/api/startup'], requireAuth);

// REST API Endpoints
app.get('/api/status', (req, res) => {
    res.json({
        ...botManager.getStatus(),
        tunnel: tunnelManager.getStatus(),
        config: {
            botName: config.botName,
            prefix: config.prefix,
            mode: config.mode || 'public',
            packname: config.packname,
            author: config.author,
            botNumber: config.botNumber,
            tunnelDomain: config.tunnelDomain || 'api.revicshop.web.id',
            tunnelToken: config.tunnelToken || '',
            webhookDelaySeconds: config.webhookDelaySeconds || 60,
            autoStartServer: config.autoStartServer !== false,
            autoStartBot: config.autoStartBot !== false,
            autoStartTunnel: config.autoStartTunnel !== false
        },
        isStartupEnabled: isStartupEnabled()
    });
});

// Bot Action Controls
app.post('/api/action', async (req, res) => {
    const { action, phoneNumber } = req.body;
    try {
        if (action === 'start') {
            await botManager.start(phoneNumber);
            res.json({ success: true, message: 'Memulai bot...' });
        } else if (action === 'stop') {
            await botManager.stop();
            res.json({ success: true, message: 'Menghentikan bot...' });
        } else if (action === 'restart') {
            await botManager.restart(phoneNumber);
            res.json({ success: true, message: 'Memulai ulang bot...' });
        } else if (action === 'clear_session') {
            await botManager.clearSession();
            res.json({ success: true, message: 'Sesi berhasil dibersihkan.' });
        } else {
            res.status(400).json({ success: false, message: 'Action tidak dikenal' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Tunnel Action Controls
app.get('/api/tunnel/status', (req, res) => {
    res.json(tunnelManager.getStatus());
});

app.post('/api/tunnel/start', (req, res) => {
    const { token } = req.body;
    const result = tunnelManager.start(token);
    res.json(result);
});

app.post('/api/tunnel/stop', (req, res) => {
    const result = tunnelManager.stop();
    res.json(result);
});

// Test Send Message Endpoint
app.post('/api/send-message', async (req, res) => {
    const { target, message } = req.body;
    if (!target || !message) {
        return res.status(400).json({ success: false, message: 'Nomor tujuan dan pesan wajib diisi' });
    }
    const cleanTarget = target.replace(/[^0-9]/g, '') + (target.includes('@') ? '' : '@s.whatsapp.net');
    const startTime = Date.now();
    try {
        if (!botManager.sock || botManager.status !== 'open') {
            return res.status(400).json({ success: false, message: 'Bot WhatsApp belum terhubung (offline)' });
        }
        await botManager.sock.sendMessage(cleanTarget, { text: message });
        const elapsedMs = Date.now() - startTime;
        const elapsedSec = (elapsedMs / 1000).toFixed(2);
        botManager.addLog('command', `Pesan test terkirim ke ${cleanTarget.split('@')[0]} dalam ${elapsedSec}s (${elapsedMs}ms)`);
        res.json({
            success: true,
            elapsedSec,
            elapsedMs,
            message: `Pesan berhasil sampai! Waktu respon: ${elapsedSec} detik (${elapsedMs}ms)`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * WEBHOOK VERIFICATION API
 * Endpoint: GET /api/v1?number=...&code=... atau POST /api/v1 { number, code }
 * Delay 60 detik per nomor target untuk mencegah spam.
 * Tugas bot hanya mengirimkan pesan verifikasi sesuai parameter yang dimasukkan.
 */
const handleVerificationWebhook = async (req, res) => {
    const params = req.method === 'POST' ? { ...req.query, ...req.body } : req.query;
    const targetRaw = params.number || params.target || params.to || '';
    const code = params.code || params.kode || params.verification_code || params.pairing_code || '';
    const customMsg = params.message || params.pesan || '';
    const force = params.force === 'true' || params.force === true;

    if (!targetRaw || !code) {
        return res.status(400).json({
            status: 'error',
            success: false,
            message: 'Parameter "number" dan "code" wajib disertakan. Contoh: /api/v1?number=1010&code=123456'
        });
    }

    // Normalisasi nomor target
    const targetClean = targetRaw.toString().trim();
    let targetJid = targetClean;
    if (!targetJid.includes('@')) {
        const digits = targetClean.replace(/[^0-9]/g, '');
        if (digits.startsWith('0')) {
            targetJid = '62' + digits.slice(1) + '@s.whatsapp.net';
        } else {
            targetJid = digits + '@s.whatsapp.net';
        }
    }

    const cooldownKey = targetClean.replace(/[^0-9a-zA-Z]/g, '');
    const now = Date.now();
    const cooldownMs = (config.webhookDelaySeconds || 60) * 1000;
    const lastSent = verificationCooldowns.get(cooldownKey) || 0;

    // Cek jeda delay (60 detik per target nomor)
    if (!force && (now - lastSent < cooldownMs)) {
        const remainingSec = Math.ceil((cooldownMs - (now - lastSent)) / 1000);
        botManager.addLog('warn', `[WEBHOOK] Ditolak (Cooldown 60s): Nomor ${targetClean} sisa waktu ${remainingSec} detik.`);
        return res.status(429).json({
            status: 'rate_limited',
            success: false,
            target: targetClean,
            remainingSeconds: remainingSec,
            message: `Nomor ${targetClean} memiliki jeda delay ${config.webhookDelaySeconds || 60} detik. Silakan coba lagi dalam ${remainingSec} detik.`
        });
    }

    // Format pesan kode verifikasi
    const textToSend = customMsg || `*KODE VERIFIKASI AKUN*

Halo, kode verifikasi Anda adalah:
👉 *${code}*

_Gunakan kode di atas untuk verifikasi akun Anda. Jangan berikan kode ini kepada siapapun demi keamanan._

*${config.botName || 'EndLessAcademy'}*`;

    const startTime = Date.now();

    try {
        if (!botManager.sock || botManager.status !== 'open') {
            return res.status(503).json({
                status: 'error',
                success: false,
                message: 'Bot WhatsApp belum terhubung (offline). Mohon nyalakan bot terlebih dahulu.'
            });
        }

        await botManager.sock.sendMessage(targetJid, { text: textToSend });
        verificationCooldowns.set(cooldownKey, now);

        const elapsedMs = Date.now() - startTime;
        const elapsedSec = (elapsedMs / 1000).toFixed(2);

        botManager.addLog('command', `[WEBHOOK] Kode verifikasi "${code}" terkirim ke ${targetClean} | Respon: ${elapsedSec}s (${elapsedMs}ms)`);

        res.json({
            status: 'success',
            success: true,
            target: targetClean,
            code: code,
            elapsedSec,
            elapsedMs,
            message: `Kode verifikasi ${code} berhasil dikirim ke ${targetClean} dalam ${elapsedSec} detik`
        });
    } catch (err) {
        botManager.addLog('error', `[WEBHOOK] Gagal mengirim kode ke ${targetClean}: ${err.message}`);
        res.status(500).json({
            status: 'error',
            success: false,
            message: `Gagal mengirim ke WhatsApp: ${err.message}`
        });
    }
};

app.all('/api/v1', handleVerificationWebhook);
app.all('/api/v1/verify', handleVerificationWebhook);
app.all('/api/v1/send', handleVerificationWebhook);

// ==========================================
// CHAT PLACE REST API (Read & Write ke Server /api/chat)
// ==========================================
app.get('/api/chat', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const chats = ChatManager.getChats(limit);

        // Hitung jumlah pengirim obrolan aktif baru-baru ini (15 menit terakhir)
        const recentTime = Date.now() - (15 * 60 * 1000);
        const recentSenders = new Set();
        chats.forEach(c => {
            if ((!c.timestamp || c.timestamp > recentTime) && c.username) {
                recentSenders.add(c.username.trim().toLowerCase());
            }
        });

        // Jumlah orang aktif berdasarkan WebSocket / pengirim chat
        const wsClientCount = wss.clients ? wss.clients.size : 0;
        const activePeople = Math.max(recentSenders.size, wsClientCount, 1);
        const isCrowded = activePeople >= 4;

        res.json({
            success: true,
            count: chats.length,
            activePeople,
            isCrowded,
            chats
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { username, text, fileData, fileName, fileType, source, replyTo, isSticker, isAudio, fileUrl, isAdmin } = req.body || {};
        if (!text && !fileData && !isSticker && !fileUrl) {
            return res.status(400).json({ success: false, message: 'Pesan teks atau berkas lampiran wajib diisi.' });
        }

        // Sistem Anti-Spam: Tanpa jeda normal, tapi jika spam (>= 4 pesan dalam 3 detik), di-freeze 10 detik
        const cleanUser = (username || 'Anonim').trim().toLowerCase();
        const now = Date.now();

        // 1. Cek apakah pengguna saat ini sedang dalam masa freeze
        const frozenUntil = chatFrozenUntil.get(cleanUser) || 0;
        if (now < frozenUntil) {
            const remainingSec = Math.ceil((frozenUntil - now) / 1000);
            return res.status(429).json({
                success: false,
                rateLimited: true,
                frozen: true,
                remainingSec,
                message: `Pesan dibekukan karena spam! Tunggu ${remainingSec} detik lagi.`
            });
        }

        // 2. Deteksi Spam: Filter pesan dalam 3 detik terakhir
        let timestamps = chatMessageTimestamps.get(cleanUser) || [];
        timestamps = timestamps.filter(t => now - t < 3000);

        if (timestamps.length >= 3) {
            // Spam terdeteksi! Bekukan akun selama 10 detik
            const freezeUntil = now + 10000;
            chatFrozenUntil.set(cleanUser, freezeUntil);
            chatMessageTimestamps.set(cleanUser, []);
            return res.status(429).json({
                success: false,
                rateLimited: true,
                frozen: true,
                remainingSec: 10,
                message: 'Terdeteksi spam chat! Anda dibekukan selama 10 detik.'
            });
        }

        // Catat pengiriman pesan ini
        timestamps.push(now);
        chatMessageTimestamps.set(cleanUser, timestamps);

        const newChat = await ChatManager.addChat({
            username,
            text,
            fileData,
            fileName,
            fileType,
            source: source || 'web',
            replyTo,
            isSticker,
            isAudio,
            fileUrl
        });

        // Broadcast lewat WebSocket ke klien yang aktif
        broadcast({ type: 'chat_message', data: newChat });

        res.json({
            success: true,
            message: 'Pesan berhasil dikirim!',
            chat: newChat
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/chat/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { text, username, isAdmin } = req.body || {};
        if (!text) {
            return res.status(400).json({ success: false, message: 'Teks pesan tidak boleh kosong' });
        }
        const result = ChatManager.editChat(id, text, username, isAdmin);
        if (result.success) {
            broadcast({ type: 'chat_edited', data: result.chat });
            return res.json(result);
        }
        return res.status(400).json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/chat/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { username, isAdmin } = req.body || {};
        const result = ChatManager.deleteChat(id, username, isAdmin);
        if (result.success) {
            broadcast({ type: 'chat_deleted', id });
            return res.json({ success: true, message: 'Pesan berhasil dihapus' });
        }
        res.status(404).json({ success: false, message: result.message || 'Pesan tidak ditemukan' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/chat/sticker', async (req, res) => {
    try {
        const { fileData, mediaUrl, isVideo, username } = req.body || {};
        const result = await ChatManager.makeSticker({ fileData, mediaUrl, isVideo, username });
        if (result.success) {
            return res.json(result);
        }
        return res.status(400).json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/chat', (req, res) => {
    try {
        ChatManager.clearChats();
        broadcast({ type: 'chat_cleared' });
        res.json({ success: true, message: 'Riwayat obrolan telah dibersihkan' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// PREMIUM USERS API (Pengaturan Delay Pesan 1 Detik oleh Admin)
// ==========================================
app.get('/api/users/premium', (req, res) => {
    try {
        const premiumUsers = getPremiumUsers();
        res.json({
            success: true,
            premiumUsers
        });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/users/premium', (req, res) => {
    try {
        const { username, isPremium } = req.body || {};
        if (!username) {
            return res.status(400).json({ success: false, message: 'Username wajib disertakan.' });
        }
        const cleanUser = username.trim().toLowerCase();
        let list = getPremiumUsers();

        if (isPremium) {
            if (!list.map(u => u.toLowerCase()).includes(cleanUser)) {
                list.push(username.trim());
            }
        } else {
            list = list.filter(u => u.toLowerCase() !== cleanUser);
        }

        savePremiumUsers(list);
        botManager.addLog('info', `[ADMIN] Status Premium user "${username}" diatur ke: ${Boolean(isPremium)} (Delay pesan: ${isPremium ? '1 detik' : '5 detik'}).`);

        res.json({
            success: true,
            username,
            isPremium: Boolean(isPremium),
            message: Boolean(isPremium)
                ? `Pengguna @${username} berhasil dijadikan Premium! Delay pesan kini 1 detik.`
                : `Status Premium @${username} dicabut. Delay pesan kembali 5 detik.`
        });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// MEMBER DELETION API (Hapus Member Permanen oleh Admin)
// ==========================================
app.get('/api/users/deleted', (req, res) => {
    try {
        const data = getDeletedUsers();
        res.json({
            success: true,
            ...data
        });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/users/delete', async (req, res) => {
    try {
        const { id, username, phone } = req.body || {};
        if (!id && !username && !phone) {
            return res.status(400).json({ success: false, message: 'ID, username, atau nomor telepon wajib disertakan.' });
        }

        const cleanUser = (username || '').trim().toLowerCase();

        // Lindungi akun administrator utama
        if (cleanUser === 'arcz' || cleanUser === 'admin') {
            return res.status(403).json({ success: false, message: 'Akun Administrator tidak dapat dihapus.' });
        }

        // 1. Simpan ke daftar deleted_users.json agar terfilter permanen
        const delData = getDeletedUsers();
        if (id && !delData.ids.includes(id)) delData.ids.push(id);
        if (cleanUser && !delData.usernames.includes(cleanUser)) delData.usernames.push(cleanUser);
        if (phone && !delData.phones.includes(phone)) delData.phones.push(phone);
        saveDeletedUsers(delData);

        // 2. Hapus dari users.json jika ada
        try {
            if (fs.existsSync(USERS_FILE)) {
                let uList = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '[]');
                uList = uList.filter(u => {
                    if (id && u.id === id) return false;
                    if (cleanUser && (u.username || '').toLowerCase() === cleanUser) return false;
                    if (phone && u.phone === phone) return false;
                    return true;
                });
                fs.writeFileSync(USERS_FILE, JSON.stringify(uList, null, 2), 'utf8');
            }
        } catch(e) {}

        // 3. Hapus dari premium_users.json jika ada
        try {
            let premList = getPremiumUsers();
            premList = premList.filter(u => u.toLowerCase() !== cleanUser);
            savePremiumUsers(premList);
        } catch(e) {}

        // 4. Hapus sesi aktif dari sessions.json jika ada
        try {
            if (fs.existsSync(SESSIONS_FILE)) {
                let sess = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8') || '{}');
                for (const tok in sess) {
                    const s = sess[tok];
                    if ((id && s.userId === id) || (cleanUser && (s.username || '').toLowerCase() === cleanUser)) {
                        delete sess[tok];
                    }
                }
                fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sess, null, 2), 'utf8');
            }
        } catch(e) {}

        // 5. Coba hapus juga di Supabase REST API
        const SB = "https://dbbfoisrphocoyddgyhu.supabase.co";
        const KEY = "sb_publishable_PmYc-4IAfiNVPhvrH0fnvw_OBuK28Gd";
        const H = { "apikey": KEY, "Content-Type": "application/json" };
        try {
            if (id) await fetch(SB + "/rest/v1/py_users?id=eq." + id, { method: "DELETE", headers: H });
            if (cleanUser) await fetch(SB + "/rest/v1/py_users?username=eq." + cleanUser, { method: "DELETE", headers: H });
        } catch(e) {}

        botManager.addLog('info', `[ADMIN] Akun member @${username || id} berhasil dihapus permanen oleh admin.`);

        res.json({
            success: true,
            message: `Akun member @${username || 'pengguna'} berhasil dihapus permanen dari sistem.`
        });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==========================================
// COMBO LOG MANAGEMENT (Hapus Log Verifikasi Combo oleh Admin)
// ==========================================
app.get('/api/combo/deleted', (req, res) => {
    try {
        const data = getDeletedCombos();
        res.json({
            success: true,
            ...data
        });
    } catch(err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/combo/delete', async (req, res) => {
    try {
        const { id, status, ids } = req.body || {};
        const store = getDeletedCombos();

        if (id) {
            if (!store.ids.includes(id)) store.ids.push(id);
        }
        if (Array.isArray(ids)) {
            ids.forEach(oneId => {
                if (!store.ids.includes(oneId)) store.ids.push(oneId);
            });
        }
        if (status) {
            if (!store.statuses.includes(status)) store.statuses.push(status);
        }

        saveDeletedCombos(store);

        // Cobakan juga delete di Supabase jika REST API terbuka
        const SB = "https://dbbfoisrphocoyddgyhu.supabase.co";
        const KEY = "sb_publishable_PmYc-4IAfiNVPhvrH0fnvw_OBuK28Gd";
        const H = { "apikey": KEY, "Content-Type": "application/json" };

        let query = "";
        if (id) query = "?id=eq." + id;
        else if (status) query = "?status=eq." + status;

        if (query) {
            try {
                await fetch(SB + "/rest/v1/py_combos" + query, { method: "DELETE", headers: H });
            } catch(e) {}
        }

        botManager.addLog('info', `[ADMIN] Berhasil menghapus log combo (id: ${id || 'batch'}, status: ${status || 'single'}).`);
        return res.json({
            success: true,
            message: 'Log combo berhasil dihapus dan dibersihkan dari server.'
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Settings Endpoint
app.post('/api/settings', (req, res) => {
    try {
        const {
            botName,
            prefix,
            mode,
            packname,
            author,
            botNumber,
            tunnelDomain,
            tunnelToken,
            webhookDelaySeconds,
            autoStartServer,
            autoStartBot,
            autoStartTunnel
        } = req.body;

        if (botName !== undefined) config.botName = botName;
        if (prefix !== undefined) config.prefix = prefix;
        if (mode !== undefined) config.mode = mode === 'private' ? 'private' : 'public';
        if (packname !== undefined) config.packname = packname;
        if (author !== undefined) config.author = author;
        if (botNumber !== undefined) config.botNumber = botNumber.replace(/[^0-9]/g, '');
        if (tunnelDomain !== undefined) {
            config.tunnelDomain = tunnelDomain.trim();
            tunnelManager.domain = config.tunnelDomain;
        }
        if (tunnelToken !== undefined) {
            config.tunnelToken = tunnelToken.trim();
            tunnelManager.token = config.tunnelToken;
        }
        if (webhookDelaySeconds !== undefined) config.webhookDelaySeconds = Number(webhookDelaySeconds) || 60;
        if (autoStartServer !== undefined) config.autoStartServer = Boolean(autoStartServer);
        if (autoStartBot !== undefined) config.autoStartBot = Boolean(autoStartBot);
        if (autoStartTunnel !== undefined) config.autoStartTunnel = Boolean(autoStartTunnel);

        // Tulis ulang ke file config.js secara rapi
        const configPath = path.join(__dirname, 'config.js');
        const fileContent = `/**
 * Konfigurasi Bot WhatsApp
 * EndLessAcademy Bot
 */

module.exports = {
    botName: ${JSON.stringify(config.botName)},
    prefix: ${JSON.stringify(config.prefix)},
    mode: ${JSON.stringify(config.mode || 'public')},
    packname: ${JSON.stringify(config.packname)},
    author: ${JSON.stringify(config.author)},
    botNumber: ${JSON.stringify(config.botNumber)},
    sessionDir: './session',
    port: ${PORT},

    // Konfigurasi Cloudflare Tunnel & Domain
    tunnelDomain: ${JSON.stringify(config.tunnelDomain || 'api.revicshop.web.id')},
    tunnelToken: ${JSON.stringify(config.tunnelToken || '')},

    // Webhook API Verification Delay
    webhookDelaySeconds: ${config.webhookDelaySeconds || 60},

    // Password Login Dashboard Web (Password Only)
    dashboardPassword: ${JSON.stringify(config.dashboardPassword || 'x')},

    // Pengaturan Auto-Start Services di Awal
    autoStartServer: ${config.autoStartServer !== false},
    autoStartBot: ${config.autoStartBot !== false},
    autoStartTunnel: ${config.autoStartTunnel !== false}
};
`;
        fs.writeFileSync(configPath, fileContent, 'utf-8');

        broadcast({
            type: 'config',
            data: {
                botName: config.botName,
                prefix: config.prefix,
                mode: config.mode,
                packname: config.packname,
                author: config.author,
                botNumber: config.botNumber,
                tunnelDomain: config.tunnelDomain,
                tunnelToken: config.tunnelToken,
                webhookDelaySeconds: config.webhookDelaySeconds,
                autoStartServer: config.autoStartServer !== false,
                autoStartBot: config.autoStartBot !== false,
                autoStartTunnel: config.autoStartTunnel !== false
            }
        });

        botManager.addLog('info', 'Pengaturan bot & auto-start services berhasil disimpan.');
        res.json({ success: true, message: 'Pengaturan berhasil disimpan!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/startup', (req, res) => {
    try {
        const { enable } = req.body;
        if (enable) {
            enableStartup();
            botManager.addLog('success', 'Bot telah didaftarkan ke Windows Startup.');
        } else {
            disableStartup();
            botManager.addLog('warn', 'Bot telah dihapus dari Windows Startup.');
        }
        res.json({ success: true, isStartupEnabled: isStartupEnabled() });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Jalankan Web Server
server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.clear();
    console.log(color(`
╔══════════════════════════════════════════════════════╗
║               ${config.botName.padEnd(38, ' ')} ║
║        DASHBOARD + TUNNEL + WEBHOOK VERIFICATION     ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  🌐 Web Dashboard: ${color(url, 'green')}              ║
║  🔗 Custom Domain: ${color(config.tunnelDomain || 'api.revicshop.web.id', 'cyan')}   ║
║  ⚡ Webhook API:   ${color('/api/v1?number=...&code=...', 'yellow')} ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
`, 'cyan'));

    // Jalankan bot otomatis jika diizinkan
    if (config.autoStartBot !== false) {
        info('Menjalankan bot WhatsApp otomatis...');
        botManager.start();
    } else {
        warn('Auto-start Bot WhatsApp dimatikan (bisa dijalankan manual lewat tombol Jalankan).');
    }

    // Jalankan Cloudflare Tunnel otomatis jika diizinkan
    if (config.autoStartTunnel !== false) {
        info('Menjalankan Cloudflare Tunnel otomatis...');
        tunnelManager.start(config.tunnelToken);
    } else {
        warn('Auto-start Cloudflare Tunnel dimatikan (bisa dijalankan manual lewat tombol Mulai Tunnel).');
    }
});

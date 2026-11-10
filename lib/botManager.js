const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const config = require('../config');
const messageHandler = require('../handler');
const groupScheduler = require('./groupScheduler');
const { color } = require('./color');

class BotManager extends EventEmitter {
    constructor() {
        super();
        this.sock = null;
        this.status = 'offline'; // 'offline' | 'connecting' | 'open' | 'waiting_pairing'
        this.pairingCode = null;
        this.startTime = null;
        this.totalCommands = 0;
        this.logs = [];
        this.maxLogs = 300;
        this.isExplicitStop = false;
        this.reconnectTimer = null;
    }

    addLog(type, text, details = null) {
        const entry = {
            id: Date.now() + Math.random().toString(36).substring(2, 6),
            time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            type, // 'info' | 'command' | 'success' | 'warn' | 'error'
            text,
            details
        };

        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        this.emit('log', entry);
    }

    setStatus(newStatus, pairingCode = null) {
        this.status = newStatus;
        if (pairingCode !== undefined) {
            this.pairingCode = pairingCode;
        }
        this.emit('status', {
            status: this.status,
            pairingCode: this.pairingCode,
            uptime: this.getUptime(),
            totalCommands: this.totalCommands
        });
    }

    getUptime() {
        if (!this.startTime || this.status !== 'open') return 0;
        return Math.floor((Date.now() - this.startTime) / 1000);
    }

    getStatus() {
        return {
            status: this.status,
            pairingCode: this.pairingCode,
            uptime: this.getUptime(),
            totalCommands: this.totalCommands,
            logs: this.logs
        };
    }

    async start(targetPhoneNumber = null) {
        if (this.status === 'open' || this.status === 'connecting') {
            this.addLog('warn', 'Bot sudah berjalan atau sedang menghubungkan.');
            return;
        }

        this.isExplicitStop = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        const sessionPath = path.resolve(config.sessionDir || './session');
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        this.setStatus('connecting', null);
        this.addLog('info', 'Memulai inisialisasi Baileys socket...');

        try {
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
            const { version } = await fetchLatestBaileysVersion();

            this.sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                printQRInTerminal: false,
                auth: state,
                browser: Browsers.ubuntu('Chrome'),
                syncFullHistory: false,
                markOnlineOnConnect: true,
                generateHighQualityLinkPreview: true
            });

            // Handle Pairing Code jika sesi belum teregistrasi
            if (!this.sock.authState.creds.registered) {
                const phone = (targetPhoneNumber || config.botNumber || '').replace(/[^0-9]/g, '');
                
                if (phone) {
                    this.addLog('info', `Meminta Pairing Code untuk nomor: ${phone}...`);
                    this.setStatus('waiting_pairing', null);

                    setTimeout(async () => {
                        try {
                            if (!this.sock || this.isExplicitStop) return;
                            const rawCode = await this.sock.requestPairingCode(phone);
                            const clean = rawCode.replace(/[^a-zA-Z0-9]/g, '');
                            const formatted = clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : rawCode;

                            this.setStatus('waiting_pairing', formatted);
                            this.addLog('success', `Kode Pairing diterima: ${formatted}`);
                        } catch (err) {
                            this.addLog('error', `Gagal meminta Pairing Code: ${err.message}`);
                            this.setStatus('connecting', null);
                        }
                    }, 3000);
                } else {
                    this.setStatus('waiting_pairing', null);
                    this.addLog('warn', 'Nomor bot belum diisi. Masukkan nomor WhatsApp di menu Pengaturan untuk meminta kode pairing.');
                }
            }

            this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'connecting') {
                    if (this.status !== 'waiting_pairing') {
                        this.setStatus('connecting', this.pairingCode);
                    }
                } else if (connection === 'open') {
                    this.startTime = Date.now();
                    this.setStatus('open', null);
                    this.addLog('success', 'Bot WhatsApp berhasil terhubung! Siap menerima pesan.');
                    groupScheduler.init(this.sock);
                } else if (connection === 'close') {
                    const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
                    this.addLog('warn', `Koneksi terputus: ${lastDisconnect?.error?.message || 'Unknown'} (Kode: ${statusCode})`);

                    if (this.isExplicitStop) {
                        this.setStatus('offline', null);
                        return;
                    }

                    // Anti-Bad-Session auto recovery
                    if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
                        this.addLog('error', '[ANTI-BAD-SESSION] Sesi tidak valid / logged out. Membersihkan folder sesi...');
                        try {
                            fs.rmSync(sessionPath, { recursive: true, force: true });
                            this.addLog('info', '[ANTI-BAD-SESSION] Folder sesi dibersihkan. Memulai ulang...');
                        } catch (e) {
                            this.addLog('error', `Gagal membersihkan sesi: ${e.message}`);
                        }

                        this.setStatus('offline', null);
                        this.reconnectTimer = setTimeout(() => this.start(), 3000);
                    } else {
                        this.setStatus('connecting', null);
                        this.addLog('info', 'Mencoba menghubungkan kembali dalam 5 detik...');
                        this.reconnectTimer = setTimeout(() => this.start(), 5000);
                    }
                }
            });

            this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify') return;
                for (const m of messages) {
                    if (!m.message) continue;

                    // Log command jika pesan mengandung prefix
                    const from = m.key.remoteJid;
                    if (from === 'status@broadcast') continue;

                    let body = '';
                    if (m.message.conversation) body = m.message.conversation;
                    else if (m.message.extendedTextMessage?.text) body = m.message.extendedTextMessage.text;
                    else if (m.message.imageMessage?.caption) body = m.message.imageMessage.caption;
                    else if (m.message.videoMessage?.caption) body = m.message.videoMessage.caption;

                    body = (body || '').trim();
                    if (body.startsWith(config.prefix)) {
                        this.totalCommands++;
                        const isGroup = from.endsWith('@g.us');
                        const sender = isGroup ? (m.key.participant || from) : from;
                        const senderName = m.pushName || 'Tanpa Nama';
                        const senderNumber = sender.replace(/[^0-9]/g, '');

                        this.addLog('command', `Perintah diterima: ${body}`, {
                            command: body,
                            senderName,
                            senderNumber,
                            chatType: isGroup ? 'Grup' : 'Pribadi'
                        });

                        this.emit('stats', { totalCommands: this.totalCommands });
                    }

                    let activeHandler = messageHandler;
                    try {
                        delete require.cache[require.resolve('../handler')];
                        activeHandler = require('../handler');
                    } catch (e) {
                        activeHandler = messageHandler;
                    }
                    await activeHandler(this.sock, m);
                }
            });

        } catch (err) {
            this.addLog('error', `Inisialisasi bot gagal: ${err.message}`);
            this.setStatus('offline', null);
        }
    }

    async stop() {
        this.isExplicitStop = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.sock) {
            try {
                this.sock.end();
            } catch {}
            this.sock = null;
        }

        this.setStatus('offline', null);
        this.addLog('warn', 'Bot telah dinonaktifkan secara manual.');
    }

    async restart(phoneNumber = null) {
        this.addLog('info', 'Memulai ulang bot...');
        await this.stop();
        await new Promise((r) => setTimeout(r, 1500));
        await this.start(phoneNumber);
    }

    async clearSession() {
        await this.stop();
        const sessionPath = path.resolve(config.sessionDir || './session');
        if (fs.existsSync(sessionPath)) {
            try {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                this.addLog('success', 'Folder sesi berhasil dibersihkan! Anda bisa melakukan pairing ulang sekarang.');
            } catch (err) {
                this.addLog('error', `Gagal menghapus folder sesi: ${err.message}`);
            }
        } else {
            this.addLog('info', 'Folder sesi sudah bersih.');
        }
    }
}

const botManager = new BotManager();
module.exports = botManager;

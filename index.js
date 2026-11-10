/**
 * Main Entry Point Bot WhatsApp
 * Fitur: Pairing Code Login, Anti-Bad-Session, .stiker, .hd
 */

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const messageHandler = require('./handler');
const { color, info, success, warn, error } = require('./lib/color');

// Global process exception safety (Anti-Crash Bad MAC & Bad Session)
process.on('uncaughtException', (err) => {
    const msg = String(err?.message || err);
    if (msg.includes('Bad MAC') || msg.includes('Decryption') || msg.includes('Session')) {
        warn(`[ANTI-BAD-MAC] Melewati error dekripsi lama: ${msg}`);
        return;
    }
    error(`Uncaught Exception: ${err?.stack || msg}`);
});

process.on('unhandledRejection', (reason) => {
    const msg = String(reason?.message || reason);
    if (msg.includes('Bad MAC') || msg.includes('Decryption') || msg.includes('Session')) {
        warn(`[ANTI-BAD-MAC] Melewati unhandled rejection sesi: ${msg}`);
        return;
    }
    error(`Unhandled Rejection: ${msg}`);
});

// Helper input readline untuk terminal
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => rl.question(query, (ans) => {
        rl.close();
        resolve(ans.trim());
    }));
}

// Format kode pairing (contoh: ABCD-EFGH)
function formatPairingCode(code) {
    if (!code) return '';
    const clean = code.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length === 8) {
        return `${clean.slice(0, 4)}-${clean.slice(4)}`;
    }
    return code;
}

// Fungsi utama socket WhatsApp
async function startBot() {
    console.clear();
    console.log(color(`
╔══════════════════════════════════════════════════════╗
║               ${config.botName.padEnd(38, ' ')} ║
║             Pairing Code + Anti Bad Session          ║
╚══════════════════════════════════════════════════════╝
`, 'cyan'));

    const sessionPath = path.resolve(config.sessionDir);
    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }

    // Inisialisasi Auth State Multi-File
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version, isLatest } = await fetchLatestBaileysVersion();
    info(`Menggunakan Baileys v${version.join('.')}${isLatest ? ' (Versi Terbaru)' : ''}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // Wajib false karena menggunakan Pairing Code
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true
    });

    // Handle Pairing Code jika sesi belum teregistrasi
    if (!sock.authState.creds.registered) {
        info('Sesi belum terhubung. Memulai proses Pairing Code...');

        let phoneNumber = config.botNumber;
        if (!phoneNumber) {
            console.log(color('\n[!] Nomor WhatsApp Bot belum ditentukan di config.js', 'yellow'));
            phoneNumber = await askQuestion(color('Masukkan nomor WhatsApp Bot (contoh: 6289523042979): ', 'bright'));
        }

        // Bersihkan karakter non-angka
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

        if (!phoneNumber) {
            error('Nomor telepon tidak valid. Silakan restart dan masukkan nomor yang benar.');
            process.exit(1);
        }

        info(`Menghubungkan ke nomor: ${phoneNumber}...`);

        // Tunggu 3 detik agar socket stabil sebelum request pairing code
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                const formatted = formatPairingCode(code);

                console.log(color(`
╔══════════════════════════════════════════════════════╗
║                KODE PAIRING WHATSAPP                 ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║                 KODE: ${color(formatted, 'bright')}                      ║
║                                                      ║
╠══════════════════════════════════════════════════════╣
║ 1. Buka WhatsApp di HP Anda                          ║
║ 2. Buka Pengaturan > Perangkat Tertaut               ║
║ 3. Klik Tautkan Perangkat > Tautkan dengan nomor HP  ║
║ 4. Masukkan kode 8 digit di atas                     ║
╚══════════════════════════════════════════════════════╝
`, 'green'));
            } catch (err) {
                error(`Gagal meminta Pairing Code: ${err.message}`);
                warn('Jika gagal, pastikan nomor benar dan tunggu 1 menit lalu coba kembali.');
            }
        }, 3000);
    }

    // Simpan kredensial secara otomatis saat diperbarui
    sock.ev.on('creds.update', saveCreds);

    // Monitor status koneksi & Anti-Bad-Session
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'connecting') {
            info('Menghubungkan ke server WhatsApp...');
        } else if (connection === 'open') {
            success('WhatsApp berhasil terhubung! Bot siap menerima perintah (.stiker & .hd).');
        } else if (connection === 'close') {
            const statusCode = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
            warn(`Koneksi terputus! Reason: ${lastDisconnect?.error?.message || 'Unknown'} (Status Code: ${statusCode})`);

            // Anti Bad Session: Jika status 401 (logged out) atau bad session corrupt
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
                console.log(color('\n[ANTI-BAD-SESSION] Sesi lama tidak valid/logged out.', 'red'));
                console.log(color('[ANTI-BAD-SESSION] Membersihkan folder session agar pairing ulang bersih...', 'yellow'));

                try {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                    success('[ANTI-BAD-SESSION] Folder sesi berhasil dibersihkan!');
                } catch (err) {
                    error(`Gagal menghapus folder sesi: ${err.message}`);
                }

                warn('Memulai ulang dalam 3 detik untuk generate Pairing Code baru...');
                setTimeout(() => startBot(), 3000);
            } else {
                // Koneksi terputus sementara (jaringan drop/restart), sambungkan kembali otomatis
                info('Menghubungkan kembali dalam 4 detik...');
                setTimeout(() => startBot(), 4000);
            }
        }
    });

    // Menerima dan memproses pesan masuk
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const m of messages) {
            await messageHandler(sock, m);
        }
    });

    return sock;
}

// Jalankan bot
startBot().catch((err) => {
    error(`Gagal menjalankan bot: ${err.message}`);
});

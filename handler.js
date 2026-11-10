const { downloadContentFromMessage, generateWAMessageFromContent, proto, prepareWAMessageMedia } = require('@whiskeysockets/baileys');
const config = require('./config');
const { imageToSticker, videoToSticker } = require('./lib/sticker');
const { enhanceImage, uploadToCatbox } = require('./lib/enhancer');
const { generateAiImage } = require('./lib/imageai');
const { generateQrBuffer } = require('./lib/qr');
const prexzy = require('./lib/prexzy');
const { downloadTikTok, downloadYouTubeAudio, downloadYouTubeVideo } = require('./lib/downloader');
const { shortUrl, uploadTempFile, tempMail, searchPinterest } = require('./lib/tools');
const { renderNulis, combineEmojis, blendEmojimix } = require('./lib/maker');
const { summarizeText, summarizePdf } = require('./lib/summarizer');
const {
    parseBibleQuery,
    formatBookChapters,
    getBiblePassage,
    searchBible,
    getDailyDevotional,
    generateAiDevotional,
    getBibleHelp,
    queryEndLessAI
} = require('./lib/alkitab');
const groupScheduler = require('./lib/groupScheduler');
const onlyManager = require('./lib/onlyManager');
const ChatManager = require('./lib/chatManager');
const { info, warn, error } = require('./lib/color');

/**
 * Helper untuk mendownload media (gambar / video / stiker / dokumen) ke Buffer
 */
async function getMediaBuffer(mediaMessage, mediaType) {
    const stream = await downloadContentFromMessage(mediaMessage, mediaType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

/**
 * Handler utama untuk setiap pesan yang masuk
 */
module.exports = async function messageHandler(sock, m) {
    try {
        if (!m.message) return;

        // Cegah bot merespon pesan status / broadcast sistem
        const from = m.key.remoteJid;
        if (from === 'status@broadcast') return;

        // Ambil jenis pesan
        const messageType = Object.keys(m.message)[0];
        const msg = m.message[messageType];

        // Ekstrak teks pesan
        let body = '';
        if (messageType === 'conversation') {
            body = m.message.conversation;
        } else if (messageType === 'extendedTextMessage') {
            body = m.message.extendedTextMessage.text || '';
        } else if (messageType === 'imageMessage') {
            body = m.message.imageMessage.caption || '';
        } else if (messageType === 'videoMessage') {
            body = m.message.videoMessage.caption || '';
        } else if (messageType === 'documentMessage') {
            body = m.message.documentMessage.caption || '';
        }

        body = (body || '').trim();

        // Cek prefix atau perintah langsung
        const isCmd = body.startsWith(config.prefix);
        const command = isCmd ? body.slice(config.prefix.length).trim().split(/ +/)[0].toLowerCase() : '';
        const args = isCmd ? body.slice(config.prefix.length).trim().split(/ +/).slice(1) : [];
        const text = args.join(' ');

        if (!isCmd || !command) return;

        const isGroup = from.endsWith('@g.us');
        const sender = isGroup ? (m.key.participant || from) : from;
        const senderName = m.pushName || 'Tanpa Nama';
        const senderNumber = sender.replace(/[^0-9]/g, '');
        const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const chatType = isGroup ? 'GRUP' : 'PRIBADI';

        // Identifikasi apakah pengirim adalah bot sendiri / pemilik
        const isFromMe = !!m.key.fromMe;
        const botNumberClean = (config.botNumber || '').replace(/[^0-9]/g, '');
        const isOwner = isFromMe || (botNumberClean && senderNumber === botNumberClean);

        // Pengaturan Private Mode (Hanya bot/pemilik yang bisa gunakan command)
        const isPrivateMode = config.mode === 'private';
        if (isPrivateMode && !isOwner) {
            // Mode private: Abaikan perintah dari nomor lain
            return;
        }

        // Pengaturan Only Mode (Hanya chat yang terdaftar di .only yang diperbolehkan dibaca sistem)
        if (!onlyManager.isAllowed(from, isOwner)) {
            // Chat ini tidak terdaftar di daftar .only, abaikan
            return;
        }

        // Print command yang masuk ke terminal
        console.log(
            `\x1b[90m[${time}]\x1b[0m ` +
            `\x1b[35m[COMMAND]\x1b[0m ` +
            `\x1b[1m\x1b[32m${config.prefix}${command}\x1b[0m ` +
            `${args.length > 0 ? `\x1b[37m${args.join(' ')}\x1b[0m ` : ''}` +
            `| Pengirim: \x1b[1m${senderName}\x1b[0m (\x1b[33m${senderNumber}\x1b[0m) ` +
            `| Di: \x1b[36m${chatType}\x1b[0m ` +
            `| Mode: \x1b[34m${isPrivateMode ? 'PRIVATE' : 'OPEN'}\x1b[0m`
        );

        // Deteksi pesan kutipan (quoted message)
        const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        // Waktu mulai proses perintah
        const cmdStartTime = Date.now();

        // Reply helper
        const reply = async (text) => {
            return await sock.sendMessage(from, { text }, { quoted: m });
        };

        // Helper cek admin grup
        const isGroupAdmin = async () => {
            if (!isGroup) return false;
            try {
                const meta = await sock.groupMetadata(from);
                const participant = meta.participants.find(p => (p.id === sender || p.jid === sender));
                return participant?.admin === 'admin' || participant?.admin === 'superadmin';
            } catch (e) {
                return false;
            }
        };

        // Routing perintah
        switch (command) {
            // ==================== MENU ====================
            case 'menu':
            case 'help': {
                const elapsedMs = Date.now() - cmdStartTime;
                const elapsedSec = (elapsedMs / 1000).toFixed(2);
                const menuText = `╭━━━❮ *${config.botName}* ❯━━━╮
┃
┃ 🎨 *MEDIA & STIKER*
┃ 🔸 *${config.prefix}mau* : Stiker QR Code masuk Web Academy
┃ 🔸 *${config.prefix}stiker* / *${config.prefix}s* : Foto/video jadi stiker
┃ 🔸 *${config.prefix}hd* / *${config.prefix}remini* : Penjernih foto resolusi HD
┃ 🔸 *${config.prefix}nulis* <teks> : Ubah teks jadi tulisan tangan buku
┃ 🔸 *${config.prefix}emoji* <emojis> : Gabung s/d 20 emoji jadi stiker
┃ 🔸 *${config.prefix}emojimix* <e1> <e2> : Mix 2 emoji (Emoji Kitchen)
┃ 🔸 *${config.prefix}tts* [suara] <teks> : Text-to-speech audio VN
┃
┃ 📥 *DOWNLOADER*
┃ 🔸 *${config.prefix}spotify* <url> : Unduh lagu Spotify (MP3)
┃ 🔸 *${config.prefix}fb* <url> : Unduh video Facebook HD
┃ 🔸 *${config.prefix}ig* <url> : Unduh reels / video Instagram
┃ 🔸 *${config.prefix}tiktok* <url> : Unduh video TikTok tanpa watermark
┃ 🔸 *${config.prefix}ytmp3* <url> : Unduh audio YouTube MP3
┃ 🔸 *${config.prefix}ytmp4* <url> : Unduh video YouTube MP4
┃ 🔸 *${config.prefix}mediafire* <url> : Unduh berkas MediaFire
┃ 🔸 *${config.prefix}pinterest* <kueri> : Cari foto Pinterest (Carousel)
┃
┃ 🔍 *PENCARIAN & INFORMASI*
┃ 🔸 *${config.prefix}cuaca* <kota> : Info perkiraan cuaca kota
┃ 🔸 *${config.prefix}lirik* <judul> : Cari lirik lagu lengkap
┃ 🔸 *${config.prefix}yts* <kueri> : Cari video YouTube
┃ 🔸 *${config.prefix}imdb* <judul> : Info rating & sinopsis film
┃ 🔸 *${config.prefix}apk* <nama> : Cari mod APK & Game Android
┃ 🔸 *${config.prefix}github* <kueri> : Cari repositori GitHub
┃ 🔸 *${config.prefix}anime* <judul> : Cari info & streaming anime
┃
┃ 👤 *STALKING & PROFIL*
┃ 🔸 *${config.prefix}igstalk* <user> : Cek profil Instagram
┃ 🔸 *${config.prefix}ytstalk* <@user> : Cek statistik channel YouTube
┃ 🔸 *${config.prefix}ffstalk* <id> : Cek profil akun Free Fire
┃
┃ ✨ *3D TEXT MAKER & LOGOS*
┃ 🔸 *${config.prefix}textpro* <style> <teks> : 29 variasi efek teks 3D
┃ 🔸 *${config.prefix}blackpink* / *${config.prefix}gold* / *${config.prefix}neon* / *${config.prefix}glitch* <teks>
┃
┃ 🎲 *RANDOM IMAGES HD*
┃ 🔸 *${config.prefix}kucing* / *${config.prefix}anjing* / *${config.prefix}mobil* : Foto acak HD
┃ 🔸 *${config.prefix}cewe* [indo|japan|korea|hijab] : Foto cewe estetik
┃ 🔸 *${config.prefix}cowo* / *${config.prefix}bluearchive* / *${config.prefix}ppcouple*
┃
┃ 🛠️ *UTILITY, TOOLS & DEVELOPER*
┃ 🔸 *${config.prefix}ssweb* <url> : Screenshot website Full HD
┃ 🔸 *${config.prefix}compile* <lang> <code> : Compiler online (python, js, c, cpp, java)
┃ 🔸 *${config.prefix}geoip* <ip> : Cek geolokasi & ISP IP address
┃ 🔸 *${config.prefix}hostcheck* <domain> : Cek DNS & status server domain
┃ 🔸 *${config.prefix}styletext* <teks> : 35+ variasi font estetik
┃ 🔸 *${config.prefix}tr* <teks> : Terjemahan bahasa instan
┃ 🔸 *${config.prefix}qr* <link/teks> : Buat QR Code gambar HD
┃ 🔸 *${config.prefix}shorturl* <url> : Buat tautan pendek (TinyURL)
┃ 🔸 *${config.prefix}tempmail* / *${config.prefix}checkmail* : Email sementara & OTP
┃ 🔸 *${config.prefix}rangkum* [jml] : Rangkum pesan teks / PDF
┃
┃ ⚽ *OLAHRAGA & LIVE SCORE*
┃ 🔸 *${config.prefix}bola* / *${config.prefix}livescore* : Skor bola live terkini
┃
┃ 🕊️ *ALKITAB & RENUNGAN (TB)*
┃ 🔸 *${config.prefix}alkitab* <kitab> : Info kitab & bab
┃ 🔸 *${config.prefix}alkitab* <kitab> <bab> : Baca perikop & ayat
┃ 🔸 *${config.prefix}alkitab cari* <kata> : Cari ayat Alkitab (EndLess AI)
┃ 🔸 *${config.prefix}renungan* : Renungan Harian resmi / topik rohani
┃
┃ 🤖 *ENDLESS AI*
┃ 🔸 *${config.prefix}ai* <tanya> : Asisten AI pintar (EndLess AI)
┃ 🔸 *${config.prefix}imageai* <prompt> : AI Image Generator
┃
┃ 👥 *PENGELOLAAN GRUP (Khusus Admin)*
┃ 🔸 *${config.prefix}grup buka* / *${config.prefix}tutup* : Buka / kunci grup manual
┃ 🔸 *${config.prefix}jadwalgrup* [tutup/buka/daftar] : Jadwal otomatis
┃
┃ ⚙️ *PENGATURAN & KEAMANAN*
┃ 🔸 *${config.prefix}only* [add/del/list/on/off] : Batasi chat bot
┃ 🔸 *${config.prefix}mode* [public/private] : Mode akses bot
┃ 🔸 *${config.prefix}ping* : Cek respon & status bot
┃
┃ ⏱️ *Waktu Respon:* ${elapsedSec} detik (${elapsedMs}ms)
┃ 👤 *Author:* ${config.author.trim()}
╰━━━━━━━━━━━━━━━━━━━━╯`;
                await reply(menuText);
                break;
            }

            // ==================== PING ====================
            case 'ping': {
                const elapsedMs = Date.now() - cmdStartTime;
                const elapsedSec = (elapsedMs / 1000).toFixed(2);
                await reply(`🏓 *Pong!*\n⏱️ *Waktu Respon:* ${elapsedSec} detik (${elapsedMs}ms)\n🔒 *Mode:* ${config.mode === 'private' ? 'Private (Hanya Bot)' : 'Open (Publik)'}\nStatus: Aktif & Siap digunakan.`);
                break;
            }

            // ==================== MODE ====================
            case 'mode':
            case 'self':
            case 'public': {
                if (!isOwner) return await reply('⚠️ Perintah pengaturan mode hanya bisa digunakan oleh bot/pemilik.');

                if (command === 'self') {
                    config.mode = 'private';
                } else if (command === 'public') {
                    config.mode = 'public';
                } else if (args[0]) {
                    const argMode = args[0].toLowerCase();
                    if (argMode === 'private' || argMode === 'self') config.mode = 'private';
                    else if (argMode === 'public' || argMode === 'open') config.mode = 'public';
                } else {
                    config.mode = config.mode === 'private' ? 'public' : 'private';
                }

                try {
                    const fs = require('fs');
                    const path = require('path');
                    const configPath = path.join(__dirname, 'config.js');
                    let content = fs.readFileSync(configPath, 'utf-8');
                    content = content.replace(/mode:\s*['"][^'"]+['"]/, `mode: '${config.mode}'`);
                    fs.writeFileSync(configPath, content, 'utf-8');
                } catch (e) {}

                const statusText = config.mode === 'private'
                    ? '🔒 *PRIVATE MODE AKTIF*\n(Hanya bot/pemilik yang bisa menjalankan perintah)'
                    : '🌐 *OPEN / PUBLIC MODE AKTIF*\n(Semua pengguna di chat bisa menjalankan perintah)';

                await reply(`⚙️ *Pengaturan Mode Bot Diperbarui:*\n\n${statusText}`);
                break;
            }

            // ==================== MAU (STIKER QR WEB ACADEMY) ====================
            case 'mau': {
                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                try {
                    info(`Memproses stiker QR Web Academy (.mau) untuk: ${from}`);
                    const fs = require('fs');
                    const path = require('path');
                    const qrStickerPath = path.join(__dirname, 'assets', 'academy_qr.webp');
                    const qrPngPath = path.join(__dirname, 'assets', 'academy_qr.png');

                    let stickerBuffer;
                    if (fs.existsSync(qrStickerPath)) {
                        stickerBuffer = await fs.promises.readFile(qrStickerPath);
                    } else if (fs.existsSync(qrPngPath)) {
                        const imgBuffer = await fs.promises.readFile(qrPngPath);
                        stickerBuffer = await imageToSticker(imgBuffer, {
                            packname: 'Web Academy',
                            author: 'Scan untuk masuk web academy'
                        });
                        await fs.promises.writeFile(qrStickerPath, stickerBuffer);
                    } else {
                        throw new Error('File gambar QR academy_qr.png tidak ditemukan di folder assets');
                    }

                    await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: m });
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });

                    const elapsedMs = Date.now() - cmdStartTime;
                    const elapsedSec = (elapsedMs / 1000).toFixed(2);
                    info(`Stiker QR Web Academy terkirim! Respon: ${elapsedSec}s (${elapsedMs}ms)`);
                } catch (err) {
                    error(`Gagal mengirim stiker QR Web Academy: ${err.message}`);
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal mengirim stiker QR: ${err.message}`);
                }
                break;
            }

            // ==================== CHAT PLACE (WEB ACADEMY CHAT) ====================
            case 'chat':
            case 'chatplace': {
                const chatText = args.join(' ');
                let targetMedia = null;
                let mediaType = null;

                if (m.message?.imageMessage) {
                    targetMedia = m.message.imageMessage;
                    mediaType = 'image';
                } else if (quoted?.imageMessage) {
                    targetMedia = quoted.imageMessage;
                    mediaType = 'image';
                }

                // Jika pengguna tidak memasukkan pesan dan tidak ada gambar: Tampilkan pesan terakhir
                if (!chatText && !targetMedia) {
                    const chats = ChatManager.getChats(6);
                    if (!chats.length) {
                        return await reply(`💬 *Chat Place Web Academy*\n\nBelum ada pesan yang tersimpan di server.\nKetik *${config.prefix}chat <pesan>* untuk mengirim obrolan langsung ke web!`);
                    }

                    let listStr = `💬 *CHAT PLACE - WEB ACADEMY*\n_Pesan terbaru dari komunitas:_\n\n`;
                    chats.forEach((c, idx) => {
                        const src = c.source === 'wa' ? '📱 [WA]' : '🌐 [Web]';
                        listStr += `*${idx + 1}. ${c.username}* ${src} (${c.timeStr})\n${c.text || '(File terlampir)'}\n`;
                        if (c.fileUrl) listStr += `📎 File: https://${config.tunnelDomain || 'api.revicshop.web.id'}${c.fileUrl}\n`;
                        listStr += `────────────────────\n`;
                    });
                    listStr += `\nKirim pesan baru: *${config.prefix}chat <pesan kamu>*\nBuka di web: https://${config.tunnelDomain || 'api.revicshop.web.id'}`;
                    return await reply(listStr);
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                try {
                    let fileBuffer = null;
                    let fileName = null;
                    let fileType = null;

                    if (targetMedia) {
                        fileBuffer = await getMediaBuffer(targetMedia, mediaType);
                        fileName = `wa_img_${Date.now()}.png`;
                        fileType = 'image/png';
                    }

                    const newChat = await ChatManager.addChat({
                        username: `${senderName}`,
                        text: chatText,
                        fileData: fileBuffer,
                        fileName,
                        fileType,
                        source: 'wa'
                    });

                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                    await reply(`✅ Pesan kamu berhasil dikirim ke *Chat Place Web Academy*!\n\n💬 *Nama:* ${newChat.username}\n📝 *Pesan:* ${newChat.text || '(Gambar terlampir)'}\n⏱️ *Waktu:* ${newChat.timeStr}`);
                } catch (err) {
                    error(`Gagal mengirim ke Chat Place: ${err.message}`);
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal mengirim ke Chat Place: ${err.message}`);
                }
                break;
            }

            // ==================== STIKER ====================
            case 's':
            case 'stiker':
            case 'sticker': {
                let targetMsg = null;
                let type = null;

                if (m.message?.imageMessage) {
                    targetMsg = m.message.imageMessage;
                    type = 'image';
                } else if (m.message?.videoMessage) {
                    targetMsg = m.message.videoMessage;
                    type = 'video';
                } else if (quoted?.imageMessage) {
                    targetMsg = quoted.imageMessage;
                    type = 'image';
                } else if (quoted?.videoMessage) {
                    targetMsg = quoted.videoMessage;
                    type = 'video';
                } else if (quoted?.stickerMessage) {
                    targetMsg = quoted.stickerMessage;
                    type = 'sticker';
                }

                if (!targetMsg) {
                    return await reply(`⚠️ Silakan kirim gambar/video dengan caption *${config.prefix}stiker* atau balas/reply gambar dengan *${config.prefix}stiker*!`);
                }

                if (type === 'video' && targetMsg.seconds && targetMsg.seconds > 10) {
                    return await reply(`⚠️ Durasi video terlalu panjang! Maksimal 10 detik untuk dijadikan stiker.`);
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });

                try {
                    info(`Memproses stiker dari: ${from}`);
                    const mediaBuffer = await getMediaBuffer(targetMsg, type);

                    let stickerBuffer;
                    if (type === 'video') {
                        stickerBuffer = await videoToSticker(mediaBuffer);
                    } else {
                        stickerBuffer = await imageToSticker(mediaBuffer);
                    }

                    await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: m });
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });

                    const elapsedMs = Date.now() - cmdStartTime;
                    const elapsedSec = (elapsedMs / 1000).toFixed(2);
                    info(`Stiker terkirim! Respon: ${elapsedSec}s (${elapsedMs}ms)`);
                } catch (err) {
                    error(`Gagal membuat stiker: ${err.message}`);
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Terjadi kesalahan saat membuat stiker: ${err.message}`);
                }
                break;
            }

            // ==================== HD / REMINI ====================
            case 'hd':
            case 'remini':
            case 'jernih':
            case 'hdr': {
                let targetMsg = null;
                let type = null;

                if (m.message?.imageMessage) {
                    targetMsg = m.message.imageMessage;
                    type = 'image';
                } else if (quoted?.imageMessage) {
                    targetMsg = quoted.imageMessage;
                    type = 'image';
                } else if (quoted?.stickerMessage) {
                    targetMsg = quoted.stickerMessage;
                    type = 'sticker';
                }

                if (!targetMsg) {
                    return await reply(`⚠️ Silakan kirim gambar dengan caption *${config.prefix}hd* atau balas/reply gambar dengan *${config.prefix}hd*!`);
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                await reply('⚡ Sedang meningkatkan kualitas foto ke HD, mohon tunggu sebentar...');

                try {
                    info(`Memproses HD untuk: ${from}`);
                    const mediaBuffer = await getMediaBuffer(targetMsg, type);
                    const { buffer: hdBuffer, method, origResolution, hdResolution } = await enhanceImage(mediaBuffer);

                    const elapsedMs = Date.now() - cmdStartTime;
                    const elapsedSec = (elapsedMs / 1000).toFixed(2);

                    await sock.sendMessage(from, {
                        image: hdBuffer,
                        caption: `✨ *Foto Berhasil Ditingkatkan ke HD!*\n📐 *Resolusi:* ${origResolution} ➔ *${hdResolution}*\n⏱️ *Waktu Respon:* ${elapsedSec} detik (${elapsedMs}ms)\n⚙️ *Engine:* ${method}\n\n*${config.botName}*`
                    }, { quoted: m });

                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                    info(`HD terkirim! Respon: ${elapsedSec}s (${elapsedMs}ms)`);
                } catch (err) {
                    error(`Gagal enhance foto: ${err.message}`);
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal meningkatkan kualitas foto: ${err.message}`);
                }
                break;
            }

            // ==================== TIKTOK DOWNLOADER ====================
            case 'tiktok':
            case 'tt': {
                const targetUrl = args[0] || (quoted?.conversation || quoted?.extendedTextMessage?.text || '').match(/https?:\/\/[^\s]+/)?.[0];
                if (!targetUrl || !targetUrl.includes('tiktok.com')) {
                    return await reply(`⚠️ Silakan masukkan URL TikTok!\nContoh: *${config.prefix}tiktok https://vt.tiktok.com/ZS6e6vjS8/*`);
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                await reply('⚡ Sedang mengunduh video TikTok tanpa watermark, mohon tunggu...');

                try {
                    const result = await downloadTikTok(targetUrl);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);

                    await sock.sendMessage(from, {
                        video: { url: result.videoUrl },
                        caption: `🎬 *TikTok Video Downloader*\n\n` +
                                 `📌 *Judul:* ${result.title}\n` +
                                 `👤 *Kreator:* @${result.author}\n` +
                                 `⏱️ *Waktu Respon:* ${elapsedSec} detik\n\n` +
                                 `*${config.botName}*`
                    }, { quoted: m });

                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal mengunduh TikTok: ${err.message}`);
                }
                break;
            }

            // ==================== YOUTUBE AUDIO (MP3) ====================
            case 'ytmp3':
            case 'yta': {
                const targetUrl = args[0] || (quoted?.conversation || quoted?.extendedTextMessage?.text || '').match(/https?:\/\/[^\s]+/)?.[0];
                if (!targetUrl || (!targetUrl.includes('youtube.com') && !targetUrl.includes('youtu.be'))) {
                    return await reply(`⚠️ Silakan masukkan URL YouTube!\nContoh: *${config.prefix}ytmp3 https://www.youtube.com/watch?v=dQw4w9WgXcQ*`);
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                await reply('🎵 Sedang memproses dan mengunduh audio YouTube, mohon tunggu...');

                try {
                    const result = await downloadYouTubeAudio(targetUrl);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);

                    await sock.sendMessage(from, {
                        audio: result.buffer,
                        mimetype: 'audio/mp4',
                        fileName: `${result.title.replace(/[/\\?%*:|"<>]/g, '')}.mp3`,
                        contextInfo: {
                            externalAdReply: {
                                title: result.title,
                                body: `Artis: ${result.author} | Respon: ${elapsedSec}s`,
                                mediaType: 2,
                                thumbnailUrl: result.thumbnail,
                                sourceUrl: targetUrl
                            }
                        }
                    }, { quoted: m });

                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal mengunduh audio YouTube: ${err.message}`);
                }
                break;
            }

            // ==================== YOUTUBE VIDEO (MP4) ====================
            case 'ytmp4':
            case 'ytv':
            case 'yt': {
                const targetUrl = args[0] || (quoted?.conversation || quoted?.extendedTextMessage?.text || '').match(/https?:\/\/[^\s]+/)?.[0];
                if (!targetUrl || (!targetUrl.includes('youtube.com') && !targetUrl.includes('youtu.be'))) {
                    return await reply(`⚠️ Silakan masukkan URL YouTube!\nContoh: *${config.prefix}ytmp4 https://www.youtube.com/watch?v=dQw4w9WgXcQ*`);
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                await reply('🎬 Sedang memproses dan mengunduh video YouTube, mohon tunggu...');

                try {
                    const result = await downloadYouTubeVideo(targetUrl);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);

                    await sock.sendMessage(from, {
                        video: result.buffer,
                        caption: `🎬 *YouTube Video Downloader*\n\n` +
                                 `📌 *Judul:* ${result.title}\n` +
                                 `👤 *Channel:* ${result.author}\n` +
                                 `⏱️ *Waktu Respon:* ${elapsedSec} detik\n\n` +
                                 `*${config.botName}*`
                    }, { quoted: m });

                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal mengunduh video YouTube: ${err.message}`);
                }
                break;
            }

            // ==================== SHORT URL ====================
            case 'shorturl':
            case 'short':
            case 'shortlink': {
                const targetUrl = args[0] || (quoted?.conversation || quoted?.extendedTextMessage?.text || '').match(/https?:\/\/[^\s]+/)?.[0];
                if (!targetUrl) {
                    return await reply(`⚠️ Masukkan tautan yang ingin diperpendek!\nContoh: *${config.prefix}shorturl https://google.com*`);
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                try {
                    const shortened = await shortUrl(targetUrl);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);
                    await reply(
                        `🔗 *SHORT URL BERHASIL DIBUAT*\n\n` +
                        `🌐 *Tautan Asli:* ${targetUrl}\n` +
                        `✨ *Tautan Pendek:* ${shortened}\n` +
                        `⏱️ *Waktu Respon:* ${elapsedSec} detik`
                    );
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal memperpendek link: ${err.message}`);
                }
                break;
            }

            // ==================== QR CODE GENERATOR ====================
            case 'qr':
            case 'qrcode':
            case 'makeqr': {
                const qrContent = (text || args.join(' ') || quoted?.conversation || quoted?.extendedTextMessage?.text || '').trim();
                if (!qrContent) {
                    return await reply(
                        `📱 *QR CODE GENERATOR*\n\n` +
                        `💡 *Cara Penggunaan:*\n` +
                        `• *${config.prefix}qr <link atau teks>*\n` +
                        `• Balas/reply pesan teks dengan *${config.prefix}qr*\n\n` +
                        `📌 *Contoh:*\n` +
                        `• *${config.prefix}qr https://google.com*\n` +
                        `• *${config.prefix}qr https://revicshop.web.id*\n` +
                        `• *${config.prefix}qr WIFI:S:NamaWifi;T:WPA;P:PasswordWifi;;*`
                    );
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });

                try {
                    const qrBuffer = await generateQrBuffer(qrContent);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);

                    const isLink = qrContent.startsWith('http://') || qrContent.startsWith('https://');
                    const previewText = qrContent.length > 80 ? qrContent.substring(0, 80) + '...' : qrContent;

                    await sock.sendMessage(from, {
                        image: qrBuffer,
                        caption: `📱 *QR CODE BERHASIL DIBUAT*\n\n` +
                                 `${isLink ? `🌐 *Tautan:* ${qrContent}\n` : `📝 *Isi:* ${previewText}\n`}` +
                                 `🔍 *Kualitas:* High Definition (ECC Level H)\n` +
                                 `⏱️ *Waktu Respon:* ${elapsedSec} detik\n\n` +
                                 `*${config.botName}*`
                    }, { quoted: m });

                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal membuat QR Code: ${err.message}`);
                }
                break;
            }

            // ==================== TEMP FILE UPLOAD ====================
            case 'tempfile':
            case 'upload':
            case 'tourl': {
                let targetMedia = null;
                let mediaType = null;
                let defaultExt = 'bin';

                if (m.message?.imageMessage) { targetMedia = m.message.imageMessage; mediaType = 'image'; defaultExt = 'jpg'; }
                else if (m.message?.videoMessage) { targetMedia = m.message.videoMessage; mediaType = 'video'; defaultExt = 'mp4'; }
                else if (m.message?.documentMessage) { targetMedia = m.message.documentMessage; mediaType = 'document'; defaultExt = targetMedia.fileName?.split('.').pop() || 'dat'; }
                else if (m.message?.audioMessage) { targetMedia = m.message.audioMessage; mediaType = 'audio'; defaultExt = 'mp3'; }
                else if (m.message?.stickerMessage) { targetMedia = m.message.stickerMessage; mediaType = 'sticker'; defaultExt = 'webp'; }
                else if (quoted?.imageMessage) { targetMedia = quoted.imageMessage; mediaType = 'image'; defaultExt = 'jpg'; }
                else if (quoted?.videoMessage) { targetMedia = quoted.videoMessage; mediaType = 'video'; defaultExt = 'mp4'; }
                else if (quoted?.documentMessage) { targetMedia = quoted.documentMessage; mediaType = 'document'; defaultExt = targetMedia.fileName?.split('.').pop() || 'dat'; }
                else if (quoted?.audioMessage) { targetMedia = quoted.audioMessage; mediaType = 'audio'; defaultExt = 'mp3'; }
                else if (quoted?.stickerMessage) { targetMedia = quoted.stickerMessage; mediaType = 'sticker'; defaultExt = 'webp'; }

                if (!targetMedia) {
                    return await reply(`⚠️ Silakan kirim berkas/gambar/video/dokumen dengan caption *${config.prefix}tempfile* atau balas/reply berkas dengan *${config.prefix}tempfile*!`);
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                await reply('📤 Sedang mengunggah berkas ke server penyimpanan sementara...');

                try {
                    const buf = await getMediaBuffer(targetMedia, mediaType);
                    const originalName = targetMedia.fileName || `file_${Date.now()}.${defaultExt}`;
                    const res = await uploadTempFile(buf, originalName);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);
                    const sizeMb = (buf.length / (1024 * 1024)).toFixed(2);

                    await reply(
                        `📦 *BERKAS BERHASIL DIUNGGAH (TEMP FILE)*\n\n` +
                        `📄 *Nama Berkas:* ${res.filename}\n` +
                        `⚖️ *Ukuran:* ${sizeMb} MB\n` +
                        `🔗 *Direct Download:* ${res.downloadUrl}\n` +
                        `🌐 *View Link:* ${res.viewUrl}\n\n` +
                        `⏱️ *Waktu Respon:* ${elapsedSec} detik\n` +
                        `⚠️ *Catatan:* Berkas tersimpan sementara secara otomatis.`
                    );
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal mengunggah berkas: ${err.message}`);
                }
                break;
            }

            // ==================== TEMP MAIL ====================
            case 'tempmail': {
                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                try {
                    const mailData = await tempMail.create(senderNumber);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);
                    await reply(
                        `📬 *TEMP MAIL BERHASIL DIBUAT*\n\n` +
                        `📧 *Email Anda:* \`${mailData.email}\`\n\n` +
                        `💡 *Cara Penggunaan:*\n` +
                        `• Gunakan email di atas untuk mendaftar akun / menerima kode verifikasi OTP.\n` +
                        `• Ketik *${config.prefix}checkmail* untuk melihat kotak masuk & kode OTP yang masuk.\n` +
                        `• Ketik *${config.prefix}changemail <nama>* jika ingin mengubah alamat email.\n\n` +
                        `⏱️ *Waktu Respon:* ${elapsedSec} detik`
                    );
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal membuat temp mail: ${err.message}`);
                }
                break;
            }

            // ==================== CHECK MAIL ====================
            case 'checkmail': {
                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                try {
                    const inbox = await tempMail.check(senderNumber);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);

                    if (!inbox.messages || inbox.messages.length === 0) {
                        await reply(
                            `📭 *KOTAK MASUK KOSONG*\n\n` +
                            `📧 *Email:* \`${inbox.email}\`\n` +
                            `Belum ada email yang masuk. Silakan kirimkan email/verifikasi ke alamat di atas lalu ketik *${config.prefix}checkmail* kembali.`
                        );
                    } else {
                        let text = `📬 *KOTAK MASUK EMAIL*\n` +
                                   `📧 *Alamat:* \`${inbox.email}\`\n` +
                                   `📊 *Total Pesan:* ${inbox.messages.length}\n\n`;

                        inbox.messages.forEach((msg, idx) => {
                            text += `━━━━━━━━━━━━━━━\n` +
                                    `*Pesan #${idx + 1}*\n` +
                                    `👤 *Dari:* ${msg.from}\n` +
                                    `📌 *Subjek:* ${msg.subject}\n` +
                                    `🕒 *Waktu:* ${msg.date}\n` +
                                    `📝 *Isi / Kode:* ${msg.excerpt}\n`;
                        });

                        text += `━━━━━━━━━━━━━━━\n⏱️ *Waktu Respon:* ${elapsedSec} detik`;
                        await reply(text);
                    }
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal mengecek email: ${err.message}`);
                }
                break;
            }

            // ==================== CHANGE MAIL ====================
            case 'changemail': {
                const newUsername = args[0];
                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                try {
                    const updated = await tempMail.change(senderNumber, newUsername);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);
                    await reply(
                        `🔄 *ALAMAT EMAIL DIPERBARUI*\n\n` +
                        `📧 *Email Baru Anda:* \`${updated.email}\`\n\n` +
                        `Ketik *${config.prefix}checkmail* untuk mengecek pesan masuk.\n` +
                        `⏱️ *Waktu Respon:* ${elapsedSec} detik`
                    );
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal mengubah email: ${err.message}`);
                }
                break;
            }

            // ==================== PINTEREST CAROUSEL ====================
            case 'pinterest':
            case 'pin': {
                const query = args.join(' ');
                if (!query) {
                    return await reply(`⚠️ Masukkan kata kunci pencarian Pinterest!\nContoh: *${config.prefix}pin anime aesthetic*`);
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });

                try {
                    const results = await searchPinterest(query);
                    if (!results || results.length === 0) {
                        return await reply(`❌ Gambar Pinterest untuk kata kunci *"${query}"* tidak ditemukan.`);
                    }

                    // Ambil hingga 6 gambar untuk kartu Carousel
                    const carouselImages = results.slice(0, 6);
                    const cards = [];

                    for (let i = 0; i < carouselImages.length; i++) {
                        const imgUrl = carouselImages[i];
                        try {
                            const media = await prepareWAMessageMedia(
                                { image: { url: imgUrl } },
                                { upload: sock.waUploadToServer }
                            );

                            cards.push({
                                body: proto.Message.InteractiveMessage.Body.fromObject({
                                    text: `📸 *Foto ${i + 1}* dari ${carouselImages.length}\n🔍 Kueri: *${query}*`
                                }),
                                footer: proto.Message.InteractiveMessage.Footer.fromObject({
                                    text: `📌 Pinterest • ${config.botName}`
                                }),
                                header: proto.Message.InteractiveMessage.Header.fromObject({
                                    title: `📌 Pinterest #${i + 1}`,
                                    hasMediaAttachment: true,
                                    imageMessage: media.imageMessage
                                }),
                                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                                    buttons: [
                                        {
                                            name: 'cta_url',
                                            buttonParamsJson: JSON.stringify({
                                                display_text: '🔍 Buka Full HD',
                                                url: imgUrl,
                                                merchant_url: imgUrl
                                            })
                                        }
                                    ]
                                })
                            });
                        } catch (cardErr) {
                            console.warn(`Gagal memuat media carousel ke-${i + 1}:`, cardErr.message);
                        }
                    }

                    if (cards.length > 0) {
                        const carouselContent = {
                            viewOnceMessage: {
                                message: {
                                    messageContextInfo: {
                                        deviceListMetadata: {},
                                        deviceListMetadataVersion: 2
                                    },
                                    interactiveMessage: proto.Message.InteractiveMessage.fromObject({
                                        body: proto.Message.InteractiveMessage.Body.fromObject({
                                            text: `📌 *PINTEREST CAROUSEL*\n\n` +
                                                  `🔍 *Kueri:* ${query}\n` +
                                                  `📸 *Total Ditemukan:* ${results.length} foto HD\n\n` +
                                                  `👉 *Geser ke samping (swipe) untuk melihat foto lainnya.*`
                                        }),
                                        footer: proto.Message.InteractiveMessage.Footer.fromObject({
                                            text: config.botName
                                        }),
                                        header: proto.Message.InteractiveMessage.Header.fromObject({
                                            hasMediaAttachment: false
                                        }),
                                        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
                                            cards: cards,
                                            messageVersion: 1
                                        })
                                    })
                                }
                            }
                        };

                        const waMsg = generateWAMessageFromContent(from, carouselContent, { quoted: m });
                        await sock.relayMessage(from, waMsg.message, { messageId: waMsg.key.id });
                    } else {
                        // Fallback jika semua kartu gagal upload
                        await sock.sendMessage(from, {
                            image: { url: results[0] },
                            caption: `📌 *PINTEREST RESULTS*\n\n🔍 *Kueri:* ${query}\n📸 Ditemukan ${results.length} foto HD.`
                        }, { quoted: m });
                    }

                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal mencari di Pinterest: ${err.message}`);
                }
                break;
            }

            // ==================== NULIS BUKU TULIS ====================
            case 'nulis':
            case 'magernulis': {
                const textToNulis = args.join(' ') || quoted?.conversation || quoted?.extendedTextMessage?.text || '';
                if (!textToNulis.trim()) {
                    return await reply(`⚠️ Silakan masukkan teks yang ingin ditulis di kertas buku atau balas/reply pesan dengan *${config.prefix}nulis*!\nContoh: *${config.prefix}nulis Tugas Matematika Halaman 45*`);
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                try {
                    const nulisBuffer = await renderNulis(textToNulis, senderName);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);

                    await sock.sendMessage(from, {
                        image: nulisBuffer,
                        caption: `📖 *Teks Berhasil Ditulis di Buku Tulis Bergaris*\n\n` +
                                 `👤 *Nama:* ${senderName}\n` +
                                 `⏱️ *Waktu Respon:* ${elapsedSec} detik\n\n` +
                                 `*${config.botName}*`
                    }, { quoted: m });

                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal menulis di buku: ${err.message}`);
                }
                break;
            }

            // ==================== GABUNG EMOJI JADI STIKER ====================
            case 'emoji':
            case 'smoji': {
                const emojiText = args.join(' ') || quoted?.conversation || quoted?.extendedTextMessage?.text || '';
                if (!emojiText.trim()) {
                    return await reply(`⚠️ Silakan masukkan emoji yang ingin digabung menjadi stiker (hingga 20 emoji)!\nContoh: *${config.prefix}emoji 😀🔥😍✨⚡*`);
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                try {
                    const stickerBuffer = await combineEmojis(emojiText);
                    await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: m });
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal menggabungkan emoji: ${err.message}`);
                }
                break;
            }

            // ==================== EMOJIMIX (KITCHEN) ====================
            case 'emojimix':
            case 'mixemoji': {
                const em1 = args[0];
                const em2 = args[1];

                if (!em1 || !em2) {
                    return await reply(`⚠️ Masukkan dua emoji untuk dicampur!\nContoh: *${config.prefix}emojimix 😀 😍* atau *${config.prefix}emojimix 😭 🔥*`);
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                try {
                    const stickerBuffer = await blendEmojimix(em1, em2);
                    await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: m });
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${err.message}`);
                }
                break;
            }

            // ==================== JADWAL GRUP (BUKA & TUTUP) ====================
            case 'jadwalgrup':
            case 'groupjadwal': {
                if (!isGroup) {
                    return await reply('⚠️ Perintah jadwal grup hanya dapat digunakan di dalam grup WhatsApp!');
                }

                const subCmd = (args[0] || '').toLowerCase();
                const timeArg = args[1];

                // Cek hak akses admin
                const userIsAdmin = await isGroupAdmin();
                if (!userIsAdmin && !isOwner) {
                    return await reply('⛔ Khusus Admin Grup! Hanya admin grup yang diizinkan mengatur jadwal buka dan tutup grup.');
                }

                let groupName = 'Grup WhatsApp';
                try {
                    const meta = await sock.groupMetadata(from);
                    groupName = meta.subject || groupName;
                } catch (e) {}

                if (subCmd === 'tutup') {
                    if (!timeArg) return await reply(`⚠️ Masukkan jam penutupan grup!\nContoh: *${config.prefix}jadwalgrup tutup 22:00*`);
                    try {
                        const setTime = groupScheduler.setSchedule(from, groupName, 'tutup', timeArg);
                        await reply(`🔒 *JADWAL PENUTUPAN GRUP DISETEL*\n\nGrup akan ditutup otomatis setiap pukul *${setTime} WIB*.\nHanya admin yang dapat berkirim pesan saat ditutup.`);
                    } catch (e) {
                        await reply(`❌ ${e.message}`);
                    }
                } else if (subCmd === 'buka') {
                    if (!timeArg) return await reply(`⚠️ Masukkan jam pembukaan grup!\nContoh: *${config.prefix}jadwalgrup buka 06:00*`);
                    try {
                        const setTime = groupScheduler.setSchedule(from, groupName, 'buka', timeArg);
                        await reply(`🔓 *JADWAL PEMBUKAAN GRUP DISETEL*\n\nGrup akan dibuka otomatis setiap pukul *${setTime} WIB*.\nSemua anggota dapat berdiskusi kembali.`);
                    } catch (e) {
                        await reply(`❌ ${e.message}`);
                    }
                } else if (subCmd === 'daftar' || subCmd === 'list' || subCmd === 'status') {
                    const schedule = groupScheduler.getSchedule(from);
                    if (!schedule || (!schedule.buka && !schedule.tutup)) {
                        return await reply(`📋 Belum ada jadwal buka/tutup yang aktif untuk grup ini.\n\nAtur jadwal dengan:\n• *${config.prefix}jadwalgrup tutup 22:00*\n• *${config.prefix}jadwalgrup buka 06:00*`);
                    }

                    await reply(
                        `📋 *JADWAL BUKA / TUTUP GRUP SAAT INI*\n\n` +
                        `👥 *Grup:* ${schedule.groupName}\n` +
                        `🔓 *Jam Buka:* ${schedule.buka ? `${schedule.buka} WIB` : 'Tidak Diatur'}\n` +
                        `🔒 *Jam Tutup:* ${schedule.tutup ? `${schedule.tutup} WIB` : 'Tidak Diatur'}\n\n` +
                        `Untuk menghapus jadwal: *${config.prefix}jadwalgrup hapus*`
                    );
                } else if (subCmd === 'hapus' || subCmd === 'delete') {
                    const targetType = (timeArg || 'all').toLowerCase();
                    groupScheduler.removeSchedule(from, targetType);
                    await reply(`🗑️ Jadwal buka/tutup grup berhasil dinonaktifkan/dihapus.`);
                } else {
                    await reply(
                        `📖 *PANDUAN JADWAL BUKA/TUTUP GRUP (Khusus Admin):*\n\n` +
                        `• *${config.prefix}jadwalgrup tutup 22:00* : Kunci pesan grup otomatis pada jam 22:00 WIB\n` +
                        `• *${config.prefix}jadwalgrup buka 06:00* : Buka pesan grup otomatis pada jam 06:00 WIB\n` +
                        `• *${config.prefix}jadwalgrup daftar* : Lihat jadwal aktif saat ini\n` +
                        `• *${config.prefix}jadwalgrup hapus* : Hapus seluruh jadwal otomatis`
                    );
                }
                break;
            }

            // ==================== BUKA & TUTUP GRUP MANUAL (OPEN / CLOSE) ====================
            case 'grup':
            case 'group':
            case 'opengrup':
            case 'closegrup':
            case 'buka':
            case 'tutup':
            case 'open':
            case 'close': {
                if (!isGroup) {
                    return await reply('⚠️ Perintah buka/tutup grup hanya dapat digunakan di dalam grup WhatsApp!');
                }

                const userIsAdmin = await isGroupAdmin();
                if (!userIsAdmin && !isOwner) {
                    return await reply('⛔ Khusus Admin Grup! Hanya admin grup atau pemilik bot yang diizinkan membuka atau menutup grup.');
                }

                let action = '';
                if (command === 'opengrup' || command === 'open' || command === 'buka') {
                    action = 'buka';
                } else if (command === 'closegrup' || command === 'close' || command === 'tutup') {
                    action = 'tutup';
                } else {
                    action = (args[0] || '').toLowerCase();
                }

                if (action === 'buka' || action === 'open' || action === '1') {
                    await sock.groupSettingUpdate(from, 'not_announcement');
                    await sock.sendMessage(from, {
                        text: `🔓 *GRUP DIBUKA*\n\n` +
                              `Grup telah dibuka oleh @${senderNumber}.\n` +
                              `Semua anggota sekarang dapat mengirim pesan kembali. Mohon tetap jaga ketertiban! ✨`,
                        mentions: [sender]
                    });
                } else if (action === 'tutup' || action === 'close' || action === '0') {
                    await sock.groupSettingUpdate(from, 'announcement');
                    await sock.sendMessage(from, {
                        text: `🔒 *GRUP DITUTUP*\n\n` +
                              `Grup telah ditutup sementara oleh @${senderNumber}.\n` +
                              `Hanya Admin yang dapat mengirim pesan saat ini. Silakan istirahat atau tunggu pengumuman berikutnya! 💤`,
                        mentions: [sender]
                    });
                } else {
                    await reply(
                        `📖 *PANDUAN BUKA / TUTUP GRUP (Khusus Admin):*\n\n` +
                        `• *${config.prefix}grup buka* atau *${config.prefix}open* : Buka chat grup (semua anggota bisa chat)\n` +
                        `• *${config.prefix}grup tutup* atau *${config.prefix}close* : Kunci chat grup (hanya admin yang bisa chat)`
                    );
                }
                break;
            }

            // ==================== FITUR ONLY CHAT (WHITELIST LEBIH DARI SATU) ====================
            case 'only':
            case 'whitelist': {
                if (!isOwner) {
                    return await reply('⚠️ Fitur .only hanya dapat dikonfigurasi oleh pemilik bot.');
                }

                const subCmd = (args[0] || '').toLowerCase();

                let chatTitle = isGroup ? 'Grup WhatsApp' : `Chat Pribadi (${senderName})`;
                if (isGroup) {
                    try {
                        const meta = await sock.groupMetadata(from);
                        chatTitle = meta.subject || chatTitle;
                    } catch (e) {}
                }

                if (subCmd === 'add' || subCmd === 'tambah' || (!subCmd && !args[0])) {
                    // Daftarkan chat ini
                    const total = onlyManager.addChat(from, chatTitle);
                    await reply(
                        `✅ *CHAT DITAMBAHKAN KE DAFTAR .ONLY*\n\n` +
                        `📌 *Nama Chat:* ${chatTitle}\n` +
                        `🆔 *JID:* \`${from}\`\n` +
                        `📊 *Total Chat Diizinkan:* ${total}\n\n` +
                        `🔒 Sekarang bot HANYA membaca & merespon perintah di chat yang terdaftar.`
                    );
                } else if (subCmd === 'del' || subCmd === 'delete' || subCmd === 'hapus' || subCmd === 'remove') {
                    const targetJid = args[1] || from;
                    const removed = onlyManager.removeChat(targetJid);
                    if (removed) {
                        await reply(`🗑️ Chat dengan JID \`${targetJid}\` berhasil dihapus dari daftar .only.`);
                    } else {
                        await reply(`⚠️ Chat tidak ditemukan dalam daftar .only.`);
                    }
                } else if (subCmd === 'on' || subCmd === 'enable') {
                    onlyManager.setEnabled(true);
                    await reply(`🔒 *FITUR .ONLY DIAKTIFKAN*\nBot sekarang HANYA merespon chat yang ada di dalam daftar whitelist.`);
                } else if (subCmd === 'off' || subCmd === 'disable') {
                    onlyManager.setEnabled(false);
                    await reply(`🌐 *FITUR .ONLY DINONAKTIFKAN*\nBot kembali dapat merespon di semua chat/grup.`);
                } else if (subCmd === 'list' || subCmd === 'daftar' || subCmd === 'status') {
                    const data = onlyManager.getList();
                    if (!data.chats || data.chats.length === 0) {
                        return await reply(
                            `📋 *DAFTAR .ONLY KOSONG*\n\n` +
                            `Status: ${data.enabled ? '🔒 *Aktif (Terfilter)*' : '🌐 *Nonaktif (Semua Chat)*'}\n\n` +
                            `Ketik *${config.prefix}only add* di grup/chat yang ingin diizinkan.`
                        );
                    }

                    let listText = `📋 *DAFTAR CHAT .ONLY YANG DIIZINKAN*\n\n` +
                                   `🔒 *Status Filter:* ${data.enabled ? 'AKTIF' : 'NONAKTIF'}\n` +
                                   `📊 *Total Chat Diizinkan:* ${data.total}\n\n`;

                    data.chats.forEach((c, idx) => {
                        const isCurrent = c.jid === from;
                        listText += `${idx + 1}. *${c.name}* ${isCurrent ? '👈 (Chat Ini)' : ''}\n` +
                                    `   🆔 \`${c.jid}\`\n` +
                                    `   📅 Ditambahkan: ${c.addedAt}\n\n`;
                    });

                    listText += `• Tambah: *${config.prefix}only add*\n` +
                                `• Hapus: *${config.prefix}only del*\n` +
                                `• On/Off: *${config.prefix}only on* / *${config.prefix}only off*`;
                    await reply(listText);
                } else if (subCmd === 'clear') {
                    onlyManager.clearAll();
                    await reply(`🗑️ Seluruh daftar .only telah dikosongkan dan filter dinonaktifkan.`);
                } else {
                    await reply(
                        `📖 *PANDUAN FITUR .ONLY (Hanya Chat yang Diizinkan):*\n\n` +
                        `• *${config.prefix}only* atau *${config.prefix}only add* : Daftarkan chat/grup ini agar dibaca sistem\n` +
                        `• *${config.prefix}only del* : Hapus chat/grup ini dari daftar izin\n` +
                        `• *${config.prefix}only list* : Lihat semua chat yang diizinkan (berlaku lebih dari satu)\n` +
                        `• *${config.prefix}only on* : Aktifkan filter pembatasan\n` +
                        `• *${config.prefix}only off* : Matikan filter (baca semua chat)\n` +
                        `• *${config.prefix}only clear* : Kosongkan seluruh daftar`
                    );
                }
                break;
            }

            // ==================== RANGKUM MATERI (TEKS & PDF/TXT) ====================
            case 'rangkum':
            case 'summarize':
            case 'ringkas': {
                let numSentences = 5;
                const potentialNum = parseInt(args[0], 10);
                if (!isNaN(potentialNum) && potentialNum > 0 && potentialNum <= 20) {
                    numSentences = potentialNum;
                }

                let docTarget = null;
                if (m.message?.documentMessage) docTarget = m.message.documentMessage;
                else if (quoted?.documentMessage) docTarget = quoted.documentMessage;

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });

                try {
                    if (docTarget) {
                        const fileName = (docTarget.fileName || '').toLowerCase();
                        const isPdf = fileName.endsWith('.pdf') || docTarget.mimetype?.includes('pdf');
                        const isTxt = fileName.endsWith('.txt') || docTarget.mimetype?.includes('text');

                        if (!isPdf && !isTxt) {
                            return await reply('⚠️ Format berkas tidak didukung untuk dirangkum. Gunakan berkas *.pdf* atau *.txt*.');
                        }

                        await reply(`📄 Sedang mengekstrak teks dari berkas *${docTarget.fileName}* dan merangkum, mohon tunggu...`);
                        const docBuffer = await getMediaBuffer(docTarget, 'document');

                        let summaryResult;
                        if (isPdf) {
                            summaryResult = await summarizePdf(docBuffer, numSentences);
                        } else {
                            const rawText = docBuffer.toString('utf-8');
                            summaryResult = summarizeText(rawText, numSentences);
                        }

                        const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);
                        await reply(
                            `📑 *RANGKUMAN DOKUMEN (${docTarget.fileName})*\n\n` +
                            `📊 *Statistik:* Diambil ${summaryResult.selectedCount} kalimat dari total ${summaryResult.sentencesCount} kalimat (${summaryResult.originalLength} karakter)\n\n` +
                            `📌 *Inti Materi Rangkuman:*\n\n${summaryResult.summary}\n\n` +
                            `⏱️ *Waktu Respon:* ${elapsedSec} detik\n` +
                            `*${config.botName}*`
                        );
                    } else {
                        const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
                        let textToSummarize = quotedText;

                        if (!textToSummarize) {
                            textToSummarize = isNaN(potentialNum) ? args.join(' ') : args.slice(1).join(' ');
                        }

                        if (!textToSummarize || textToSummarize.trim().length < 50) {
                            return await reply(
                                `⚠️ Silakan balas/reply pesan panjang atau berkas PDF/TXT dengan *${config.prefix}rangkum*!\n\n` +
                                `Contoh:\n` +
                                `• Balas pesan panjang dengan: *${config.prefix}rangkum*\n` +
                                `• Balas pesan dengan atur jumlah kalimat: *${config.prefix}rangkum 5*\n` +
                                `• Balas berkas materi PDF dengan: *${config.prefix}rangkum 7*`
                            );
                        }

                        const summaryResult = summarizeText(textToSummarize, numSentences);
                        const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);

                        await reply(
                            `📑 *RANGKUMAN MATERI*\n\n` +
                            `📊 *Statistik:* ${summaryResult.selectedCount} kalimat penting terpilih (${summaryResult.originalLength} karakter diringkas)\n\n` +
                            `📌 *Inti Materi:*\n\n${summaryResult.summary}\n\n` +
                            `⏱️ *Waktu Respon:* ${elapsedSec} detik\n` +
                            `*${config.botName}*`
                        );
                    }

                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal merangkum materi: ${err.message}`);
                }
                break;
            }

            // ==================== ALKITAB (TERJEMAHAN BARU) ====================
            case 'alkitab':
            case 'bible':
            case 'injil': {
                await sock.sendMessage(from, { react: { text: '📖', key: m.key } });

                try {
                    const parsed = parseBibleQuery(text);

                    if (parsed.action === 'help') {
                        await reply(getBibleHelp());
                    } else if (parsed.action === 'search') {
                        const searchResult = await searchBible(parsed.keyword);
                        await reply(searchResult);
                    } else if (parsed.action === 'book_info') {
                        const infoText = formatBookChapters(parsed.book);
                        await reply(infoText);
                    } else if (parsed.action === 'passage') {
                        const passageText = await getBiblePassage(
                            parsed.book,
                            parsed.chapter,
                            parsed.verseStart,
                            parsed.verseEnd
                        );
                        await reply(passageText);
                    }

                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal memuat Alkitab: ${err.message}`);
                }
                break;
            }

            // ==================== RENUNGAN HARIAN & AI ====================
            case 'renungan':
            case 'devotional':
            case 'saatteduh': {
                await sock.sendMessage(from, { react: { text: '🕊️', key: m.key } });

                try {
                    const cleanText = (text || '').trim();
                    let devotionalResult = '';

                    if (!cleanText || cleanText.toLowerCase() === 'hari ini' || cleanText.toLowerCase() === 'today') {
                        // Renungan Harian resmi hari ini
                        devotionalResult = await getDailyDevotional('rh');
                    } else if (cleanText.toLowerCase() === 'sh' || cleanText.toLowerCase() === 'santapan') {
                        // Santapan Harian resmi hari ini
                        devotionalResult = await getDailyDevotional('sh');
                    } else {
                        // Renungan Rohani berbasis AI sesuai topik atau ayat
                        await reply(`⏳ Sedang menyusun renungan rohani dengan AI untuk topik *"${cleanText}"*, mohon tunggu sebentar...`);
                        devotionalResult = await generateAiDevotional(cleanText);
                    }

                    await reply(devotionalResult);
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal memuat renungan: ${err.message}`);
                }
                break;
            }

            // ==================== ENDLESS AI CHAT ====================
            case 'ai':
            case 'endlessai': {
                const prompt = args.join(' ') || quoted?.conversation || quoted?.extendedTextMessage?.text || '';
                if (!prompt.trim()) {
                    return await reply(`🤖 *EndLess AI*\n\nSilakan masukkan pertanyaan Anda!\nContoh: *${config.prefix}ai jelaskan arti perumpamaan anak yang hilang*`);
                }

                await sock.sendMessage(from, { react: { text: '✨', key: m.key } });

                try {
                    const systemPrompt = `Kamu adalah EndLess AI, asisten kecerdasan buatan cerdas, ramah, dan bijaksana dari EndLess Academy. 
Jawablah pertanyaan berikut dengan jelas, lengkap, dan bermanfaat: "${prompt.trim()}".
Gunakan Bahasa Indonesia yang baik dan terstruktur.`;

                    const aiResponse = await queryEndLessAI(systemPrompt, 25000);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);

                    await reply(
                        `🤖 *ENDLESS AI*\n` +
                        `─────────────────────────\n\n` +
                        `${aiResponse.trim()}\n\n` +
                        `─────────────────────────\n` +
                        `⏱️ *Waktu Respon:* ${elapsedSec} detik\n` +
                        `*EndLess Academy*`
                    );

                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ EndLess AI mengalami kendala: ${err.message}`);
                }
                break;
            }

            // ==================== ENDLESS AI IMAGE GENERATOR ====================
            case 'imageai':
            case 'imgai':
            case 'aiimage':
            case 'aiimg':
            case 'txt2img': {
                let promptStr = (text || args.join(' ') || '').trim();

                // Cek apakah ada foto yang disertakan / direply untuk Image-to-Image
                let targetMedia = null;
                if (m.message?.imageMessage) {
                    targetMedia = m.message.imageMessage;
                } else if (quoted?.imageMessage) {
                    targetMedia = quoted.imageMessage;
                }

                // Jika prompt kosong dan tidak ada reply gambar
                if (!promptStr && !targetMedia) {
                    return await reply(
                        `🎨 *ENDLESS AI IMAGE GENERATOR*\n\n` +
                        `💡 *Cara Penggunaan:*\n` +
                        `• *${config.prefix}imageai <prompt>* : Buat gambar baru dari teks (Text-to-Image)\n` +
                        `• *${config.prefix}imageai [balas foto] <prompt>* : Ubah/variasi foto (Image-to-Image)\n\n` +
                        `⚙️ *Opsi Tambahan (Opsional):*\n` +
                        `• \`--style <nama_style>\` : Menentukan style gambar (anime, realistic, cyberpunk, dll)\n` +
                        `• \`--model <id_model>\` : Menentukan ID model AI\n\n` +
                        `📌 *Contoh:*\n` +
                        `• *${config.prefix}imageai cute white cat playing wool yarn*\n` +
                        `• *${config.prefix}imageai futuristic cyberpunk robot in neo tokyo --style anime*\n` +
                        `• *${config.prefix}imageai indonesian mountain temple sunset 8k hd*`
                    );
                }

                // Ekstrak opsi --style dan --model jika ada
                let style = '';
                let modelId = '';

                const styleMatch = promptStr.match(/(?:--|-)style\s+([^\s]+)/i);
                if (styleMatch) {
                    style = styleMatch[1];
                    promptStr = promptStr.replace(styleMatch[0], '').trim();
                }

                const modelMatch = promptStr.match(/(?:--|-)model(?:id)?\s+([^\s]+)/i);
                if (modelMatch) {
                    modelId = modelMatch[1];
                    promptStr = promptStr.replace(modelMatch[0], '').trim();
                }

                if (!promptStr) {
                    promptStr = 'high quality masterpiece, detailed aesthetic visual';
                }

                await sock.sendMessage(from, { react: { text: '🎨', key: m.key } });

                let imageUrl = '';
                try {
                    if (targetMedia) {
                        await reply('📤 Sedang mengunggah foto referensi untuk Image-to-Image, mohon tunggu sebentar...');
                        const imgBuffer = await getMediaBuffer(targetMedia, 'image');
                        imageUrl = await uploadToCatbox(imgBuffer);
                    }

                    await reply(`🎨 Sedang membuat gambar AI untuk prompt:\n*"${promptStr}"*...\n⏱️ Mohon tunggu 10-20 detik.`);

                    const imageResult = await generateAiImage({
                        prompt: promptStr,
                        image: imageUrl || undefined,
                        modelId: modelId || undefined,
                        style: style || undefined,
                        timeoutMs: 90000
                    });

                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);

                    const caption = `🎨 *ENDLESS AI IMAGE GENERATOR*\n` +
                                    `─────────────────────────\n` +
                                    `📝 *Prompt:* ${promptStr}\n` +
                                    (style ? `🎭 *Style:* ${style}\n` : '') +
                                    (modelId ? `🤖 *Model:* ${modelId}\n` : '') +
                                    (imageUrl ? `🖼️ *Mode:* Image-to-Image\n` : `✨ *Mode:* Text-to-Image\n`) +
                                    `⏱️ *Waktu Respon:* ${elapsedSec} detik\n` +
                                    `─────────────────────────\n` +
                                    `*EndLess Academy*`;

                    if (Buffer.isBuffer(imageResult)) {
                        await sock.sendMessage(from, {
                            image: imageResult,
                            caption: caption
                        }, { quoted: m });
                    } else if (typeof imageResult === 'string' && imageResult.startsWith('http')) {
                        await sock.sendMessage(from, {
                            image: { url: imageResult },
                            caption: caption
                        }, { quoted: m });
                    } else {
                        throw new Error('Hasil pembuatan gambar tidak valid.');
                    }

                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal membuat gambar AI: ${err.message}`);
                }
                break;
            }

            // ==================== PREXZY DOWNLOADERS ====================
            case 'spotify':
            case 'spotdl': {
                const targetUrl = args[0] || (quoted?.conversation || quoted?.extendedTextMessage?.text || '').match(/https?:\/\/[^\s]+/)?.[0];
                if (!targetUrl || !targetUrl.includes('spotify.com')) {
                    return await reply(`⚠️ Silakan masukkan tautan lagu Spotify!\nContoh: *${config.prefix}spotify https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT*`);
                }

                await sock.sendMessage(from, { react: { text: '🎵', key: m.key } });
                await reply('🎧 Sedang memproses dan mengunduh lagu Spotify...');

                try {
                    const data = await prexzy.downloadSpotify(targetUrl);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);
                    const title = data.title || 'Spotify Track';
                    const artist = data.artist || 'Unknown Artist';

                    await sock.sendMessage(from, {
                        audio: { url: data.download_url },
                        mimetype: 'audio/mp4',
                        fileName: `${title} - ${artist}.mp3`,
                        contextInfo: {
                            externalAdReply: {
                                title: title,
                                body: `Artis: ${artist} • Respon: ${elapsedSec}s`,
                                mediaType: 2,
                                thumbnailUrl: data.cover || undefined,
                                sourceUrl: targetUrl
                            }
                        }
                    }, { quoted: m });

                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal mengunduh lagu Spotify: ${err.message}`);
                }
                break;
            }

            case 'fb':
            case 'facebook': {
                const targetUrl = args[0] || (quoted?.conversation || quoted?.extendedTextMessage?.text || '').match(/https?:\/\/[^\s]+/)?.[0];
                if (!targetUrl || (!targetUrl.includes('facebook.com') && !targetUrl.includes('fb.watch'))) {
                    return await reply(`⚠️ Masukkan tautan video Facebook!\nContoh: *${config.prefix}fb https://fb.watch/xyz*`);
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                await reply('⚡ Sedang mengunduh video Facebook...');

                try {
                    const fbData = await prexzy.downloadFacebook(targetUrl);
                    const videoUrl = fbData.hd || fbData.sd || fbData.url || (Array.isArray(fbData) ? fbData[0]?.url : null);
                    if (!videoUrl) throw new Error('Link unduhan video Facebook tidak ditemukan.');

                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);
                    await sock.sendMessage(from, {
                        video: { url: videoUrl },
                        caption: `🎬 *Facebook Video Downloader*\n\n⏱️ *Waktu Respon:* ${elapsedSec} detik\n*${config.botName}*`
                    }, { quoted: m });

                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal mengunduh Facebook: ${err.message}`);
                }
                break;
            }

            case 'ig':
            case 'igdl':
            case 'instagram': {
                const targetUrl = args[0] || (quoted?.conversation || quoted?.extendedTextMessage?.text || '').match(/https?:\/\/[^\s]+/)?.[0];
                if (!targetUrl || !targetUrl.includes('instagram.com')) {
                    return await reply(`⚠️ Masukkan tautan postingan / Reels Instagram!\nContoh: *${config.prefix}ig https://www.instagram.com/reel/C3x...*`);
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                await reply('📸 Sedang mengunduh media Instagram...');

                try {
                    const igData = await prexzy.downloadInstagram(targetUrl);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);

                    let mediaList = Array.isArray(igData) ? igData : (igData.media || igData.urls || [igData]);
                    let sent = false;

                    for (const item of mediaList.slice(0, 3)) {
                        const mUrl = typeof item === 'string' ? item : (item.url || item.download_url);
                        if (!mUrl) continue;
                        const isVideo = mUrl.includes('.mp4') || item.type === 'video';
                        if (isVideo) {
                            await sock.sendMessage(from, { video: { url: mUrl }, caption: `📸 *Instagram Downloader*\n⏱️ *Respon:* ${elapsedSec}s\n*${config.botName}*` }, { quoted: m });
                        } else {
                            await sock.sendMessage(from, { image: { url: mUrl }, caption: `📸 *Instagram Downloader*\n⏱️ *Respon:* ${elapsedSec}s\n*${config.botName}*` }, { quoted: m });
                        }
                        sent = true;
                    }

                    if (!sent) throw new Error('Tidak ada media yang dapat diunduh.');
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal mengunduh Instagram: ${err.message}`);
                }
                break;
            }

            case 'mediafire':
            case 'mf': {
                const targetUrl = args[0] || (quoted?.conversation || quoted?.extendedTextMessage?.text || '').match(/https?:\/\/[^\s]+/)?.[0];
                if (!targetUrl || !targetUrl.includes('mediafire.com')) {
                    return await reply(`⚠️ Masukkan tautan MediaFire!\nContoh: *${config.prefix}mediafire https://www.mediafire.com/file/...*`);
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                await reply('📦 Sedang mengambil link unduhan MediaFire...');

                try {
                    const mfData = await prexzy.downloadMediafire(targetUrl);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);
                    const dlUrl = mfData.download_url || mfData.url || mfData.link;
                    const filename = mfData.filename || mfData.name || 'file';
                    const filesize = mfData.filesize || mfData.size || '-';

                    await reply(
                        `📦 *MEDIAFIRE DOWNLOADER*\n\n` +
                        `📄 *Nama:* ${filename}\n` +
                        `⚖️ *Ukuran:* ${filesize}\n` +
                        `🔗 *Link Unduh Langsung:* ${dlUrl}\n\n` +
                        `⏱️ *Waktu Respon:* ${elapsedSec} detik`
                    );
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal memproses MediaFire: ${err.message}`);
                }
                break;
            }

            case 'aio': {
                const targetUrl = args[0] || (quoted?.conversation || quoted?.extendedTextMessage?.text || '').match(/https?:\/\/[^\s]+/)?.[0];
                if (!targetUrl) {
                    return await reply(`⚠️ Masukkan tautan media yang ingin diunduh!\nContoh: *${config.prefix}aio https://...*`);
                }

                await sock.sendMessage(from, { react: { text: '⏳', key: m.key } });
                try {
                    const aioData = await prexzy.downloadAio(targetUrl);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);
                    const mediaUrl = aioData.url || aioData.download_url || (Array.isArray(aioData) ? aioData[0]?.url : null);

                    if (mediaUrl) {
                        await sock.sendMessage(from, {
                            video: { url: mediaUrl },
                            caption: `📥 *All-In-One Downloader*\n⏱️ *Respon:* ${elapsedSec}s\n*${config.botName}*`
                        }, { quoted: m });
                    } else {
                        await reply(`📥 *AIO DOWNLOADER*\n\nData: ${JSON.stringify(aioData).slice(0, 300)}`);
                    }
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal mengunduh: ${err.message}`);
                }
                break;
            }

            // ==================== TEXT TO SPEECH (TTS) ====================
            case 'tts':
            case 'vn':
            case 'suara': {
                let voiceKey = 'id';
                let ttsText = text || args.join(' ');

                if (args[0] && prexzy.TTS_VOICES[args[0].toLowerCase()]) {
                    voiceKey = args[0].toLowerCase();
                    ttsText = args.slice(1).join(' ');
                } else if (!ttsText && quoted?.conversation) {
                    ttsText = quoted.conversation;
                } else if (!ttsText && quoted?.extendedTextMessage?.text) {
                    ttsText = quoted.extendedTextMessage.text;
                }

                if (!ttsText || !ttsText.trim()) {
                    return await reply(
                        `🗣️ *TEXT TO SPEECH (TTS)*\n\n` +
                        `💡 *Cara Penggunaan:*\n` +
                        `• *${config.prefix}tts <teks>* : Suara Bahasa Indonesia\n` +
                        `• *${config.prefix}tts <suara> <teks>* : Pilih suara/bahasa\n\n` +
                        `🎙️ *Pilihan Suara:* \`id\` (Indonesia), \`en\` (Inggris), \`ja\` (Jepang), \`ko\` (Korea), \`ar\` (Arab), \`whisper\` (Bisikan), \`robot\` (Robosoft)\n\n` +
                        `📌 *Contoh:* *${config.prefix}tts halo selamat datang di kelas*`
                    );
                }

                await sock.sendMessage(from, { react: { text: '🎙️', key: m.key } });

                try {
                    const audioBuffer = await prexzy.textToSpeech(ttsText.trim(), voiceKey);
                    await sock.sendMessage(from, {
                        audio: audioBuffer,
                        mimetype: 'audio/mp4',
                        ptt: true
                    }, { quoted: m });
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal menghasilkan suara: ${err.message}`);
                }
                break;
            }

            // ==================== PENCARIAN & INFORMASI ====================
            case 'cuaca':
            case 'weather': {
                const city = args.join(' ') || 'Jakarta';
                await sock.sendMessage(from, { react: { text: '🌤️', key: m.key } });

                try {
                    const w = await prexzy.searchWeather(city);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);
                    await reply(
                        `🌤️ *INFORMASI CUACA TERKINI*\n\n` +
                        `📍 *Lokasi:* ${w.location}, ${w.country}\n` +
                        `☁️ *Kondisi:* ${w.weather || '-'}\n` +
                        `🌡️ *Suhu Saat Ini:* ${w.currentTemp || '-'}\n` +
                        `📈 *Suhu Maks/Min:* ${w.maxTemp || '-'} / ${w.minTemp || '-'}\n` +
                        `💧 *Kelembapan:* ${w.humidity || '-'}\n` +
                        `💨 *Kecepatan Angin:* ${w.windSpeed || '-'}\n\n` +
                        `⏱️ *Waktu Respon:* ${elapsedSec} detik`
                    );
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${err.message}`);
                }
                break;
            }

            case 'lirik':
            case 'lyrics': {
                const songQuery = args.join(' ');
                if (!songQuery) {
                    return await reply(`⚠️ Masukkan judul lagu yang dicari!\nContoh: *${config.prefix}lirik Adele Someone Like You*`);
                }

                await sock.sendMessage(from, { react: { text: '🎵', key: m.key } });

                try {
                    const l = await prexzy.searchLyrics(songQuery);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);
                    await reply(
                        `🎵 *LIRIK LAGU: ${l.title || songQuery}*\n` +
                        `👤 *Artis:* ${l.artist || '-'}\n` +
                        `💿 *Album:* ${l.album || '-'}\n` +
                        `─────────────────────────\n\n` +
                        `${l.lyrics || 'Lirik tidak tersedia.'}\n\n` +
                        `─────────────────────────\n` +
                        `⏱️ *Waktu Respon:* ${elapsedSec} detik`
                    );
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${err.message}`);
                }
                break;
            }

            case 'yts':
            case 'ytsearch': {
                const ytQuery = args.join(' ');
                if (!ytQuery) {
                    return await reply(`⚠️ Masukkan kata kunci pencarian YouTube!\nContoh: *${config.prefix}yts lofi chill music*`);
                }

                await sock.sendMessage(from, { react: { text: '🔍', key: m.key } });

                try {
                    const list = await prexzy.searchYouTube(ytQuery);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);

                    let resText = `🎬 *HASIL PENCARIAN YOUTUBE*\n🔍 Kueri: *${ytQuery}*\n\n`;
                    list.slice(0, 5).forEach((item, idx) => {
                        resText += `*${idx + 1}. ${item.title}*\n` +
                                   `👤 *Channel:* ${item.channel}\n` +
                                   `⏱️ *Durasi:* ${item.duration}\n` +
                                   `🔗 *Link:* ${item.link}\n\n`;
                    });
                    resText += `⏱️ *Waktu Respon:* ${elapsedSec} detik\n💡 Ketik *${config.prefix}ytmp3 <link>* untuk unduh audionya!`;

                    await reply(resText);
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${err.message}`);
                }
                break;
            }

            case 'imdb':
            case 'film': {
                const movieTitle = args.join(' ');
                if (!movieTitle) {
                    return await reply(`⚠️ Masukkan judul film!\nContoh: *${config.prefix}imdb Inception*`);
                }

                await sock.sendMessage(from, { react: { text: '🎬', key: m.key } });

                try {
                    const movie = await prexzy.searchImdb(movieTitle);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);

                    const caption = `🎬 *INFORMASI FILM (IMDb)*\n\n` +
                                    `📌 *Judul:* ${movie.title} (${movie.year})\n` +
                                    `⭐ *Rating:* ${movie.imdbRating || '-'} / 10\n` +
                                    `🎭 *Genre:* ${movie.genre || '-'}\n` +
                                    `🎬 *Sutradara:* ${movie.director || '-'}\n` +
                                    `👥 *Aktor:* ${movie.actors || '-'}\n` +
                                    `⏱️ *Durasi:* ${movie.runtime || '-'}\n\n` +
                                    `📖 *Sinopsis:*\n${movie.plot || '-'}\n\n` +
                                    `⏱️ *Waktu Respon:* ${elapsedSec} detik`;

                    if (movie.poster && movie.poster.startsWith('http')) {
                        await sock.sendMessage(from, { image: { url: movie.poster }, caption }, { quoted: m });
                    } else {
                        await reply(caption);
                    }
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${err.message}`);
                }
                break;
            }

            case 'apk':
            case 'modapk': {
                const apkQuery = args.join(' ');
                if (!apkQuery) {
                    return await reply(`⚠️ Masukkan nama game / aplikasi!\nContoh: *${config.prefix}apk subway surfers*`);
                }

                await sock.sendMessage(from, { react: { text: '📲', key: m.key } });

                try {
                    const results = await prexzy.searchModApk(apkQuery);
                    const list = Array.isArray(results) ? results : (results.data || []);
                    if (!list || list.length === 0) throw new Error('Aplikasi tidak ditemukan.');

                    let apkText = `📲 *HASIL PENCARIAN MOD APK*\n🔍 Kueri: *${apkQuery}*\n\n`;
                    list.slice(0, 5).forEach((item, idx) => {
                        apkText += `*${idx + 1}. ${item.title || item.name}*\n` +
                                   `⭐ *Rating:* ${item.rating || '-'}\n` +
                                   `🔗 *Link:* ${item.link || item.url}\n\n`;
                    });
                    await reply(apkText);
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${err.message}`);
                }
                break;
            }

            case 'gitsearch':
            case 'github': {
                const gitQuery = args.join(' ');
                if (!gitQuery) {
                    return await reply(`⚠️ Masukkan kata kunci pencarian GitHub!\nContoh: *${config.prefix}github whatsapp bot baileys*`);
                }

                await sock.sendMessage(from, { react: { text: '🐙', key: m.key } });

                try {
                    const gitData = await prexzy.searchGitHub(gitQuery);
                    const items = Array.isArray(gitData) ? gitData : (gitData.items || gitData.repositories || []);
                    if (!items || items.length === 0) throw new Error('Repositori tidak ditemukan.');

                    let gitText = `🐙 *HASIL PENCARIAN GITHUB*\n🔍 Kueri: *${gitQuery}*\n\n`;
                    items.slice(0, 5).forEach((repo, idx) => {
                        gitText += `*${idx + 1}. ${repo.full_name || repo.name}*\n` +
                                   `⭐ *Stars:* ${repo.stargazers_count || repo.stars || 0} • 🍴 *Forks:* ${repo.forks_count || repo.forks || 0}\n` +
                                   `📝 *Deskripsi:* ${repo.description ? repo.description.slice(0, 100) + '...' : '-'}\n` +
                                   `🔗 *Link:* ${repo.html_url || repo.url}\n\n`;
                    });
                    await reply(gitText);
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${err.message}`);
                }
                break;
            }

            // ==================== STALKING PROFIL ====================
            case 'igstalk': {
                const target = (args[0] || '').replace(/^@/, '');
                if (!target) return await reply(`⚠️ Masukkan username Instagram!\nContoh: *${config.prefix}igstalk cristiano*`);

                await sock.sendMessage(from, { react: { text: '🔍', key: m.key } });
                try {
                    const data = await prexzy.stalkInstagram(target);
                    await reply(
                        `📸 *INSTAGRAM PROFILE STALK*\n\n` +
                        `👤 *Nama:* ${data.name || '-'}\n` +
                        `🆔 *Username:* @${data.username?.replace('@', '') || target}\n` +
                        `👥 *Followers:* ${data.followers || '-'}\n` +
                        `📸 *Uploads:* ${data.uploads || '-'}\n` +
                        `🔗 *Profil:* ${data.profileUrl || `https://instagram.com/${target}`}`
                    );
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (e) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${e.message}`);
                }
                break;
            }

            case 'ytstalk': {
                const target = args[0];
                if (!target) return await reply(`⚠️ Masukkan nama channel YouTube!\nContoh: *${config.prefix}ytstalk @MrBeast*`);

                await sock.sendMessage(from, { react: { text: '🔍', key: m.key } });
                try {
                    const yt = await prexzy.stalkYouTube(target);
                    await reply(
                        `🎬 *YOUTUBE CHANNEL STALK*\n\n` +
                        `👤 *Nama:* ${yt.name || target}\n` +
                        `🆔 *Handle:* ${yt.username || target}\n` +
                        `👥 *Subscribers:* ${yt.subscriberCount || '-'}\n` +
                        `🎥 *Total Video:* ${yt.videoCount || '-'}\n` +
                        `📝 *Deskripsi:* ${yt.description ? yt.description.slice(0, 150) + '...' : '-'}`
                    );
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (e) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${e.message}`);
                }
                break;
            }

            case 'ffstalk': {
                const target = args[0];
                if (!target) return await reply(`⚠️ Masukkan ID Free Fire!\nContoh: *${config.prefix}ffstalk 12345678*`);

                await sock.sendMessage(from, { react: { text: '🎮', key: m.key } });
                try {
                    const ff = await prexzy.stalkFreeFire(target);
                    await reply(
                        `🎮 *FREE FIRE ACCOUNT STALK*\n\n` +
                        `🆔 *ID:* ${target}\n` +
                        `👤 *Nickname:* ${ff.nickname || '-'}\n` +
                        `🌍 *Region:* ${ff.region || '-'}\n` +
                        `📊 *Level:* ${ff.level || '-'}\n` +
                        `👍 *Likes:* ${ff.likes || '-'}\n` +
                        `🏆 *Rank:* ${ff.rank || '-'}`
                    );
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (e) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${e.message}`);
                }
                break;
            }

            // ==================== SCREENSHOT WEBSITE ====================
            case 'ssweb':
            case 'ss':
            case 'screenshot': {
                const webTarget = args[0] || (quoted?.conversation || quoted?.extendedTextMessage?.text || '').match(/https?:\/\/[^\s]+/)?.[0];
                if (!webTarget) {
                    return await reply(`⚠️ Masukkan URL situs web yang ingin discreenshot!\nContoh: *${config.prefix}ssweb https://google.com*`);
                }

                await sock.sendMessage(from, { react: { text: '📸', key: m.key } });
                await reply('🌐 Sedang mengambil tangkapan layar website...');

                try {
                    const ssBuffer = await prexzy.screenshotWeb(webTarget);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);

                    await sock.sendMessage(from, {
                        image: ssBuffer,
                        caption: `🌐 *SCREENSHOT WEBSITE*\n\n🔗 *URL:* ${webTarget}\n⏱️ *Waktu Respon:* ${elapsedSec} detik\n*${config.botName}*`
                    }, { quoted: m });
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${err.message}`);
                }
                break;
            }

            // ==================== TEXT MAKER (3D LOGOS) ====================
            case 'textmaker':
            case 'textpro':
            case 'blackpink':
            case 'luxury':
            case 'gold':
            case 'neon':
            case 'glitch':
            case 'gradient':
            case 'hologram':
            case 'sand':
            case 'underwater':
            case 'clouds':
            case 'papercut':
            case 'royal':
            case 'bearlogo': {
                let chosenStyle = command;
                let textToMake = text || args.join(' ');

                if (command === 'textmaker' || command === 'textpro') {
                    if (!args[0]) {
                        const styleKeys = Object.keys(prexzy.TEXT_MAKER_STYLES).slice(0, 20).join(', ');
                        return await reply(
                            `✨ *TEXT MAKER & 3D LOGO EFFECT*\n\n` +
                            `💡 *Cara Penggunaan:*\n` +
                            `• *${config.prefix}textpro <style> <teks>*\n` +
                            `• Atau gunakan langsung: *${config.prefix}blackpink <teks>*, *${config.prefix}neon <teks>*, *${config.prefix}gold <teks>*, dll.\n\n` +
                            `🎨 *Pilihan Style:* \n${styleKeys}`
                        );
                    }
                    chosenStyle = args[0].toLowerCase();
                    textToMake = args.slice(1).join(' ');
                }

                if (!textToMake.trim()) {
                    return await reply(`⚠️ Masukkan teks yang ingin dibuat!\nContoh: *${config.prefix}${command} EndLess Academy*`);
                }

                await sock.sendMessage(from, { react: { text: '🎨', key: m.key } });
                try {
                    const imgBuffer = await prexzy.generateTextMaker(chosenStyle, textToMake.trim());
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);

                    await sock.sendMessage(from, {
                        image: imgBuffer,
                        caption: `✨ *3D TEXT EFFECT (${chosenStyle.toUpperCase()})*\n\n📝 *Teks:* ${textToMake.trim()}\n⏱️ *Waktu Respon:* ${elapsedSec} detik\n*${config.botName}*`
                    }, { quoted: m });
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal membuat teks 3D: ${err.message}`);
                }
                break;
            }

            // ==================== RANDOM IMAGES ====================
            case 'random':
            case 'cat':
            case 'kucing':
            case 'dog':
            case 'anjing':
            case 'car':
            case 'mobil':
            case 'bluearchive':
            case 'boy':
            case 'cowo':
            case 'ppcouple':
            case 'avatar':
            case 'cewe':
            case 'girl': {
                let catName = command;
                if (command === 'random') {
                    catName = args[0] || 'cat';
                } else if (command === 'cewe' || command === 'girl') {
                    catName = args[0] || 'indo';
                }

                await sock.sendMessage(from, { react: { text: '🎲', key: m.key } });
                try {
                    const imgBuffer = await prexzy.getRandomImage(catName);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);

                    await sock.sendMessage(from, {
                        image: imgBuffer,
                        caption: `🎲 *RANDOM IMAGE (${catName.toUpperCase()})*\n⏱️ *Waktu Respon:* ${elapsedSec} detik\n*${config.botName}*`
                    }, { quoted: m });
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ Gagal mengambil gambar: ${err.message}`);
                }
                break;
            }

            // ==================== ONLINE COMPILER ====================
            case 'compile':
            case 'compiler': {
                const lang = args[0]?.toLowerCase();
                const code = args.slice(1).join(' ');
                const validLangs = ['python', 'js', 'javascript', 'c', 'cpp', 'csharp', 'java'];

                if (!lang || !validLangs.includes(lang) || !code.trim()) {
                    return await reply(
                        `💻 *ONLINE CODE COMPILER*\n\n` +
                        `💡 *Cara Penggunaan:*\n` +
                        `• *${config.prefix}compile <bahasa> <kode>*\n\n` +
                        `⚙️ *Bahasa yang Didukung:* \`python\`, \`js\`, \`c\`, \`cpp\`, \`java\`, \`csharp\`\n\n` +
                        `📌 *Contoh:* *${config.prefix}compile python print("Halo dari EndLess!")*`
                    );
                }

                await sock.sendMessage(from, { react: { text: '⚙️', key: m.key } });
                try {
                    const compLang = lang === 'javascript' ? 'js' : lang;
                    const res = await prexzy.compileCode(code, compLang);
                    const elapsedSec = ((Date.now() - cmdStartTime) / 1000).toFixed(2);

                    await reply(
                        `💻 *HASIL EKSEKUSI KODE (${res.language || lang.toUpperCase()})*\n\n` +
                        `📤 *Output:*\n\`\`\`\n${res.output || '(Tidak ada output)'}\n\`\`\`\n\n` +
                        `⏱️ *Waktu Respon:* ${elapsedSec} detik`
                    );
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (e) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${e.message}`);
                }
                break;
            }

            // ==================== GEOIP LOOKUP ====================
            case 'geoip': {
                const ipTarget = args[0];
                if (!ipTarget) return await reply(`⚠️ Masukkan alamat IP!\nContoh: *${config.prefix}geoip 8.8.8.8*`);

                await sock.sendMessage(from, { react: { text: '🌐', key: m.key } });
                try {
                    const geo = await prexzy.checkGeoIp(ipTarget);
                    const loc = geo.data?.location || geo.location || {};
                    const net = geo.data?.network || geo.network || {};
                    await reply(
                        `🌐 *GEOIP LOOKUP: ${ipTarget}*\n\n` +
                        `📍 *Negara:* ${loc.country || '-'} (${loc.country_code || '-'})\n` +
                        `🏙️ *Kota/Wilayah:* ${loc.city || '-'}, ${loc.region || '-'}\n` +
                        `🗺️ *Koordinat:* ${loc.latitude || '-'}, ${loc.longitude || '-'}\n` +
                        `🏢 *ISP / Org:* ${net.autonomous_system_organization || net.isp || '-'}`
                    );
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (e) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${e.message}`);
                }
                break;
            }

            // ==================== HOST / DNS CHECK ====================
            case 'hostcheck':
            case 'dns': {
                const domainTarget = args[0];
                if (!domainTarget) return await reply(`⚠️ Masukkan domain web!\nContoh: *${config.prefix}hostcheck google.com*`);

                await sock.sendMessage(from, { react: { text: '🌐', key: m.key } });
                try {
                    const hostData = await prexzy.checkHost(domainTarget);
                    const ips = hostData.web_servers?.ips ? hostData.web_servers.ips.map(i => i.ip).join(', ') : '-';
                    await reply(
                        `🌐 *HOST CHECK: ${domainTarget}*\n\n` +
                        `🖥️ *IP Server:* ${ips}\n` +
                        `📡 *IPv6 Web:* ${hostData.ipv6_support?.web ? '✅ Didukung' : '❌ Tidak'}\n` +
                        `🛡️ *Nameserver:* ${hostData.ipv6_support?.nameserver ? '✅ Didukung' : '❌ Tidak'}`
                    );
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (e) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${e.message}`);
                }
                break;
            }

            // ==================== FANCY / STYLE TEXT ====================
            case 'styletext':
            case 'fancy': {
                const rawText = text || args.join(' ');
                if (!rawText.trim()) return await reply(`⚠️ Masukkan teks yang ingin diubah gayanya!\nContoh: *${config.prefix}styletext EndLess Academy*`);

                await sock.sendMessage(from, { react: { text: '✨', key: m.key } });
                try {
                    const styles = await prexzy.getStyleText(rawText.trim());
                    let out = `✨ *VARIASI FONT & GAYA TEKS*\n\n`;
                    styles.slice(0, 15).forEach((s, idx) => {
                        out += `*${idx + 1}. ${s.style_name}:*\n${s.styled_text}\n\n`;
                    });
                    await reply(out);
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (e) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${e.message}`);
                }
                break;
            }

            // ==================== TRANSLATE ====================
            case 'tr':
            case 'translate': {
                const direction = args[0]?.toLowerCase();
                const validDirs = ['idtoen', 'entoid', 'artoid', 'jatoid', 'kotoid'];
                let dir = 'idtoen';
                let textToTr = '';

                if (validDirs.includes(direction)) {
                    dir = direction;
                    textToTr = args.slice(1).join(' ');
                } else {
                    textToTr = args.join(' ');
                }

                if (!textToTr.trim()) {
                    return await reply(
                        `🌐 *PENERJEMAH BAHASA INSTAN*\n\n` +
                        `💡 *Cara Penggunaan:*\n` +
                        `• *${config.prefix}tr <teks>* : Indonesia ke Inggris (default)\n` +
                        `• *${config.prefix}tr entoid <teks>* : Inggris ke Indonesia\n` +
                        `• *${config.prefix}tr artoid <teks>* : Arab ke Indonesia\n` +
                        `• *${config.prefix}tr jatoid <teks>* : Jepang ke Indonesia\n\n` +
                        `📌 *Contoh:* *${config.prefix}tr selamat pagi kawan*`
                    );
                }

                await sock.sendMessage(from, { react: { text: '🌐', key: m.key } });
                try {
                    const result = await prexzy.translateText(textToTr.trim(), dir);
                    await reply(`🌐 *HASIL TERJEMAHAN (${dir.toUpperCase()}):*\n\n${result}`);
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (e) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${e.message}`);
                }
                break;
            }

            // ==================== ANIME SEARCH ====================
            case 'anime':
            case 'animesearch': {
                const animeQuery = args.join(' ');
                if (!animeQuery) return await reply(`⚠️ Masukkan judul anime!\nContoh: *${config.prefix}anime solo leveling*`);

                await sock.sendMessage(from, { react: { text: '🎌', key: m.key } });
                try {
                    const list = await prexzy.searchAnime(animeQuery);
                    let out = `🎌 *HASIL PENCARIAN ANIME*\n🔍 Kueri: *${animeQuery}*\n\n`;
                    list.slice(0, 5).forEach((a, idx) => {
                        out += `*${idx + 1}. ${a.name}*\n` +
                               `🎭 *Genre:* ${a.genre || '-'}\n` +
                               `⭐ *Score:* ${a.score || '-'}\n` +
                               `🆔 *Anime ID:* \`${a.anime_id}\`\n\n`;
                    });
                    const firstPoster = list[0]?.large_poster || list[0]?.small_poster;
                    if (firstPoster && firstPoster.startsWith('http')) {
                        await sock.sendMessage(from, { image: { url: firstPoster }, caption: out }, { quoted: m });
                    } else {
                        await reply(out);
                    }
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (e) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${e.message}`);
                }
                break;
            }

            // ==================== SEPAK BOLA & OLAHRAGA LIVE ====================
            case 'bola':
            case 'livescore': {
                await sock.sendMessage(from, { react: { text: '⚽', key: m.key } });
                try {
                    const foot = await prexzy.getFootballLive();
                    const matches = foot.data?.matches || [];
                    if (matches.length === 0) {
                        return await reply(`⚽ *LIVE SCORE SEPAK BOLA*\n\nSaat ini belum ada pertandingan live yang sedang berlangsung.`);
                    }
                    let out = `⚽ *LIVE SCORE SEPAK BOLA TERKINI*\n📊 Total Laga: ${matches.length}\n\n`;
                    matches.slice(0, 10).forEach((m, idx) => {
                        out += `*${idx + 1}. ${m.home_team || 'Home'} vs ${m.away_team || 'Away'}*\n` +
                               `🏆 Skor: *${m.home_score || 0} - ${m.away_score || 0}* (${m.status || 'Live'})\n` +
                               `🏟️ Liga: ${m.league || '-'}\n\n`;
                    });
                    await reply(out);
                    await sock.sendMessage(from, { react: { text: '✅', key: m.key } });
                } catch (e) {
                    await sock.sendMessage(from, { react: { text: '❌', key: m.key } });
                    await reply(`❌ ${e.message}`);
                }
                break;
            }

            default:
                break;
        }
    } catch (err) {
        error(`Handler error: ${err.message}`);
    }
};

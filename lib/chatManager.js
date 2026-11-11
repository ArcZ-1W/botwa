const fs = require('fs');
const path = require('path');
const { imageToSticker, videoToSticker } = require('./sticker');

const dataDir = path.join(__dirname, '..', 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const chatsFile = path.join(dataDir, 'chats.json');

// Pastikan direktori tersedia
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(chatsFile)) fs.writeFileSync(chatsFile, '[]', 'utf8');

function readChats() {
    try {
        if (!fs.existsSync(chatsFile)) return [];
        const content = fs.readFileSync(chatsFile, 'utf8');
        return JSON.parse(content || '[]');
    } catch (err) {
        console.error('[CHAT_MANAGER] Gagal membaca chats.json:', err.message);
        return [];
    }
}

function writeChats(chats) {
    try {
        fs.writeFileSync(chatsFile, JSON.stringify(chats, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error('[CHAT_MANAGER] Gagal menulis ke chats.json:', err.message);
        return false;
    }
}

class ChatManager {
    static getChats(limit = 100) {
        const chats = readChats();
        return chats.slice(-limit);
    }

    static getChatById(id) {
        const chats = readChats();
        return chats.find(c => c.id === id) || null;
    }

    static async addChat({ username, text, fileData, fileName, fileType, source = 'web', replyTo = null, isSticker = false, isAudio = false, fileUrl: passedFileUrl = null }) {
        let fileUrl = passedFileUrl || null;
        let storedFileName = fileName || (passedFileUrl ? path.basename(passedFileUrl) : null);
        let detectedIsSticker = Boolean(isSticker);
        let detectedIsAudio = Boolean(isAudio);

        // Simpan lampiran file jika ada
        if (fileData) {
            try {
                let buffer;
                if (Buffer.isBuffer(fileData)) {
                    buffer = fileData;
                } else if (typeof fileData === 'string') {
                    // Deteksi jika base64 memiliki data URI prefix (e.g. data:image/png;base64,...)
                    const match = fileData.match(/^data:([^;]+);base64,/);
                    if (match && !fileType) {
                        fileType = match[1];
                    }
                    const base64Clean = fileData.replace(/^data:[^;]+;base64,/, '');
                    buffer = Buffer.from(base64Clean, 'base64');
                }

                if (buffer && buffer.length > 0) {
                    // Konversi langsung stiker yang diunggah secara direct
                    if (detectedIsSticker) {
                        try {
                            const isVid = (fileType && fileType.includes('video')) || /\.(mp4|mov|webm)$/i.test(fileName || '');
                            let stickerWebp;
                            if (isVid) {
                                stickerWebp = await videoToSticker(buffer, {
                                    packname: 'Web Academy',
                                    author: username || 'EndLess Community',
                                    duration: 10
                                });
                            } else {
                                stickerWebp = await imageToSticker(buffer, {
                                    packname: 'Web Academy',
                                    author: username || 'EndLess Community'
                                });
                            }
                            if (stickerWebp && stickerWebp.length > 0) {
                                buffer = stickerWebp;
                                fileType = 'image/webp';
                            }
                        } catch (stkErr) {
                            console.error('[CHAT_MANAGER] Gagal mengonversi direct upload sticker:', stkErr.message);
                        }
                    }

                    const cleanName = (fileName || (detectedIsSticker ? 'sticker.webp' : 'attachment')).replace(/[^a-zA-Z0-9._-]/g, '_');
                    let ext = path.extname(cleanName);
                    if (!ext) {
                        if (detectedIsSticker) ext = '.webp';
                        else if (fileType?.includes('video')) ext = '.mp4';
                        else if (fileType?.includes('image')) ext = '.png';
                        else ext = '.bin';
                    }
                    if (detectedIsSticker) ext = '.webp';

                    const baseName = path.basename(cleanName, ext);
                    const uniqueName = `${baseName}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}${ext}`;
                    const targetPath = path.join(uploadsDir, uniqueName);

                    await fs.promises.writeFile(targetPath, buffer);
                    fileUrl = `/uploads/${uniqueName}`;
                    storedFileName = fileName || uniqueName;
                }
            } catch (err) {
                console.error('[CHAT_MANAGER] Gagal menyimpan lampiran file:', err.message);
            }
        }

        // Cek jika perintah .s, .sticker, atau .stiker dengan reply ke chat bergambar / video
        let trimmedText = (text || '').trim();
        const isStickerCommand = /^\.(s|sticker|stiker)(\s.*)?$/i.test(trimmedText);

        if (isStickerCommand && replyTo && replyTo.fileUrl) {
            try {
                let mediaBuffer = null;
                const cleanRelative = replyTo.fileUrl.replace(/^https?:\/\/[^\/]+/, '').replace(/^\//, '');
                const targetFilePath = path.join(dataDir, cleanRelative);

                if (fs.existsSync(targetFilePath)) {
                    mediaBuffer = await fs.promises.readFile(targetFilePath);
                } else if (replyTo.fileUrl.startsWith('http')) {
                    const fetchRes = await fetch(replyTo.fileUrl);
                    if (fetchRes.ok) {
                        mediaBuffer = Buffer.from(await fetchRes.arrayBuffer());
                    }
                }

                if (mediaBuffer && mediaBuffer.length > 0) {
                    const isVideo = (replyTo.fileType && replyTo.fileType.includes('video')) || /\.(mp4|mov|webm)$/i.test(replyTo.fileUrl);

                    let stickerWebp;
                    if (isVideo) {
                        stickerWebp = await videoToSticker(mediaBuffer, {
                            packname: 'Web Academy',
                            author: username || 'EndLess Community',
                            duration: 10
                        });
                    } else {
                        stickerWebp = await imageToSticker(mediaBuffer, {
                            packname: 'Web Academy',
                            author: username || 'EndLess Community'
                        });
                    }

                    const stickerUniqueName = `sticker_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.webp`;
                    const stickerTargetPath = path.join(uploadsDir, stickerUniqueName);
                    await fs.promises.writeFile(stickerTargetPath, stickerWebp);

                    fileUrl = `/uploads/${stickerUniqueName}`;
                    storedFileName = stickerUniqueName;
                    fileType = 'image/webp';
                    detectedIsSticker = true;
                    trimmedText = ''; // Hapus teks perintah .s karena sudah berhasil dikonversi jadi stiker
                }
            } catch (stickerErr) {
                console.error('[CHAT_MANAGER] Gagal membuat stiker dari reply:', stickerErr.message);
            }
        }

        const now = new Date();
        const chatItem = {
            id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
            username: (username || 'Anggota Komunitas').trim().slice(0, 30),
            text: trimmedText.slice(0, 1000),
            fileUrl,
            fileName: storedFileName,
            fileType: fileType || null,
            isSticker: detectedIsSticker,
            isAudio: detectedIsAudio,
            replyTo: replyTo ? {
                id: replyTo.id,
                username: replyTo.username,
                text: (replyTo.text || '').slice(0, 120),
                fileUrl: replyTo.fileUrl || null,
                fileType: replyTo.fileType || null,
                isSticker: Boolean(replyTo.isSticker)
            } : null,
            isEdited: false,
            source,
            timestamp: now.toISOString(),
            timeStr: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        };

        const chats = readChats();
        chats.push(chatItem);

        // Batasi maksimal 500 riwayat obrolan
        if (chats.length > 500) {
            chats.splice(0, chats.length - 500);
        }

        writeChats(chats);
        return chatItem;
    }

    static editChat(id, newText, requestUser, isAdmin = false) {
        const chats = readChats();
        const item = chats.find(c => c.id === id);
        if (!item) return { success: false, message: 'Pesan tidak ditemukan' };

        // Hanya pemilik pesan atau admin yang boleh mengedit
        if (!isAdmin && item.username !== requestUser) {
            return { success: false, message: 'Kamu hanya bisa mengedit pesan milikmu sendiri' };
        }

        item.text = (newText || '').trim().slice(0, 1000);
        item.isEdited = true;
        item.editedAt = new Date().toISOString();

        writeChats(chats);
        return { success: true, chat: item };
    }

    static deleteChat(id, requestUser = null, isAdmin = false) {
        const chats = readChats();
        const index = chats.findIndex(c => c.id === id);
        if (index === -1) return { success: false, message: 'Pesan tidak ditemukan' };

        const item = chats[index];
        // Hanya pemilik atau admin yang boleh menghapus
        if (requestUser && !isAdmin && item.username !== requestUser) {
            return { success: false, message: 'Kamu hanya bisa menghapus pesan milikmu sendiri' };
        }

        const [removed] = chats.splice(index, 1);
        if (removed.fileUrl) {
            try {
                const filePath = path.join(dataDir, removed.fileUrl.replace(/^\//, ''));
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (e) {}
        }

        writeChats(chats);
        return { success: true, chat: removed };
    }

    static async makeSticker({ fileData, mediaUrl, isVideo = false, username = 'EndLess' }) {
        try {
            let buffer;
            if (fileData) {
                const base64Clean = fileData.replace(/^data:[^;]+;base64,/, '');
                buffer = Buffer.from(base64Clean, 'base64');
            } else if (mediaUrl) {
                const targetFilePath = path.join(dataDir, mediaUrl.replace(/^\//, ''));
                if (fs.existsSync(targetFilePath)) {
                    buffer = await fs.promises.readFile(targetFilePath);
                }
            }

            if (!buffer || buffer.length === 0) {
                throw new Error('Data gambar/video tidak ditemukan');
            }

            let webpBuffer;
            if (isVideo) {
                webpBuffer = await videoToSticker(buffer, {
                    packname: 'Web Academy',
                    author: username || 'EndLess Community',
                    duration: 10
                });
            } else {
                webpBuffer = await imageToSticker(buffer, {
                    packname: 'Web Academy',
                    author: username || 'EndLess Community'
                });
            }

            const stickerName = `sticker_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.webp`;
            const targetPath = path.join(uploadsDir, stickerName);
            await fs.promises.writeFile(targetPath, webpBuffer);

            return {
                success: true,
                fileUrl: `/uploads/${stickerName}`,
                fileName: stickerName,
                isSticker: true
            };
        } catch (err) {
            console.error('[CHAT_MANAGER] Gagal membuat stiker:', err.message);
            return { success: false, message: err.message };
        }
    }

    static clearChats() {
        writeChats([]);
        return true;
    }
}

module.exports = ChatManager;

/**
 * Only Chats Manager Module: Filter chat yang diizinkan dibaca & direspon oleh bot
 * Mendukung multiple chat/grup (berlaku lebih dari satu)
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ONLY_FILE = path.join(DATA_DIR, 'only_chats.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadData() {
    try {
        if (fs.existsSync(ONLY_FILE)) {
            return JSON.parse(fs.readFileSync(ONLY_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading only_chats.json:', e.message);
    }
    return {
        enabled: false,
        chats: [] // Array of { jid, name, addedAt }
    };
}

function saveData(data) {
    try {
        fs.writeFileSync(ONLY_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving only_chats.json:', e.message);
    }
}

class OnlyManager {
    constructor() {
        this.data = loadData();
    }

    /**
     * Cek apakah mode only aktif
     */
    isEnabled() {
        return !!this.data.enabled;
    }

    /**
     * Cek apakah suatu chatJid diizinkan untuk direspon oleh sistem
     * @param {string} chatJid
     * @param {boolean} isOwner - Jika pemilik bot, selalu diizinkan agar tidak terkunci
     */
    isAllowed(chatJid, isOwner = false) {
        if (isOwner) return true;
        if (!this.data.enabled) return true; // Jika fitur .only nonaktif, semua chat diizinkan
        if (!this.data.chats || this.data.chats.length === 0) return true;

        return this.data.chats.some(c => c.jid === chatJid);
    }

    /**
     * Tambah chat/grup ke daftar only
     */
    addChat(chatJid, name = 'Chat') {
        const exists = this.data.chats.find(c => c.jid === chatJid);
        if (exists) {
            exists.name = name;
        } else {
            this.data.chats.push({
                jid: chatJid,
                name: name,
                addedAt: new Date().toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                })
            });
        }
        // Otomatis aktifkan filter jika belum aktif
        this.data.enabled = true;
        saveData(this.data);
        return this.data.chats.length;
    }

    /**
     * Hapus chat/grup dari daftar only
     */
    removeChat(chatJid) {
        const initialLen = this.data.chats.length;
        this.data.chats = this.data.chats.filter(c => c.jid !== chatJid);
        saveData(this.data);
        return this.data.chats.length < initialLen;
    }

    /**
     * Aktifkan / Nonaktifkan fitur only
     */
    setEnabled(bool) {
        this.data.enabled = !!bool;
        saveData(this.data);
        return this.data.enabled;
    }

    /**
     * Dapatkan semua chat dalam daftar only
     */
    getList() {
        return {
            enabled: this.data.enabled,
            total: this.data.chats.length,
            chats: [...this.data.chats]
        };
    }

    /**
     * Kosongkan seluruh daftar
     */
    clearAll() {
        this.data.chats = [];
        this.data.enabled = false;
        saveData(this.data);
        return true;
    }
}

const onlyManagerInstance = new OnlyManager();
module.exports = onlyManagerInstance;

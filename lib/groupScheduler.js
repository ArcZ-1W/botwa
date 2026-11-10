/**
 * Group Scheduler Module: Buka & Tutup Grup Otomatis Berdasarkan Jam
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SCHEDULE_FILE = path.join(DATA_DIR, 'group_schedules.json');

// Pastikan direktori data ada
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadSchedules() {
    try {
        if (fs.existsSync(SCHEDULE_FILE)) {
            return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading group_schedules.json:', e.message);
    }
    return {};
}

function saveSchedules(data) {
    try {
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving group_schedules.json:', e.message);
    }
}

class GroupScheduler {
    constructor() {
        this.schedules = loadSchedules();
        this.timer = null;
        this.sock = null;
    }

    /**
     * Hubungkan instance socket Baileys
     */
    init(sock) {
        this.sock = sock;
        if (this.timer) clearInterval(this.timer);

        // Periksa setiap 30 detik
        this.timer = setInterval(() => this.checkSchedules(), 30000);
        this.checkSchedules();
    }

    /**
     * Dapatkan jam sekarang dalam format HH:mm (WIB)
     */
    getCurrentWIB() {
        const now = new Date();
        const parts = new Intl.DateTimeFormat('id-ID', {
            timeZone: 'Asia/Jakarta',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).formatToParts(now);

        const hour = parts.find(p => p.type === 'hour')?.value || '00';
        const minute = parts.find(p => p.type === 'minute')?.value || '00';
        const dateStr = now.toISOString().slice(0, 10);

        return {
            time: `${hour}:${minute}`,
            date: dateStr
        };
    }

    /**
     * Setel jadwal buka atau tutup untuk suatu grup
     */
    setSchedule(groupId, groupName, type, timeStr) {
        // Validasi format HH:mm
        const match = timeStr.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/);
        if (!match) {
            throw new Error('Format jam salah! Gunakan format 24 jam HH:mm (contoh: 22:00 atau 06:00)');
        }

        const normalizedTime = `${match[1].padStart(2, '0')}:${match[2]}`;

        if (!this.schedules[groupId]) {
            this.schedules[groupId] = {
                groupName: groupName || 'Grup WhatsApp',
                buka: null,
                tutup: null,
                lastTriggerBuka: null,
                lastTriggerTutup: null
            };
        }

        if (type === 'buka') {
            this.schedules[groupId].buka = normalizedTime;
        } else if (type === 'tutup') {
            this.schedules[groupId].tutup = normalizedTime;
        }
        if (groupName) this.schedules[groupId].groupName = groupName;

        saveSchedules(this.schedules);
        return normalizedTime;
    }

    /**
     * Dapatkan jadwal grup tertentu
     */
    getSchedule(groupId) {
        return this.schedules[groupId] || null;
    }

    /**
     * Hapus jadwal grup
     */
    removeSchedule(groupId, type = 'all') {
        if (!this.schedules[groupId]) return false;

        if (type === 'buka') {
            this.schedules[groupId].buka = null;
        } else if (type === 'tutup') {
            this.schedules[groupId].tutup = null;
        } else {
            delete this.schedules[groupId];
        }

        saveSchedules(this.schedules);
        return true;
    }

    /**
     * Cek dan eksekusi buka/tutup grup otomatis
     */
    async checkSchedules() {
        if (!this.sock) return;

        const { time, date } = this.getCurrentWIB();
        const groups = Object.keys(this.schedules);

        for (const gid of groups) {
            const item = this.schedules[gid];
            if (!item) continue;

            // Trigger Tutup Grup
            if (item.tutup === time && item.lastTriggerTutup !== `${date}_${time}`) {
                item.lastTriggerTutup = `${date}_${time}`;
                saveSchedules(this.schedules);

                try {
                    // Hanya admin yang bisa kirim pesan
                    await this.sock.groupSettingUpdate(gid, 'announcement');
                    await this.sock.sendMessage(gid, {
                        text: `🔒 *JADWAL GRUP - DITUTUP OTOMATIS*\n\n` +
                              `⏰ *Waktu:* ${time} WIB\n` +
                              `📋 Grup telah ditutup otomatis sesuai jadwal malam.\n` +
                              `Hanya Admin yang dapat mengirim pesan saat ini. Selamat beristirahat! 💤`
                    });
                } catch (err) {
                    console.error(`[Scheduler] Gagal menutup grup ${gid}:`, err.message);
                }
            }

            // Trigger Buka Grup
            if (item.buka === time && item.lastTriggerBuka !== `${date}_${time}`) {
                item.lastTriggerBuka = `${date}_${time}`;
                saveSchedules(this.schedules);

                try {
                    // Semua anggota bisa kirim pesan
                    await this.sock.groupSettingUpdate(gid, 'not_announcement');
                    await this.sock.sendMessage(gid, {
                        text: `🔓 *JADWAL GRUP - DIBUKA OTOMATIS*\n\n` +
                              `⏰ *Waktu:* ${time} WIB\n` +
                              `☀️ Selamat pagi! Grup telah dibuka kembali sesuai jadwal.\n` +
                              `Semua anggota sekarang dapat berdiskusi. Mohon tetap jaga ketertiban bersama! ✨`
                    });
                } catch (err) {
                    console.error(`[Scheduler] Gagal membuka grup ${gid}:`, err.message);
                }
            }
        }
    }
}

const schedulerInstance = new GroupScheduler();
module.exports = schedulerInstance;

const fs = require('fs');
const path = require('path');

const COMBOS_FILE = path.join(__dirname, '..', 'data', 'combos.json');

// Map sesi interaktif pending combo send: key `${from}_${sender}`
const pendingSessions = new Map();

/**
 * Normalisasi teks untuk pencarian fuzzy (hilangkan simbol, spasi, lowercase)
 */
function normalizeText(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Baca semua combo dari file database data/combos.json
 */
function readCombos() {
    try {
        if (!fs.existsSync(COMBOS_FILE)) {
            fs.writeFileSync(COMBOS_FILE, '[]', 'utf-8');
            return [];
        }
        const data = fs.readFileSync(COMBOS_FILE, 'utf-8');
        const list = JSON.parse(data);
        return Array.isArray(list) ? list : [];
    } catch (e) {
        console.error('Gagal membaca combos.json:', e.message);
        return [];
    }
}

/**
 * Simpan daftar combo ke data/combos.json
 */
function writeCombos(combos) {
    try {
        const dir = path.dirname(COMBOS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(COMBOS_FILE, JSON.stringify(combos, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error('Gagal menulis combos.json:', e.message);
        return false;
    }
}

/**
 * Inisialisasi seed default jika database masih kosong
 */
function initDefaultCombos() {
    const current = readCombos();
    if (current.length === 0) {
        const defaultSeeds = [
            {
                id: 1,
                title: "One Shot Kitsune Sanguine",
                build: "Kitsune, Sanguine Art, CDK, Soul Guitar",
                sequence: "Kitsune C -> Sanguine C -> Kitsune F -> Sanguine Z -> Sanguine X -> CDK Z -> Tap -> CDK X -> Soul Guitar X",
                description: "Pastikan Ken lawan pecah di awal dengan Kitsune C untuk garansi kill instan.",
                rawText: "Judul: One Shot Kitsune Sanguine\nBuild: Sanguine, Kitsune, CDK, Soul Guitar\nUrutan: Kitsune C -> Sanguine C -> Kitsune F -> Sanguine Z -> Sanguine X -> CDK Z -> Tap -> CDK X -> Soul Guitar X",
                sender: "Admin",
                senderNumber: "System",
                createdAt: new Date().toLocaleString('id-ID')
            },
            {
                id: 2,
                title: "Godhuman Portal CDK Combo",
                build: "Portal, Godhuman, CDK, Soul Guitar",
                sequence: "Portal V -> Soul Guitar Z -> Portal X -> Godhuman Z -> Godhuman C -> CDK Z -> CDK X -> Godhuman X",
                description: "Combo dimensional rift super lincah dengan lock stun bertubi-tubi.",
                rawText: "Judul: Godhuman Portal CDK Combo\nBuild: Portal, Godhuman, CDK, Soul Guitar\nUrutan: Portal V -> Soul Guitar Z -> Portal X -> Godhuman Z -> Godhuman C -> CDK Z -> CDK X -> Godhuman X",
                sender: "Admin",
                senderNumber: "System",
                createdAt: new Date().toLocaleString('id-ID')
            },
            {
                id: 3,
                title: "Dough Sanguine Art One Combo",
                build: "Dough (Awakened), Sanguine Art, CDK, Kabucha",
                sequence: "Dough X -> Dough V -> Sanguine C -> Sanguine Z -> Dough C -> CDK Z -> Sanguine X",
                description: "Kombo adonan mematikan dengan penutup Sanguine Art lifesteal.",
                rawText: "Judul: Dough Sanguine Art One Combo\nBuild: Dough, Sanguine Art, CDK, Kabucha\nUrutan: Dough X -> Dough V -> Sanguine C -> Sanguine Z -> Dough C -> CDK Z -> Sanguine X",
                sender: "Admin",
                senderNumber: "System",
                createdAt: new Date().toLocaleString('id-ID')
            }
        ];
        writeCombos(defaultSeeds);
    }
}

// Inisialisasi seed awal saat modul dimuat
initDefaultCombos();

/**
 * Parsing teks mentah yang dikirim user menjadi struktur combo yang rapi
 */
function parseRawCombo(rawText) {
    const text = (rawText || '').trim();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    let title = '';
    let build = '';
    let sequence = '';
    let description = '';

    // Cek format terstruktur
    lines.forEach(line => {
        const lower = line.toLowerCase();
        if (lower.startsWith('judul:') || lower.startsWith('title:')) {
            title = line.replace(/^(judul|title):\s*/i, '').trim();
        } else if (lower.startsWith('build:') || lower.startsWith('perlengkapan:') || lower.startsWith('gear:')) {
            build = line.replace(/^(build|perlengkapan|gear):\s*/i, '').trim();
        } else if (lower.startsWith('urutan:') || lower.startsWith('combo:') || lower.startsWith('sequence:')) {
            sequence = line.replace(/^(urutan|combo|sequence):\s*/i, '').trim();
        } else if (lower.startsWith('deskripsi:') || lower.startsWith('desc:') || lower.startsWith('catatan:')) {
            description = line.replace(/^(deskripsi|desc|catatan):\s*/i, '').trim();
        }
    });

    // Jika user mengirim teks bebas tanpa format:
    if (!sequence) {
        if (lines.length === 1) {
            // Teks satu baris
            title = 'Kombo PvP Blox Fruits';
            sequence = lines[0];
        } else {
            // Baris 1 dianggap judul jika pendek
            if (lines[0].length < 40 && !lines[0].includes('->') && !lines[0].includes('>')) {
                title = lines[0];
                sequence = lines.slice(1).join(' -> ');
            } else {
                title = 'Kombo PvP Blox Fruits';
                sequence = lines.join(' -> ');
            }
        }
    }

    if (!title) {
        title = build ? `Combo ${build}` : 'Combo Blox Fruits PvP';
    }

    // Deteksi build otomatis dari teks jika build belum terisi
    if (!build) {
        const detected = [];
        const full = text.toLowerCase();
        const catalog = [
            'kitsune', 'dough', 'portal', 'dragon', 'leopard', 't-rex', 'spirit', 'venom', 'shadow',
            'blizzard', 'buddha', 'magma', 'ice', 'light', 'dark', 'flame', 'mammoth', 'sound',
            'sanguine art', 'sanguine', 'godhuman', 'electric claw', 'dragon talon', 'death step', 'sharkman karate',
            'cursed dual katana', 'cdk', 'shark anchor', 'true triple katana', 'ttk', 'hallow scythe', 'dark blade',
            'soul guitar', 'kabucha', 'acidum rifle', 'bizarre rifle', 'serpent bow'
        ];

        catalog.forEach(item => {
            if (full.includes(item)) {
                // Jangan duplikasi varian singkat jika sudah ada versi panjangnya
                if (item === 'sanguine' && detected.includes('sanguine art')) return;
                if (item === 'cdk' && detected.includes('cursed dual katana')) return;
                detected.push(item.toUpperCase());
            }
        });

        if (detected.length > 0) {
            build = detected.slice(0, 5).join(', ');
        } else {
            build = 'Universal Build';
        }
    }

    return {
        title,
        build,
        sequence,
        description,
        rawText: text
    };
}

/**
 * Simpan combo baru ke database
 */
function saveNewCombo({ rawText, sender, senderNumber }) {
    const combos = readCombos();
    const parsed = parseRawCombo(rawText);

    const newId = combos.length > 0 ? (Math.max(...combos.map(c => Number(c.id) || 0)) + 1) : 1;

    const newCombo = {
        id: newId,
        title: parsed.title,
        build: parsed.build,
        sequence: parsed.sequence,
        description: parsed.description,
        rawText: parsed.rawText,
        sender: sender || 'Anonim',
        senderNumber: senderNumber || 'System',
        createdAt: new Date().toLocaleString('id-ID')
    };

    combos.unshift(newCombo); // Simpan di urutan teratas
    writeCombos(combos);
    return newCombo;
}

/**
 * Cari combo berdasarkan kata kunci
 */
function searchCombos(query) {
    const combos = readCombos();
    if (!query || !query.trim() || query.trim().toLowerCase() === 'all' || query.trim().toLowerCase() === 'semua') {
        return combos;
    }

    const rawKeywords = query.trim().toLowerCase().split(/[\s,]+/);
    const normalizedKeywords = rawKeywords.map(k => normalizeText(k)).filter(Boolean);

    return combos.filter(combo => {
        const fullComboText = `${combo.title} ${combo.build} ${combo.sequence} ${combo.description || ''} ${combo.rawText || ''}`.toLowerCase();
        const normalizedFull = normalizeText(fullComboText);

        // Cocokkan jika salah satu kata kunci ditemukan
        return normalizedKeywords.some(kw => {
            return normalizedFull.includes(kw);
        });
    });
}

/**
 * Format hasil pencarian combo menjadi teks WhatsApp yang rapi
 */
function formatComboList(combos, query = '') {
    if (!combos || combos.length === 0) {
        return `❌ *COMBO TIDAK DITEMUKAN*\n\n` +
               `Tidak ada combo yang cocok dengan kata kunci *"${query}"*.\n\n` +
               `💡 *Saran Pencarian:*\n` +
               `• Coba gunakan nama buah / fighting style: *kitsune*, *sanguine*, *portal*, *dough*, *cdk*, *godhuman*, dll.\n` +
               `• Ketik *.combo get* untuk melihat seluruh daftar combo yang tersedia.\n` +
               `• Atau daftarkan combo Anda sendiri dengan mengetik *.combo send*.`;
    }

    let out = `⚔️ *DAFTAR COMBO BLOX FRUITS PVP*\n`;
    if (query && query !== 'all' && query !== 'semua') {
        out += `🔍 *Kueri Pencarian:* "${query}"\n`;
    }
    out += `📊 *Total Ditemukan:* ${combos.length} Combo\n`;
    out += `─────────────────────────\n\n`;

    combos.slice(0, 10).forEach((c, idx) => {
        out += `*${idx + 1}. ${c.title.toUpperCase()}* (ID: #${c.id})\n` +
               `🛡️ *Build:* ${c.build}\n` +
               `⚡ *Urutan Combo:*\n\`\`\`${c.sequence}\`\`\`\n` +
               (c.description ? `📝 *Tips:* ${c.description}\n` : '') +
               `👤 *Ditambahkan oleh:* ${c.senderNumber === 'System' ? 'System' : `@${c.senderNumber}`} • 📅 ${c.createdAt}\n` +
               `─────────────────────────\n\n`;
    });

    if (combos.length > 10) {
        out += `_... dan ${combos.length - 10} combo lainnya. Persempit kata kunci pencarian Anda untuk melihat lebih detail._\n\n`;
    }

    out += `💡 *Ingin menambah combo baru?* Ketik *.combo send*`;
    return out;
}

// ==================== INTERACTIVE SESSION ====================

function setPendingSession(from, sender, promptMsgKey) {
    const key = `${from}_${sender}`;
    pendingSessions.set(key, {
        from,
        sender,
        promptMsgKey,
        createdAt: Date.now()
    });

    // Auto timeout setelah 3 menit jika tidak dibalas
    setTimeout(() => {
        if (pendingSessions.has(key)) {
            pendingSessions.delete(key);
        }
    }, 180000);
}

function getPendingSession(from, sender) {
    const key = `${from}_${sender}`;
    return pendingSessions.get(key);
}

function hasPendingSession(from, sender) {
    const key = `${from}_${sender}`;
    return pendingSessions.has(key);
}

function removePendingSession(from, sender) {
    const key = `${from}_${sender}`;
    return pendingSessions.delete(key);
}

module.exports = {
    readCombos,
    saveNewCombo,
    searchCombos,
    formatComboList,
    setPendingSession,
    getPendingSession,
    hasPendingSession,
    removePendingSession
};

/**
 * Alkitab & Renungan Module
 * Fitur:
 * - Pencarian Kitab & Bab (.alkitab <kitab> -> info & daftar bab)
 * - Baca Bab (.alkitab <kitab> <bab> -> ayat & perikop)
 * - Baca Ayat Spesifik (.alkitab <kitab> <bab>:<ayat> atau <ayat_awal>-<ayat_akhir>)
 * - Cari Ayat Alkitab (.alkitab cari <kata kunci>)
 * - Renungan Harian Resmi (.renungan)
 * - AI Renungan Rohani (.renungan <topik / ayat>)
 */

const https = require('https');
const http = require('http');

/**
 * HTTP GET Helper dengan IPv4 (family: 4) untuk mencegah issue DNS timeout Windows
 */
function httpGet(url, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        try {
            const u = new URL(url);
            const client = u.protocol === 'https:' ? https : http;
            const req = client.get(url, {
                family: 4,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Connection': 'close',
                    'Accept': '*/*'
                },
                timeout: timeoutMs
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 400) {
                        resolve(data);
                    } else {
                        reject(new Error(`HTTP Status ${res.statusCode}`));
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Request timeout (${timeoutMs}ms)`));
            });

            req.on('error', (err) => reject(err));
        } catch (err) {
            reject(err);
        }
    });
}

// 66 Kitab Alkitab (Lembaga Alkitab Indonesia / Terjemahan Baru)
const BIBLE_BOOKS = [
    // Perjanjian Lama (39 Kitab)
    { name: 'Kejadian', abbr: 'Kej', chapters: 50, testament: 'Perjanjian Lama', group: 'Taurat Musa', aliases: ['kejadian', 'kej', 'genesis', 'gen'] },
    { name: 'Keluaran', abbr: 'Kel', chapters: 40, testament: 'Perjanjian Lama', group: 'Taurat Musa', aliases: ['keluaran', 'kel', 'exodus', 'exo'] },
    { name: 'Imamat', abbr: 'Im', chapters: 27, testament: 'Perjanjian Lama', group: 'Taurat Musa', aliases: ['imamat', 'im', 'leviticus', 'lev'] },
    { name: 'Bilangan', abbr: 'Bil', chapters: 36, testament: 'Perjanjian Lama', group: 'Taurat Musa', aliases: ['bilangan', 'bil', 'numbers', 'num'] },
    { name: 'Ulangan', abbr: 'Ul', chapters: 34, testament: 'Perjanjian Lama', group: 'Taurat Musa', aliases: ['ulangan', 'ul', 'deuteronomy', 'deut'] },
    { name: 'Yosua', abbr: 'Yos', chapters: 24, testament: 'Perjanjian Lama', group: 'Sejarah', aliases: ['yosua', 'yos', 'joshua', 'josh'] },
    { name: 'Hakim-hakim', abbr: 'Hak', chapters: 21, testament: 'Perjanjian Lama', group: 'Sejarah', aliases: ['hakim-hakim', 'hakim', 'hak', 'judges'] },
    { name: 'Rut', abbr: 'Rut', chapters: 4, testament: 'Perjanjian Lama', group: 'Sejarah', aliases: ['rut', 'ruth'] },
    { name: '1 Samuel', abbr: '1Sa', chapters: 31, testament: 'Perjanjian Lama', group: 'Sejarah', aliases: ['1samuel', '1sam', '1sa', '1 samuel'] },
    { name: '2 Samuel', abbr: '2Sa', chapters: 24, testament: 'Perjanjian Lama', group: 'Sejarah', aliases: ['2samuel', '2sam', '2sa', '2 samuel'] },
    { name: '1 Raja-raja', abbr: '1Ra', chapters: 22, testament: 'Perjanjian Lama', group: 'Sejarah', aliases: ['1raja-raja', '1raj', '1ra', '1raja', '1 kings'] },
    { name: '2 Raja-raja', abbr: '2Ra', chapters: 25, testament: 'Perjanjian Lama', group: 'Sejarah', aliases: ['2raja-raja', '2raj', '2ra', '2raja', '2 kings'] },
    { name: '1 Tawarikh', abbr: '1Ta', chapters: 29, testament: 'Perjanjian Lama', group: 'Sejarah', aliases: ['1tawarikh', '1taw', '1ta', '1 chronicles'] },
    { name: '2 Tawarikh', abbr: '2Ta', chapters: 36, testament: 'Perjanjian Lama', group: 'Sejarah', aliases: ['2tawarikh', '2taw', '2ta', '2 chronicles'] },
    { name: 'Ezra', abbr: 'Ezr', chapters: 10, testament: 'Perjanjian Lama', group: 'Sejarah', aliases: ['ezra', 'ezr'] },
    { name: 'Nehemia', abbr: 'Neh', chapters: 13, testament: 'Perjanjian Lama', group: 'Sejarah', aliases: ['nehemia', 'neh', 'nehemiah'] },
    { name: 'Ester', abbr: 'Est', chapters: 10, testament: 'Perjanjian Lama', group: 'Sejarah', aliases: ['ester', 'est', 'esther'] },
    { name: 'Ayub', abbr: 'Ayb', chapters: 42, testament: 'Perjanjian Lama', group: 'Puisi & Hikmat', aliases: ['ayub', 'ayb', 'job'] },
    { name: 'Mazmur', abbr: 'Mzm', chapters: 150, testament: 'Perjanjian Lama', group: 'Puisi & Pujian', aliases: ['mazmur', 'mzm', 'psalms', 'psalm', 'ps'] },
    { name: 'Amsal', abbr: 'Ams', chapters: 31, testament: 'Perjanjian Lama', group: 'Puisi & Hikmat', aliases: ['amsal', 'ams', 'proverbs', 'prov'] },
    { name: 'Pengkhotbah', abbr: 'Pkh', chapters: 12, testament: 'Perjanjian Lama', group: 'Puisi & Hikmat', aliases: ['pengkhotbah', 'pkh', 'ecclesiastes', 'eccl'] },
    { name: 'Kidung Agung', abbr: 'Kid', chapters: 8, testament: 'Perjanjian Lama', group: 'Puisi', aliases: ['kidung agung', 'kidung', 'kid', 'song of solomon', 'song'] },
    { name: 'Yesaya', abbr: 'Yes', chapters: 66, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Besar', aliases: ['yesaya', 'yes', 'isaiah', 'isa'] },
    { name: 'Yeremia', abbr: 'Yer', chapters: 52, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Besar', aliases: ['yeremia', 'yer', 'jeremiah', 'jer'] },
    { name: 'Ratapan', abbr: 'Rat', chapters: 5, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Besar', aliases: ['ratapan', 'rat', 'lamentations', 'lam'] },
    { name: 'Yehezkiel', abbr: 'Yeh', chapters: 48, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Besar', aliases: ['yehezkiel', 'yeh', 'ezekiel', 'ezek'] },
    { name: 'Daniel', abbr: 'Dan', chapters: 12, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Besar', aliases: ['daniel', 'dan'] },
    { name: 'Hosea', abbr: 'Hos', chapters: 14, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Kecil', aliases: ['hosea', 'hos'] },
    { name: 'Yoel', abbr: 'Yol', chapters: 3, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Kecil', aliases: ['yoel', 'yol', 'joel'] },
    { name: 'Amos', abbr: 'Amo', chapters: 9, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Kecil', aliases: ['amos', 'amo'] },
    { name: 'Obaja', abbr: 'Oba', chapters: 1, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Kecil', aliases: ['obaja', 'oba', 'obadiah'] },
    { name: 'Yunus', abbr: 'Yun', chapters: 4, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Kecil', aliases: ['yunus', 'yun', 'jonah'] },
    { name: 'Mikha', abbr: 'Mik', chapters: 7, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Kecil', aliases: ['mikha', 'mik', 'micah'] },
    { name: 'Nahum', abbr: 'Nah', chapters: 3, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Kecil', aliases: ['nahum', 'nah'] },
    { name: 'Habakuk', abbr: 'Hab', chapters: 3, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Kecil', aliases: ['habakuk', 'hab', 'habakkuk'] },
    { name: 'Zefanya', abbr: 'Zef', chapters: 3, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Kecil', aliases: ['zefanya', 'zef', 'zephaniah'] },
    { name: 'Hagai', abbr: 'Hag', chapters: 2, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Kecil', aliases: ['hagai', 'hag', 'haggai'] },
    { name: 'Zakharia', abbr: 'Zak', chapters: 14, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Kecil', aliases: ['zakharia', 'zak', 'zechariah'] },
    { name: 'Maleakhi', abbr: 'Mal', chapters: 4, testament: 'Perjanjian Lama', group: 'Nabi-Nabi Kecil', aliases: ['maleakhi', 'mal', 'malachi'] },

    // Perjanjian Baru (27 Kitab)
    { name: 'Matius', abbr: 'Mat', chapters: 28, testament: 'Perjanjian Baru', group: 'Injil', aliases: ['matius', 'mat', 'matthew', 'matt'] },
    { name: 'Markus', abbr: 'Mrk', chapters: 16, testament: 'Perjanjian Baru', group: 'Injil', aliases: ['markus', 'mrk', 'mark', 'mar'] },
    { name: 'Lukas', abbr: 'Luk', chapters: 24, testament: 'Perjanjian Baru', group: 'Injil', aliases: ['lukas', 'luk', 'luke'] },
    { name: 'Yohanes', abbr: 'Yoh', chapters: 21, testament: 'Perjanjian Baru', group: 'Injil', aliases: ['yohanes', 'yoh', 'john'] },
    { name: 'Kisah Para Rasul', abbr: 'Kis', chapters: 28, testament: 'Perjanjian Baru', group: 'Sejarah Gereja', aliases: ['kisah para rasul', 'kisah', 'kis', 'acts'] },
    { name: 'Roma', abbr: 'Rom', chapters: 16, testament: 'Perjanjian Baru', group: 'Surat Paulus', aliases: ['roma', 'rom', 'romans'] },
    { name: '1 Korintus', abbr: '1Ko', chapters: 16, testament: 'Perjanjian Baru', group: 'Surat Paulus', aliases: ['1korintus', '1kor', '1ko', '1 corinthians'] },
    { name: '2 Korintus', abbr: '2Ko', chapters: 13, testament: 'Perjanjian Baru', group: 'Surat Paulus', aliases: ['2korintus', '2kor', '2ko', '2 corinthians'] },
    { name: 'Galatia', abbr: 'Gal', chapters: 6, testament: 'Perjanjian Baru', group: 'Surat Paulus', aliases: ['galatia', 'gal', 'galatians'] },
    { name: 'Efesus', abbr: 'Efe', chapters: 6, testament: 'Perjanjian Baru', group: 'Surat Paulus', aliases: ['efesus', 'efe', 'ef', 'ephesians'] },
    { name: 'Filipi', abbr: 'Flp', chapters: 4, testament: 'Perjanjian Baru', group: 'Surat Paulus', aliases: ['filipi', 'flp', 'philippians'] },
    { name: 'Kolose', abbr: 'Kol', chapters: 4, testament: 'Perjanjian Baru', group: 'Surat Paulus', aliases: ['kolose', 'kol', 'colossians'] },
    { name: '1 Tesalonika', abbr: '1Te', chapters: 5, testament: 'Perjanjian Baru', group: 'Surat Paulus', aliases: ['1tesalonika', '1tes', '1te', '1 thessalonians'] },
    { name: '2 Tesalonika', abbr: '2Te', chapters: 3, testament: 'Perjanjian Baru', group: 'Surat Paulus', aliases: ['2tesalonika', '2tes', '2te', '2 thessalonians'] },
    { name: '1 Timotius', abbr: '1Ti', chapters: 6, testament: 'Perjanjian Baru', group: 'Surat Pastoral', aliases: ['1timotius', '1tim', '1ti', '1 timothy'] },
    { name: '2 Timotius', abbr: '2Ti', chapters: 4, testament: 'Perjanjian Baru', group: 'Surat Pastoral', aliases: ['2timotius', '2tim', '2ti', '2 timothy'] },
    { name: 'Titus', abbr: 'Tit', chapters: 3, testament: 'Perjanjian Baru', group: 'Surat Pastoral', aliases: ['titus', 'tit'] },
    { name: 'Filemon', abbr: 'Flm', chapters: 1, testament: 'Perjanjian Baru', group: 'Surat Paulus', aliases: ['filemon', 'flm', 'philemon'] },
    { name: 'Ibrani', abbr: 'Ibr', chapters: 13, testament: 'Perjanjian Baru', group: 'Surat Am', aliases: ['ibrani', 'ibr', 'hebrews'] },
    { name: 'Yakobus', abbr: 'Yak', chapters: 5, testament: 'Perjanjian Baru', group: 'Surat Am', aliases: ['yakobus', 'yak', 'james'] },
    { name: '1 Petrus', abbr: '1Pe', chapters: 5, testament: 'Perjanjian Baru', group: 'Surat Am', aliases: ['1petrus', '1pet', '1pe', '1 peter'] },
    { name: '2 Petrus', abbr: '2Pe', chapters: 3, testament: 'Perjanjian Baru', group: 'Surat Am', aliases: ['2petrus', '2pet', '2pe', '2 peter'] },
    { name: '1 Yohanes', abbr: '1Yo', chapters: 5, testament: 'Perjanjian Baru', group: 'Surat Am', aliases: ['1yohanes', '1yoh', '1yo', '1 john'] },
    { name: '2 Yohanes', abbr: '2Yo', chapters: 1, testament: 'Perjanjian Baru', group: 'Surat Am', aliases: ['2yohanes', '2yoh', '2yo', '2 john'] },
    { name: '3 Yohanes', abbr: '3Yo', chapters: 1, testament: 'Perjanjian Baru', group: 'Surat Am', aliases: ['3yohanes', '3yoh', '3yo', '3 john'] },
    { name: 'Yudas', abbr: 'Yud', chapters: 1, testament: 'Perjanjian Baru', group: 'Surat Am', aliases: ['yudas', 'yud', 'jude'] },
    { name: 'Wahyu', abbr: 'Wah', chapters: 22, testament: 'Perjanjian Baru', group: 'Nubuat / Apokaliptik', aliases: ['wahyu', 'wah', 'revelation', 'rev'] }
];

/**
 * Cari kitab berdasarkan nama atau singkatan
 * @param {string} query
 */
function findBook(query) {
    if (!query) return null;
    const clean = query.trim().toLowerCase().replace(/\s+/g, ' ');
    
    // Exact match pada aliases atau nama
    for (const b of BIBLE_BOOKS) {
        if (b.name.toLowerCase() === clean || b.abbr.toLowerCase() === clean) return b;
        if (b.aliases.includes(clean)) return b;
    }

    // Match jika query ada di awal nama (contoh: "luk" -> "lukas")
    for (const b of BIBLE_BOOKS) {
        if (b.name.toLowerCase().startsWith(clean)) return b;
        if (b.aliases.some(a => a.startsWith(clean))) return b;
    }

    return null;
}

/**
 * Format teks bab menjadi daftar bab yang rapi
 * @param {object} book
 */
function formatBookChapters(book) {
    let result = `📖 *KITAB ${book.name.toUpperCase()}*\n`;
    result += `─────────────────────────\n`;
    result += `📁 *Bagian:* ${book.testament} (${book.group})\n`;
    result += `📑 *Jumlah Bab:* ${book.chapters} Bab/Pasal\n\n`;
    result += `📌 *Daftar Bab yang Tersedia:*\n`;

    let chapterList = [];
    for (let i = 1; i <= book.chapters; i++) {
        chapterList.push(`[Bab ${i}]`);
    }

    // Tampilkan 5 kolom per baris agar rapi di WA
    for (let i = 0; i < chapterList.length; i += 5) {
        result += chapterList.slice(i, i + 5).join(' ') + '\n';
    }

    result += `\n💡 *Cara Membaca:*`;
    result += `\n• Ketik *.alkitab ${book.name.toLowerCase()} 1* (Membaca Bab 1)`;
    result += `\n• Ketik *.alkitab ${book.name.toLowerCase()} 1:1-10* (Membaca ayat 1 s/d 10)`;
    result += `\n• Ketik *.alkitab ${book.name.toLowerCase()} 1:37* (Membaca ayat spesifik)`;
    result += `\n• Ketik *.renungan ${book.name.toLowerCase()} 1:37* (Renungan rohani AI untuk ayat ini)`;

    return result;
}

/**
 * Ambil ayat dari Alkitab (TB)
 * @param {object|string} bookInput - Object kitab atau singkatan SABDA
 * @param {number} chapter - Nomor bab/pasal
 */
async function fetchChapterVerses(bookInput, chapter) {
    const bookAbbr = typeof bookInput === 'object' ? bookInput.abbr : bookInput;
    const bookName = typeof bookInput === 'object' ? bookInput.name : bookInput;
    const url = `https://alkitab.mobi/tb/${bookAbbr}/${chapter}`;
    let html = '';
    try {
        html = await httpGet(url, 12000);
    } catch (err) {
        // Fallback coba ambil dari endpoint passage SABDA
        const fallbackUrl = `https://alkitab.sabda.org/api/passage.php?passage=${encodeURIComponent(bookName)}+${chapter}&ver=tb`;
        try {
            html = await httpGet(fallbackUrl, 12000);
        } catch {
            throw new Error(`Gagal mengambil data dari server Alkitab untuk bab ${chapter}.`);
        }
    }

    if (!html) {
        throw new Error(`Gagal mengambil data dari server Alkitab untuk bab ${chapter}.`);
    }
    
    // Parse Perikop dan Ayat
    // Contoh perikop: <span class="paragraphtitle">Pendahuluan</span>
    // Contoh ayat: <p><span class="reftext"><a name=v1 ...>1</a></span> <span ...>Teks ayat...</span></p>
    const items = [];
    
    // Regex mengekstrak perikop dan baris ayat
    const regex = /<span class="paragraphtitle">([^<]+)<\/span>|<p><span class="reftext"><a[^>]*>(\d+)<\/a><\/span>\s*<span[^>]*>([^<]+)<\/span><\/p>|<verse><number>(\d+)<\/number>(?:<title>([^<]+)<\/title>)?<text>([\s\S]*?)<\/text><\/verse>/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
        if (match[1]) {
            // Perikop dari alkitab.mobi
            items.push({ type: 'perikop', text: match[1].trim() });
        } else if (match[2] && match[3]) {
            // Ayat dari alkitab.mobi
            items.push({
                type: 'verse',
                number: parseInt(match[2], 10),
                text: match[3].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim()
            });
        } else if (match[4] && match[6]) {
            // Ayat dari fallback SABDA XML
            if (match[5]) {
                items.push({ type: 'perikop', text: match[5].trim() });
            }
            items.push({
                type: 'verse',
                number: parseInt(match[4], 10),
                text: match[6].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim()
            });
        }
    }

    return items;
}

/**
 * Tampilkan Bab atau Ayat Spesifik
 * @param {object} book - Object kitab dari BIBLE_BOOKS
 * @param {number} chapter - Nomor bab
 * @param {number|null} verseStart - Nomor ayat awal
 * @param {number|null} verseEnd - Nomor ayat akhir
 */
async function getBiblePassage(book, chapter, verseStart = null, verseEnd = null) {
    if (chapter < 1 || chapter > book.chapters) {
        throw new Error(`Kitab ${book.name} hanya memiliki ${book.chapters} Bab/Pasal. Masukkan antara 1 s/d ${book.chapters}.`);
    }

    const items = await fetchChapterVerses(book.abbr, chapter);
    if (!items || items.length === 0) {
        throw new Error(`Ayat untuk ${book.name} Bab ${chapter} tidak dapat dimuat.`);
    }

    // Filter ayat jika ada permintaan ayat tertentu (misal: 1:37 atau 1:1-5)
    let versesOnly = items.filter(x => x.type === 'verse');
    const totalVerses = versesOnly.length;

    let targetVerses = versesOnly;
    let titleRange = `Bab ${chapter}`;

    if (verseStart !== null) {
        const start = verseStart;
        const end = verseEnd !== null ? verseEnd : verseStart;
        targetVerses = versesOnly.filter(v => v.number >= start && v.number <= end);
        titleRange = start === end ? `Bab ${chapter}:${start}` : `Bab ${chapter}:${start}-${end}`;

        if (targetVerses.length === 0) {
            throw new Error(`Ayat tidak ditemukan. ${book.name} Bab ${chapter} hanya memiliki ${totalVerses} ayat.`);
        }
    }

    let out = `📖 *${book.name.toUpperCase()} ${titleRange}* (TB)\n`;
    out += `─────────────────────────\n`;

    // Jika menampilkan seluruh bab dan ayat lebih dari 30, potong agar tidak spam chat
    let isTruncated = false;
    let displayList = targetVerses;
    if (verseStart === null && targetVerses.length > 30) {
        displayList = targetVerses.slice(0, 30);
        isTruncated = true;
    }

    // Tampilkan perikop yang relevan dan ayat
    for (const v of displayList) {
        // Cek apakah ada perikop sebelum ayat ini di items asli
        const originalIdx = items.findIndex(item => item.type === 'verse' && item.number === v.number);
        if (originalIdx > 0 && items[originalIdx - 1].type === 'perikop') {
            out += `\n🔖 *[ ${items[originalIdx - 1].text} ]*\n`;
        }
        out += `*${v.number}.* ${v.text}\n`;
    }

    out += `─────────────────────────\n`;

    if (isTruncated) {
        out += `⚠️ _Menampilkan ayat 1 - 30 dari total ${totalVerses} ayat._\n`;
        out += `💡 _Ketik *.alkitab ${book.name.toLowerCase()} ${chapter}:31-${totalVerses}* untuk melanjutkan membaca._\n\n`;
    }

    out += `✨ *Renungan AI:* Ketik *.renungan ${book.name.toLowerCase()} ${chapter}* untuk renungan dari perikop ini.`;

    return out;
}

/**
 * Query EndLess AI (Powered by DeepSeek v4.1 Flash via Prexzy API)
 * @param {string} prompt
 * @param {number} timeoutMs
 */
function queryEndLessAI(prompt, timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
        try {
            const url = 'https://prexzyapis.com/ai/deepseek-v4-1-flash?text=' + encodeURIComponent(prompt);
            https.get(url, {
                family: 4,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Connection': 'close',
                    'Accept': 'application/json'
                },
                timeout: timeoutMs
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed && parsed.response) {
                            resolve(parsed.response.trim());
                        } else if (parsed && parsed.result) {
                            resolve(parsed.result.trim());
                        } else {
                            resolve(data.trim());
                        }
                    } catch (e) {
                        resolve(data.trim());
                    }
                });
            }).on('error', (err) => reject(err));
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Cari ayat Alkitab berdasarkan kata kunci (Menggunakan EndLess AI + Fallback Sabda)
 * @param {string} keyword
 */
async function searchBible(keyword) {
    if (!keyword || keyword.trim().length < 2) {
        throw new Error('Masukkan kata kunci pencarian minimal 2 karakter.');
    }

    const clean = keyword.trim();

    // 1. Coba pencarian semantik & ayat kontekstual via EndLess AI
    try {
        const searchPrompt = `Kamu adalah EndLess AI, asisten Alkitab Kristen berbasis Terjemahan Baru (TB - Lembaga Alkitab Indonesia).
Berikan 3 sampai 4 ayat Alkitab TB yang paling tepat, akurat, dan relevan untuk pencarian: "${clean}".
Format jawaban dengan rapi:
- Nomor dan Referensi Kitab Pasal:Ayat (TB) tebal
- Kutipan teks ayat Alkitab lengkap di dalam tanda kutip
- Penjelasan singkat (1 kalimat) tentang makna ayat tersebut

Gunakan Bahasa Indonesia yang sopan dan meneguhkan iman. Jangan gunakan format JSON, tuliskan teks langsung.`;

        const aiRes = await queryEndLessAI(searchPrompt, 20000);
        if (aiRes && aiRes.length > 50) {
            let out = `🔍 *HASIL PENCARIAN AYAT ALKITAB (ENDLESS AI)*\n`;
            out += `Kata Kunci: *"${clean}"*\n`;
            out += `─────────────────────────\n\n`;
            out += aiRes;
            out += `\n\n─────────────────────────\n`;
            out += `💡 _Ketik *.alkitab <kitab> <bab>* (misal: .alkitab filipi 4) untuk membaca konteks pasal lengkap._`;
            return out;
        }
    } catch (aiErr) {
        console.warn('EndLess AI Bible Search warning:', aiErr.message);
    }

    // 2. Fallback ke mesin pencari Alkitab Mobi (Exact match)
    const url = `https://alkitab.mobi/universal.php?s=${encodeURIComponent(clean)}&version=tb`;
    let html = '';
    try {
        html = await httpGet(url, 15000);
    } catch (err) {
        throw new Error(`Gagal mencari di server Alkitab: ${err.message}`);
    }

    const regex = /<p><a href="https:\/\/alkitab\.mobi\/tb\/[^"]+">([^<]+)<\/a><br\/>\s*([^<]+)<\/p>/gi;
    const matches = [];
    let m;
    while ((m = regex.exec(html)) !== null && matches.length < 15) {
        matches.push({
            passage: m[1].trim(),
            text: m[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim()
        });
    }

    if (matches.length === 0) {
        return `❌ Ayat Alkitab dengan kata kunci *"${clean}"* tidak ditemukan dalam versi Terjemahan Baru (TB).`;
    }

    let out = `🔍 *HASIL PENCARIAN ALKITAB*\n`;
    out += `Kata Kunci: "${clean}"\n`;
    out += `Ditemukan: ${matches.length} ayat teratas\n`;
    out += `─────────────────────────\n\n`;

    matches.forEach((item, idx) => {
        out += `${idx + 1}. *${item.passage}*\n"${item.text}"\n\n`;
    });

    out += `💡 _Ketik *.alkitab <kitab> <bab>* untuk membaca konteks lengkap perikop._`;
    return out;
}

/**
 * Ambil Renungan Harian / Santapan Harian Resmi Hari Ini
 * @param {string} source - 'rh' (Renungan Harian) atau 'sh' (Santapan Harian)
 */
async function getDailyDevotional(source = 'rh') {
    const url = `https://alkitab.mobi/renungan/${source}/`;
    let html = '';
    try {
        html = await httpGet(url, 15000);
    } catch (err) {
        // Fallback coba ambil dari endpoint XML SABDA
        const fallbackUrl = `https://alkitab.sabda.org/api/${source}.php`;
        try {
            html = await httpGet(fallbackUrl, 15000);
        } catch {
            throw new Error('Gagal mengambil renungan harian dari server.');
        }
    }

    if (!html) {
        throw new Error('Gagal mengambil renungan harian hari ini.');
    }

    const titleMatch = html.match(/<title>([^<]+)<\/title>|<judul>([^<]+)<\/judul>/i);
    const mainTitle = titleMatch ? (titleMatch[1] || titleMatch[2]).replace(/\(TB\)/g, '').trim() : 'Renungan Hari Ini';

    let paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
        .map(x => x[1].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim())
        .filter(p => p.length > 0 && !p.includes('Alkitab Mobile') && !p.includes('Bahan Renungan'));

    // Jika format fallback XML
    if (paragraphs.length < 2 && html.includes('<renungan_harian') || html.includes('<result')) {
        const tgl = html.match(/<tanggal>([^<]+)<\/tanggal>/i)?.[1] || '';
        const ayt = html.match(/<ayat>([^<]+)<\/ayat>/i)?.[1] || '';
        const bSetahun = html.match(/<bacaan_setahun>([^<]+)<\/bacaan_setahun>/i)?.[1] || '';
        const nas = html.match(/<nas>([\s\S]*?)<\/nas>/i)?.[1] || '';
        const jdl = html.match(/<judul>([^<]+)<\/judul>/i)?.[1] || '';
        const isi = html.match(/<isi>([\s\S]*?)<\/isi>/i)?.[1] || '';

        paragraphs = [
            `Bacaan: ${ayt}`,
            bSetahun ? `Bacaan Setahun: ${bSetahun}` : '',
            nas ? `Nas: ${nas.replace(/<[^>]+>/g, '').trim()}` : '',
            jdl ? `Judul: ${jdl}` : '',
            isi ? isi.replace(/<[^>]+>/g, '').trim() : ''
        ].filter(Boolean);
    }

    if (paragraphs.length < 2) {
        throw new Error('Format teks renungan tidak dapat dimuat.');
    }

    let out = `🕊️ *${mainTitle.toUpperCase()}*\n`;
    out += `─────────────────────────\n`;

    // Biasanya paragraf 0 = Bacaan Alkitab
    // Paragraf 1 = Judul Renungan atau Nas
    let startIndex = 0;
    if (paragraphs[0].toLowerCase().startsWith('bacaan:')) {
        out += `📖 *${paragraphs[0]}*\n`;
        startIndex = 1;
    }
    if (paragraphs[startIndex] && paragraphs[startIndex].toLowerCase().startsWith('bacaan setahun:')) {
        out += `📅 *${paragraphs[startIndex]}*\n`;
        startIndex++;
    }
    if (paragraphs[startIndex] && paragraphs[startIndex].toLowerCase().startsWith('nas:')) {
        out += `🌟 *${paragraphs[startIndex]}*\n`;
        startIndex++;
    }

    out += `─────────────────────────\n\n`;

    // Sisa paragraf adalah isi renungan
    const bodyParagraphs = paragraphs.slice(startIndex);
    out += bodyParagraphs.join('\n\n');

    out += `\n\n─────────────────────────\n`;
    out += `💡 _Ketik *.renungan <topik>* (misal: .renungan damai / .renungan bersyukur) untuk renungan AI kustom._`;

    return out;
}

/**
 * Hasilkan Renungan Rohani Berbasis EndLess AI (DeepSeek v4.1 Flash + Fallback)
 * @param {string} topicOrVerse - Topik atau ayat (contoh: 'kecemasan', 'kasih', 'Lukas 1:37')
 */
async function generateAiDevotional(topicOrVerse) {
    if (!topicOrVerse || !topicOrVerse.trim()) {
        return await getDailyDevotional('rh');
    }

    const query = topicOrVerse.trim();
    const promptText = `Bertindaklah sebagai EndLess AI, gembala, konselor rohani, dan hamba Tuhan Kristen yang bijak, penuh kasih, dan berakar kuat pada Alkitab (Terjemahan Baru). 
Buatlah renungan rohani Kristen yang mendalam, menyejukkan hati, dan praktis dengan topik/ayat: "${query}".
Format harus rapi dan terstruktur sebagai berikut:
1. JUDUL RENUNGAN (Menarik, menguatkan hati)
2. AYAT REFERENSI ALKITAB (Tuliskan ayat firman Tuhan yang relevan beserta isinya dalam kutipan)
3. REFLEKSI & RENUNGAN HIDUP (2-3 paragraf penuh empati, mengupas makna hidup, solusi rohani dari firman Tuhan)
4. APLIKASI NYATA HARI INI (1-2 langkah praktis untuk diterapkan hari ini)
5. DOA HARI INI (Doa singkat penyerahan diri yang tulus kepada Tuhan Yesus)

Gunakan Bahasa Indonesia yang hangat, sopan, dan menguatkan iman. Jangan gunakan format JSON, tuliskan langsung teks renungan yang siap dibaca.`;

    // 1. Prioritas Utama: EndLess AI (DeepSeek v4.1 Flash via Prexzy)
    try {
        const aiText = await queryEndLessAI(promptText, 25000);
        if (aiText && aiText.trim().length > 100) {
            let out = `✨ *RENUNGAN ROHANI (ENDLESS AI)*\n`;
            out += `Topik / Refleksi: *"${query}"*\n`;
            out += `─────────────────────────\n\n`;
            out += aiText.trim();
            out += `\n\n─────────────────────────\n`;
            out += `🕊️ _"Damai sejahtera Kutinggalkan bagimu. Damai sejahtera-Ku Kuberikan kepadamu." (Yohanes 14:27)_`;
            return out;
        }
    } catch (err) {
        console.warn('EndLess AI Devotional fetch warning:', err.message);
    }

    // 2. Fallback Secondary: Pollinations
    try {
        const url = `https://text.pollinations.ai/${encodeURIComponent(promptText)}?model=openai-fast`;
        const aiText = await httpGet(url, 20000);

        if (aiText && aiText.trim().length > 100) {
            let out = `✨ *RENUNGAN ROHANI AI*\n`;
            out += `Topik / Refleksi: *"${query}"*\n`;
            out += `─────────────────────────\n\n`;
            out += aiText.trim();
            out += `\n\n─────────────────────────\n`;
            out += `🕊️ _"Damai sejahtera Kutinggalkan bagimu. Damai sejahtera-Ku Kuberikan kepadamu." (Yohanes 14:27)_`;
            return out;
        }
    } catch (err) {
        console.warn('Pollinations Devotional fetch warning:', err.message);
    }

    // Fallback: Jika koneksi AI offline/timeout, cari ayat terkait dan berikan renungan teologis terkurasi
    try {
        const searchRes = await searchBible(query);
        let out = `🕊️ *RENUNGAN FIRMAN TUHAN*\n`;
        out += `Topik: *"${query}"*\n`;
        out += `─────────────────────────\n\n`;
        out += `Tuhan selalu hadir dan peduli terhadap setiap pergumulan hidup kita, termasuk mengenai *${query}*.\n\n`;
        out += `Ketika kita menaruh harapan sepenuhnya kepada Kristus, Ia memberikan damai sejahtera yang melampaui segala akal manusia.\n\n`;
        out += `📖 *Ayat Referensi Terkait:*\n${searchRes.slice(0, 500)}...\n\n`;
        out += `🙏 *Doa Hari Ini:*\n"Tuhan Yesus, terima kasih atas firman-Mu yang menjadi pelita bagi kakiku dan terang bagi jalanku. Dalam segala hal mengenai ${query}, aku menyerahkan sepenuhnya ke dalam tangan pengasihan-Mu. Amin."`;
        return out;
    } catch {
        return await getDailyDevotional('rh');
    }
}

/**
 * Panduan Bantuan Alkitab
 */
function getBibleHelp() {
    let out = `📖 *PANDUAN LENGKAP FITUR ALKITAB (TB)*\n`;
    out += `─────────────────────────\n`;
    out += `Gunakan fitur Alkitab digital resmi (Terjemahan Baru) lengkap dengan 66 Kitab:\n\n`;
    out += `1️⃣ *Info Kitab & Daftar Bab:*\n`;
    out += `• *.alkitab lukas*\n`;
    out += `• *.alkitab kejadian*\n`;
    out += `• *.alkitab mazmur*\n\n`;

    out += `2️⃣ *Membaca Satu Bab/Pasal:*\n`;
    out += `• *.alkitab lukas 1*\n`;
    out += `• *.alkitab yohanes 3*\n`;
    out += `• *.alkitab mazmur 23*\n\n`;

    out += `3️⃣ *Membaca Ayat Spesifik / Rentang Ayat:*\n`;
    out += `• *.alkitab lukas 1:37*\n`;
    out += `• *.alkitab yohanes 3:16*\n`;
    out += `• *.alkitab matius 5:1-12*\n\n`;

    out += `4️⃣ *Mencari Ayat dengan Kata Kunci:*\n`;
    out += `• *.alkitab cari kasih karunia*\n`;
    out += `• *.alkitab cari damai sejahtera*\n`;
    out += `• *.alkitab cari pengharapan*\n\n`;

    out += `5️⃣ *Renungan Harian & AI:*\n`;
    out += `• *.renungan* (Renungan Harian hari ini)\n`;
    out += `• *.renungan santapan* (Santapan Harian hari ini)\n`;
    out += `• *.renungan kecemasan* (Renungan AI tentang kecemasan)\n`;
    out += `• *.renungan lukas 1:37* (Renungan AI dari ayat tertentu)\n`;
    out += `• *.renungan masa depan* (Renungan AI topik kehidupan)\n`;
    out += `─────────────────────────\n`;
    out += `📚 *Total Kitab:* 39 Perjanjian Lama + 27 Perjanjian Baru`;
    return out;
}

/**
 * Parser Cerdas Input Alkitab
 * Menangani:
 * - Kosong / help -> action: 'help'
 * - "lukas" -> action: 'book_info'
 * - "lukas 1" -> action: 'passage', chapter: 1
 * - "lukas 1:37" -> action: 'passage', chapter: 1, verseStart: 37
 * - "lukas 1:1-5" -> action: 'passage', chapter: 1, verseStart: 1, verseEnd: 5
 * - "1 samuel 2:1" -> action: 'passage'
 * - "cari kasih" atau kata bebas -> action: 'search'
 */
function parseBibleQuery(text) {
    if (!text || !text.trim()) return { action: 'help' };
    const clean = text.trim();
    if (clean.toLowerCase().startsWith('cari ')) {
        return { action: 'search', keyword: clean.substring(5).trim() };
    }
    if (clean.toLowerCase() === 'help' || clean.toLowerCase() === 'panduan') {
        return { action: 'help' };
    }

    const match = clean.match(/^([0-3]?\s*[a-zA-Z\s-]+?)(?:\s+(\d+)(?::(\d+)(?:-(\d+))?)?)?$/i);
    if (!match) return { action: 'search', keyword: clean };

    const bookPart = match[1].trim();
    const chapPart = match[2] ? parseInt(match[2], 10) : null;
    const v1Part = match[3] ? parseInt(match[3], 10) : null;
    const v2Part = match[4] ? parseInt(match[4], 10) : null;

    const book = findBook(bookPart);
    if (!book) return { action: 'search', keyword: clean };

    if (chapPart === null) return { action: 'book_info', book };

    return {
        action: 'passage',
        book,
        chapter: chapPart,
        verseStart: v1Part,
        verseEnd: v2Part
    };
}

module.exports = {
    BIBLE_BOOKS,
    findBook,
    parseBibleQuery,
    formatBookChapters,
    getBiblePassage,
    searchBible,
    getDailyDevotional,
    generateAiDevotional,
    getBibleHelp,
    queryEndLessAI
};

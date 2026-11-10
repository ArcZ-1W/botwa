const https = require('https');

const PREXZY_BASE = 'https://prexzyapis.com';

/**
 * Universal request helper for Prexzy APIs (handles IPv4 routing, timeouts, buffer & json parsing)
 * @param {string} endpointPath - path with query, e.g. /search/cuaca?kota=Jakarta
 * @param {object} [options]
 * @param {number} [options.timeoutMs=45000]
 * @returns {Promise<any>} returns Buffer if binary image/audio or parsed JSON object
 */
function requestPrexzy(endpointPath, options = {}) {
    const { timeoutMs = 45000 } = options;
    const url = endpointPath.startsWith('http') ? endpointPath : `${PREXZY_BASE}${endpointPath.startsWith('/') ? '' : '/'}${endpointPath}`;

    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            family: 4,
            headers: {
                'Connection': 'close',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*'
            },
            timeout: timeoutMs
        }, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const contentType = res.headers['content-type'] || '';

                // If content is image or audio or binary
                if (
                    contentType.includes('image') ||
                    contentType.includes('audio') ||
                    contentType.includes('video') ||
                    (buffer[0] === 0xFF && buffer[1] === 0xD8) || // JPEG magic bytes
                    (buffer[0] === 0x89 && buffer[1] === 0x50) || // PNG magic bytes
                    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) // MP3 ID3 magic bytes
                ) {
                    return resolve(buffer);
                }

                // Try parse JSON
                try {
                    const json = JSON.parse(buffer.toString('utf-8'));
                    resolve(json);
                } catch (e) {
                    // Raw string
                    resolve(buffer.toString('utf-8'));
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Koneksi ke Prexzy API mengalami batas waktu (timeout).'));
        });

        req.on('error', (err) => {
            reject(new Error(`Gagal menghubungi Prexzy: ${err.message}`));
        });
    });
}

// ==================== DOWNLOADERS ====================

/**
 * Download lagu Spotify
 */
async function downloadSpotify(url) {
    const res = await requestPrexzy(`/download/spotify?url=${encodeURIComponent(url)}`);
    if (res && res.status && res.data) {
        return res.data;
    }
    throw new Error(res?.error || res?.message || 'Lagu Spotify tidak ditemukan atau link tidak valid.');
}

/**
 * Download media Mediafire
 */
async function downloadMediafire(url) {
    const res = await requestPrexzy(`/download/mediafire?url=${encodeURIComponent(url)}`);
    if (res && res.status && res.data) {
        return res.data;
    }
    throw new Error(res?.error || res?.message || 'Berkas MediaFire tidak dapat diunduh.');
}

/**
 * Download Facebook video
 */
async function downloadFacebook(url) {
    const res = await requestPrexzy(`/download/facebookv2?url=${encodeURIComponent(url)}`);
    if (res && (res.status || res.statusCode === 200) && res.data) {
        return res.data;
    }
    // Fallback v1
    const resV1 = await requestPrexzy(`/download/facebook?url=${encodeURIComponent(url)}`);
    if (resV1 && resV1.data) return resV1.data;
    throw new Error(res?.error || res?.message || 'Video Facebook tidak ditemukan.');
}

/**
 * Download Instagram (Reels / Post / Video)
 */
async function downloadInstagram(url) {
    const res = await requestPrexzy(`/download/igv2?url=${encodeURIComponent(url)}`);
    if (res && res.status && res.data) {
        return res.data;
    }
    const resV3 = await requestPrexzy(`/download/igv3?url=${encodeURIComponent(url)}`);
    if (resV3 && resV3.data) return resV3.data;
    throw new Error(res?.error || res?.message || 'Konten Instagram tidak ditemukan atau akun bersifat privat.');
}

/**
 * All-In-One Downloader
 */
async function downloadAio(url) {
    const res = await requestPrexzy(`/download/aio?url=${encodeURIComponent(url)}`);
    if (res && (res.status || res.data)) {
        return res.data || res;
    }
    throw new Error(res?.error || res?.message || 'Gagal mengunduh media dari link tersebut.');
}

// ==================== TEXT TO SPEECH ====================

const TTS_VOICES = {
    'id': 'tts-id',
    'indonesia': 'tts-id',
    'indo': 'tts-id',
    'en': 'tts-en',
    'inggris': 'tts-en',
    'ja': 'tts-ja',
    'jepang': 'tts-ja',
    'ko': 'tts-ko',
    'korea': 'tts-ko',
    'ar': 'tts-ar',
    'arab': 'tts-ar',
    'fr': 'tts-fr',
    'prancis': 'tts-fr',
    'es': 'tts-es',
    'spanyol': 'tts-es',
    'de': 'tts-de',
    'jerman': 'tts-de',
    'ru': 'tts-ru',
    'rusia': 'tts-ru',
    'whisper': 'tts-female-whisper',
    'bisik': 'tts-female-whisper',
    'robosoft': 'tts-robosoft-one',
    'robot': 'tts-robosoft-one',
    'mary': 'tts-mary',
    'sam': 'tts-sam'
};

/**
 * Convert text to speech MP3 buffer
 */
async function textToSpeech(text, voiceKey = 'id') {
    const endpoint = TTS_VOICES[voiceKey.toLowerCase()] || 'tts-id';
    const buffer = await requestPrexzy(`/tts/${endpoint}?text=${encodeURIComponent(text)}`);
    if (Buffer.isBuffer(buffer)) {
        return buffer;
    }
    throw new Error('Gagal menghasilkan audio Text to Speech.');
}

// ==================== PENCARIAN (SEARCH) ====================

/**
 * Cari informasi cuaca berdasarkan nama kota
 */
async function searchWeather(city) {
    const res = await requestPrexzy(`/search/cuaca?kota=${encodeURIComponent(city)}`);
    if (res && res.status && res.data) {
        return res.data;
    }
    throw new Error(res?.error || `Informasi cuaca untuk kota "${city}" tidak ditemukan.`);
}

/**
 * Cari lirik lagu
 */
async function searchLyrics(title) {
    const res = await requestPrexzy(`/search/lyrics?title=${encodeURIComponent(title)}`);
    if (res && res.status && res.data) {
        return res.data;
    }
    throw new Error(res?.error || `Lirik lagu "${title}" tidak ditemukan.`);
}

/**
 * Cari video di YouTube
 */
async function searchYouTube(query) {
    const res = await requestPrexzy(`/search/youtube?q=${encodeURIComponent(query)}`);
    if (res && res.status && res.data) {
        return Array.isArray(res.data) ? res.data : [res.data];
    }
    throw new Error(res?.error || `Pencarian YouTube untuk "${query}" tidak ditemukan.`);
}

/**
 * Cari film di IMDb
 */
async function searchImdb(query) {
    const res = await requestPrexzy(`/search/imdb?query=${encodeURIComponent(query)}`);
    if (res && res.status && res.data) {
        return res.data;
    }
    throw new Error(res?.error || `Film "${query}" tidak ditemukan di IMDb.`);
}

/**
 * Cari Game Mod / APK di Android-1
 */
async function searchModApk(query) {
    const res = await requestPrexzy(`/search/android1?q=${encodeURIComponent(query)}`);
    if (res && res.status && res.data) {
        return res.data;
    }
    throw new Error(res?.error || `Game/Aplikasi "${query}" tidak ditemukan.`);
}

/**
 * Cari repositori GitHub
 */
async function searchGitHub(query) {
    const res = await requestPrexzy(`/search/repos?q=${encodeURIComponent(query)}`);
    if (res && (res.status || Array.isArray(res.data))) {
        return res.data || res;
    }
    throw new Error(res?.error || `Repositori GitHub untuk "${query}" tidak ditemukan.`);
}

// ==================== STALKING / PROFIL INFO ====================

/**
 * Stalk profil Instagram
 */
async function stalkInstagram(username) {
    const cleanUser = username.replace(/^@/, '').trim();
    const res = await requestPrexzy(`/stalk/igstalkV2?user=${encodeURIComponent(cleanUser)}`);
    if (res && res.status && res.data) {
        return res.data;
    }
    throw new Error(res?.error || `Akun Instagram @${cleanUser} tidak ditemukan.`);
}

/**
 * Stalk channel YouTube
 */
async function stalkYouTube(channel) {
    const clean = channel.trim().startsWith('@') ? channel.trim() : `@${channel.trim()}`;
    const res = await requestPrexzy(`/stalk/ytstalk?user=${encodeURIComponent(clean)}`);
    if (res && res.status && res.data) {
        return res.data;
    }
    throw new Error(res?.error || `Channel YouTube ${clean} tidak ditemukan.`);
}

/**
 * Stalk akun Free Fire
 */
async function stalkFreeFire(id) {
    const res = await requestPrexzy(`/stalk/ffstalk?id=${encodeURIComponent(id)}`);
    if (res && res.status && res.data) {
        return res.data;
    }
    throw new Error(res?.error || `ID Free Fire "${id}" tidak ditemukan.`);
}

// ==================== SCREENSHOT WEBSITE ====================

/**
 * Tangkapan layar halaman website (WebSS)
 */
async function screenshotWeb(webUrl) {
    let target = webUrl.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
        target = 'https://' + target;
    }
    const buffer = await requestPrexzy(`/ssweb/webss?url=${encodeURIComponent(target)}`);
    if (Buffer.isBuffer(buffer)) {
        return buffer;
    }
    throw new Error('Gagal mengambil tangkapan layar website.');
}

// ==================== TEXT MAKER (3D LOGOS & EFFECTS) ====================

const TEXT_MAKER_STYLES = {
    'blackpink': 'blackpinklogo',
    'blackpinklogo': 'blackpinklogo',
    'blackpinkstyle': 'blackpinkstyle',
    'gold': 'luxurygold',
    'luxury': 'luxurygold',
    'luxurygold': 'luxurygold',
    'neon': 'makingneon',
    'makingneon': 'makingneon',
    'glitch': 'glitchtext',
    'glitchtext': 'glitchtext',
    'gradient': 'gradienttext',
    'gradienttext': 'gradienttext',
    'hologram': 'freecreate',
    'freecreate': 'freecreate',
    'sand': 'sandsummer',
    'sandsummer': 'sandsummer',
    'summer': 'summerbeach',
    'summerbeach': 'summerbeach',
    'underwater': 'underwatertext',
    'underwatertext': 'underwatertext',
    'clouds': 'effectclouds',
    'effectclouds': 'effectclouds',
    'papercut': 'papercutstyle',
    'papercutstyle': 'papercutstyle',
    'royal': 'royaltext',
    'royaltext': 'royaltext',
    'bearlogo': 'logomaker',
    'logomaker': 'logomaker',
    '1917': 'style1917',
    'style1917': 'style1917',
    'advancedglow': 'advancedglow',
    'cartoon': 'cartoonstyle',
    'cartoonstyle': 'cartoonstyle',
    'deleting': 'deletingtext',
    'galaxystyle': 'galaxystyle',
    'galaxywallpaper': 'galaxywallpaper',
    'glowing': 'glowingtext',
    'glowingtext': 'glowingtext',
    'lighteffects': 'lighteffects',
    'neonglitch': 'neonglitch',
    'pixelglitch': 'pixelglitch',
    'typography': 'typographytext',
    'watercolor': 'watercolortext',
    'watercolortext': 'watercolortext',
    'glass': 'writetext',
    'writetext': 'writetext',
    'flag3d': 'flag3dtext',
    'flag': 'flagtext'
};

/**
 * Generate 3D Text Effect image buffer
 */
async function generateTextMaker(styleName, text) {
    const endpoint = TEXT_MAKER_STYLES[styleName.toLowerCase()] || 'luxurygold';
    const buffer = await requestPrexzy(`/${endpoint}?text=${encodeURIComponent(text)}`);
    if (Buffer.isBuffer(buffer)) {
        return buffer;
    }
    throw new Error('Gagal membuat gambar teks 3D.');
}

// ==================== RANDOM IMAGES ====================

const RANDOM_IMAGE_TYPES = {
    'cat': 'cat',
    'kucing': 'cat',
    'dog': 'dog',
    'anjing': 'dog',
    'car': 'car',
    'mobil': 'car',
    'bluearchive': 'bluearchive',
    'boy': 'boypic',
    'cowo': 'boypic',
    'ppcouple': 'profilepics',
    'avatar': 'profilepics',
    'china': 'chinagirl',
    'hijab': 'hijabgirl',
    'indo': 'indonesiagirl',
    'indonesia': 'indonesiagirl',
    'japan': 'japangirl',
    'jepang': 'japangirl',
    'korea': 'koreangirl',
    'malaysia': 'malaysiagirl',
    'thai': 'thailandgirl',
    'thailand': 'thailandgirl',
    'vietnam': 'vietnamgirl',
    'tiktok': 'tiktokgirl',
    'moe': 'anhmoe',
    'sfw': 'anhsfw'
};

/**
 * Ambil gambar acak HD
 */
async function getRandomImage(category) {
    const ep = RANDOM_IMAGE_TYPES[category.toLowerCase()] || 'cat';
    const buffer = await requestPrexzy(`/random/${ep}`);
    if (Buffer.isBuffer(buffer)) {
        return buffer;
    }
    throw new Error('Gagal mengambil gambar acak.');
}

// ==================== TOOLS & DEVELOPER ====================

/**
 * Eksekusi dan kompilasi kode pemrograman online (Python, JS, C, C++, C#, Java)
 */
async function compileCode(code, lang = 'python') {
    const res = await requestPrexzy(`/tools/compiler?code=${encodeURIComponent(code)}&lang=${encodeURIComponent(lang)}`);
    if (res && (res.status || res.output !== undefined)) {
        return res;
    }
    throw new Error(res?.error || 'Gagal mengeksekusi kode program.');
}

/**
 * Cek Geolokasi & ISP IP Address
 */
async function checkGeoIp(ip) {
    const res = await requestPrexzy(`/tools/geoip?ip=${encodeURIComponent(ip)}`);
    if (res && res.status && res.data) {
        return res;
    }
    throw new Error(res?.error || `Informasi IP ${ip} tidak ditemukan.`);
}

/**
 * Cek status DNS & Server Domain Host
 */
async function checkHost(domain) {
    const clean = domain.replace(/^https?:\/\//, '').split('/')[0];
    const res = await requestPrexzy(`/tools/hostcheck?domain=${encodeURIComponent(clean)}`);
    if (res && res.status) {
        return res;
    }
    throw new Error(res?.error || `Gagal memeriksa host ${clean}.`);
}

/**
 * Generate 35+ Font Estetik / Fancy Text Styles
 */
async function getStyleText(text) {
    const res = await requestPrexzy(`/tools/allstyles?text=${encodeURIComponent(text)}`);
    if (res && res.status && res.styles) {
        return res.styles;
    }
    throw new Error(res?.error || 'Gagal memproses gaya teks.');
}

/**
 * Terjemahan instan (idtoen, entoid, artoid, jatoid, kotoid, zhtoid)
 */
async function translateText(text, direction = 'idtoen') {
    const dir = direction.toLowerCase().replace(/[^a-z]/g, '');
    const valid = ['idtoen', 'entoid', 'artoid', 'jatoid', 'kotoid', 'zhtoid'];
    const ep = valid.includes(dir) ? dir : 'idtoen';

    const res = await requestPrexzy(`/tools/${ep}?text=${encodeURIComponent(text)}`);
    if (res && res.status) {
        return res.translated_text || res.translation || res.result || res.data || res;
    }
    throw new Error(res?.error || 'Gagal menerjemahkan teks.');
}

// ==================== ANIME ====================

/**
 * Cari anime & link streaming
 */
async function searchAnime(query) {
    const res = await requestPrexzy(`/anime/animekill-search?query=${encodeURIComponent(query)}`);
    if (res && res.data && res.data.data && Array.isArray(res.data.data.animelist)) {
        return res.data.data.animelist;
    }
    throw new Error(res?.error || `Anime "${query}" tidak ditemukan.`);
}

/**
 * Jadwal rilis anime
 */
async function getAnimeSchedule() {
    const res = await requestPrexzy(`/anime/animekill-schedule`);
    if (res && res.data) {
        return res.data;
    }
    throw new Error('Gagal mengambil jadwal anime.');
}

// ==================== SPORTS ====================

/**
 * Info skor pertandingan sepak bola terkini
 */
async function getFootballLive() {
    const res = await requestPrexzy('/sports/football');
    if (res && res.status) {
        return res;
    }
    throw new Error('Gagal memuat skor sepak bola.');
}

module.exports = {
    requestPrexzy,
    // Downloader
    downloadSpotify,
    downloadMediafire,
    downloadFacebook,
    downloadInstagram,
    downloadAio,
    // TTS
    textToSpeech,
    TTS_VOICES,
    // Search
    searchWeather,
    searchLyrics,
    searchYouTube,
    searchImdb,
    searchModApk,
    searchGitHub,
    // Stalk
    stalkInstagram,
    stalkYouTube,
    stalkFreeFire,
    // Screenshot Web
    screenshotWeb,
    // Text Maker
    generateTextMaker,
    TEXT_MAKER_STYLES,
    // Random Images
    getRandomImage,
    RANDOM_IMAGE_TYPES,
    // Tools & Developer
    compileCode,
    checkGeoIp,
    checkHost,
    getStyleText,
    translateText,
    // Anime
    searchAnime,
    getAnimeSchedule,
    // Sports
    getFootballLive
};

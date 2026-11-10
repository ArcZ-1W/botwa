/**
 * Tools Module: Short URL, Temp File, Temp Mail, Pinterest
 */

// In-memory session store untuk temp mail pengguna (berdasarkan nomor WA)
const userMailSessions = new Map();

/**
 * Shorten URL via TinyURL API
 * @param {string} longUrl
 */
async function shortUrl(longUrl) {
    if (!longUrl || !longUrl.startsWith('http')) {
        throw new Error('URL harus diawali dengan http:// atau https://');
    }

    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl.trim())}`);
    if (!res.ok) throw new Error('Gagal memperpendek URL');
    return await res.text();
}

/**
 * Upload Temporary File to tmpfiles.org
 * @param {Buffer} buffer - File buffer
 * @param {string} filename - Filename with extension
 */
async function uploadTempFile(buffer, filename = 'file.bin') {
    const form = new FormData();
    const blob = new Blob([buffer]);
    form.append('file', blob, filename);

    const res = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: form
    });

    const data = await res.json();
    if (data.status !== 'success' || !data.data?.url) {
        throw new Error('Gagal mengupload file ke server temporary');
    }

    // Ubah URL ke direct download link (tmpfiles.org/XXXX/file -> tmpfiles.org/dl/XXXX/file)
    const directUrl = data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    return {
        viewUrl: data.data.url,
        downloadUrl: directUrl,
        filename
    };
}

/**
 * Temp Mail Management (GuerrillaMail API)
 */
const tempMail = {
    /**
     * Buat alamat email baru untuk user
     */
    async create(userId) {
        const res = await fetch('https://api.guerrillamail.com/ajax.php?f=get_email_address');
        const data = await res.json();
        if (!data.email_addr || !data.sid_token) {
            throw new Error('Gagal membuat temp mail');
        }

        userMailSessions.set(userId, {
            email: data.email_addr,
            sid: data.sid_token,
            createdAt: Date.now()
        });

        return {
            email: data.email_addr,
            sid: data.sid_token
        };
    },

    /**
     * Cek kotak masuk email
     */
    async check(userId) {
        let session = userMailSessions.get(userId);
        if (!session) {
            // Jika belum ada, buatkan baru
            session = await tempMail.create(userId);
        }

        const res = await fetch(`https://api.guerrillamail.com/ajax.php?f=check_email&seq=0&sid_token=${session.sid}`);
        const data = await res.json();

        const messages = (data.list || []).filter(m => m.mail_from !== 'no-reply@guerrillamail.com'); // Saring pesan sambutan default jika ada pesan lain

        return {
            email: session.email,
            total: data.count || 0,
            messages: (messages.length ? messages : data.list || []).map(m => ({
                id: m.mail_id,
                from: m.mail_from,
                subject: m.mail_subject,
                date: m.mail_date,
                excerpt: m.mail_excerpt
            }))
        };
    },

    /**
     * Baca detail pesan email
     */
    async read(userId, mailId) {
        const session = userMailSessions.get(userId);
        if (!session) throw new Error('Kamu belum memiliki sesi email! Ketik .tempmail untuk membuat.');

        const res = await fetch(`https://api.guerrillamail.com/ajax.php?f=fetch_email&email_id=${mailId}&sid_token=${session.sid}`);
        const data = await res.json();
        return {
            from: data.mail_from,
            subject: data.mail_subject,
            body: data.mail_body,
            date: data.mail_date
        };
    },

    /**
     * Ganti username email
     */
    async change(userId, customUsername) {
        let session = userMailSessions.get(userId);
        if (!session) {
            session = await tempMail.create(userId);
        }

        const user = customUsername ? customUsername.toLowerCase().replace(/[^a-z0-9]/g, '') : `user${Math.floor(Math.random() * 90000 + 10000)}`;
        const res = await fetch(`https://api.guerrillamail.com/ajax.php?f=set_email_user&email_user=${user}&sid_token=${session.sid}`);
        const data = await res.json();

        session.email = data.email_addr;
        userMailSessions.set(userId, session);

        return {
            email: data.email_addr,
            sid: session.sid
        };
    }
};

/**
 * Pinterest Image Search
 * @param {string} query
 */
async function searchPinterest(query) {
    if (!query) throw new Error('Masukkan kata kunci pencarian!');

    // Jika input berupa direct link pinterest
    if (query.includes('pin.it') || query.includes('pinterest.com/pin/')) {
        const res = await fetch(query, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const html = await res.text();
        const pinImg = html.match(/https:\/\/i\.pinimg\.com\/originals\/[^\s"'<>]+\.(?:jpg|png|webp)/)
                    || html.match(/https:\/\/i\.pinimg\.com\/736x\/[^\s"'<>]+\.(?:jpg|png|webp)/);
        if (pinImg) return [pinImg[0]];
    }

    // Scrape high-resolution image results from Bing Image Pinterest index
    const res = await fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(query + ' pinterest')}&form=HDRSC2&first=1`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    const html = await res.text();
    const rawMatches = [...html.matchAll(/murl&quot;:&quot;(https?:\/\/[^&]+)&quot;/g)].map(x => x[1]);

    const pinResults = rawMatches.filter(u => u.includes('pinimg.com'));
    const finalResults = pinResults.length ? pinResults : rawMatches;

    if (!finalResults.length) {
        throw new Error('Gambar tidak ditemukan di Pinterest untuk kata kunci tersebut.');
    }

    return finalResults.slice(0, 20);
}

module.exports = {
    shortUrl,
    uploadTempFile,
    tempMail,
    searchPinterest
};

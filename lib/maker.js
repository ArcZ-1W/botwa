/**
 * Maker Module: Nulis Buku Tulis, Gabung Emoji (hingga 20), dan Emojimix Kitchen
 */

const sharp = require('sharp');
const { imageToWebpSticker } = require('./sticker');
const config = require('../config');

/**
 * Escape XML characters for SVG text
 */
function escapeXml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString().replace(/[<>&'"]/g, c => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

/**
 * Buat Gambar Kertas Buku Bergaris Berisi Tulisan Tangan
 * @param {string} text - Teks yang akan ditulis
 * @param {string} authorName - Nama pembuat (opsional)
 */
async function renderNulis(text, authorName = 'EndLessAcademy') {
    if (!text || !text.trim()) {
        throw new Error('Teks tidak boleh kosong!');
    }

    const lines = text.trim().split('\n');

    const width = 840;
    const lineHeight = 38;
    const marginTop = 130;
    const marginLeft = 110;
    const maxCharsPerLine = 48;

    // Word wrapping
    const formattedLines = [];
    for (const rawLine of lines) {
        if (!rawLine.trim()) {
            formattedLines.push('');
            continue;
        }
        const words = rawLine.split(' ');
        let current = '';
        for (const w of words) {
            if ((current + ' ' + w).length > maxCharsPerLine) {
                formattedLines.push(current);
                current = w;
            } else {
                current = current ? current + ' ' + w : w;
            }
        }
        if (current) formattedLines.push(current);
    }

    const totalLines = Math.max(26, formattedLines.length + 3);
    const height = marginTop + totalLines * lineHeight + 80;

    // Garis buku biru bergaris
    let ruledLinesSvg = '';
    for (let i = 0; i < totalLines; i++) {
        const y = marginTop + i * lineHeight;
        ruledLinesSvg += `<line x1="50" y1="${y}" x2="${width - 50}" y2="${y}" stroke="#bfdbfe" stroke-width="1.2" />`;
    }

    // Garis batas tepi merah buku
    const marginLine = `<line x1="${marginLeft - 25}" y1="45" x2="${marginLeft - 25}" y2="${height - 40}" stroke="#f87171" stroke-width="2" />`;

    // Tanggal dan Nama di pojok kanan atas
    const dateStr = new Date().toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const headerSvg = `
        <text x="${width - 65}" y="70" text-anchor="end" font-family="'Segoe Print', 'Comic Sans MS', cursive" font-size="16" fill="#475569">Hari/Tgl: ${escapeXml(dateStr)}</text>
        <text x="${width - 65}" y="96" text-anchor="end" font-family="'Segoe Print', 'Comic Sans MS', cursive" font-size="16" fill="#475569">Nama: ${escapeXml(authorName)}</text>
    `;

    // Konten tulisan tangan tepat di atas garis
    let textSvg = '';
    for (let idx = 0; idx < formattedLines.length; idx++) {
        const lineContent = formattedLines[idx];
        if (!lineContent) continue;
        const y = marginTop + idx * lineHeight - 7;
        textSvg += `<text x="${marginLeft}" y="${y}" font-family="'Segoe Print', 'Segoe Script', 'Comic Sans MS', cursive" font-size="20" fill="#0f172a" letter-spacing="0.4">${escapeXml(lineContent)}</text>`;
    }

    const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="paperBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fffef9" />
                <stop offset="50%" stop-color="#fdfbf4" />
                <stop offset="100%" stop-color="#f8f6ec" />
            </linearGradient>
            <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
                <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.12" />
            </filter>
        </defs>
        <!-- Latar Belakang Kertas -->
        <rect width="${width}" height="${height}" fill="#f1f5f9" />
        <rect x="25" y="25" width="${width - 50}" height="${height - 50}" rx="8" fill="url(#paperBg)" filter="url(#shadow)" stroke="#e2e8f0" stroke-width="1.5" />
        ${ruledLinesSvg}
        ${marginLine}
        ${headerSvg}
        ${textSvg}
    </svg>`;

    return await sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
}

/**
 * Ekstrak array emoji dari string
 */
function extractEmojis(str) {
    if (!str) return [];
    // Regex Unicode modern untuk emoji
    const regex = /\p{Extended_Pictographic}/ug;
    return str.match(regex) || [];
}

/**
 * Gabung emoji jadi satu stiker (hingga 20 emoji)
 * @param {string} emojiStr
 */
async function combineEmojis(emojiStr) {
    const list = extractEmojis(emojiStr).slice(0, 20);
    if (!list.length) {
        throw new Error('Masukkan setidaknya 1 emoji (contoh: .emoji 😀🔥😍)');
    }

    const count = list.length;
    let fontSize = 96;
    if (count > 2) fontSize = 80;
    if (count > 4) fontSize = 64;
    if (count > 9) fontSize = 52;
    if (count > 16) fontSize = 42;

    const width = 512;
    const height = 512;

    const perRow = Math.min(5, Math.ceil(Math.sqrt(count)));
    const rows = Math.ceil(count / perRow);
    const rowHeight = height / (rows + 1);

    let textSvg = '';
    for (let r = 0; r < rows; r++) {
        const rowEmojis = list.slice(r * perRow, (r + 1) * perRow);
        const y = (r + 1) * rowHeight + fontSize / 3;
        const totalRowW = rowEmojis.length * (fontSize * 1.25);
        const startX = (width - totalRowW) / 2;

        rowEmojis.forEach((em, idx) => {
            const x = startX + idx * (fontSize * 1.25) + (fontSize * 0.62);
            textSvg += `<text x="${x}" y="${y}" text-anchor="middle" font-size="${fontSize}" font-family="'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji'">${em}</text>`;
        });
    }

    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        ${textSvg}
    </svg>`;

    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    return await imageToWebpSticker(pngBuffer, {
        packname: config.packname,
        author: config.author
    });
}

/**
 * Convert emoji to hex codepoint
 */
function toCodePoint(emoji) {
    return emoji.codePointAt(0).toString(16).toLowerCase();
}

/**
 * Campur 2 emoji via Google Emoji Kitchen CDN
 * @param {string} emoji1
 * @param {string} emoji2
 */
async function blendEmojimix(emoji1, emoji2) {
    const list = extractEmojis(`${emoji1} ${emoji2}`);
    if (list.length < 2) {
        throw new Error('Masukkan dua emoji untuk dicampur (contoh: .emojimix 😀 😍)');
    }

    const u1 = toCodePoint(list[0]);
    const u2 = toCodePoint(list[1]);

    const dates = [
        '20201001', '20210218', '20210521', '20210831', '20211115',
        '20220110', '20220215', '20220406', '20220506', '20220815',
        '20220823', '20221101', '20221124', '20230126', '20230301',
        '20230309', '20230803', '20231113'
    ];

    const combinations = [
        `u${u1}_u${u2}.png`,
        `u${u2}_u${u1}.png`
    ];

    let foundUrl = null;
    for (const date of dates) {
        for (const comb of combinations) {
            const url = `https://www.gstatic.com/android/keyboard/emojikitchen/${date}/u${u1}/${comb}`;
            try {
                const res = await fetch(url);
                if (res.ok) {
                    foundUrl = url;
                    break;
                }
            } catch (e) {}
        }
        if (foundUrl) break;
    }

    if (!foundUrl) {
        // Coba base u2
        for (const date of dates) {
            for (const comb of combinations) {
                const url = `https://www.gstatic.com/android/keyboard/emojikitchen/${date}/u${u2}/${comb}`;
                try {
                    const res = await fetch(url);
                    if (res.ok) {
                        foundUrl = url;
                        break;
                    }
                } catch (e) {}
            }
            if (foundUrl) break;
        }
    }

    if (!foundUrl) {
        throw new Error(`Kombinasi emoji ${list[0]} dan ${list[1]} belum didukung oleh Google Emoji Kitchen.`);
    }

    const imgRes = await fetch(foundUrl);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    return await imageToWebpSticker(imgBuffer, {
        packname: config.packname,
        author: config.author
    });
}

module.exports = {
    renderNulis,
    combineEmojis,
    blendEmojimix
};

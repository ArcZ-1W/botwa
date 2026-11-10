/**
 * Summarizer Module: Text & PDF Extractive Summarization
 */

const pdfParse = require('pdf-parse');

// Indonesian stop words for natural NLP keyword filtering
const STOP_WORDS = new Set([
    'yang', 'untuk', 'pada', 'ke', 'para', 'namun', 'menurut', 'antara', 'dia', 'dua',
    'ia', 'seperti', 'jika', 'sehingga', 'kembali', 'dan', 'ini', 'karena', 'oleh',
    'saat', 'harus', 'sementara', 'setelah', 'belum', 'kami', 'sekitar', 'bagi',
    'serta', 'di', 'dari', 'telah', 'sebagai', 'masih', 'hal', 'ketika', 'adalah',
    'itu', 'dalam', 'bisa', 'bahwa', 'atau', 'hanya', 'kita', 'dengan', 'akan',
    'juga', 'ada', 'mereka', 'sudah', 'saya', 'terhadap', 'secara', 'agar', 'lain',
    'the', 'is', 'at', 'which', 'on', 'in', 'and', 'to', 'a', 'an', 'of', 'for'
]);

/**
 * Pisahkan teks menjadi kalimat-kalimat
 */
function splitIntoSentences(text) {
    if (!text) return [];
    return text
        .replace(/\r\n|\r/g, '\n')
        .split(/(?<=[.?!])\s+(?=[A-Z0-9"']|\n)/g)
        .map(s => s.trim())
        .filter(s => s.length > 20 && !s.startsWith('#'));
}

/**
 * Ringkas teks menjadi sejumlah N kalimat penting
 * @param {string} text - Teks materi / artikel
 * @param {number} numSentences - Jumlah kalimat ringkasan (default 5)
 */
function summarizeText(text, numSentences = 5) {
    if (!text || text.trim().length < 50) {
        throw new Error('Teks terlalu pendek untuk dirangkum (minimal 50 karakter).');
    }

    const sentences = splitIntoSentences(text);
    if (sentences.length <= numSentences) {
        return {
            originalLength: text.length,
            sentencesCount: sentences.length,
            summary: sentences.join(' ')
        };
    }

    // Hitung frekuensi kata
    const wordFreq = new Map();
    const words = text.toLowerCase().match(/\b[a-zA-Z0-9_]{3,}\b/g) || [];
    for (const w of words) {
        if (!STOP_WORDS.has(w)) {
            wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
        }
    }

    // Normalisasi frekuensi kata tertinggi
    let maxFreq = 1;
    for (const count of wordFreq.values()) {
        if (count > maxFreq) maxFreq = count;
    }

    // Berikan skor untuk setiap kalimat
    const scoredSentences = sentences.map((sentence, index) => {
        const sentenceWords = sentence.toLowerCase().match(/\b[a-zA-Z0-9_]{3,}\b/g) || [];
        let score = 0;
        for (const w of sentenceWords) {
            if (wordFreq.has(w)) {
                score += (wordFreq.get(w) / maxFreq);
            }
        }

        // Posisi bonus: Kalimat awal paragraf / artikel sering kali memuat inti
        if (index === 0) score *= 1.5;
        else if (index < 3) score *= 1.2;

        // Penalti kalimat yang terlalu pendek atau terlalu panjang
        const len = sentenceWords.length;
        if (len < 6 || len > 50) score *= 0.7;

        return {
            index,
            sentence,
            score: len > 0 ? score / Math.sqrt(len) : 0
        };
    });

    // Ambil N kalimat dengan skor tertinggi
    scoredSentences.sort((a, b) => b.score - a.score);
    const topSentences = scoredSentences.slice(0, Math.min(numSentences, sentences.length));

    // Urutkan kembali sesuai alur cerita asli (berdasarkan index)
    topSentences.sort((a, b) => a.index - b.index);

    const summary = topSentences.map(s => s.sentence).join('\n\n');

    return {
        originalLength: text.length,
        sentencesCount: sentences.length,
        selectedCount: topSentences.length,
        summary
    };
}

/**
 * Ringkas dokumen PDF
 * @param {Buffer} pdfBuffer - Buffer dokumen PDF
 * @param {number} numSentences - Jumlah kalimat ringkasan
 */
async function summarizePdf(pdfBuffer, numSentences = 5) {
    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
        throw new Error('File PDF tidak valid!');
    }

    const data = await pdfParse(pdfBuffer);
    const text = (data.text || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 50) {
        throw new Error('Dokumen PDF tidak memiliki teks yang dapat dibaca (kemungkinan berupa scan gambar).');
    }

    const res = summarizeText(text, numSentences);
    return {
        ...res,
        pages: data.numpages || 1
    };
}

module.exports = {
    summarizeText,
    summarizePdf
};

const https = require('https');

/**
 * Generate AI Image via Prexzy AI App Gen API
 * Endpoint: https://prexzyapis.com/ai/aiappgen?prompt=&image?=&modelId?=&style?=
 * @param {object} options
 * @param {string} options.prompt - Deskripsi teks gambar
 * @param {string} [options.image] - URL gambar referensi (opsional, untuk image-to-image)
 * @param {string} [options.modelId] - ID Model (opsional)
 * @param {string} [options.style] - Style gambar (opsional)
 * @param {number} [options.timeoutMs=60000]
 * @returns {Promise<Buffer|string>}
 */
function generateAiImage({ prompt, image, modelId, style, timeoutMs = 60000 }) {
    return new Promise((resolve, reject) => {
        if (!prompt || !prompt.trim()) {
            return reject(new Error('Prompt teks wajib diisi untuk membuat gambar AI.'));
        }

        let qs = 'prompt=' + encodeURIComponent(prompt.trim());
        if (image) qs += '&image=' + encodeURIComponent(image);
        if (modelId) qs += '&modelId=' + encodeURIComponent(modelId);
        if (style) qs += '&style=' + encodeURIComponent(style);

        const url = 'https://prexzyapis.com/ai/aiappgen?' + qs;

        https.get(url, {
            family: 4,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Connection': 'close',
                'Accept': 'image/*,application/json'
            },
            timeout: timeoutMs
        }, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const contentType = res.headers['content-type'] || '';
                
                // Cek apakah balasan merupakan data biner gambar JPEG / PNG / WebP
                if (contentType.includes('image') || (buffer[0] === 0xFF && buffer[1] === 0xD8) || (buffer[0] === 0x89 && buffer[1] === 0x50)) {
                    resolve(buffer);
                } else {
                    try {
                        const json = JSON.parse(buffer.toString('utf-8'));
                        if (json && json.image) {
                            resolve(json.image);
                        } else if (json && json.url) {
                            resolve(json.url);
                        } else if (json && json.message) {
                            reject(new Error(json.message));
                        } else {
                            reject(new Error('Server AI tidak mengembalikan gambar: ' + JSON.stringify(json)));
                        }
                    } catch (e) {
                        reject(new Error('Format balasan server AI tidak dikenali: ' + buffer.toString('utf-8').slice(0, 150)));
                    }
                }
            });
        }).on('error', (err) => reject(err));
    });
}

module.exports = {
    generateAiImage
};

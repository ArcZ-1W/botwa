const QRCode = require('qrcode');

/**
 * Generate QR Code Buffer High Resolution (PNG)
 * @param {string} text - Teks atau URL yang akan di-encode ke QR Code
 * @param {object} [options]
 * @param {number} [options.width=640] - Resolusi lebar gambar QR
 * @param {number} [options.margin=2] - Margin putih tepi QR
 * @param {string} [options.darkColor='#000000'] - Warna batang QR
 * @param {string} [options.lightColor='#ffffff'] - Warna latar belakang QR
 * @returns {Promise<Buffer>}
 */
async function generateQrBuffer(text, options = {}) {
    if (!text || !text.trim()) {
        throw new Error('Teks atau link untuk membuat QR Code tidak boleh kosong.');
    }

    const {
        width = 640,
        margin = 2,
        darkColor = '#000000',
        lightColor = '#ffffff'
    } = options;

    return await QRCode.toBuffer(text.trim(), {
        type: 'png',
        width: width,
        margin: margin,
        errorCorrectionLevel: 'H',
        color: {
            dark: darkColor,
            light: lightColor
        }
    });
}

module.exports = {
    generateQrBuffer
};

const sharp = require('sharp');
const axios = require('axios');
const FormData = require('form-data');

/**
 * Upload buffer gambar ke Catbox untuk mendapatkan public URL sementara (jika butuh API eksternal)
 */
async function uploadToCatbox(buffer) {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });

    const response = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: form.getHeaders(),
        timeout: 10000
    });

    if (typeof response.data === 'string' && response.data.startsWith('http')) {
        return response.data.trim();
    }
    throw new Error('Gagal upload ke host sementara');
}

/**
 * Local Super-Resolution HD Engine (Lanczos-3 Sinc Filter + Chroma 4:4:4)
 * Menghasilkan resolusi tinggi yang jernih, tajam, dan natural tanpa merusak warna / efek sketch.
 */
async function enhanceLocal(buffer, customScale = null) {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    const origWidth = metadata.width || 600;
    const origHeight = metadata.height || 600;

    // Skala otomatis sesuai ukuran asli:
    // Gambar kecil (< 500px) dinaikkan 3x - 4x agar benar-benar menjadi HD
    // Gambar sedang (500-1000px) dinaikkan 2x - 2.5x
    // Gambar besar (> 1000px) dinaikkan 1.5x - 2x (maksimal 3200px agar WhatsApp tidak menolak)
    let scale = customScale;
    if (!scale) {
        if (origWidth < 450 || origHeight < 450) {
            scale = 3.5;
        } else if (origWidth < 900 || origHeight < 900) {
            scale = 2.2;
        } else {
            scale = 1.6;
        }
    }

    const targetWidth = Math.min(Math.round(origWidth * scale), 3200);
    const targetHeight = Math.min(Math.round(origHeight * scale), 3200);

    // Proses upscaling murni menggunakan Lanczos-3
    // PENTING: Jangan gunakan CLAHE karena CLAHE merusak gambar anime/garis menjadi sketsa gosong/rusak.
    const hdBuffer = await image
        .resize(targetWidth, targetHeight, {
            kernel: sharp.kernel.lanczos3,
            fit: 'inside',
            withoutEnlargement: false
        })
        .sharpen({
            sigma: 0.7,  // Radius sharpening yang halus
            m1: 0.35,    // Threshold noise area datar agar tidak berbintik
            m2: 0.15     // Penajaman garis tepi agar tetap presisi
        })
        .jpeg({
            quality: 98,
            mozjpeg: true,
            chromaSubsampling: '4:4:4' // Warna penuh tanpa kompresi pixel kasar
        })
        .toBuffer();

    const outMeta = await sharp(hdBuffer).metadata();

    return {
        buffer: hdBuffer,
        origResolution: `${origWidth}x${origHeight}`,
        hdResolution: `${outMeta.width}x${outMeta.height}`,
        scale: scale.toFixed(1)
    };
}

/**
 * Fungsi utama untuk meningkatkan kualitas gambar ke HD
 */
async function enhanceImage(buffer) {
    try {
        const result = await enhanceLocal(buffer);
        return {
            buffer: result.buffer,
            method: `Super-Resolution HD (${result.scale}x)`,
            origResolution: result.origResolution,
            hdResolution: result.hdResolution
        };
    } catch (err) {
        throw new Error(`Gagal memproses HD: ${err.message}`);
    }
}

module.exports = {
    enhanceImage,
    enhanceLocal,
    uploadToCatbox
};

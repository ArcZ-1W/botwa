const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const webp = require('node-webpmux');
const { spawn } = require('child_process');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const config = require('../config');

const tempDir = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Menyisipkan metadata EXIF (Packname & Author) ke dalam file WebP
 */
async function writeExif(webpBuffer, metadata = {}) {
    const packname = metadata.packname !== undefined ? metadata.packname : config.packname;
    const author = metadata.author !== undefined ? metadata.author : config.author;

    const json = {
        'sticker-pack-id': 'com.endlessacademy.sticker',
        'sticker-pack-name': packname,
        'sticker-pack-publisher': author,
        'emojis': metadata.emojis || ['🤖', '✨']
    };

    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf-8');

    // EXIF header standard untuk WhatsApp Sticker
    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ]);

    const exifBuffer = Buffer.concat([exifAttr, jsonBuffer]);
    exifBuffer.writeUIntLE(jsonBuffer.length, 14, 4);

    const img = new webp.Image();
    await img.load(webpBuffer);
    img.exif = exifBuffer;
    return await img.save(null);
}

/**
 * Konversi gambar statis ke Stiker WebP dengan metadata EXIF
 */
async function imageToSticker(imageBuffer, metadata = {}) {
    // Resize ke 512x512 dengan background transparan (contain)
    const rawWebp = await sharp(imageBuffer)
        .resize(512, 512, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp({ quality: 80 })
        .toBuffer();

    return await writeExif(rawWebp, metadata);
}

/**
 * Konversi video / GIF ke Stiker Animasi WebP dengan metadata EXIF
 */
async function videoToSticker(videoBuffer, metadata = {}) {
    const randomId = Math.random().toString(36).substring(2, 9);
    const inputPath = path.join(tempDir, `input_${randomId}.mp4`);
    const outputPath = path.join(tempDir, `output_${randomId}.webp`);

    await fs.promises.writeFile(inputPath, videoBuffer);

    return new Promise((resolve, reject) => {
        // FFmpeg command untuk stiker WhatsApp & Web (max 512x512, 15fps, durasi maks 10 detik)
        const durationSec = metadata.duration ? String(Math.min(10, metadata.duration)) : '10';
        const args = [
            '-y',
            '-i', inputPath,
            '-t', durationSec,
            '-vf', "scale='min(512,iw)':min'(512,ih)':force_original_aspect_ratio=decrease,fps=15,pad=512:512:(512-iw)/2:(512-ih)/2:color=0x00000000",
            '-loop', '0',
            '-preset', 'default',
            '-an',
            '-vsync', '0',
            outputPath
        ];

        const ff = spawn(ffmpegPath, args);

        ff.on('close', async (code) => {
            try {
                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);

                if (code !== 0 || !fs.existsSync(outputPath)) {
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    return reject(new Error(`FFmpeg exited with code ${code}`));
                }

                const webpBuffer = await fs.promises.readFile(outputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

                const finalSticker = await writeExif(webpBuffer, metadata);
                resolve(finalSticker);
            } catch (err) {
                reject(err);
            }
        });

        ff.on('error', (err) => {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            reject(err);
        });
    });
}

module.exports = {
    imageToSticker,
    videoToSticker,
    writeExif
};

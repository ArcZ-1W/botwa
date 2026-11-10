/**
 * Downloader Module: TikTok & YouTube (MP3 / MP4)
 */

const { Ytdl } = require('@distube/ytdl-core');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ytdlClient = new Ytdl();

/**
 * Download TikTok video & audio via TikWM
 * @param {string} url - TikTok video URL
 */
async function downloadTikTok(url) {
    if (!url || !url.includes('tiktok.com')) {
        throw new Error('URL TikTok tidak valid!');
    }

    const cleanUrl = url.trim();
    const res = await fetch('https://www.tikwm.com/api/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        body: 'url=' + encodeURIComponent(cleanUrl)
    });

    const data = await res.json();
    if (data.code !== 0 || !data.data) {
        throw new Error(data.msg || 'Gagal mengambil data video TikTok');
    }

    const d = data.data;
    return {
        title: d.title || 'TikTok Video',
        author: d.author?.nickname || d.author?.unique_id || 'TikTok User',
        duration: d.duration || 0,
        cover: d.cover,
        videoUrl: d.play || d.wmplay,
        audioUrl: d.music
    };
}

/**
 * Helper to download YouTube to a temporary buffer
 */
async function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', err => reject(err));
    });
}

/**
 * Download YouTube MP3 Audio
 * @param {string} url - YouTube URL
 */
async function downloadYouTubeAudio(url) {
    if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
        throw new Error('URL YouTube tidak valid!');
    }

    const info = await ytdlClient.getInfo(url);
    const title = info.videoDetails.title;
    const duration = info.videoDetails.lengthSeconds;
    const author = info.videoDetails.author?.name || 'YouTube';
    const thumbnail = info.videoDetails.thumbnails?.[0]?.url;

    // Filter audio only
    const stream = ytdlClient.download(url, {
        filter: 'audioonly',
        quality: 'highestaudio'
    });

    const buffer = await streamToBuffer(stream);

    return {
        title,
        author,
        duration,
        thumbnail,
        buffer,
        mimetype: 'audio/mp4'
    };
}

/**
 * Download YouTube MP4 Video
 * @param {string} url - YouTube URL
 */
async function downloadYouTubeVideo(url) {
    if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
        throw new Error('URL YouTube tidak valid!');
    }

    const info = await ytdlClient.getInfo(url);
    const title = info.videoDetails.title;
    const duration = info.videoDetails.lengthSeconds;
    const author = info.videoDetails.author?.name || 'YouTube';
    const thumbnail = info.videoDetails.thumbnails?.[0]?.url;

    // Filter video and audio combined
    let stream;
    try {
        stream = ytdlClient.download(url, {
            filter: 'videoandaudio',
            quality: 'highest'
        });
    } catch (e) {
        stream = ytdlClient.download(url, {
            quality: 'highest'
        });
    }

    const buffer = await streamToBuffer(stream);

    return {
        title,
        author,
        duration,
        thumbnail,
        buffer,
        mimetype: 'video/mp4'
    };
}

module.exports = {
    downloadTikTok,
    downloadYouTubeAudio,
    downloadYouTubeVideo
};

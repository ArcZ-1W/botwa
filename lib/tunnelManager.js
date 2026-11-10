const { spawn, exec } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// Path default cloudflared di Windows
const defaultCloudflaredPaths = [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    'cloudflared'
];

function getCloudflaredBin() {
    for (const p of defaultCloudflaredPaths) {
        if (p === 'cloudflared') return 'cloudflared';
        if (fs.existsSync(p)) return p;
    }
    return 'cloudflared';
}

class TunnelManager extends EventEmitter {
    constructor() {
        super();
        this.process = null;
        this.isRunning = false;
        this.domain = config.tunnelDomain || 'api.revicshop.web.id';
        this.token = config.tunnelToken || '';
        this.logs = [];
    }

    addLog(text) {
        const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const entry = `[${time}] [TUNNEL] ${text}`;
        this.logs.push(entry);
        if (this.logs.length > 100) this.logs.shift();
        this.emit('log', entry);
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            domain: this.domain,
            hasToken: !!this.token,
            logs: this.logs
        };
    }

    start(customToken = null) {
        if (this.isRunning) {
            this.addLog('Tunnel sudah berjalan.');
            return { success: true, message: 'Tunnel sudah berjalan' };
        }

        const token = customToken || this.token || config.tunnelToken || '';
        const bin = getCloudflaredBin();

        let args = [];
        if (token && token.trim().length > 10) {
            this.addLog(`Menjalankan Cloudflare Tunnel dengan token untuk domain: ${this.domain}`);
            args = ['tunnel', 'run', '--token', token.trim()];
        } else {
            this.addLog(`Menjalankan Quick Tunnel untuk port ${config.port || 2979}...`);
            args = ['tunnel', '--url', `http://localhost:${config.port || 2979}`];
        }

        try {
            this.process = spawn(bin, args);
            this.isRunning = true;
            this.emit('status', this.getStatus());

            this.process.stdout.on('data', (data) => {
                const str = data.toString().trim();
                if (str) this.addLog(str);
            });

            this.process.stderr.on('data', (data) => {
                const str = data.toString().trim();
                if (str) {
                    // Filter banner cloudflared biasa
                    if (str.includes('https://') && str.includes('trycloudflare.com')) {
                        const match = str.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
                        if (match) {
                            this.addLog(`URL Publik Quick Tunnel: ${match[0]}`);
                        }
                    }
                    this.addLog(str);
                }
            });

            this.process.on('close', (code) => {
                this.isRunning = false;
                this.process = null;
                this.addLog(`Tunnel terhenti dengan kode keluar: ${code}`);
                this.emit('status', this.getStatus());
            });

            this.process.on('error', (err) => {
                this.isRunning = false;
                this.process = null;
                this.addLog(`Error saat memulai cloudflared: ${err.message}`);
                this.emit('status', this.getStatus());
            });

            return { success: true, message: `Tunnel dimulai untuk domain ${this.domain}` };
        } catch (err) {
            this.isRunning = false;
            this.addLog(`Gagal spawn cloudflared: ${err.message}`);
            return { success: false, message: err.message };
        }
    }

    stop() {
        if (!this.isRunning || !this.process) {
            this.isRunning = false;
            return { success: true, message: 'Tunnel sudah dalam kondisi mati' };
        }

        try {
            // Bunuh proses cloudflared di Windows
            if (process.platform === 'win32') {
                exec(`taskkill /pid ${this.process.pid} /T /F`);
            } else {
                this.process.kill();
            }
            this.isRunning = false;
            this.process = null;
            this.addLog('Tunnel telah dihentikan.');
            this.emit('status', this.getStatus());
            return { success: true, message: 'Tunnel berhasil dihentikan' };
        } catch (err) {
            this.addLog(`Gagal menghentikan tunnel: ${err.message}`);
            return { success: false, message: err.message };
        }
    }
}

const tunnelManager = new TunnelManager();
module.exports = tunnelManager;

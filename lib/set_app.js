/**
 * Interactive CLI Settings & Setup Manager for EndLess Academy WhatsApp Bot
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const configPath = path.join(rootDir, 'config.js');
const sessionDir = path.join(rootDir, 'session');
const { isStartupEnabled, enableStartup, disableStartup } = require('./startup');

function loadConfig() {
    delete require.cache[require.resolve('../config')];
    return require('../config');
}

function saveConfig(cfg) {
    let content = fs.readFileSync(configPath, 'utf8');

    content = content.replace(/botName:\s*['"][^'"]*['"]/, `botName: ${JSON.stringify(cfg.botName)}`);
    content = content.replace(/prefix:\s*['"][^'"]*['"]/, `prefix: ${JSON.stringify(cfg.prefix)}`);
    content = content.replace(/mode:\s*['"][^'"]*['"]/, `mode: ${JSON.stringify(cfg.mode)}`);
    content = content.replace(/packname:\s*['"][^'"]*['"]/, `packname: ${JSON.stringify(cfg.packname)}`);
    content = content.replace(/author:\s*['"][\s\S]*?['"],/, `author: ${JSON.stringify(cfg.author)},`);
    content = content.replace(/botNumber:\s*['"][^'"]*['"]/, `botNumber: ${JSON.stringify(cfg.botNumber)}`);
    content = content.replace(/port:\s*\d+/, `port: ${cfg.port}`);
    content = content.replace(/tunnelDomain:\s*['"][^'"]*['"]/, `tunnelDomain: ${JSON.stringify(cfg.tunnelDomain)}`);
    content = content.replace(/tunnelToken:\s*['"][^'"]*['"]/, `tunnelToken: ${JSON.stringify(cfg.tunnelToken)}`);
    content = content.replace(/webhookDelaySeconds:\s*\d+/, `webhookDelaySeconds: ${cfg.webhookDelaySeconds}`);

    fs.writeFileSync(configPath, content, 'utf8');
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

async function mainMenu() {
    while (true) {
        const cfg = loadConfig();
        const startupState = isStartupEnabled() ? '\x1b[32mAKTIF\x1b[0m' : '\x1b[31mNONAKTIF\x1b[0m';

        console.clear();
        console.log('\x1b[36m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
        console.log('\x1b[36m║           PENGATURAN & SETUP APLIKASI (SET_APP)              ║\x1b[0m');
        console.log('\x1b[36m║                  EndLess Academy WhatsApp Bot                ║\x1b[0m');
        console.log('\x1b[36m╠══════════════════════════════════════════════════════════════╣\x1b[0m');
        console.log(`║  1. Nama Bot        : \x1b[33m${cfg.botName}\x1b[0m`);
        console.log(`║  2. Prefix          : \x1b[33m${cfg.prefix}\x1b[0m`);
        console.log(`║  3. Mode Bot        : \x1b[35m${cfg.mode.toUpperCase()}\x1b[0m (public/private)`);
        console.log(`║  4. Nomor WA Bot    : \x1b[33m${cfg.botNumber || '(Belum disetel)'}\x1b[0m`);
        console.log(`║  5. Port Server     : \x1b[33m${cfg.port}\x1b[0m`);
        console.log(`║  6. Domain Tunnel   : \x1b[33m${cfg.tunnelDomain}\x1b[0m`);
        console.log(`║  7. Token Tunnel    : \x1b[33m${cfg.tunnelToken ? cfg.tunnelToken.slice(0, 15) + '...' : '(Kosong)'}\x1b[0m`);
        console.log(`║  8. Delay Webhook   : \x1b[33m${cfg.webhookDelaySeconds} detik\x1b[0m`);
        console.log(`║  9. Sticker Pack    : \x1b[33m${cfg.packname}\x1b[0m`);
        console.log(`║ 10. Windows Startup : ${startupState}`);
        console.log('\x1b[36m╠══════════════════════════════════════════════════════════════╣\x1b[0m');
        console.log('║ 11. Reset Sesi WhatsApp (Hapus cache session untuk pairing)   ║');
        console.log('║ 12. Install / Update Dependensi (npm & python packages)      ║');
        console.log('║ 13. Rebuild File EXE (EndLessAcademy.exe)                    ║');
        console.log('║ 14. Jalankan Aplikasi Sekarang (Run App)                     ║');
        console.log('║  0. Keluar                                                   ║');
        console.log('\x1b[36m╚══════════════════════════════════════════════════════════════╝\x1b[0m');

        const choice = (await ask('\nPilih nomor menu [0-14]: ')).trim();

        if (choice === '0') {
            console.log('\nKeluar dari menu pengaturan.');
            rl.close();
            process.exit(0);
        } else if (choice === '1') {
            const val = await ask(`Masukkan Nama Bot baru [${cfg.botName}]: `);
            if (val.trim()) { cfg.botName = val.trim(); saveConfig(cfg); }
        } else if (choice === '2') {
            const val = await ask(`Masukkan Prefix baru [${cfg.prefix}]: `);
            if (val.trim()) { cfg.prefix = val.trim(); saveConfig(cfg); }
        } else if (choice === '3') {
            const val = await ask(`Pilih Mode (public/private) [${cfg.mode}]: `);
            if (val.trim().toLowerCase() === 'private' || val.trim().toLowerCase() === 'public') {
                cfg.mode = val.trim().toLowerCase();
                saveConfig(cfg);
            }
        } else if (choice === '4') {
            const val = await ask(`Masukkan Nomor WA Bot (contoh: 6289523042979) [${cfg.botNumber}]: `);
            if (val.trim()) { cfg.botNumber = val.trim().replace(/[^0-9]/g, ''); saveConfig(cfg); }
        } else if (choice === '5') {
            const val = await ask(`Masukkan Port Server baru [${cfg.port}]: `);
            const num = parseInt(val.trim(), 10);
            if (!isNaN(num) && num > 0) { cfg.port = num; saveConfig(cfg); }
        } else if (choice === '6') {
            const val = await ask(`Masukkan Domain Tunnel baru [${cfg.tunnelDomain}]: `);
            if (val.trim()) { cfg.tunnelDomain = val.trim(); saveConfig(cfg); }
        } else if (choice === '7') {
            const val = await ask(`Masukkan Token Cloudflare Tunnel (Kosongkan jika quick tunnel): `);
            cfg.tunnelToken = val.trim();
            saveConfig(cfg);
        } else if (choice === '8') {
            const val = await ask(`Masukkan Jeda Delay Webhook (detik) [${cfg.webhookDelaySeconds}]: `);
            const num = parseInt(val.trim(), 10);
            if (!isNaN(num) && num > 0) { cfg.webhookDelaySeconds = num; saveConfig(cfg); }
        } else if (choice === '9') {
            const val = await ask(`Masukkan Nama Pack Stiker [${cfg.packname}]: `);
            if (val.trim()) { cfg.packname = val.trim(); saveConfig(cfg); }
        } else if (choice === '10') {
            if (isStartupEnabled()) {
                disableStartup();
                console.log('\n\x1b[32m✔ Windows Startup berhasil dinonaktifkan.\x1b[0m');
            } else {
                enableStartup();
                console.log('\n\x1b[32m✔ Windows Startup berhasil diaktifkan.\x1b[0m');
            }
            await ask('Tekan Enter untuk melanjutkan...');
        } else if (choice === '11') {
            const confirm = await ask('Yakin ingin mereset sesi WhatsApp? Folder session akan dihapus (y/N): ');
            if (confirm.trim().toLowerCase() === 'y') {
                try {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                    console.log('\n\x1b[32m✔ Sesi berhasil direset! Silakan restart bot untuk pairing ulang.\x1b[0m');
                } catch (e) {
                    console.log('\n\x1b[31mGagal menghapus sesi (mungkin bot sedang berjalan): ' + e.message + '\x1b[0m');
                }
                await ask('Tekan Enter untuk melanjutkan...');
            }
        } else if (choice === '12') {
            console.log('\n\x1b[33mMemulai instalasi dependensi npm...\x1b[0m');
            try {
                execSync('npm.cmd install', { cwd: rootDir, stdio: 'inherit' });
                console.log('\n\x1b[32m✔ Dependensi npm selesai dipasang.\x1b[0m');
            } catch (e) {
                console.log('\n\x1b[31mGagal menginstall npm packages: ' + e.message + '\x1b[0m');
            }
            await ask('Tekan Enter untuk melanjutkan...');
        } else if (choice === '13') {
            console.log('\n\x1b[33mMemulai kompilasi file EXE (PyInstaller)...\x1b[0m');
            try {
                execSync('python -m PyInstaller --noconsole --onefile --icon="assets\\logo.ico" --add-data "assets;assets" --collect-all customtkinter --name "EndLessAcademy" gui_app.py', { cwd: rootDir, stdio: 'inherit' });
                if (fs.existsSync(path.join(rootDir, 'dist', 'EndLessAcademy.exe'))) {
                    fs.copyFileSync(path.join(rootDir, 'dist', 'EndLessAcademy.exe'), path.join(rootDir, 'EndLessAcademy.exe'));
                }
                console.log('\n\x1b[32m✔ File EndLessAcademy.exe berhasil dibangun!\x1b[0m');
            } catch (e) {
                console.log('\n\x1b[31mGagal kompilasi EXE: ' + e.message + '\x1b[0m');
            }
            await ask('Tekan Enter untuk melanjutkan...');
        } else if (choice === '14') {
            rl.close();
            const exeFile = path.join(rootDir, 'EndLessAcademy.exe');
            if (fs.existsSync(exeFile)) {
                spawn(exeFile, [], { detached: true, stdio: 'ignore' }).unref();
            } else {
                spawn('pythonw', ['gui_app.py'], { cwd: rootDir, detached: true, stdio: 'ignore' }).unref();
            }
            console.log('\n\x1b[32m✔ Aplikasi diluncurkan!\x1b[0m');
            process.exit(0);
        }
    }
}

mainMenu().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});

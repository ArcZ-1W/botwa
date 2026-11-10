const fs = require('fs');
const path = require('path');

const startupDir = path.join(
    process.env.APPDATA || '',
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup'
);

const startupFileName = 'WhatsAppBot_EndLessAcademy.vbs';
const startupFilePath = path.join(startupDir, startupFileName);
const botDir = path.resolve(__dirname, '..');

/**
 * Cek apakah bot terdaftar di Windows Startup
 */
function isStartupEnabled() {
    try {
        return fs.existsSync(startupFilePath);
    } catch {
        return false;
    }
}

/**
 * Daftarkan bot ke Windows Startup agar berjalan otomatis saat Windows menyala
 */
function enableStartup() {
    if (!fs.existsSync(startupDir)) {
        throw new Error('Direktori Windows Startup tidak ditemukan');
    }

    const exePath = path.join(botDir, 'EndLessAcademy.exe');
    const targetCmd = fs.existsSync(exePath) ? 'EndLessAcademy.exe' : 'pythonw gui_app.py';

    // Skrip VBS untuk menjalankan aplikasi saat startup
    const vbsContent = `' Auto-generated Windows Startup script for WhatsApp Bot
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "${botDir.replace(/\\/g, '\\\\')}"
WshShell.Run "${targetCmd}", 1, False
`;

    fs.writeFileSync(startupFilePath, vbsContent, 'utf-8');
    return true;
}

/**
 * Hapus bot dari Windows Startup
 */
function disableStartup() {
    if (fs.existsSync(startupFilePath)) {
        fs.unlinkSync(startupFilePath);
    }
    return true;
}

module.exports = {
    isStartupEnabled,
    enableStartup,
    disableStartup,
    startupFilePath
};

/**
 * Konfigurasi Bot WhatsApp
 * EndLessAcademy Bot
 */

module.exports = {
    botName: "> EndLess Academy Bot",
    prefix: ".",
    mode: "public",
    packname: "EndLessAcademy",
    author: "mau belajar pvp bloxfruit ketik .mau di 6289523042979,\nbukan promosi grup wa",
    botNumber: "6289523042979",
    sessionDir: './session',
    port: 2979,

    // Konfigurasi Cloudflare Tunnel & Domain
    tunnelDomain: "api.revicshop.web.id",
    tunnelToken: "eyJhIjoiZDZiNTNiNzk3MGMyZGYzMzdkYjA5ZDZhNjNlZDRjMjYiLCJ0IjoiOGEwZDdmM2QtMTQxOC00MGNkLTkyZDEtMWI2NmFhZWIxOWU5IiwicyI6Ik5qRTVOVE00TTJNdE1tRTBNeTAwTm1ObExUaGlObU10TTJGbFl6TmpZbVkyTTJRMiJ9",

    // Webhook API Verification Delay
    webhookDelaySeconds: 60,

    // Password Login Dashboard Web (Password Only)
    dashboardPassword: "x",

    // Pengaturan Auto-Start Services di Awal
    autoStartServer: true,
    autoStartBot: true,
    autoStartTunnel: true
};

# WhatsApp Bot - EndLessAcademy (Desktop & Web Controller)

Aplikasi Desktop Native (**Python CustomTkinter**) & Backend Bot WhatsApp (**Node.js Baileys**) dengan fitur lengkap:
1. **Mode Akses Bot (Private Mode vs Open Mode)**:
   - 🔒 **Private Mode (Self Bot)**: Hanya bot / nomor pemilik (`botNumber` atau pesan dari akun bot sendiri) yang dapat menjalankan perintah bot (`.stiker`, `.hd`, dll.). Perintah dari nomor lain otomatis diabaikan.
   - 🌐 **Open Mode (Publik)**: Semua pengguna di chat pribadi maupun grup dapat menggunakan perintah bot.
   - Dapat diubah lewat tombol di **Header Aplikasi Desktop**, **Web Dashboard**, atau langsung lewat chat:
     - `.self` atau `.mode private`: Mengaktifkan mode privat (hanya bot/pemilik).
     - `.public` atau `.mode public`: Mengaktifkan mode terbuka (semua orang).
2. **Taskbar & System Tray (Seperti Xoezn Cloud)**:
   - Terdaftar di taskbar dengan logo **Infinity**.
   - Dilengkapi **System Tray icon** di pojok kanan bawah Windows.
   - Saat jendela ditutup (tombol `X`), bot tetap berjalan di background dan terminimalkan ke tray.
   - Klik kanan icon di tray untuk menu cepat: Buka Dashboard, Mulai/Stop Bot, Ganti Mode, Tunnel, atau Keluar Sepenuhnya.
3. **Webhook Verification API (Delay 60 Detik)**:
   - Endpoint: `https://api.revicshop.web.id/api/v1?number=1010&code=123456`
   - Tugas bot mengirimkan pesan kode verifikasi ke target nomor yang dimasukkan di webhook.
   - Proteksi delay jeda cooldown 60 detik per nomor target.
4. **Cloudflare Tunnel (`api.revicshop.web.id`)**:
   - Tombol Start / Stop Tunnel langsung dari desktop app & web dashboard.
5. **Pembuat Stiker (`.stiker` / `.s`)**:
   - Pack Name: `EndLessAcademy`
   - Author: `Minat? pm 6289523042979`
6. **Penjernih Foto HD (`.hd` / `.remini`)**:
   - AI Super-Resolution + Local Lanczos3 Sharp Engine dengan catatan waktu respon pengiriman.

---

## 🚀 Cara Menjalankan & Pengaturan

### 1. Menjalankan Bot & Aplikasi:
Cukup klik dua kali:
👉 **[`run_app.bat`](file:///D:/!bot%20wa/run_app.bat)** atau **[`EndLessAcademy.exe`](file:///D:/!bot%20wa/EndLessAcademy.exe)**

Saat dibuka, akan muncul dialog pemilih mode:
* **🖥️ Terminal + App Desktop + Web:** Membuka jendela console terminal log, aplikasi desktop taskbar & tray, serta web dashboard di browser.
* **🌐 Web Only (Tanpa Desktop App):** Menjalankan bot di latar belakang & membuka web dashboard saja.

---

### 2. Pengaturan & Setup Aplikasi (Khusus Konfigurasi):
Cukup klik dua kali:
👉 **[`set_app.bat`](file:///D:/!bot%20wa/set_app.bat)**

Menu terminal interaktif untuk:
* Mengubah Nama Bot, Prefix, dan Mode (Public/Private)
* Mengubah Nomor WhatsApp Bot & Port Server
* Mengubah Domain & Token Cloudflare Tunnel
* Mengubah Nama Sticker Pack & Author Watermark
* Mengaktifkan / Menonaktifkan Windows Startup Otomatis
* Mereset Sesi WhatsApp untuk pairing ulang
* Menginstal / Memperbarui Dependensi (`npm install`)
* Membangun ulang file `EndLessAcademy.exe`

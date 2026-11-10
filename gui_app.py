"""
EndLessAcademy WhatsApp Bot - Desktop Controller
Native Windows Taskbar & System Tray Application (seperti Xoezn Cloud / Cloudflare Warp)
Fitur: Logo Infinity, System Tray, Webhook Verification (Delay 60s), Tunnel Controller (api.revicshop.web.id)
"""

import os
import sys
import time
import json
import webbrowser
import subprocess
import threading
import requests
import ctypes
import re
import tkinter as tk
from tkinter import messagebox
from PIL import Image
import pystray
from pystray import MenuItem as item, Menu
import customtkinter as ctk

# Set Explicit Windows App ID agar Taskbar menampilkan icon & identitas aplikasi mandiri
try:
    APP_ID = "endlessacademy.whatsappbot.controller.1.0"
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_ID)
except Exception:
    pass

# Inisialisasi tema CustomTkinter
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

# Setup Path agar bekerja saat script .py maupun sebagai file .exe PyInstaller
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
    BUNDLE_DIR = getattr(sys, '_MEIPASS', BASE_DIR)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    BUNDLE_DIR = BASE_DIR

API_URL = "http://localhost:2979"
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
if not os.path.exists(ASSETS_DIR) and getattr(sys, 'frozen', False):
    ASSETS_DIR = os.path.join(BUNDLE_DIR, "assets")

LOGO_PNG = os.path.join(ASSETS_DIR, "logo.png")
LOGO_ICO = os.path.join(ASSETS_DIR, "logo.ico")


class WhatsAppBotApp(ctk.CTk):
    def __init__(self, start_minimized=True):
        super().__init__()

        # Setup Window & Taskbar
        self.title("EndLess Academy - WhatsApp Bot & Webhook Controller")
        self.geometry("1020x760")
        self.minsize(900, 680)

        # Pasang Icon Window Taskbar jika file .ico ada
        if os.path.exists(LOGO_ICO):
            try:
                self.iconbitmap(LOGO_ICO)
            except Exception as e:
                print("Icon warning:", e)

        # State Variables
        self.node_process = None
        self.bot_status = "offline"
        self.is_tunnel_running = False
        self.tunnel_domain = "api.revicshop.web.id"
        self.pairing_code = None
        self.uptime_seconds = 0
        self.total_commands = 0
        self.is_running = True
        self.config_data = {}
        self.last_log_id = None
        self.tray_icon = None

        # Build UI Components
        self.create_header()
        self.create_pairing_card()
        self.create_tabs()

        # Inisialisasi System Tray (Taskbar Notification Area)
        self.init_system_tray()

        # Handle Window Close -> Minimize ke Tray
        self.protocol("WM_DELETE_WINDOW", self.minimize_to_tray)

        # Start Background Backend & Monitoring Thread
        self.ensure_backend_running()
        self.poll_thread = threading.Thread(target=self.background_polling, daemon=True)
        self.poll_thread.start()

        # Mulai senyap di System Tray (tidak langsung buka semua jendela dan browser)
        if start_minimized:
            self.withdraw()

    def init_system_tray(self):
        """Inisialisasi System Tray icon di Taskbar kanan bawah seperti Xoezn Cloud"""
        try:
            if os.path.exists(LOGO_PNG):
                tray_image = Image.open(LOGO_PNG)
            else:
                tray_image = Image.new("RGB", (64, 64), color=(2, 132, 199))

            menu = Menu(
                item("📌 Buka Dashboard Desktop", self.restore_from_tray, default=True),
                item("🌐 Buka Web Browser", lambda: webbrowser.open(API_URL)),
                Menu.SEPARATOR,
                item("🔒 / 🌐 Ganti Mode Bot (Private/Open)", self.toggle_mode_quick),
                item("▶ Mulai Bot", lambda: self.send_action("start")),
                item("⏹ Hentikan Bot", lambda: self.send_action("stop")),
                item("🔄 Restart Bot", lambda: self.send_action("restart")),
                Menu.SEPARATOR,
                item("🌐 Buka / Tutup Tunnel", self.toggle_tunnel_from_tray),
                Menu.SEPARATOR,
                item("❌ Keluar Sepenuhnya", self.quit_completely)
            )

            self.tray_icon = pystray.Icon(
                "EndLessAcademyBot",
                tray_image,
                "EndLess Academy - WhatsApp Bot (Berjalan di Taskbar)",
                menu
            )
            # Jalankan tray icon secara detached (asynchronous)
            self.tray_icon.run_detached()
        except Exception as e:
            print("Gagal membuat system tray icon:", e)

    def minimize_to_tray(self):
        """Sembunyikan window ke taskbar tray saat tombol X diklik secara senyap tanpa notifikasi popup"""
        self.withdraw()

    def restore_from_tray(self, icon=None, item_menu=None):
        """Tampilkan kembali window dari taskbar tray"""
        self.after(0, self._show_window)

    def _show_window(self):
        self.deiconify()
        self.lift()
        self.focus_force()

    def toggle_tunnel_from_tray(self, icon=None, item_menu=None):
        if self.is_tunnel_running:
            self.stop_tunnel()
        else:
            self.start_tunnel()

    def quit_completely(self, icon=None, item_menu=None):
        """Keluar sepenuhnya dari aplikasi dan matikan background process"""
        self.is_running = False
        if self.tray_icon:
            try:
                self.tray_icon.stop()
            except:
                pass
        if self.node_process:
            try:
                self.node_process.terminate()
            except:
                pass
        self.after(0, self.destroy)

    def create_header(self):
        """Header atas dengan Logo Infinity, status, dan tombol kontrol utama"""
        header_frame = ctk.CTkFrame(self, corner_radius=12)
        header_frame.pack(fill="x", padx=16, pady=(16, 8))

        # Brand Box dengan Logo
        brand_box = ctk.CTkFrame(header_frame, fg_color="transparent")
        brand_box.pack(side="left", padx=16, pady=12)

        # Logo Gambar
        if os.path.exists(LOGO_PNG):
            try:
                pil_img = Image.open(LOGO_PNG)
                self.ctk_logo = ctk.CTkImage(pil_img, size=(46, 46))
                lbl_logo = ctk.CTkLabel(brand_box, image=self.ctk_logo, text="")
                lbl_logo.pack(side="left", padx=(0, 12))
            except:
                pass

        title_text_box = ctk.CTkFrame(brand_box, fg_color="transparent")
        title_text_box.pack(side="left")

        app_title = ctk.CTkLabel(
            title_text_box,
            text="EndLess Academy Bot",
            font=ctk.CTkFont(size=20, weight="bold")
        )
        app_title.pack(anchor="w")

        self.lbl_subtitle = ctk.CTkLabel(
            title_text_box,
            text="WhatsApp Webhook & Taskbar Controller (api.revicshop.web.id)",
            font=ctk.CTkFont(size=12),
            text_color="#94a3b8"
        )
        self.lbl_subtitle.pack(anchor="w")

        # Controls & Badges
        control_box = ctk.CTkFrame(header_frame, fg_color="transparent")
        control_box.pack(side="right", padx=16, pady=12)

        self.lbl_mode_badge = ctk.CTkButton(
            control_box,
            text="🌐 OPEN",
            width=90,
            height=34,
            corner_radius=18,
            fg_color="#0369a1",
            font=ctk.CTkFont(size=11, weight="bold"),
            command=self.toggle_mode_quick
        )
        self.lbl_mode_badge.pack(side="left", padx=4)

        self.btn_status = ctk.CTkButton(
            control_box,
            text="🔴 OFFLINE",
            width=120,
            height=34,
            corner_radius=18,
            fg_color="#7f1d1d",
            hover_color="#991b1b",
            font=ctk.CTkFont(size=12, weight="bold"),
            state="disabled"
        )
        self.btn_status.pack(side="left", padx=4)

        self.btn_start = ctk.CTkButton(
            control_box,
            text="▶ Mulai",
            width=70,
            height=34,
            fg_color="#059669",
            hover_color="#10b981",
            command=lambda: self.send_action("start")
        )
        self.btn_start.pack(side="left", padx=4)

        self.btn_stop = ctk.CTkButton(
            control_box,
            text="⏹ Stop",
            width=70,
            height=34,
            fg_color="#dc2626",
            hover_color="#ef4444",
            command=lambda: self.send_action("stop")
        )
        self.btn_stop.pack(side="left", padx=4)

        self.btn_restart = ctk.CTkButton(
            control_box,
            text="🔄 Restart",
            width=75,
            height=34,
            fg_color="#334155",
            hover_color="#475569",
            command=lambda: self.send_action("restart")
        )
        self.btn_restart.pack(side="left", padx=4)

        self.btn_web = ctk.CTkButton(
            control_box,
            text="🌐 Web",
            width=70,
            height=34,
            fg_color="#0284c7",
            hover_color="#0ea5e9",
            command=self.open_web_dashboard
        )
        self.btn_web.pack(side="left", padx=4)

        btn_hide = ctk.CTkButton(
            control_box,
            text="⬇ Tray",
            width=65,
            height=34,
            fg_color="#475569",
            hover_color="#64748b",
            command=self.minimize_to_tray
        )
        btn_hide.pack(side="left", padx=4)

    def create_pairing_card(self):
        """Card yang muncul otomatis saat membutuhkan pairing code"""
        self.pairing_frame = ctk.CTkFrame(self, fg_color="#082f49", border_color="#0ea5e9", border_width=2, corner_radius=12)

        lbl_title = ctk.CTkLabel(
            self.pairing_frame,
            text="🔑 KODE PAIRING WHATSAPP (PERANGKAT TERTAUT)",
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color="#38bdf8"
        )
        lbl_title.pack(anchor="w", padx=16, pady=(10, 2))

        lbl_desc = ctk.CTkLabel(
            self.pairing_frame,
            text="Buka WhatsApp di HP > Perangkat Tertaut > Tautkan dengan nomor telepon > Masukkan kode:",
            font=ctk.CTkFont(size=12),
            text_color="#e0f2fe"
        )
        lbl_desc.pack(anchor="w", padx=16, pady=(0, 8))

        code_box = ctk.CTkFrame(self.pairing_frame, fg_color="transparent")
        code_box.pack(fill="x", padx=16, pady=(0, 10))

        self.lbl_pairing_code = ctk.CTkLabel(
            code_box,
            text="MEMINTA KODE...",
            font=ctk.CTkFont(family="Consolas", size=26, weight="bold"),
            text_color="#38bdf8"
        )
        self.lbl_pairing_code.pack(side="left", padx=8)

        btn_copy = ctk.CTkButton(
            code_box,
            text="📋 Salin Kode",
            width=110,
            height=32,
            fg_color="#0284c7",
            hover_color="#38bdf8",
            command=self.copy_pairing_code
        )
        btn_copy.pack(side="left", padx=12)

    def create_tabs(self):
        """Tabbed view untuk Log, Webhook, Setting, dan Panduan"""
        self.tabview = ctk.CTkTabview(self, corner_radius=12)
        self.tabview.pack(fill="both", expand=True, padx=16, pady=(0, 16))

        self.tab_log = self.tabview.add("📜 Log & Respon")
        self.tab_webhook = self.tabview.add("⚡ Webhook Verification (Delay 60s)")
        self.tab_tunnel = self.tabview.add("🌐 Tunnel (api.revicshop.web.id)")
        self.tab_settings = self.tabview.add("⚙️ Pengaturan Bot")
        self.tab_guide = self.tabview.add("📖 Panduan")

        self.build_log_tab()
        self.build_webhook_tab()
        self.build_tunnel_tab()
        self.build_settings_tab()
        self.build_guide_tab()

    def build_log_tab(self):
        """Tab Terminal Log & Respon"""
        stats_bar = ctk.CTkFrame(self.tab_log, fg_color="transparent")
        stats_bar.pack(fill="x", padx=8, pady=(4, 8))

        self.lbl_stat_uptime = ctk.CTkLabel(
            stats_bar,
            text="⏱️ Uptime: 0d",
            font=ctk.CTkFont(size=13, weight="bold")
        )
        self.lbl_stat_uptime.pack(side="left", padx=10)

        self.lbl_stat_commands = ctk.CTkLabel(
            stats_bar,
            text="⚡ Total Command: 0",
            font=ctk.CTkFont(size=13, weight="bold")
        )
        self.lbl_stat_commands.pack(side="left", padx=10)

        btn_clear_logs = ctk.CTkButton(
            stats_bar,
            text="Bersihkan Log",
            width=100,
            height=28,
            fg_color="#334155",
            hover_color="#475569",
            command=self.clear_logs
        )
        btn_clear_logs.pack(side="right", padx=6)

        self.txt_logs = ctk.CTkTextbox(
            self.tab_log,
            font=ctk.CTkFont(family="Consolas", size=12),
            wrap="word",
            corner_radius=8
        )
        self.txt_logs.pack(fill="both", expand=True, padx=8, pady=4)
        self.txt_logs.insert("end", "[INFO] Aplikasi Desktop siap (Terintegrasi Taskbar Tray).\n")

    def build_webhook_tab(self):
        """Tab Pengujian Webhook Verification (Delay 60s)"""
        frame = ctk.CTkScrollableFrame(self.tab_webhook, corner_radius=8)
        frame.pack(fill="both", expand=True, padx=8, pady=8)

        lbl_info = ctk.CTkLabel(
            frame,
            text="Webhook Verification API (Mirip API):",
            font=ctk.CTkFont(size=15, weight="bold"),
            text_color="#38bdf8"
        )
        lbl_info.pack(anchor="w", padx=8, pady=(8, 2))

        self.lbl_endpoint_sample = ctk.CTkLabel(
            frame,
            text="Contoh Endpoint: https://api.revicshop.web.id/api/v1?number=1010&code=123456",
            font=ctk.CTkFont(family="Consolas", size=12),
            text_color="#a5f3fc"
        )
        self.lbl_endpoint_sample.pack(anchor="w", padx=8, pady=(0, 14))

        sim_box = ctk.CTkFrame(frame, corner_radius=8)
        sim_box.pack(fill="x", padx=4, pady=6)

        lbl_sim_title = ctk.CTkLabel(
            sim_box,
            text="Uji Coba Kirim Kode Verifikasi & Delay 60 Detik:",
            font=ctk.CTkFont(size=13, weight="bold")
        )
        lbl_sim_title.pack(anchor="w", padx=16, pady=(12, 4))

        lbl_t = ctk.CTkLabel(sim_box, text="Target Nomor (contoh: 1010 atau 6289523042979):", font=ctk.CTkFont(size=12))
        lbl_t.pack(anchor="w", padx=16, pady=(4, 2))
        self.ent_web_target = ctk.CTkEntry(sim_box, placeholder_text="1010")
        self.ent_web_target.pack(fill="x", padx=16, pady=(0, 10))

        lbl_c = ctk.CTkLabel(sim_box, text="Kode Verifikasi (contoh: 882910):", font=ctk.CTkFont(size=12))
        lbl_c.pack(anchor="w", padx=16, pady=(4, 2))
        self.ent_web_code = ctk.CTkEntry(sim_box, placeholder_text="882910")
        self.ent_web_code.pack(fill="x", padx=16, pady=(0, 14))

        btn_act = ctk.CTkFrame(sim_box, fg_color="transparent")
        btn_act.pack(fill="x", padx=16, pady=(0, 14))

        self.btn_send_webhook = ctk.CTkButton(
            btn_act,
            text="🚀 Kirim Kode Verifikasi & Ukur Respon",
            height=36,
            fg_color="#059669",
            hover_color="#10b981",
            font=ctk.CTkFont(size=12, weight="bold"),
            command=self.send_webhook_test
        )
        self.btn_send_webhook.pack(side="left")

        self.lbl_cooldown_indicator = ctk.CTkLabel(
            btn_act,
            text="",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color="#f59e0b"
        )
        self.lbl_cooldown_indicator.pack(side="left", padx=14)

        self.webhook_res_box = ctk.CTkFrame(sim_box, fg_color="#090d16", corner_radius=6)
        self.webhook_res_box.pack(fill="x", padx=16, pady=(0, 14))

        self.lbl_webhook_result = ctk.CTkLabel(
            self.webhook_res_box,
            text="Hasil pengujian webhook & respon waktu akan muncul di sini.",
            font=ctk.CTkFont(size=12),
            justify="left"
        )
        self.lbl_webhook_result.pack(anchor="w", padx=12, pady=10)

    def build_tunnel_tab(self):
        """Tab Kontrol Cloudflare Tunnel untuk api.revicshop.web.id"""
        frame = ctk.CTkScrollableFrame(self.tab_tunnel, corner_radius=8)
        frame.pack(fill="both", expand=True, padx=8, pady=8)

        lbl_title = ctk.CTkLabel(
            frame,
            text="Cloudflare Tunnel Controller (api.revicshop.web.id)",
            font=ctk.CTkFont(size=15, weight="bold"),
            text_color="#38bdf8"
        )
        lbl_title.pack(anchor="w", padx=8, pady=(8, 4))

        card = ctk.CTkFrame(frame, corner_radius=8)
        card.pack(fill="x", padx=4, pady=8)

        status_row = ctk.CTkFrame(card, fg_color="transparent")
        status_row.pack(fill="x", padx=16, pady=12)

        lbl_s_title = ctk.CTkLabel(status_row, text="Status Tunnel:", font=ctk.CTkFont(weight="bold"))
        lbl_s_title.pack(side="left", padx=(0, 10))

        self.lbl_tunnel_status = ctk.CTkLabel(
            status_row,
            text="🔴 MATI",
            font=ctk.CTkFont(weight="bold"),
            text_color="#ef4444"
        )
        self.lbl_tunnel_status.pack(side="left")

        lbl_dom = ctk.CTkLabel(card, text="Domain Tunnel:", font=ctk.CTkFont(weight="bold"))
        lbl_dom.pack(anchor="w", padx=16, pady=(4, 2))
        self.ent_tunnel_domain = ctk.CTkEntry(card, placeholder_text="api.revicshop.web.id")
        self.ent_tunnel_domain.pack(fill="x", padx=16, pady=(0, 10))

        lbl_tok = ctk.CTkLabel(card, text="Cloudflare Tunnel Token (Zero Trust):", font=ctk.CTkFont(weight="bold"))
        lbl_tok.pack(anchor="w", padx=16, pady=(4, 2))
        self.ent_tunnel_token = ctk.CTkEntry(card, show="*", placeholder_text="eyJh... (Kosongkan jika menggunakan quick tunnel)")
        self.ent_tunnel_token.pack(fill="x", padx=16, pady=(0, 14))

        btn_box = ctk.CTkFrame(card, fg_color="transparent")
        btn_box.pack(fill="x", padx=16, pady=(0, 14))

        self.btn_tunnel_start = ctk.CTkButton(
            btn_box,
            text="▶ Mulai Tunnel",
            fg_color="#0284c7",
            hover_color="#0ea5e9",
            height=34,
            command=self.start_tunnel
        )
        self.btn_tunnel_start.pack(side="left", padx=(0, 8))

        self.btn_tunnel_stop = ctk.CTkButton(
            btn_box,
            text="⏹ Hentikan Tunnel",
            fg_color="#dc2626",
            hover_color="#ef4444",
            height=34,
            command=self.stop_tunnel
        )
        self.btn_tunnel_stop.pack(side="left")

    def build_settings_tab(self):
        """Tab Pengaturan Bot & Author Pack"""
        scroll_frame = ctk.CTkScrollableFrame(self.tab_settings, corner_radius=8)
        scroll_frame.pack(fill="both", expand=True, padx=8, pady=8)

        # Mode Bot (Public vs Private)
        lbl_mode = ctk.CTkLabel(scroll_frame, text="Mode Akses Perintah Bot:", font=ctk.CTkFont(weight="bold"))
        lbl_mode.pack(anchor="w", pady=(8, 2))

        self.seg_mode = ctk.CTkSegmentedButton(
            scroll_frame,
            values=["🌐 Open Mode (Publik)", "🔒 Private Mode (Hanya Bot)"],
            selected_color="#0284c7"
        )
        self.seg_mode.pack(fill="x", pady=(0, 10))
        self.seg_mode.set("🌐 Open Mode (Publik)")

        lbl_botname = ctk.CTkLabel(scroll_frame, text="Nama Bot WhatsApp:", font=ctk.CTkFont(weight="bold"))
        lbl_botname.pack(anchor="w", pady=(4, 2))
        self.ent_botname = ctk.CTkEntry(scroll_frame, placeholder_text="EndLess Academy Bot")
        self.ent_botname.pack(fill="x", pady=(0, 10))

        lbl_prefix = ctk.CTkLabel(scroll_frame, text="Prefix Perintah (contoh: .):", font=ctk.CTkFont(weight="bold"))
        lbl_prefix.pack(anchor="w", pady=(4, 2))
        self.ent_prefix = ctk.CTkEntry(scroll_frame, placeholder_text=".")
        self.ent_prefix.pack(fill="x", pady=(0, 10))

        lbl_number = ctk.CTkLabel(scroll_frame, text="Nomor WhatsApp Bot (untuk pairing code):", font=ctk.CTkFont(weight="bold"))
        lbl_number.pack(anchor="w", pady=(4, 2))
        self.ent_number = ctk.CTkEntry(scroll_frame, placeholder_text="6289523042979")
        self.ent_number.pack(fill="x", pady=(0, 10))

        lbl_delay = ctk.CTkLabel(scroll_frame, text="Jeda Cooldown Delay Webhook (Detik):", font=ctk.CTkFont(weight="bold"))
        lbl_delay.pack(anchor="w", pady=(4, 2))
        self.ent_delay = ctk.CTkEntry(scroll_frame, placeholder_text="60")
        self.ent_delay.pack(fill="x", pady=(0, 10))

        lbl_packname = ctk.CTkLabel(scroll_frame, text="Sticker Pack Name:", font=ctk.CTkFont(weight="bold"))
        lbl_packname.pack(anchor="w", pady=(4, 2))
        self.ent_packname = ctk.CTkEntry(scroll_frame, placeholder_text="EndLessAcademy")
        self.ent_packname.pack(fill="x", pady=(0, 10))

        lbl_author = ctk.CTkLabel(scroll_frame, text="Sticker Author Pack (Bisa Multi-baris):", font=ctk.CTkFont(weight="bold"))
        lbl_author.pack(anchor="w", pady=(4, 2))
        self.txt_author = ctk.CTkTextbox(scroll_frame, height=120, font=ctk.CTkFont(family="Consolas", size=12))
        self.txt_author.pack(fill="x", pady=(0, 14))

        self.chk_startup_var = ctk.BooleanVar(value=False)
        self.chk_startup = ctk.CTkCheckBox(
            scroll_frame,
            text="Jalankan otomatis saat Windows startup (Auto-Run Taskbar)",
            variable=self.chk_startup_var,
            command=self.toggle_startup
        )
        self.chk_startup.pack(anchor="w", pady=(4, 16))

        action_bar = ctk.CTkFrame(scroll_frame, fg_color="transparent")
        action_bar.pack(fill="x", pady=(8, 12))

        btn_save = ctk.CTkButton(
            action_bar,
            text="💾 Simpan Pengaturan",
            fg_color="#0284c7",
            hover_color="#0ea5e9",
            height=36,
            command=self.save_settings
        )
        btn_save.pack(side="left", padx=4)

        btn_clear_sess = ctk.CTkButton(
            action_bar,
            text="🗑️ Reset Sesi WhatsApp",
            fg_color="#b45309",
            hover_color="#d97706",
            height=36,
            command=self.reset_session
        )
        btn_clear_sess.pack(side="left", padx=12)

    def build_guide_tab(self):
        """Tab Panduan & Dokumentasi"""
        scroll_guide = ctk.CTkScrollableFrame(self.tab_guide, corner_radius=8)
        scroll_guide.pack(fill="both", expand=True, padx=8, pady=8)

        commands = [
            ("⚡ Webhook Verification", "Kirim Kode Verifikasi Otomatis", "Panggil endpoint: https://api.revicshop.web.id/api/v1?number=1010&code=123456\nNomor target (contoh: 1010) memiliki jeda delay 60 detik setiap meminta kode verifikasi.\nTugas bot hanya mengirimkan pesan verifikasi sesuai parameter yang dimasukkan."),
            ("📌 Taskbar & System Tray (seperti Xoezn Cloud)", "Minimasi & Manajemen Taskbar", "Klik tombol 'X' akan meminimasi aplikasi ke System Tray (pojok kanan bawah dekat jam). Klik kanan icon Infinity untuk menu cepat (Mulai, Stop, Tunnel, Buka Dashboard)."),
            ("🌐 Start / Stop Tunnel", "Konektivitas Domain api.revicshop.web.id", "Dapat dinyalakan atau dimatikan kapan saja lewat tab 'Tunnel' dengan Cloudflare Tunnel."),
            ("🔸 .stiker / .s", "Membuat Stiker WhatsApp", "Kirim foto atau video pendek dengan caption .stiker.\nPackname: EndLessAcademy\nAuthor: Minat? pm 6289523042979"),
            ("🔸 .hd / .remini", "Penjernih Foto HD", "Kirim foto dengan caption .hd. Meningkatkan ketajaman foto dan menyertakan respon waktu pemrosesan."),
            ("🎬 .tiktok <url>", "TikTok Video Downloader", "Mengunduh video TikTok tanpa watermark dan audio secara otomatis."),
            ("🎵 .ytmp3 & .ytmp4 <url>", "YouTube Downloader MP3 / MP4", "Unduh lagu MP3 (.ytmp3 <link>) atau video MP4 (.ytmp4 <link>) langsung dari YouTube."),
            ("🔗 .shorturl <url>", "Pemendek Tautan Pendek", "Membuat tautan singkat TinyURL secara instan."),
            ("📦 .tempfile", "Penyimpanan File Cloud Sementara", "Balas atau kirim berkas/media apa saja dengan .tempfile untuk mendapatkan link unduhan langsung."),
            ("📬 .tempmail / .checkmail", "Email Sementara & Cek OTP", ".tempmail: membuat email acak gratis.\n.checkmail: memeriksa pesan dan kode verifikasi yang masuk.\n.changemail <nama>: ganti nama email."),
            ("📌 .pinterest <kueri>", "Pencarian & Unduh Pinterest", "Mencari dan mengunduh foto estetika resolusi tinggi dari Pinterest."),
            ("📖 .nulis <teks>", "Tulisan Tangan di Kertas Buku", "Mengubah teks panjang menjadi gambar kertas buku tulis bergaris dengan tulisan tangan rapi."),
            ("🎨 .emoji <emojis>", "Gabung Emoji Jadi Stiker", "Gabungkan hingga 20 emoji sekaligus menjadi satu stiker WhatsApp."),
            ("🧪 .emojimix <e1> <e2>", "Campur Emoji (Emoji Kitchen)", "Mencampur dua emoji menjadi stiker kombinasi unik resmi Google Emoji Kitchen."),
            ("👥 .grup buka / tutup", "Buka & Tutup Chat Grup Manual", "Khusus Admin Grup! Ketik .grup buka / .open untuk membuka chat semua anggota, atau .grup tutup / .close untuk mengunci chat agar hanya admin yang bisa berkirim pesan."),
            ("🔒 .only [add/del/list/on/off]", "Whitelist Chat yang Dibaca Bot", "Membatasi bot agar HANYA membaca dan merespon pesan di chat/grup yang didaftarkan. Berlaku untuk lebih dari satu chat/grup sekaligus!\n• .only add : Daftarkan chat ini\n• .only del : Hapus chat ini\n• .only list : Lihat daftar chat aktif\n• .only on / off : Aktifkan / matikan filter pembatasan"),
            ("👥 .jadwalgrup <buka/tutup> <jam>", "Otomasi Buka & Tutup Grup (Admin)", ".jadwalgrup tutup 22:00 : Mengunci chat grup otomatis tiap jam 22:00 WIB.\n.jadwalgrup buka 06:00 : Membuka chat grup otomatis tiap jam 06:00 WIB.\n.jadwalgrup daftar : Melihat jadwal aktif."),
            ("📑 .rangkum [jumlah]", "Ringkas Materi Teks & PDF/TXT", "Balas teks panjang atau dokumen PDF/TXT dengan .rangkum (contoh: .rangkum 5) untuk meringkas inti materi."),
            ("🛡️ Anti Bad Session", "Sistem Pemulihan Sesi", "Otomatis mencegah crash loop jika terjadi Bad MAC atau sesi kadaluarsa. Cukup klik tombol 'Reset Sesi WhatsApp' untuk memulai pairing ulang.")
        ]

        for cmd, title, desc in commands:
            card = ctk.CTkFrame(scroll_guide, corner_radius=8)
            card.pack(fill="x", pady=6, padx=4)

            lbl_title = ctk.CTkLabel(card, text=f"{cmd} - {title}", font=ctk.CTkFont(size=14, weight="bold"), text_color="#38bdf8")
            lbl_title.pack(anchor="w", padx=12, pady=(10, 2))

            lbl_desc = ctk.CTkLabel(card, text=desc, font=ctk.CTkFont(size=12), justify="left")
            lbl_desc.pack(anchor="w", padx=12, pady=(0, 10))

    def ensure_backend_running(self):
        """Periksa apakah backend node app.js sudah jalan"""
        try:
            r = requests.get(f"{API_URL}/api/status", timeout=1.5)
            if r.status_code == 200:
                return
        except:
            pass

        try:
            creation_flags = 0x08000000 if sys.platform == "win32" else 0
            self.node_process = subprocess.Popen(
                ["node", "app.js"],
                cwd=BASE_DIR,
                creationflags=creation_flags,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
        except Exception as e:
            self.txt_logs.insert("end", f"[ERROR] Gagal menjalankan node app.js: {e}\n")

    def background_polling(self):
        """Thread background untuk polling status dan log secara berkala"""
        while self.is_running:
            try:
                r = requests.get(f"{API_URL}/api/status", timeout=2.5)
                if r.status_code == 200:
                    data = r.json()
                    self.after(0, self.update_ui_state, data)
            except:
                self.after(0, self.set_offline_state)

            time.sleep(1.8)

    def update_ui_state(self, data):
        """Update komponen UI berdasarkan data dari backend"""
        status = data.get("status", "offline")
        pairing_code = data.get("pairingCode")
        uptime = data.get("uptime", 0)
        total_commands = data.get("totalCommands", 0)
        logs = data.get("logs", [])
        config = data.get("config", {})
        tunnel = data.get("tunnel", {})
        is_startup = data.get("isStartupEnabled", False)

        # Update Status Button
        if status == "open":
            self.btn_status.configure(text="🟢 ONLINE", fg_color="#065f46", hover_color="#047857")
            self.pairing_frame.pack_forget()
        elif status == "waiting_pairing":
            self.btn_status.configure(text="🔑 PAIRING", fg_color="#0369a1", hover_color="#0284c7")
            self.pairing_frame.pack(fill="x", padx=16, pady=(0, 8), before=self.tabview)
            self.lbl_pairing_code.configure(text=pairing_code if pairing_code else "MEMINTA KODE...")
        elif status == "connecting":
            self.btn_status.configure(text="🟡 CONNECTING", fg_color="#854d0e", hover_color="#a16207")
            self.pairing_frame.pack_forget()
        else:
            self.btn_status.configure(text="🔴 OFFLINE", fg_color="#7f1d1d", hover_color="#991b1b")
            self.pairing_frame.pack_forget()

        # Update Mode Badge
        mode = config.get("mode", "public")
        if mode == "private":
            self.lbl_mode_badge.configure(text="🔒 PRIVATE", fg_color="#4338ca", hover_color="#3730a3")
            if hasattr(self, 'seg_mode'): self.seg_mode.set("🔒 Private Mode (Hanya Bot)")
        else:
            self.lbl_mode_badge.configure(text="🌐 OPEN", fg_color="#0369a1", hover_color="#0284c7")
            if hasattr(self, 'seg_mode'): self.seg_mode.set("🌐 Open Mode (Publik)")

        # Update Tunnel Status
        self.is_tunnel_running = bool(tunnel.get("isRunning", False))
        self.tunnel_domain = config.get("tunnelDomain", "api.revicshop.web.id")
        if self.is_tunnel_running:
            self.lbl_tunnel_status.configure(text=f"🟢 AKTIF ({self.tunnel_domain})", text_color="#10b981")
        else:
            self.lbl_tunnel_status.configure(text="🔴 MATI", text_color="#ef4444")

        # Update Tray Tooltip
        if self.tray_icon:
            try:
                tray_text = f"EndLess Academy Bot ({'ONLINE' if status == 'open' else 'OFFLINE'}) | Tunnel: {'AKTIF' if self.is_tunnel_running else 'MATI'}"
                self.tray_icon.title = tray_text
            except:
                pass

        # Update Uptime & Total Commands
        d = uptime // 86400
        h = (uptime % 86400) // 3600
        m = (uptime % 3600) // 60
        s = uptime % 60
        uptime_str = f"{d}d {h}j {m}m {s}d" if d > 0 else f"{h}j {m}m {s}d" if h > 0 else f"{m}m {s}d"
        self.lbl_stat_uptime.configure(text=f"⏱️ Uptime: {uptime_str}")
        self.lbl_stat_commands.configure(text=f"⚡ Total Command: {total_commands}")

        # Isi form saat awal dibuka
        if not self.config_data and config:
            self.config_data = config
            self.ent_botname.delete(0, "end")
            self.ent_botname.insert(0, config.get("botName", "EndLess Academy Bot"))

            self.ent_prefix.delete(0, "end")
            self.ent_prefix.insert(0, config.get("prefix", "."))

            self.ent_number.delete(0, "end")
            self.ent_number.insert(0, config.get("botNumber", ""))

            self.ent_delay.delete(0, "end")
            self.ent_delay.insert(0, str(config.get("webhookDelaySeconds", 60)))

            self.ent_packname.delete(0, "end")
            self.ent_packname.insert(0, config.get("packname", "EndLessAcademy"))

            self.txt_author.delete("1.0", "end")
            self.txt_author.insert("1.0", config.get("author", ""))

            self.ent_tunnel_domain.delete(0, "end")
            self.ent_tunnel_domain.insert(0, config.get("tunnelDomain", "api.revicshop.web.id"))

            self.ent_tunnel_token.delete(0, "end")
            self.ent_tunnel_token.insert(0, config.get("tunnelToken", ""))

            self.chk_startup_var.set(is_startup)
            self.lbl_endpoint_sample.configure(
                text=f"Contoh Endpoint: https://{self.tunnel_domain}/api/v1?number=1010&code=123456"
            )

        # Append new logs
        if logs:
            last_id = logs[-1].get("id")
            if last_id != self.last_log_id:
                self.last_log_id = last_id
                self.txt_logs.delete("1.0", "end")
                for item in logs[-150:]:
                    tag = item.get("type", "info").upper()
                    t = item.get("time", "")
                    msg = item.get("text", "")
                    self.txt_logs.insert("end", f"[{t}] [{tag}] {msg}\n")
                self.txt_logs.see("end")

    def set_offline_state(self):
        self.btn_status.configure(text="🔴 DISCONNECTED", fg_color="#7f1d1d")
        self.pairing_frame.pack_forget()

    def send_action(self, action):
        threading.Thread(target=self._exec_action, args=(action,), daemon=True).start()

    def _exec_action(self, action):
        try:
            r = requests.post(f"{API_URL}/api/action", json={"action": action}, timeout=8)
            msg = r.json().get("message", "Aksi dikirim")
            self.after(0, lambda: messagebox.showinfo("Informasi", msg))
        except Exception as e:
            self.after(0, lambda: messagebox.showerror("Gagal", f"Tidak dapat terhubung ke bot: {e}"))

    def start_tunnel(self):
        token = self.ent_tunnel_token.get().strip()
        def _start():
            try:
                r = requests.post(f"{API_URL}/api/tunnel/start", json={"token": token}, timeout=8)
                msg = r.json().get("message", "Tunnel dijalankan")
                self.after(0, lambda: messagebox.showinfo("Tunnel", msg))
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Gagal", f"Error memulai tunnel: {e}"))
        threading.Thread(target=_start, daemon=True).start()

    def stop_tunnel(self):
        def _stop():
            try:
                r = requests.post(f"{API_URL}/api/tunnel/stop", timeout=8)
                msg = r.json().get("message", "Tunnel dihentikan")
                self.after(0, lambda: messagebox.showinfo("Tunnel", msg))
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Gagal", f"Error menghentikan tunnel: {e}"))
        threading.Thread(target=_stop, daemon=True).start()

    def send_webhook_test(self):
        target = self.ent_web_target.get().strip()
        code = self.ent_web_code.get().strip()

        if not target or not code:
            messagebox.showwarning("Peringatan", "Nomor target dan kode verifikasi wajib diisi.")
            return

        self.lbl_webhook_result.configure(text="⏳ Mengirim kode verifikasi via webhook...")

        def _send():
            try:
                url = f"{API_URL}/api/v1?number={target}&code={code}"
                r = requests.get(url, timeout=15)
                data = r.json()

                if r.status_code == 200 and data.get("success"):
                    res_text = (
                        f"✅ KODE VERIFIKASI BERHASIL DIKIRIM!\n"
                        f"Target: {data.get('target')}\n"
                        f"Kode: {data.get('code')}\n"
                        f"⏱️ Waktu Respon Sampai: {data.get('elapsedSec')} detik ({data.get('elapsedMs')}ms)"
                    )
                    self.after(0, lambda: self.lbl_webhook_result.configure(text=res_text, text_color="#10b981"))
                    self.after(0, lambda: self.lbl_cooldown_indicator.configure(text=""))
                elif r.status_code == 429:
                    rem = data.get("remainingSeconds", 60)
                    res_text = (
                        f"⚠️ COOLDOWN AKTIF (DELAY 60 DETIK):\n"
                        f"{data.get('message')}\n"
                        f"Sisa Waktu: {rem} detik"
                    )
                    self.after(0, lambda: self.lbl_webhook_result.configure(text=res_text, text_color="#f59e0b"))
                    self.after(0, lambda: self.lbl_cooldown_indicator.configure(text=f"⏳ Delay: {rem}s"))
                else:
                    self.after(0, lambda: self.lbl_webhook_result.configure(text=f"❌ Gagal: {data.get('message')}", text_color="#ef4444"))
            except Exception as e:
                self.after(0, lambda: self.lbl_webhook_result.configure(text=f"❌ Error: {e}", text_color="#ef4444"))

        threading.Thread(target=_send, daemon=True).start()

    def toggle_mode_quick(self, icon=None, item_menu=None):
        """Toggle cepat antara Public / Open Mode dan Private Mode"""
        current_text = self.lbl_mode_badge.cget("text")
        new_mode = "public" if "PRIVATE" in current_text else "private"

        def _do_toggle():
            try:
                requests.post(f"{API_URL}/api/settings", json={"mode": new_mode}, timeout=5)
            except:
                pass

        threading.Thread(target=_do_toggle, daemon=True).start()

    def save_settings(self):
        payload = {
            "botName": self.ent_botname.get().strip(),
            "prefix": self.ent_prefix.get().strip(),
            "mode": "private" if "Private" in self.seg_mode.get() else "public",
            "botNumber": self.ent_number.get().strip(),
            "webhookDelaySeconds": int(self.ent_delay.get().strip() or 60),
            "packname": self.ent_packname.get().strip(),
            "author": self.txt_author.get("1.0", "end-1c"),
            "tunnelDomain": self.ent_tunnel_domain.get().strip(),
            "tunnelToken": self.ent_tunnel_token.get().strip()
        }

        def _save():
            try:
                r = requests.post(f"{API_URL}/api/settings", json=payload, timeout=5)
                if r.json().get("success"):
                    self.after(0, lambda: messagebox.showinfo("Sukses", "Pengaturan bot & domain berhasil disimpan!"))
                    self.after(0, lambda: self.lbl_endpoint_sample.configure(
                        text=f"Contoh Endpoint: https://{payload['tunnelDomain']}/api/v1?number=1010&code=123456"
                    ))
                else:
                    self.after(0, lambda: messagebox.showerror("Gagal", "Gagal menyimpan pengaturan."))
            except Exception as e:
                self.after(0, lambda: messagebox.showerror("Error", f"Gagal menghubungi server: {e}"))

        threading.Thread(target=_save, daemon=True).start()

    def toggle_startup(self):
        enable = self.chk_startup_var.get()
        def _toggle():
            try:
                requests.post(f"{API_URL}/api/startup", json={"enable": enable}, timeout=5)
            except:
                pass
        threading.Thread(target=_toggle, daemon=True).start()

    def reset_session(self):
        if messagebox.askyesno("Konfirmasi Reset Sesi", "Yakin ingin mereset sesi WhatsApp? Folder sesi akan dihapus dan Anda perlu pairing ulang."):
            self.send_action("clear_session")

    def copy_pairing_code(self):
        code = self.lbl_pairing_code.cget("text")
        if code and "MEMINTA" not in code:
            self.clipboard_clear()
            self.clipboard_append(code)
            messagebox.showinfo("Tersalin", f"Kode {code} berhasil disalin ke clipboard!")

    def open_web_dashboard(self):
        webbrowser.open(API_URL)

    def clear_logs(self):
        self.txt_logs.delete("1.0", "end")


class LauncherSelectorDialog(ctk.CTk):
    """Dialog pilihan mode saat pertama kali dijalankan"""
    def __init__(self):
        super().__init__()
        self.title("EndLess Academy - Pilih Mode Menjalankan")
        self.geometry("540x510")
        self.resizable(False, False)

        if os.path.exists(LOGO_ICO):
            try:
                self.iconbitmap(LOGO_ICO)
            except:
                pass

        self.selected_mode = None

        # Posisi di tengah layar
        self.update_idletasks()
        x = (self.winfo_screenwidth() - 560) // 2
        y = (self.winfo_screenheight() - 590) // 2
        self.geometry(f"560x590+{x}+{y}")

        self.var_bot = ctk.BooleanVar(value=True)
        self.var_tunnel = ctk.BooleanVar(value=True)

        self.build_ui()

    def build_ui(self):
        # Header Frame
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=24, pady=(20, 12))

        if os.path.exists(LOGO_PNG):
            try:
                img = Image.open(LOGO_PNG)
                ctk_img = ctk.CTkImage(light_image=img, dark_image=img, size=(54, 54))
                lbl_icon = ctk.CTkLabel(header, image=ctk_img, text="")
                lbl_icon.pack(side="left", padx=(0, 14))
            except:
                pass

        title_box = ctk.CTkFrame(header, fg_color="transparent")
        title_box.pack(side="left", fill="both", expand=True)

        ctk.CTkLabel(
            title_box,
            text="EndLess Academy WhatsApp Bot",
            font=ctk.CTkFont(size=17, weight="bold"),
            text_color="#38bdf8"
        ).pack(anchor="w")

        ctk.CTkLabel(
            title_box,
            text="Pilih mode & opsi layanan yang ingin dijalankan:",
            font=ctk.CTkFont(size=12),
            text_color="#94a3b8"
        ).pack(anchor="w", pady=(2, 0))

        # Pilihan 1: Terminal + Desktop App + Web
        card_full = ctk.CTkFrame(self, corner_radius=10, fg_color="#1e293b", border_width=1, border_color="#334155")
        card_full.pack(fill="x", padx=24, pady=6)

        btn_full = ctk.CTkButton(
            card_full,
            text="🖥️  Terminal + App Desktop + Web",
            font=ctk.CTkFont(size=14, weight="bold"),
            height=38,
            fg_color="#2563eb",
            hover_color="#1d4ed8",
            command=self.choose_full
        )
        btn_full.pack(fill="x", padx=16, pady=(12, 4))

        lbl_desc_full = ctk.CTkLabel(
            card_full,
            text="• Berjalan senyap di Taskbar & System Tray (Xoezn Style)\n• Jendela & Web Browser tidak langsung terbuka otomatis\n• Klik kanan icon Taskbar untuk Buka Dashboard / Web kapan saja",
            font=ctk.CTkFont(size=11),
            text_color="#cbd5e1",
            justify="left"
        )
        lbl_desc_full.pack(anchor="w", padx=18, pady=(0, 10))

        # Pilihan 2: Web Only
        card_web = ctk.CTkFrame(self, corner_radius=10, fg_color="#1e293b", border_width=1, border_color="#334155")
        card_web.pack(fill="x", padx=24, pady=6)

        btn_web = ctk.CTkButton(
            card_web,
            text="🌐  Web Only (Tanpa Desktop App)",
            font=ctk.CTkFont(size=14, weight="bold"),
            height=38,
            fg_color="#059669",
            hover_color="#047857",
            command=self.choose_web
        )
        btn_web.pack(fill="x", padx=16, pady=(12, 4))

        lbl_desc_web = ctk.CTkLabel(
            card_web,
            text="• Hanya menjalankan server backend & bot di latar belakang\n• Tidak membuka jendela apapun secara tiba-tiba (Hemat memori)\n• Akses kontrol via klik kanan icon di Taskbar System Tray",
            font=ctk.CTkFont(size=11),
            text_color="#cbd5e1",
            justify="left"
        )
        lbl_desc_web.pack(anchor="w", padx=18, pady=(0, 10))

        # Layanan Services Auto-Start Toggles
        card_services = ctk.CTkFrame(self, corner_radius=10, fg_color="#0f172a", border_width=1, border_color="#334155")
        card_services.pack(fill="x", padx=24, pady=8)

        ctk.CTkLabel(
            card_services,
            text="⚙️  Pengaturan Startup Layanan (Start Server/Bot/Tunnel):",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color="#7dd3fc"
        ).pack(anchor="w", padx=16, pady=(10, 4))

        cb_bot = ctk.CTkCheckBox(
            card_services,
            text="Mulai WhatsApp Bot otomatis sejak awal",
            variable=self.var_bot,
            font=ctk.CTkFont(size=12),
            text_color="#f8fafc"
        )
        cb_bot.pack(anchor="w", padx=18, pady=4)

        cb_tunnel = ctk.CTkCheckBox(
            card_services,
            text="Mulai Cloudflare Tunnel (api.revicshop.web.id) otomatis sejak awal",
            variable=self.var_tunnel,
            font=ctk.CTkFont(size=12),
            text_color="#f8fafc"
        )
        cb_tunnel.pack(anchor="w", padx=18, pady=(4, 12))

    def save_services_config(self):
        try:
            config_path = os.path.join(BASE_DIR, "config.js")
            if os.path.exists(config_path):
                with open(config_path, "r", encoding="utf-8") as f:
                    content = f.read()
                b_val = "true" if self.var_bot.get() else "false"
                t_val = "true" if self.var_tunnel.get() else "false"
                if "autoStartBot:" in content:
                    content = re.sub(r"autoStartBot:\s*(true|false)", f"autoStartBot: {b_val}", content)
                if "autoStartTunnel:" in content:
                    content = re.sub(r"autoStartTunnel:\s*(true|false)", f"autoStartTunnel: {t_val}", content)
                with open(config_path, "w", encoding="utf-8") as f:
                    f.write(content)
        except Exception as e:
            print("Config save error:", e)

    def choose_full(self):
        self.save_services_config()
        self.selected_mode = "full"
        self.destroy()

    def choose_web(self):
        self.save_services_config()
        self.selected_mode = "web"
        self.destroy()


def start_backend(show_console=False):
    """Jalankan backend node app.js secara senyap atau di terminal console"""
    try:
        r = requests.get(f"{API_URL}/api/status", timeout=1.0)
        if r.status_code == 200:
            return True
    except:
        pass

    try:
        if sys.platform == "win32":
            if show_console:
                subprocess.Popen(
                    'start "WhatsApp Bot - Terminal Console" cmd.exe /k "node app.js"',
                    cwd=BASE_DIR,
                    shell=True
                )
            else:
                creation_flags = 0x08000000  # CREATE_NO_WINDOW (senyap tanpa popup jendela hitam)
                subprocess.Popen(
                    ["node", "app.js"],
                    cwd=BASE_DIR,
                    creationflags=creation_flags,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
        else:
            subprocess.Popen(["node", "app.js"], cwd=BASE_DIR)
        return True
    except Exception as e:
        print("Gagal menjalankan backend:", e)
        return False


MODE_FILE = os.path.join(BASE_DIR, "data", "app_mode.json")

def get_saved_mode():
    try:
        if os.path.exists(MODE_FILE):
            with open(MODE_FILE, "r", encoding="utf-8") as f:
                return json.load(f).get("mode", "full")
    except:
        pass
    return None

def save_mode(mode):
    try:
        os.makedirs(os.path.dirname(MODE_FILE), exist_ok=True)
        with open(MODE_FILE, "w", encoding="utf-8") as f:
            json.dump({"mode": mode}, f, indent=2)
    except:
        pass


if __name__ == "__main__":
    is_setup_call = "--set" in sys.argv or "--setup" in sys.argv
    saved = get_saved_mode()

    if is_setup_call or not saved:
        # Tampilkan Dialog Pemilihan Mode (dari set_app.bat atau saat awal pertama kali)
        selector = LauncherSelectorDialog()
        selector.mainloop()
        chosen = selector.selected_mode
        if not chosen:
            sys.exit(0)
        save_mode(chosen)
    else:
        # Dijalankan langsung dari run_app.bat tanpa memunculkan dialog lagi
        chosen = saved

    # Backend berjalan senyap di background tanpa popup console atau browser
    start_backend(show_console=False)

    # Aplikasi berjalan senyap di Taskbar Tray (Xoezn Cloud style)
    # Tidak langsung membuka jendela atau browser saat mulai (bisa dibuka via klik kanan tray)
    app = WhatsAppBotApp(start_minimized=True)
    app.mainloop()

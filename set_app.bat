@echo off
title EndLess Academy - Pengaturan Mode (set_app)
cd /d "%~dp0"

:: Jalankan dialog pemilihan mode
if exist "EndLessAcademy.exe" (
    start "" "EndLessAcademy.exe" --set
) else (
    start pythonw gui_app.py --set
)

exit

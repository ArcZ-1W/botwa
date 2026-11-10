@echo off
title EndLess Academy - Jalankan Bot (run_app)
cd /d "%~dp0"

:: Jalankan langsung bot sesuai mode yang telah diatur
if exist "EndLessAcademy.exe" (
    start "" "EndLessAcademy.exe" --run
) else (
    start pythonw gui_app.py --run
)

exit

@echo off
echo 🚀 GPS Data Converter
echo ====================

REM Zkontroluj Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python není nainstalován nebo není v PATH
    pause
    exit /b 1
)

REM Nainstaluj závislosti
echo 📦 Instaluji závislosti...
pip install -r requirements_converter.txt

REM Spusť konverzi
echo 🔄 Spouštím konverzi...
python convert_gps_data.py

echo.
echo ✅ Hotovo! Stiskněte libovolnou klávesu pro ukončení.
pause

@echo off
echo ========================================
echo    Lofi Radio Player Packager
echo ========================================
echo.
echo Choose your packaging method:
echo.
echo 1. Quick Portable Version (electron-packager)
echo 2. Full Installer (electron-builder)
echo.
set /p choice="Enter your choice (1 or 2): "

if "%choice%"=="1" goto :portable
if "%choice%"=="2" goto :installer
goto :invalid

:invalid
echo Invalid choice. Please enter 1 or 2.
pause
exit /b 1

:portable
echo.
echo Creating portable version with electron-packager...
echo This is faster and creates a portable app.
echo.

REM 检查electron-packager
if not exist "node_modules\.bin\electron-packager.cmd" (
    echo Installing electron-packager...
    call npm install --save-dev electron-packager
    if errorlevel 1 (
        echo Failed to install electron-packager
        pause
        exit /b 1
    )
)

REM 清理旧的dist目录
if exist "dist" rmdir /s /q "dist"

REM 创建便携版
call npx electron-packager . --platform=win32 --arch=x64 --out=dist --overwrite --icon=icon.ico --prune=true

if errorlevel 1 (
    echo Portable build failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo Portable version created successfully!
echo ========================================
echo.
echo Your portable app is in: dist\lofi-radio-player-win32-x64\
echo.
echo To run: Double-click lofi-radio-player.exe
echo.
echo This version works without installation!
echo.
goto :end

:installer
echo.
echo Creating full installer with electron-builder...
echo This creates a proper Windows installer (.exe)
echo.

REM 检查electron-builder
if not exist "node_modules\.bin\electron-builder.cmd" (
    echo Installing electron-builder...
    call npm install --save-dev electron-builder
    if errorlevel 1 (
        echo Failed to install electron-builder
        pause
        exit /b 1
    )
)

REM 清理旧的release目录
if exist "release" rmdir /s /q "release"

REM 创建安装程序
call npx electron-builder --win --publish=never

if errorlevel 1 (
    echo Installer build failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo Installer created successfully!
echo ========================================
echo.
echo Your installer is in: release\
echo - Look for "Lofi Radio Player Setup X.X.X.exe"
echo.
echo Double-click the .exe file to install your app!
echo.
goto :end

:end
echo.
echo Shortcuts:
echo - Alt+Q: Toggle mute
echo - Alt+A: Toggle mini mode
echo - Click vinyl record: Play/Pause
echo.
echo Enjoy your music! 🎵
echo.
pause
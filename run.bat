@echo off
echo ========================================
echo    Lofi Radio Widget Launcher
echo ========================================
echo.
echo Select mode:
echo 1. Normal Lofi Radio Widget
echo 2. Test Rounded Window Effect (20px radius)
echo 3. Test Rounded Window Effect (16px radius)
echo 4. Test Rounded Window Effect (24px radius)
echo.
set /p choice="Enter your choice (1-4): "

if "%choice%"=="4" goto :test_rounded_24px
if "%choice%"=="3" goto :test_rounded_16px
if "%choice%"=="2" goto :test_rounded
if "%choice%"=="1" goto :normal_app
goto :invalid_choice

:invalid_choice
echo Invalid choice. Please enter 1 or 2.
echo.
pause
exit /b 1

:test_rounded
echo.
echo ========================================
echo    Testing Rounded Window Effect
echo ========================================
echo.
echo Checking system requirements...
echo.

REM 检查 Node.js 是否安装
echo Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please download and install Node.js from:
    echo https://nodejs.org/
    echo.
    echo Choose the LTS version and follow the installation wizard.
    echo.
    goto :error
)

REM 显示 Node.js 版本
for /f "tokens=*" %%i in ('node --version') do echo [OK] Node.js version: %%i

REM 检查 npm 是否安装
echo.
echo Checking npm...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed!
    echo.
    echo Please reinstall Node.js from https://nodejs.org/
    echo npm comes bundled with Node.js.
    echo.
    goto :error
)

REM 显示 npm 版本
for /f "tokens=*" %%i in ('npm --version') do echo [OK] npm version: %%i

REM 检查 node_modules 是否存在
echo.
if exist "node_modules" (
    echo [OK] Dependencies already installed
) else (
    echo Installing dependencies...
    echo This may take a few minutes...
    echo.
    npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Failed to install dependencies!
        echo.
        echo Possible solutions:
        echo 1. Check your internet connection
        echo 2. Try running as administrator
        echo 3. Delete node_modules folder and try again
        echo.
        goto :error
    )
    echo.
    echo [OK] Dependencies installed successfully
)

goto :normal_app

:normal_app
echo.
echo ========================================
echo Starting Lofi Radio Widget...
echo ========================================
echo.
echo The widget should appear in the CENTER of your screen.
echo If you don't see it, try Alt+Tab to switch windows.
echo.
echo Controls:
echo - Click the play button to start music
echo - Drag the volume slider to adjust volume
echo - Press Alt+Q for quick play/pause
echo - Click the X to close the app
echo.
echo Waiting 3 seconds for audio to load...
timeout /t 3 /nobreak >nul
echo.
npm start
goto :end

:test_rounded_24px
echo.
echo ========================================
echo Testing Rounded Window Effect (24px)...
echo ========================================
echo.
echo The test window should appear with 24px border radius.
echo Press Ctrl+C to close or click the X button.
echo.
node main.js --test-rounded --radius=24px
goto :end

:test_rounded_16px
echo.
echo ========================================
echo Testing Rounded Window Effect (16px)...
echo ========================================
echo.
echo The test window should appear with 16px border radius.
echo Press Ctrl+C to close or click the X button.
echo.
node main.js --test-rounded --radius=16px
goto :end

:test_rounded
REM 检查 node_modules 是否存在
echo.
if exist "node_modules" (
    echo [OK] Dependencies already installed
) else (
    echo Installing dependencies...
    echo This may take a few minutes...
    echo.
    npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Failed to install dependencies!
        echo.
        echo Possible solutions:
        echo 1. Check your internet connection
        echo 2. Try running as administrator
        echo 3. Delete node_modules folder and try again
        echo.
        goto :error
    )
    echo.
    echo [OK] Dependencies installed successfully
)

echo.
echo ========================================
echo Testing Rounded Window Effect...
echo ========================================
echo.
echo The test window should appear in the CENTER of your screen.
echo This window tests the custom rounded corners and shadows.
echo.
echo Test features:
echo - Rounded corners (24px border-radius)
echo - Custom CSS shadows (no system shadows)
echo - Window dragging (except buttons)
echo - Clickable buttons
echo.
echo Press Ctrl+C to close or click the X button.
echo.
node main.js --test-rounded

goto :end

:error
echo.
echo Press any key to exit...
pause >nul

:end
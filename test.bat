@echo off
echo ========================================
echo    Lofi Radio Widget - System Check
echo ========================================
echo.

echo Checking Node.js installation...
node --version 2>nul
if %errorlevel% neq 0 (
    echo [FAIL] Node.js is NOT installed
    echo.
    echo To install Node.js:
    echo 1. Go to https://nodejs.org/
    echo 2. Download the LTS version
    echo 3. Run the installer
    echo 4. Restart this command prompt
    echo.
) else (
    for /f "tokens=*" %%i in ('node --version') do echo [OK] Node.js: %%i
)

echo.
echo Checking npm installation...
npm --version 2>nul
if %errorlevel% neq 0 (
    echo [FAIL] npm is NOT installed
    echo.
    echo npm should come with Node.js.
    echo Please reinstall Node.js from https://nodejs.org/
    echo.
) else (
    for /f "tokens=*" %%i in ('npm --version') do echo [OK] npm: %%i
)

echo.
echo Checking project files...
if exist "package.json" (
    echo [OK] package.json found
) else (
    echo [FAIL] package.json not found
)

if exist "main.js" (
    echo [OK] main.js found
) else (
    echo [FAIL] main.js not found
)

if exist "node_modules" (
    echo [OK] node_modules found
) else (
    echo [WARN] node_modules not found - run 'npm install' first
)

echo.
echo ========================================
echo If all checks pass, try running run.bat
echo ========================================
echo.
pause
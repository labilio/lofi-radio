# Lofi Radio Widget - System Check PowerShell Script
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Lofi Radio Widget - System Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = & node --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Node.js installed: $nodeVersion" -ForegroundColor Green
    } else {
        throw "Node.js not found"
    }
} catch {
    Write-Host "[FAIL] Node.js is NOT installed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "To install Node.js:" -ForegroundColor Yellow
    Write-Host "1. Go to https://nodejs.org/" -ForegroundColor White
    Write-Host "2. Download the LTS version" -ForegroundColor White
    Write-Host "3. Run the installer as administrator" -ForegroundColor White
    Write-Host "4. Restart your computer" -ForegroundColor White
    Write-Host "5. Try running this script again" -ForegroundColor White
    Write-Host ""
    exit 1
}

# Check npm
Write-Host ""
Write-Host "Checking npm..." -ForegroundColor Yellow
try {
    $npmVersion = & npm --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] npm installed: v$npmVersion" -ForegroundColor Green
    } else {
        throw "npm not found"
    }
} catch {
    Write-Host "[FAIL] npm is NOT installed!" -ForegroundColor Red
    Write-Host "npm should come with Node.js. Please reinstall Node.js." -ForegroundColor Red
    exit 1
}

# Check project files
Write-Host ""
Write-Host "Checking project files..." -ForegroundColor Yellow
$filesToCheck = @("package.json", "main.js", "index.html", "styles.css", "widget.js")
foreach ($file in $filesToCheck) {
    if (Test-Path $file) {
        Write-Host "[OK] $file found" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $file not found" -ForegroundColor Red
    }
}

# Check node_modules
Write-Host ""
if (Test-Path "node_modules") {
    Write-Host "[OK] node_modules directory exists" -ForegroundColor Green
} else {
    Write-Host "[WARN] node_modules not found - dependencies not installed" -ForegroundColor Yellow
    Write-Host "Run 'npm install' to install dependencies" -ForegroundColor White
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "System check complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. If all checks passed, run: .\run.bat" -ForegroundColor White
Write-Host "2. If dependencies are missing, run: npm install" -ForegroundColor White
Write-Host "3. Then run: npm start" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to exit"
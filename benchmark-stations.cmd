@echo off
chcp 65001 >nul
setlocal
node "%~dp0scripts\station-network-benchmark.js" %*
set "BENCHMARK_EXIT=%ERRORLEVEL%"
echo.
if not defined LOFI_BENCHMARK_NO_PAUSE pause
exit /b %BENCHMARK_EXIT%

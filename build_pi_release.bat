@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title SnowLuma - Build Raspberry Pi ARM64 Release

echo ========================================
echo   SnowLuma Raspberry Pi ARM64 Builder
echo ========================================
echo.

where node >nul 2>nul || goto :missing_node
where corepack >nul 2>nul || goto :missing_corepack
where tar >nul 2>nul || goto :missing_tar

for /f "delims=" %%V in ('node -p "require('./package.json').packageManager"') do set PACKAGE_MANAGER=%%V
if /I not "%PACKAGE_MANAGER%"=="pnpm@10.28.0" (
  echo [ERROR] package.json requires pnpm@10.28.0, got %PACKAGE_MANAGER%.
  goto :failed
)

call corepack enable
if errorlevel 1 goto :failed
call corepack prepare pnpm@10.28.0 --activate
if errorlevel 1 goto :failed

if not exist node_modules (
  echo [INFO] Installing dependencies...
  call pnpm install --frozen-lockfile
  if errorlevel 1 goto :failed
)

echo [INFO] Building self-hosted Linux ARM64 package...
node tools\package-linux-arm64.mjs
if errorlevel 1 goto :failed

echo.
echo [OK] Package created under release\
pause
exit /b 0

:missing_node
echo [ERROR] Node.js is not installed. Install the project-supported Node.js first.
goto :failed

:missing_corepack
echo [ERROR] Corepack is not available.
goto :failed

:missing_tar
echo [ERROR] tar.exe is not available. Modern Windows 10/11 normally includes it.
goto :failed

:failed
echo.
echo [FAILED] Raspberry Pi ARM64 package was not created.
pause
exit /b 1

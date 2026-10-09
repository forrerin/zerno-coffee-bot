@echo off
chcp 65001 >nul
title Zerno coffee bot
cd /d "%~dp0"

findstr /r /c:"^BOT_TOKEN=[0-9]" config.env .env >nul 2>&1
if errorlevel 1 (
  echo.
  echo  [!] Bot token is not set.
  echo      Open config.env, paste your token after BOT_TOKEN= and save the file.
  echo      Get a token from @BotFather in Telegram: /newbot
  echo.
  pause
  exit /b 1
)

if not exist "backend\.venv\Scripts\python.exe" (
  echo First run: installing Python packages, this takes 1-2 minutes...
  python -m venv backend\.venv
  if errorlevel 1 goto nopython
  backend\.venv\Scripts\python -m pip install -q --disable-pip-version-check -r backend\requirements.txt aiosqlite fakeredis
  if errorlevel 1 goto fail
)

if not exist "webapp\dist\index.html" (
  echo Building Mini App...
  pushd webapp
  call npm install --no-fund --no-audit
  if errorlevel 1 goto fail
  call npm run build
  if errorlevel 1 goto fail
  popd
)

echo.
echo  Bot is starting. Open your bot in Telegram and press /start
echo  Keep this window open: closing it stops the bot.
echo.
set PYTHONIOENCODING=utf-8
backend\.venv\Scripts\python.exe -u backend\run_local.py
echo.
echo Bot stopped.
pause
exit /b 0

:nopython
echo.
echo  [!] Python not found. Install Python 3.12+ from https://www.python.org/downloads/
echo      and tick "Add python.exe to PATH" in the installer. Then run start.bat again.
pause
exit /b 1

:fail
echo.
echo  [!] Setup error. Check your internet connection and run start.bat again.
if exist "backend\.venv" rmdir /s /q "backend\.venv"
pause
exit /b 1

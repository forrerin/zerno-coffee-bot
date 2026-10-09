"""Запуск всего проекта одной командой, без Docker.

API + Mini App + бот + планировщик в одном процессе, SQLite и in-memory Redis,
HTTPS-адрес для Mini App — бесплатный туннель localhost.run (через ssh) или Cloudflare.

    python run_local.py

Для сервера используйте docker compose (PostgreSQL + Redis + Nginx).
"""

import asyncio
import logging
import os
import re
import json
import shutil
import subprocess
import sys
import urllib.request
from urllib.parse import urlencode

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(ROOT)
sys.path.insert(0, ROOT)
os.chdir(ROOT)

os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{ROOT}/local.db")
os.environ.setdefault("REDIS_URL", "memory://")
os.environ.setdefault("MEDIA_DIR", os.path.join(ROOT, "media"))
os.environ.setdefault("LOG_FILE", os.path.join(ROOT, "logs", "zerno.log"))

PORT = int(os.environ.get("LOCAL_PORT", "8080"))
DIST = os.path.join(PROJECT, "webapp", "dist")
TUNNEL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")

log = logging.getLogger("zerno.local")


def find_cloudflared() -> str | None:
    found = shutil.which("cloudflared")
    if found:
        return found
    for candidate in (
        r"C:\Program Files (x86)\cloudflared\cloudflared.exe",
        r"C:\Program Files\cloudflared\cloudflared.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Links\cloudflared.exe"),
    ):
        if os.path.exists(candidate):
            return candidate
    return None


LHR_RE = re.compile(r"https://[a-z0-9]+\.lhr\.life")


def github_token() -> str | None:
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        return token
    gh = shutil.which("gh") or r"C:\Program Files\GitHub CLI\gh.exe"
    if not os.path.exists(gh):
        return None
    try:
        out = subprocess.run([gh, "auth", "token"], capture_output=True, text=True, timeout=15)
        return out.stdout.strip() or None
    except Exception:
        return None


def publish_api_url(gist_id: str, url: str) -> None:
    """Записывает текущий адрес API в gist — Mini App на GitHub Pages читает его при старте."""
    token = github_token()
    if not token:
        log.warning("Нет токена GitHub — адрес API в gist не обновлён")
        return
    body = json.dumps({"files": {"zerno-api.json": {"content": json.dumps({"api": url})}}}).encode()
    req = urllib.request.Request(
        f"https://api.github.com/gists/{gist_id}", data=body, method="PATCH",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
    )
    try:
        urllib.request.urlopen(req, timeout=20).read()
        log.info("Адрес API опубликован в gist")
    except Exception:
        log.exception("Не удалось обновить gist")


class Tunnel:
    """HTTPS-туннель до локального сервера с автоперезапуском.

    Основной вариант — localhost.run через встроенный в Windows ssh (работает и там,
    где Cloudflare заблокирован). Запасной — Cloudflare quick tunnel.
    Бесплатные адреса иногда меняются: on_url вызывается при каждом новом адресе.
    """

    def __init__(self, on_url):
        self.on_url = on_url
        self.url: str | None = None
        self.proc: asyncio.subprocess.Process | None = None
        self.first_url = asyncio.get_running_loop().create_future()

    def commands(self) -> list[tuple[list[str], re.Pattern, str]]:
        variants = []
        ssh = shutil.which("ssh")
        if ssh:
            variants.append(([
                ssh, "-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30",
                "-o", "ExitOnForwardFailure=yes", "-R", f"80:127.0.0.1:{PORT}", "nokey@localhost.run",
            ], LHR_RE, "stdout"))
        cf = find_cloudflared()
        if cf:
            variants.append(([cf, "tunnel", "--no-autoupdate", "--protocol", "http2", "--url", f"http://127.0.0.1:{PORT}"], TUNNEL_RE, "stderr"))
        return variants

    async def run(self) -> None:
        variants = self.commands()
        if not variants:
            log.warning("Нет ssh и cloudflared — Mini App доступна только по http://localhost:%s", PORT)
            self.first_url.set_result(None)
            return
        attempt = 0
        while True:
            cmd, pattern, stream_name = variants[attempt % len(variants)]
            self.proc = await asyncio.create_subprocess_exec(
                *cmd, stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            )
            got_url = await self._watch(getattr(self.proc, stream_name), pattern, other=self.proc.stdout if stream_name == "stderr" else self.proc.stderr)
            if not got_url:
                attempt += 1  # этот вариант не дал адреса — пробуем следующий
            if not self.first_url.done() and attempt >= len(variants) * 2:
                self.first_url.set_result(None)
            log.warning("Туннель отключился, переподключаюсь…")
            await asyncio.sleep(3)

    async def _watch(self, stream, pattern: re.Pattern, other) -> bool:
        async def drain(s):
            while await s.readline():
                pass

        drainer = asyncio.create_task(drain(other))
        got = False
        while True:
            line = await stream.readline()
            if not line:
                break
            m = pattern.search(line.decode(errors="ignore"))
            if m and m.group(0) != self.url:
                got = True
                self.url = m.group(0)
                if not self.first_url.done():
                    self.first_url.set_result(self.url)
                await self.on_url(self.url)
        drainer.cancel()
        await self.proc.wait()
        return got

    def stop(self) -> None:
        if self.proc and self.proc.returncode is None:
            self.proc.terminate()


async def main() -> None:
    import uvicorn
    from fastapi.staticfiles import StaticFiles

    from app.config import settings
    from app.db import SessionLocal, init_db
    from app.logging_setup import setup_logging
    from app.main import app
    from app.seed import seed

    setup_logging("local")
    if not os.path.isdir(DIST):
        raise SystemExit("Нет сборки Mini App: выполните `npm install && npm run build` в папке webapp")

    await init_db()
    async with SessionLocal() as session:
        await seed(session)

    class CachedStatic(StaticFiles):
        """Ассеты Vite с хешем в имени кешируем навсегда — повторное открытие без загрузки."""

        def file_response(self, full_path, stat_result, scope, status_code=200):
            response = super().file_response(full_path, stat_result, scope, status_code)
            if "assets" in str(full_path):
                response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            else:
                response.headers["Cache-Control"] = "no-cache"
            return response

    # Mini App отдаём тем же сервером, что и API — один адрес, без CORS
    app.mount("/", CachedStatic(directory=DIST, html=True), name="webapp")
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level=os.environ.get("LOCAL_LOG", "warning"), lifespan="off"))
    server_task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.1)

    from aiogram.types import BotCommand, MenuButtonWebApp, WebAppInfo

    from app.services.notify import get_bot

    bot = get_bot() if settings.bot_token else None

    menu_url: dict[str, str] = {}

    async def on_url(url: str) -> None:
        if settings.webapp_static_url and settings.api_gist_id:
            # Постоянная ссылка: Telegram кеширует кнопку меню, поэтому адрес туннеля в неё
            # не кладём — Mini App сам прочитает его из gist
            settings.webapp_url = settings.webapp_static_url
        elif settings.webapp_static_url:
            settings.webapp_url = f"{settings.webapp_static_url}?{urlencode({'api': url})}"
        else:
            settings.webapp_url = url
        print(f"\n  Туннель API: {url}\n  Mini App:    {settings.webapp_url}\n", flush=True)
        if settings.api_gist_id:
            await asyncio.to_thread(publish_api_url, settings.api_gist_id, url)
        if bot and menu_url.get("value") != settings.webapp_url:
            menu_url["value"] = settings.webapp_url
            try:
                await bot.set_chat_menu_button(
                    menu_button=MenuButtonWebApp(text="Меню", web_app=WebAppInfo(url=settings.webapp_url))
                )
            except Exception:
                log.exception("Не удалось обновить кнопку меню")

    tunnel = Tunnel(on_url)
    tunnel_task = asyncio.create_task(tunnel.run())
    try:
        async with asyncio.timeout(60):
            await tunnel.first_url
    except TimeoutError:
        log.error("Не удалось поднять HTTPS-туннель за 60 секунд")
    print("=" * 60)
    print(f"  Mini App локально:  http://localhost:{PORT}")
    print("=" * 60 + "\n", flush=True)

    tasks = [server_task, tunnel_task]
    if bot:
        from app.bot.main import build_dispatcher
        from app.bot.scheduler import create_scheduler

        me = await bot.get_me()
        await bot.set_my_commands([
            BotCommand(command="start", description="Главное меню"),
            BotCommand(command="orders", description="Мои заказы"),
            BotCommand(command="help", description="Контакты и часы работы"),
        ])
        create_scheduler(bot).start()
        dp = build_dispatcher()
        tasks.append(asyncio.create_task(dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types(), handle_signals=False)))
        print(f"  Бот запущен: https://t.me/{me.username}\n", flush=True)
    else:
        print("  BOT_TOKEN не задан — работает только Mini App в браузере\n", flush=True)

    try:
        await asyncio.gather(*tasks)
    finally:
        tunnel.stop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass

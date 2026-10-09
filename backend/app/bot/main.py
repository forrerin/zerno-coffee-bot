"""Точка входа бота: python -m app.bot.main"""

import asyncio
import logging

from aiogram import Dispatcher
from aiogram.types import BotCommand, MenuButtonWebApp, WebAppInfo

from app.bot.handlers import router
from app.bot.middlewares import DbMiddleware, ThrottleMiddleware
from app.bot.scheduler import create_scheduler
from app.config import settings
from app.db import SessionLocal, init_db
from app.logging_setup import setup_logging
from app.seed import seed
from app.services.notify import get_bot

log = logging.getLogger(__name__)


def build_dispatcher() -> Dispatcher:
    dp = Dispatcher()
    throttle = ThrottleMiddleware()
    dp.message.outer_middleware(throttle)
    dp.callback_query.outer_middleware(throttle)
    dp.message.middleware(DbMiddleware())
    dp.callback_query.middleware(DbMiddleware())
    dp.include_router(router)
    return dp


async def main() -> None:
    setup_logging("bot")
    if not settings.bot_token:
        raise SystemExit("BOT_TOKEN не задан — создайте бота у @BotFather и пропишите токен в .env")

    await init_db()
    async with SessionLocal() as session:
        await seed(session)

    bot = get_bot()
    await bot.set_my_commands([
        BotCommand(command="start", description="Главное меню"),
        BotCommand(command="orders", description="Мои заказы"),
        BotCommand(command="help", description="Контакты и часы работы"),
    ])
    if settings.webapp_url:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="Меню", web_app=WebAppInfo(url=settings.webapp_url))
        )
    else:
        log.warning("WEBAPP_URL не задан — кнопка Mini App не будет показана")

    scheduler = create_scheduler(bot)
    scheduler.start()
    dp = build_dispatcher()
    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        scheduler.shutdown(wait=False)
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())

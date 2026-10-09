import time
from collections.abc import Awaitable, Callable
from typing import Any

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject
from redis.asyncio import Redis

from app.config import settings
from app.db import SessionLocal
from app.redis import get_redis
from app.services.users import get_or_create_user

STRIKES_TO_BAN = 5


class FloodGuard:
    """Rate limit на Redis: не чаще N в секунду и M в минуту.

    Превышение секундного лимита — сообщение игнорируется и копится «страйк».
    5 страйков за минуту или превышение минутного лимита — бан на 10 минут.
    """

    def __init__(self, redis: Redis, per_second: int, per_minute: int, ban_seconds: int):
        self.redis = redis
        self.per_second = per_second
        self.per_minute = per_minute
        self.ban_seconds = ban_seconds

    async def check(self, user_id: int, now: float | None = None) -> str:
        """Возвращает 'ok', 'drop' (тихо проигнорировать), 'banned' (только что забанен) или 'blocked'."""
        if await self.redis.exists(f"flood:ban:{user_id}"):
            return "blocked"
        now = now if now is not None else time.time()
        sec_key = f"flood:s:{user_id}:{int(now)}"
        min_key = f"flood:m:{user_id}:{int(now // 60)}"
        pipe = self.redis.pipeline()
        pipe.incr(sec_key)
        pipe.expire(sec_key, 2)
        pipe.incr(min_key)
        pipe.expire(min_key, 70)
        per_sec, _, per_min, _ = await pipe.execute()

        if per_min > self.per_minute:
            return await self._ban(user_id)
        if per_sec > self.per_second:
            strike_key = f"flood:strike:{user_id}"
            strikes = await self.redis.incr(strike_key)
            await self.redis.expire(strike_key, 60)
            if strikes >= STRIKES_TO_BAN:
                return await self._ban(user_id)
            return "drop"
        return "ok"

    async def _ban(self, user_id: int) -> str:
        await self.redis.set(f"flood:ban:{user_id}", 1, ex=self.ban_seconds)
        await self.redis.delete(f"flood:strike:{user_id}")
        return "banned"


class ThrottleMiddleware(BaseMiddleware):
    def __init__(self, guard: FloodGuard | None = None):
        self._guard = guard

    @property
    def guard(self) -> FloodGuard:
        if self._guard is None:
            self._guard = FloodGuard(
                get_redis(), settings.flood_per_second, settings.flood_per_minute, settings.flood_ban_seconds
            )
        return self._guard

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        user = data.get("event_from_user")
        if user is None or user.id in settings.admin_ids:
            return await handler(event, data)

        verdict = await self.guard.check(user.id)
        if verdict == "ok":
            return await handler(event, data)
        if verdict == "banned":
            minutes = settings.flood_ban_seconds // 60
            text = f"Слишком много сообщений подряд. Бот не будет отвечать {minutes} минут ☕"
            if isinstance(event, Message):
                await event.answer(text)
            elif isinstance(event, CallbackQuery):
                await event.answer(text, show_alert=True)
        elif isinstance(event, CallbackQuery):
            await event.answer()  # чтобы у кнопки не висели «часики»
        return None


class DbMiddleware(BaseMiddleware):
    """Открывает сессию БД и регистрирует пользователя."""

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        async with SessionLocal() as session:
            data["session"] = session
            tg = data.get("event_from_user")
            if tg is not None and not tg.is_bot:
                data["user"] = await get_or_create_user(session, tg.id, tg.full_name, tg.username)
            return await handler(event, data)

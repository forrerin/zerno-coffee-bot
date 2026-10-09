"""Рассылки: выбор сегмента и отправка пачками не быстрее BROADCAST_RATE сообщений в секунду."""

import asyncio
import logging
import os
import time
from collections.abc import Awaitable, Callable, Sequence
from datetime import datetime, timedelta, timezone

from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError, TelegramRetryAfter
from aiogram.types import FSInputFile, InlineKeyboardButton, InlineKeyboardMarkup
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import REVENUE_STATUSES, Broadcast, Order, User
from app.services.notify import webapp_button

log = logging.getLogger(__name__)

SEGMENTS = {
    "all": "Все подписчики",
    "sleeping": "Не заказывали 7+ дней",
    "regular": "Постоянные (3+ заказа)",
}


async def segment_user_ids(session: AsyncSession, segment: str) -> list[int]:
    base = select(User.tg_id).where(User.notifications_on.is_(True))
    paid = Order.status.in_(REVENUE_STATUSES)
    if segment == "sleeping":
        since = datetime.now(timezone.utc) - timedelta(days=7)
        recent = select(Order.user_id).where(paid, Order.created_at >= since)
        base = base.where(User.id.not_in(recent))
    elif segment == "regular":
        regulars = select(Order.user_id).where(paid).group_by(Order.user_id).having(func.count(Order.id) >= 3)
        base = base.where(User.id.in_(regulars))
    return list(await session.scalars(base.order_by(User.id)))


async def send_in_batches(
    chat_ids: Sequence[int],
    send: Callable[[int], Awaitable[None]],
    rate: int,
    on_progress: Callable[[int, int], Awaitable[None]] | None = None,
) -> tuple[int, int]:
    """Отправляет пачками по `rate` сообщений, выдерживая минимум 1 секунду на пачку."""
    sent = failed = 0

    async def one(chat_id: int) -> bool:
        for _ in range(3):
            try:
                await send(chat_id)
                return True
            except TelegramRetryAfter as e:
                await asyncio.sleep(e.retry_after)
            except TelegramForbiddenError:
                return False  # пользователь заблокировал бота
            except Exception:
                log.exception("Ошибка рассылки для %s", chat_id)
                return False
        return False

    for start in range(0, len(chat_ids), rate):
        started = time.monotonic()
        batch = chat_ids[start : start + rate]
        results = await asyncio.gather(*(one(cid) for cid in batch))
        sent += sum(results)
        failed += len(results) - sum(results)
        if on_progress:
            await on_progress(sent, failed)
        elapsed = time.monotonic() - started
        if start + rate < len(chat_ids) and elapsed < 1:
            await asyncio.sleep(1 - elapsed)
    return sent, failed


def broadcast_markup(b: Broadcast) -> InlineKeyboardMarkup | None:
    if not b.button_text:
        return None
    if b.button_url:
        btn = InlineKeyboardButton(text=b.button_text, url=b.button_url)
    else:
        btn = webapp_button(b.button_text)
    return InlineKeyboardMarkup(inline_keyboard=[[btn]]) if btn else None


def _photo_source(photo: str):
    if photo.startswith("/media/"):
        path = os.path.join(settings.media_dir, photo.removeprefix("/media/"))
        return FSInputFile(path)
    return photo


async def run_broadcast(session: AsyncSession, bot: Bot, broadcast: Broadcast) -> None:
    broadcast.status = "sending"
    chat_ids = await segment_user_ids(session, broadcast.segment)
    broadcast.total_count = len(chat_ids)
    await session.commit()

    markup = broadcast_markup(broadcast)
    photo_cache: dict[str, str] = {}
    lock = asyncio.Lock()

    async def send(chat_id: int) -> None:
        if broadcast.photo:
            if "file_id" not in photo_cache:
                # первую отправку делаем под замком, чтобы загрузить файл один раз
                async with lock:
                    if "file_id" not in photo_cache:
                        msg = await bot.send_photo(
                            chat_id, _photo_source(broadcast.photo), caption=broadcast.text, reply_markup=markup
                        )
                        photo_cache["file_id"] = msg.photo[-1].file_id
                        return
            await bot.send_photo(chat_id, photo_cache["file_id"], caption=broadcast.text, reply_markup=markup)
        else:
            await bot.send_message(chat_id, broadcast.text, reply_markup=markup)

    async def progress(sent: int, failed: int) -> None:
        broadcast.sent_count, broadcast.failed_count = sent, failed
        await session.commit()

    try:
        await send_in_batches(chat_ids, send, settings.broadcast_rate, progress)
        broadcast.status = "done"
    except Exception:
        log.exception("Рассылка %s упала", broadcast.id)
        broadcast.status = "failed"
    await session.commit()

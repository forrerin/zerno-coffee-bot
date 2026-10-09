"""Фоновые задачи бота на APScheduler: рассылки, напоминания, дни рождения, демо-автопилот заказов."""

import logging
import secrets
from datetime import datetime, timedelta, timezone

from aiogram import Bot
from aiogram.types import InlineKeyboardMarkup
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import extract, func, select

from app.config import settings
from app.db import SessionLocal
from app.models import REVENUE_STATUSES, Broadcast, Order, OrderStatus, Promocode, User
from app.redis import get_redis
from app.services.broadcasts import run_broadcast, send_in_batches
from app.services.notify import notify_client, webapp_button
from app.services.orders import set_status
from app.services.pricing import aware

log = logging.getLogger(__name__)

REMINDER_PROMO = "COMEBACK15"


def _menu_markup() -> InlineKeyboardMarkup | None:
    btn = webapp_button("☕ Открыть меню")
    return InlineKeyboardMarkup(inline_keyboard=[[btn]]) if btn else None


async def process_broadcasts(bot: Bot) -> None:
    async with SessionLocal() as session:
        due = list(
            await session.scalars(
                select(Broadcast)
                .where(Broadcast.status == "scheduled", Broadcast.scheduled_at <= datetime.now(timezone.utc))
                .order_by(Broadcast.scheduled_at)
            )
        )
        for b in due:
            log.info("Запускаю рассылку %s (%s)", b.id, b.segment)
            await run_broadcast(session, bot, b)


async def send_reminders(bot: Bot) -> None:
    """Мягкое напоминание тем, кто не заказывал 7 дней (раз в неделю, можно отключить в профиле)."""
    since = datetime.now(timezone.utc) - timedelta(days=7)
    redis = get_redis()
    async with SessionLocal() as session:
        last_order = (
            select(Order.user_id, func.max(Order.created_at).label("last"))
            .where(Order.status.in_(REVENUE_STATUSES))
            .group_by(Order.user_id)
            .subquery()
        )
        rows = await session.execute(
            select(User.tg_id)
            .join(last_order, last_order.c.user_id == User.id)
            .where(User.notifications_on.is_(True), last_order.c.last < since)
        )
        targets = []
        for (tg_id,) in rows:
            if await redis.set(f"reminded:{tg_id}", 1, ex=7 * 24 * 3600, nx=True):
                targets.append(tg_id)

    text = (
        "Мы соскучились ☕\n\n"
        f"Возвращайтесь за любимым напитком — по промокоду <b>{REMINDER_PROMO}</b> скидка 15%.\n\n"
        "<i>Отключить напоминания можно в профиле Mini App.</i>"
    )

    async def send(chat_id: int) -> None:
        await bot.send_message(chat_id, text, reply_markup=_menu_markup())

    sent, failed = await send_in_batches(targets, send, settings.broadcast_rate)
    log.info("Напоминания: отправлено %s, ошибок %s", sent, failed)


async def congratulate_birthdays(bot: Bot) -> None:
    from zoneinfo import ZoneInfo

    today = datetime.now(ZoneInfo(settings.timezone)).date()
    redis = get_redis()
    async with SessionLocal() as session:
        users = list(
            await session.scalars(
                select(User).where(
                    User.notifications_on.is_(True),
                    extract("month", User.birthday) == today.month,
                    extract("day", User.birthday) == today.day,
                )
            )
        )
        for user in users:
            if not await redis.set(f"bday:{user.tg_id}:{today.year}", 1, ex=400 * 24 * 3600, nx=True):
                continue
            code = f"BDAY{secrets.token_hex(3).upper()}"
            session.add(Promocode(
                code=code, type="percent", value=20, usage_limit=1,
                expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            ))
            await session.commit()
            try:
                await bot.send_message(
                    user.tg_id,
                    f"🎂 {user.name.split()[0]}, с днём рождения!\n\n"
                    f"Дарим скидку 20% на любой заказ в течение недели — промокод <b>{code}</b>.",
                    reply_markup=_menu_markup(),
                )
            except Exception:
                log.exception("Не удалось поздравить %s", user.tg_id)


async def demo_autopilot() -> None:
    """Для публичного демо: без живого персонала заказ сам проходит статусы."""
    now = datetime.now(timezone.utc)
    steps = {
        OrderStatus.paid: (OrderStatus.preparing, timedelta(seconds=15)),
        OrderStatus.preparing: (OrderStatus.ready, timedelta(seconds=40)),
        OrderStatus.ready: (OrderStatus.completed, timedelta(minutes=10)),
    }
    async with SessionLocal() as session:
        orders = list(await session.scalars(select(Order).where(Order.status.in_(list(steps)))))
        for order in orders:
            target, delay = steps[OrderStatus(order.status)]
            if aware(order.status_changed_at) + delay > now:
                continue
            await set_status(session, order, target)
            if target != OrderStatus.completed:
                await notify_client(order, await session.get(User, order.user_id))


def create_scheduler(bot: Bot) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone=settings.timezone)
    scheduler.add_job(process_broadcasts, "interval", seconds=15, args=[bot], max_instances=1, coalesce=True)
    scheduler.add_job(send_reminders, "cron", hour=12, minute=0, args=[bot], max_instances=1)
    scheduler.add_job(congratulate_birthdays, "cron", hour=10, minute=0, args=[bot], max_instances=1)
    if settings.demo_autopilot:
        scheduler.add_job(demo_autopilot, "interval", seconds=5, max_instances=1, coalesce=True)
    return scheduler

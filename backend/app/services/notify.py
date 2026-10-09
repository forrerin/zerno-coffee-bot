"""Уведомления клиенту и персоналу. Используются и ботом, и API."""

import logging
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from app.bot.callbacks import StaffStatus
from app.config import settings
from app.models import Order, OrderStatus, User
from app.services.orders import STATUS_TITLES
from app.services.pricing import aware

log = logging.getLogger(__name__)

_bot: Bot | None = None


def get_bot() -> Bot | None:
    global _bot
    if _bot is None and settings.bot_token:
        _bot = Bot(settings.bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    return _bot


def set_bot(bot: Bot) -> None:
    global _bot
    _bot = bot


def webapp_link(query: str = "") -> str:
    """Адрес Mini App с доп. параметрами (?screen=…), не ломая уже имеющиеся (?api=…)."""
    parts = urlsplit(settings.webapp_url)
    params = parse_qsl(parts.query) + parse_qsl(query.lstrip("?"))
    return urlunsplit((parts.scheme, parts.netloc, parts.path or "/", urlencode(params), ""))


def webapp_button(text: str, query: str = "") -> InlineKeyboardButton | None:
    if not settings.webapp_url:
        return None
    return InlineKeyboardButton(text=text, web_app=WebAppInfo(url=webapp_link(query)))


def format_items(order: Order) -> str:
    rows = []
    for item in order.items:
        extra = ", ".join(m["name"] for m in item.modifiers)
        size = f" {item.size}" if item.size else ""
        rows.append(
            f"• {item.product_name}{size} × {item.qty}" + (f" <i>({extra})</i>" if extra else "")
        )
    return "\n".join(rows)


def format_ready_at(order: Order) -> str:
    if order.ready_at is None:
        return "как можно скорее"
    return aware(order.ready_at).astimezone(ZoneInfo(settings.timezone)).strftime("к %H:%M")


CLIENT_TEXTS = {
    OrderStatus.paid: "☕ Заказ <b>№{n}</b> принят! Бариста скоро начнёт готовить.",
    OrderStatus.preparing: "🔥 Заказ <b>№{n}</b> готовится.",
    OrderStatus.ready: "✅ Заказ <b>№{n}</b> готов! Забирайте у стойки — хорошего дня.",
    OrderStatus.cancelled: "Заказ <b>№{n}</b> отменён. Если это ошибка — напишите нам.",
}


async def notify_client(order: Order, user: User) -> None:
    bot = get_bot()
    text = CLIENT_TEXTS.get(order.status)
    if not bot or not text:
        return
    btn = webapp_button("Мои заказы", "?screen=orders")
    markup = InlineKeyboardMarkup(inline_keyboard=[[btn]]) if btn else None
    try:
        await bot.send_message(user.tg_id, text.format(n=order.number), reply_markup=markup)
    except Exception:
        log.exception("Не удалось уведомить клиента %s", user.tg_id)


def staff_keyboard(order: Order) -> InlineKeyboardMarkup | None:
    buttons = []
    if order.status == OrderStatus.paid:
        buttons.append(InlineKeyboardButton(
            text="🔥 Готовится",
            callback_data=StaffStatus(order_id=order.id, status=OrderStatus.preparing).pack(),
        ))
    if order.status in (OrderStatus.paid, OrderStatus.preparing):
        buttons.append(InlineKeyboardButton(
            text="✅ Готов",
            callback_data=StaffStatus(order_id=order.id, status=OrderStatus.ready).pack(),
        ))
    if order.status == OrderStatus.ready:
        buttons.append(InlineKeyboardButton(
            text="📦 Выдан",
            callback_data=StaffStatus(order_id=order.id, status=OrderStatus.completed).pack(),
        ))
    return InlineKeyboardMarkup(inline_keyboard=[buttons]) if buttons else None


def staff_text(order: Order, user: User) -> str:
    who = user.name + (f" (@{user.username})" if user.username else "")
    parts = [
        f"🧾 <b>Заказ №{order.number}</b> — {STATUS_TITLES[OrderStatus(order.status)]}",
        f"Гость: {who}",
        f"Готовность: {format_ready_at(order)}",
        "",
        format_items(order),
        "",
        f"Итого: <b>{order.total} ₽</b>",
    ]
    if order.comment:
        parts.append(f"💬 {order.comment}")
    return "\n".join(parts)


async def notify_staff_new_order(order: Order, user: User) -> None:
    bot = get_bot()
    if not bot or not settings.staff_chat_id:
        return
    try:
        await bot.send_message(settings.staff_chat_id, staff_text(order, user), reply_markup=staff_keyboard(order))
    except Exception:
        log.exception("Не удалось отправить заказ в служебный чат")

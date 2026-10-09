import os
from zoneinfo import ZoneInfo

from aiogram import F, Router
from aiogram.enums import ChatType
from aiogram.filters import Command, CommandStart
from aiogram.types import CallbackQuery, FSInputFile, Message
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.bot import keyboards as kb
from app.bot.callbacks import AddToCart, RepeatOrder, StaffStatus
from app.config import settings
from app.models import Order, Product, User
from app.services import barista
from app.services import cart as cart_svc
from app.services.notify import notify_client, staff_keyboard, staff_text
from app.services.orders import STATUS_TITLES, StatusError, set_status
from app.services.pricing import aware

router = Router()
WELCOME_PHOTO = os.path.join(os.path.dirname(__file__), "assets", "welcome.jpg")

STATUS_ICONS = {"new": "⏳", "paid": "🧾", "preparing": "🔥", "ready": "✅", "completed": "☕", "cancelled": "✖️"}


def welcome_text(user: User) -> str:
    return (
        f"Привет, {user.name.split()[0]}! ☀️\n\n"
        f"Это кофейня <b>«{settings.cafe_name}»</b>. Соберите напиток в меню — "
        "мы приготовим его к вашему приходу, без очереди.\n\n"
        "Не знаете, что выбрать? Просто напишите, чего хочется — "
        "например, <i>«что-то холодное и не сладкое»</i>, и AI-бариста подберёт напиток."
    )


def about_text() -> str:
    return (
        f"<b>☕ {settings.cafe_name}</b> — маленькая кофейня с большой любовью к зерну.\n\n"
        f"📍 {settings.cafe_address}\n"
        f"🕗 {settings.cafe_hours}\n"
        f"📞 {settings.cafe_phone}\n\n"
        "Обжариваем зерно сами раз в неделю, молоко — от фермы, десерты печём каждое утро."
    )


@router.message(CommandStart(), F.chat.type == ChatType.PRIVATE)
async def start(message: Message, user: User):
    if os.path.exists(WELCOME_PHOTO):
        await message.answer_photo(FSInputFile(WELCOME_PHOTO), caption=welcome_text(user), reply_markup=kb.main_menu())
    else:
        await message.answer(welcome_text(user), reply_markup=kb.main_menu())


@router.message(Command("help"))
async def help_cmd(message: Message):
    await message.answer(
        about_text() + "\n\n<b>Команды</b>\n/start — главное меню\n/orders — мои заказы\n/help — контакты",
        reply_markup=kb.open_menu(),
    )


@router.callback_query(F.data == "about")
async def about(cb: CallbackQuery):
    await cb.message.answer(about_text(), reply_markup=kb.open_menu())
    await cb.answer()


@router.callback_query(F.data == "ai_intro")
async def ai_intro(cb: CallbackQuery):
    await cb.message.answer(
        "🤖 Я AI-бариста. Напишите, какое у вас настроение или что хочется — "
        "<i>«бодрящее и холодное»</i>, <i>«посоветуй без кофеина»</i>, <i>«что-нибудь к кофе»</i>."
    )
    await cb.answer()


# ---------- заказы ----------

async def send_orders(message: Message, session: AsyncSession, user: User):
    orders = list(
        await session.scalars(select(Order).where(Order.user_id == user.id).order_by(Order.id.desc()).limit(5))
    )
    if not orders:
        await message.answer("У вас пока нет заказов. Самое время это исправить ☕", reply_markup=kb.open_menu())
        return
    tz = ZoneInfo(settings.timezone)
    lines = ["<b>Последние заказы</b>\n"]
    for o in orders:
        when = aware(o.created_at).astimezone(tz).strftime("%d.%m %H:%M")
        items = ", ".join(f"{i.product_name}{' ' + i.size if i.size else ''}" for i in o.items)
        lines.append(f"{STATUS_ICONS.get(o.status, '')} <b>№{o.number}</b> · {when} · {o.total} ₽\n{STATUS_TITLES[o.status]} — {items}\n")
    await message.answer("\n".join(lines), reply_markup=kb.orders_list(orders))


@router.message(Command("orders"))
async def orders_cmd(message: Message, session: AsyncSession, user: User):
    await send_orders(message, session, user)


@router.callback_query(F.data == "my_orders")
async def orders_cb(cb: CallbackQuery, session: AsyncSession, user: User):
    await send_orders(cb.message, session, user)
    await cb.answer()


@router.callback_query(RepeatOrder.filter())
async def repeat(cb: CallbackQuery, callback_data: RepeatOrder, session: AsyncSession, user: User):
    order = await session.get(Order, callback_data.order_id)
    if order is None or order.user_id != user.id:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    lines = await cart_svc.lines_from_order(session, order)
    if not lines:
        await cb.answer("Этих позиций больше нет в меню", show_alert=True)
        return
    await cart_svc.save_cart(user.tg_id, lines)
    await cb.message.answer(f"Положил заказ №{order.number} в корзину 🛒 Проверьте и оплатите:", reply_markup=kb.open_cart())
    await cb.answer()


# ---------- AI-бариста ----------

@router.callback_query(AddToCart.filter())
async def add_to_cart(cb: CallbackQuery, callback_data: AddToCart, session: AsyncSession, user: User):
    product = await session.scalar(
        select(Product).where(Product.id == callback_data.product_id).options(selectinload(Product.sizes))
    )
    if product is None or not product.is_active:
        await cb.answer("Эта позиция сейчас недоступна", show_alert=True)
        return
    size = None
    if product.sizes:
        size = next((s.size for s in product.sizes if s.size == "M"), product.sizes[0].size)
    lines = await cart_svc.add_line(user.tg_id, {"product_id": product.id, "size": size, "modifier_ids": [], "qty": 1})
    count = sum(line["qty"] for line in lines)
    await cb.answer(f"«{product.name}» в корзине ({count} шт.)")
    await cb.message.answer(
        f"Добавил <b>{product.name}</b>{' ' + size if size else ''} в корзину. "
        "Объём, молоко и сиропы можно поменять в Mini App.",
        reply_markup=kb.open_cart(),
    )


@router.message(F.chat.type == ChatType.PRIVATE, F.text, ~F.text.startswith("/"))
async def ai_chat(message: Message, session: AsyncSession, user: User):
    await message.bot.send_chat_action(message.chat.id, "typing")
    result = await barista.answer(session, user, message.text)
    markup = kb.open_menu() if result.limited else kb.recommendations(result.products)
    await message.answer(result.text, reply_markup=markup)


# ---------- служебный чат ----------

@router.callback_query(StaffStatus.filter())
async def staff_status(cb: CallbackQuery, callback_data: StaffStatus, session: AsyncSession, user: User):
    if cb.message.chat.id != settings.staff_chat_id and user.tg_id not in settings.admin_ids:
        await cb.answer("Нет доступа", show_alert=True)
        return
    order = await session.get(Order, callback_data.order_id)
    if order is None:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    try:
        await set_status(session, order, callback_data.status)
    except StatusError:
        await cb.answer(f"Статус уже: {STATUS_TITLES[order.status]}")
        return
    await cb.answer(STATUS_TITLES[order.status])
    client = await session.get(User, order.user_id)
    await notify_client(order, client)
    await cb.message.edit_text(staff_text(order, client), reply_markup=staff_keyboard(order))

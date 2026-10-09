from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.bot.callbacks import AddToCart, RepeatOrder
from app.models import Order, OrderStatus, Product
from app.services.notify import webapp_button


def _rows(*rows: list[InlineKeyboardButton | None]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[b for b in row if b] for row in rows if any(row)])


def main_menu() -> InlineKeyboardMarkup:
    return _rows(
        [webapp_button("☕ Открыть меню")],
        [
            InlineKeyboardButton(text="🤖 AI-бариста", callback_data="ai_intro"),
            InlineKeyboardButton(text="🧾 Мои заказы", callback_data="my_orders"),
        ],
        [InlineKeyboardButton(text="📍 О нас", callback_data="about")],
    )


def open_menu() -> InlineKeyboardMarkup | None:
    btn = webapp_button("☕ Открыть меню")
    return _rows([btn]) if btn else None


def open_cart() -> InlineKeyboardMarkup | None:
    btn = webapp_button("🛒 Перейти в корзину", "?screen=cart")
    return _rows([btn]) if btn else None


def recommendations(products: list[Product]) -> InlineKeyboardMarkup | None:
    rows = []
    for p in products:
        rows.append([
            InlineKeyboardButton(text=f"➕ {p.name}", callback_data=AddToCart(product_id=p.id).pack()),
            webapp_button("Открыть в меню", f"?product={p.id}"),
        ])
    return _rows(*rows) if rows else open_menu()


def orders_list(orders: list[Order]) -> InlineKeyboardMarkup | None:
    rows = [
        [InlineKeyboardButton(text=f"🔁 Повторить №{o.number}", callback_data=RepeatOrder(order_id=o.id).pack())]
        for o in orders
        if o.status != OrderStatus.new
    ]
    rows.append([webapp_button("Открыть историю", "?screen=orders")])
    return _rows(*rows)

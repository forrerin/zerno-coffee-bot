"""Серверный расчёт стоимости. Цене из клиента не доверяем никогда."""

from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Modifier, Product, Promocode, User

BONUS_TARGET = 6  # каждый 6-й напиток в подарок
MAX_QTY = 20
MAX_ITEMS = 30


class PricingError(ValueError):
    pass


@dataclass
class CartLine:
    product_id: int
    size: str | None = None
    modifier_ids: list[int] = field(default_factory=list)
    qty: int = 1


@dataclass
class PricedLine:
    product: Product
    size: str | None
    modifiers: list[dict]
    qty: int
    unit_price: int

    @property
    def is_drink(self) -> bool:
        return bool(self.product.sizes)


@dataclass
class Quote:
    lines: list[PricedLine]
    subtotal: int
    bonus_discount: int
    promo_discount: int
    promo: Promocode | None
    promo_error: str | None

    @property
    def discount(self) -> int:
        return self.bonus_discount + self.promo_discount

    @property
    def total(self) -> int:
        return max(self.subtotal - self.discount, 0)

    @property
    def drink_units(self) -> int:
        return sum(line.qty for line in self.lines if line.is_drink)


def aware(dt: datetime | None) -> datetime | None:
    """SQLite отдаёт naive-datetime, Postgres — aware. Приводим к UTC."""
    if dt is None or dt.tzinfo is not None:
        return dt
    return dt.replace(tzinfo=timezone.utc)


def promo_problem(promo: Promocode | None) -> str | None:
    if promo is None:
        return "Промокод не найден"
    exp = aware(promo.expires_at)
    if exp and exp < datetime.now(timezone.utc):
        return "Срок действия промокода истёк"
    if promo.usage_limit is not None and promo.used_count >= promo.usage_limit:
        return "Промокод уже использован максимальное число раз"
    return None


def promo_discount(promo: Promocode, amount: int) -> int:
    if promo.type == "percent":
        return amount * min(promo.value, 100) // 100
    return min(promo.value, amount)


async def find_promo(session: AsyncSession, code: str) -> Promocode | None:
    code = code.strip().upper()
    if not code:
        return None
    return await session.scalar(select(Promocode).where(Promocode.code == code))


async def price_lines(session: AsyncSession, cart: list[CartLine]) -> list[PricedLine]:
    if not cart:
        raise PricingError("Корзина пуста")
    if len(cart) > MAX_ITEMS:
        raise PricingError("Слишком много позиций")

    product_ids = {c.product_id for c in cart}
    products = {
        p.id: p
        for p in await session.scalars(
            select(Product).where(Product.id.in_(product_ids)).options(selectinload(Product.sizes))
        )
    }
    mod_ids = {m for c in cart for m in c.modifier_ids}
    modifiers = {
        m.id: m for m in await session.scalars(select(Modifier).where(Modifier.id.in_(mod_ids or {0})))
    }

    lines: list[PricedLine] = []
    for c in cart:
        product = products.get(c.product_id)
        if product is None or not product.is_active:
            raise PricingError("Позиция недоступна")
        if not 1 <= c.qty <= MAX_QTY:
            raise PricingError("Некорректное количество")

        if product.sizes:
            size = next((s for s in product.sizes if s.size == c.size), None)
            if size is None:
                raise PricingError(f"Выберите объём для «{product.name}»")
            unit = size.price
            size_code = size.size
        else:
            unit = product.base_price
            size_code = None

        chosen: list[dict] = []
        milk_count = 0
        for mid in dict.fromkeys(c.modifier_ids):  # без дублей, порядок сохраняем
            mod = modifiers.get(mid)
            if mod is None or not mod.is_active or mod.group not in (product.modifier_groups or []):
                raise PricingError(f"Добавка недоступна для «{product.name}»")
            if mod.group == "milk":
                milk_count += 1
            chosen.append({"id": mod.id, "group": mod.group, "name": mod.name, "price": mod.price})
            unit += mod.price
        if milk_count > 1:
            raise PricingError("Можно выбрать только одно молоко")

        lines.append(PricedLine(product, size_code, chosen, c.qty, unit))
    return lines


async def build_quote(
    session: AsyncSession, user: User, cart: list[CartLine], promo_code: str | None
) -> Quote:
    lines = await price_lines(session, cart)
    subtotal = sum(line.unit_price * line.qty for line in lines)

    bonus = 0
    drinks = [line for line in lines if line.is_drink]
    if user.bonus_count >= BONUS_TARGET - 1 and drinks:
        bonus = min(line.unit_price for line in drinks)

    promo = None
    promo_error = None
    p_discount = 0
    if promo_code:
        promo = await find_promo(session, promo_code)
        promo_error = promo_problem(promo)
        if promo_error:
            promo = None
        else:
            p_discount = promo_discount(promo, subtotal - bonus)

    return Quote(lines, subtotal, bonus, p_discount, promo, promo_error)


def next_bonus_count(current: int, drink_units: int, bonus_used: bool) -> int:
    if bonus_used:
        current, drink_units = 0, drink_units - 1
    return min(current + max(drink_units, 0), BONUS_TARGET - 1)

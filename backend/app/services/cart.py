"""Корзина хранится в Redis — так её видят и бот (кнопка «Добавить в корзину»), и Mini App."""

import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Modifier, Order, Product
from app.redis import get_redis

CART_TTL = 14 * 24 * 3600


def _key(tg_id: int) -> str:
    return f"cart:{tg_id}"


def line_key(line: dict) -> str:
    mods = ",".join(str(m) for m in sorted(line.get("modifier_ids") or []))
    return f"{line['product_id']}|{line.get('size') or ''}|{mods}"


async def get_cart(tg_id: int) -> list[dict]:
    raw = await get_redis().get(_key(tg_id))
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


async def save_cart(tg_id: int, lines: list[dict]) -> None:
    redis = get_redis()
    if not lines:
        await redis.delete(_key(tg_id))
        return
    await redis.set(_key(tg_id), json.dumps(lines, ensure_ascii=False), ex=CART_TTL)


async def add_line(tg_id: int, line: dict) -> list[dict]:
    lines = await get_cart(tg_id)
    k = line_key(line)
    for existing in lines:
        if line_key(existing) == k:
            existing["qty"] = min(existing.get("qty", 1) + line.get("qty", 1), 20)
            break
    else:
        lines.append({**line, "qty": line.get("qty", 1)})
    await save_cart(tg_id, lines)
    return lines


async def clear_cart(tg_id: int) -> None:
    await get_redis().delete(_key(tg_id))


async def lines_from_order(session: AsyncSession, order: Order) -> list[dict]:
    """Позиции заказа, которые всё ещё есть в меню, — для кнопки «Повторить»."""
    product_ids = {i.product_id for i in order.items}
    products = {
        p.id: p
        for p in await session.scalars(
            select(Product).where(Product.id.in_(product_ids)).options(selectinload(Product.sizes))
        )
    }
    active_mods = set(await session.scalars(select(Modifier.id).where(Modifier.is_active.is_(True))))
    lines = []
    for item in order.items:
        p = products.get(item.product_id)
        if p is None or not p.is_active:
            continue
        if p.sizes and item.size not in {s.size for s in p.sizes}:
            continue
        mods = [m["id"] for m in item.modifiers if m["id"] in active_mods]
        lines.append({"product_id": p.id, "size": item.size, "modifier_ids": mods, "qty": item.qty})
    return lines

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Order, OrderStatus, Promocode, User
from app.redis import get_redis
from app.services.pricing import next_bonus_count

STATUS_TITLES = {
    OrderStatus.new: "Ожидает оплаты",
    OrderStatus.paid: "Принят",
    OrderStatus.preparing: "Готовится",
    OrderStatus.ready: "Готов",
    OrderStatus.completed: "Выдан",
    OrderStatus.cancelled: "Отменён",
}

FLOW = [OrderStatus.new, OrderStatus.paid, OrderStatus.preparing, OrderStatus.ready, OrderStatus.completed]


class StatusError(ValueError):
    pass


def can_transition(current: str, target: str) -> bool:
    if current == target:
        return False
    if target == OrderStatus.cancelled:
        return current not in (OrderStatus.completed, OrderStatus.cancelled)
    if current == OrderStatus.cancelled or target not in FLOW or current not in FLOW:
        return False
    # из new только оплатой; дальше — только вперёд по цепочке
    if current == OrderStatus.new:
        return target == OrderStatus.paid
    return FLOW.index(target) > FLOW.index(current)


async def next_order_number(session: AsyncSession) -> str:
    tz = ZoneInfo(settings.timezone)
    now = datetime.now(tz)
    key = f"order_seq:{now:%Y%m%d}"
    redis = get_redis()
    if not await redis.exists(key):
        # счётчик в Redis пропал (перезапуск, in-memory Redis) — продолжаем от заказов в БД,
        # иначе в один день появятся два «№001»
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
        done = await session.scalar(select(func.count(Order.id)).where(Order.created_at >= day_start)) or 0
        await redis.set(key, done, ex=2 * 24 * 3600, nx=True)
    n = await redis.incr(key)
    return f"{n:03d}"


async def unpaid_count(session: AsyncSession, user: User) -> int:
    return await session.scalar(
        select(func.count(Order.id)).where(Order.user_id == user.id, Order.status == OrderStatus.new)
    ) or 0


def drink_units(order: Order) -> int:
    return sum(i.qty for i in order.items if i.size)


async def mark_paid(session: AsyncSession, order: Order, user: User, method: str) -> None:
    if order.status != OrderStatus.new:
        raise StatusError("Заказ уже оплачен или отменён")
    now = datetime.now(timezone.utc)
    order.status = OrderStatus.paid
    order.paid_at = now
    order.status_changed_at = now
    order.payment_method = method
    if order.promo_id:
        promo = await session.get(Promocode, order.promo_id)
        if promo is not None:
            promo.used_count += 1
    user.bonus_count = next_bonus_count(user.bonus_count, drink_units(order), order.bonus_used)
    await session.commit()


async def set_status(session: AsyncSession, order: Order, status: str) -> None:
    if not can_transition(order.status, status):
        raise StatusError(f"Нельзя перевести заказ из «{order.status}» в «{status}»")
    order.status = status
    order.status_changed_at = datetime.now(timezone.utc)
    await session.commit()

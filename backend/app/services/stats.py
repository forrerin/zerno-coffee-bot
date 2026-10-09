from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import REVENUE_STATUSES, Order, OrderItem, User
from app.services.pricing import aware

PERIODS = {"day": 1, "week": 7, "month": 30}


async def collect(session: AsyncSession, period: str) -> dict:
    tz = ZoneInfo(settings.timezone)
    now = datetime.now(tz)
    days = PERIODS.get(period, 1)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
    start_utc = start.astimezone(timezone.utc)

    orders = list(
        await session.scalars(
            select(Order).where(Order.status.in_(REVENUE_STATUSES), Order.created_at >= start_utc)
        )
    )
    revenue = sum(o.total for o in orders)
    new_users = await session.scalar(select(func.count(User.id)).where(User.created_at >= start_utc)) or 0

    top = Counter()
    names: dict[int, str] = {}
    if orders:
        items = await session.scalars(select(OrderItem).where(OrderItem.order_id.in_([o.id for o in orders])))
        for it in items:
            top[it.product_id] += it.qty
            names[it.product_id] = it.product_name

    # ряд для графика: по часам за день, по дням за неделю/месяц
    buckets: dict[str, int] = defaultdict(int)
    if period == "day":
        labels = [f"{h:02d}" for h in range(24)]
        for o in orders:
            buckets[aware(o.created_at).astimezone(tz).strftime("%H")] += o.total
    else:
        labels = [(start + timedelta(days=i)).strftime("%d.%m") for i in range(days)]
        for o in orders:
            buckets[aware(o.created_at).astimezone(tz).strftime("%d.%m")] += o.total

    return {
        "period": period,
        "orders": len(orders),
        "revenue": revenue,
        "avg_check": round(revenue / len(orders)) if orders else 0,
        "new_users": new_users,
        "top": [{"product_id": pid, "name": names[pid], "qty": qty} for pid, qty in top.most_common(5)],
        "series": [{"label": label, "value": buckets.get(label, 0)} for label in labels],
    }

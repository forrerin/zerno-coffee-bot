from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api import serialize as ser
from app.api.deps import CurrentUser, Session, can_admin
from app.api.schemas import CartIn, OrderIn, PayIn, ProfileIn, PromoCheckIn, QuoteIn
from app.config import settings
from app.models import ACTIVE_STATUSES, REVENUE_STATUSES, Category, Modifier, Order, OrderItem, OrderStatus, Product
from app.services import cart as cart_svc
from app.services.notify import notify_client, notify_staff_new_order
from app.services.orders import StatusError, mark_paid, next_order_number, set_status, unpaid_count
from app.services.pricing import CartLine, PricingError, build_quote, find_promo, promo_problem

router = APIRouter(prefix="/api")

OPEN_HOUR, CLOSE_HOUR = 8, 22

BANNERS = [
    {"id": 1, "title": "Осенний пряный латте", "text": "Тыква, корица и мускат — новинка сезона", "art": "pumpkin", "tone": "caramel"},
    {"id": 2, "title": "−10% по промокоду", "text": "Введите ZERNO10 в корзине", "art": "cappuccino", "tone": "pistachio"},
    {"id": 3, "title": "6-й кофе в подарок", "text": "Копите чашки в бонусной карте", "art": "iced_latte", "tone": "cocoa"},
]


def _lines(items) -> list[CartLine]:
    return [CartLine(i.product_id, i.size, list(i.modifier_ids), i.qty) for i in items]


async def _own_order(session, user, order_id: int) -> Order:
    order = await session.get(Order, order_id)
    if order is None or order.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Заказ не найден")
    return order


@router.get("/me")
async def me(user: CurrentUser):
    return ser.user(user, can_admin(user))


@router.patch("/me")
async def update_profile(data: ProfileIn, user: CurrentUser, session: Session):
    if "birthday" in data.model_fields_set:
        user.birthday = data.birthday
    if data.notifications_on is not None:
        user.notifications_on = data.notifications_on
    await session.commit()
    return ser.user(user, can_admin(user))


@router.get("/menu")
async def menu(session: Session, user: CurrentUser):
    categories = await session.scalars(select(Category).order_by(Category.sort))
    products = await session.scalars(
        select(Product)
        .where(Product.is_active.is_(True))
        .options(selectinload(Product.sizes))
        .order_by(Product.sort, Product.id)
    )
    modifiers = await session.scalars(
        select(Modifier).where(Modifier.is_active.is_(True)).order_by(Modifier.group, Modifier.price, Modifier.id)
    )
    return {
        "categories": [ser.category(c) for c in categories],
        "products": [ser.product(p) for p in products],
        "modifiers": [ser.modifier(m) for m in modifiers],
    }


@router.get("/home")
async def home(session: Session, user: CurrentUser):
    products = list(
        await session.scalars(select(Product).where(Product.is_active.is_(True)).order_by(Product.sort))
    )
    hit_ids = [p.id for p in products if "hit" in (p.badges or [])] or [p.id for p in products]
    day = datetime.now(ZoneInfo(settings.timezone)).toordinal()
    hit_of_day = hit_ids[day % len(hit_ids)] if hit_ids else None

    active = await session.scalar(
        select(Order)
        .where(Order.user_id == user.id, Order.status.in_(ACTIVE_STATUSES))
        .order_by(Order.id.desc())
    )

    # «Вы заказывали раньше» — последние уникальные позиции
    recent_items = await session.scalars(
        select(OrderItem)
        .join(Order)
        .where(Order.user_id == user.id, Order.status.in_(REVENUE_STATUSES))
        .order_by(OrderItem.id.desc())
        .limit(20)
    )
    seen, previous = set(), []
    for it in recent_items:
        key = (it.product_id, it.size, tuple(m["id"] for m in it.modifiers))
        if key in seen:
            continue
        seen.add(key)
        previous.append({
            "product_id": it.product_id,
            "size": it.size,
            "modifier_ids": [m["id"] for m in it.modifiers],
            "modifiers": it.modifiers,
            "name": it.product_name,
            "price": it.price,
        })
        if len(previous) == 4:
            break

    return {
        "banners": BANNERS,
        "hit_of_day": hit_of_day,
        "previous": previous,
        "active_order": ser.order(active) if active else None,
    }


# ---------- корзина ----------

@router.get("/cart")
async def get_cart(user: CurrentUser):
    return {"items": await cart_svc.get_cart(user.tg_id)}


@router.put("/cart")
async def put_cart(data: CartIn, user: CurrentUser):
    items = [i.model_dump() for i in data.items]
    await cart_svc.save_cart(user.tg_id, items)
    return {"items": items}


@router.post("/quote")
async def quote(data: QuoteIn, user: CurrentUser, session: Session):
    try:
        q = await build_quote(session, user, _lines(data.items), data.promo_code)
    except PricingError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    return ser.quote(q)


@router.post("/promo/check")
async def check_promo(data: PromoCheckIn, session: Session, user: CurrentUser):
    promo = await find_promo(session, data.code)
    problem = promo_problem(promo)
    if problem:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, problem)
    return {"code": promo.code, "type": promo.type, "value": promo.value}


# ---------- заказы ----------

def _parse_ready_at(value: str | None) -> datetime | None:
    if not value:
        return None
    tz = ZoneInfo(settings.timezone)
    now = datetime.now(tz)
    hh, mm = (int(x) for x in value.split(":"))
    if not (0 <= hh < 24 and 0 <= mm < 60):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Некорректное время")
    ready = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if ready < now + timedelta(minutes=10):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Выберите время минимум через 10 минут")
    if not (OPEN_HOUR <= hh < CLOSE_HOUR):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Мы работаем с {OPEN_HOUR}:00 до {CLOSE_HOUR}:00")
    return ready.astimezone(timezone.utc)


@router.post("/orders", status_code=201)
async def create_order(data: OrderIn, user: CurrentUser, session: Session):
    if await unpaid_count(session, user) >= settings.max_unpaid_orders:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"У вас уже {settings.max_unpaid_orders} неоплаченных заказов — оплатите или отмените их",
        )
    try:
        q = await build_quote(session, user, _lines(data.items), data.promo_code)
    except PricingError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e)) from e
    if data.promo_code and q.promo_error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, q.promo_error)

    order = Order(
        user_id=user.id,
        number=await next_order_number(session),
        status=OrderStatus.new,
        subtotal=q.subtotal,
        discount=q.discount,
        total=q.total,
        promo_id=q.promo.id if q.promo else None,
        bonus_used=q.bonus_discount > 0,
        ready_at=_parse_ready_at(data.ready_at),
        comment=data.comment.strip(),
        items=[
            OrderItem(
                product_id=line.product.id,
                product_name=line.product.name,
                size=line.size,
                modifiers=line.modifiers,
                qty=line.qty,
                price=line.unit_price,
            )
            for line in q.lines
        ],
    )
    session.add(order)
    await session.commit()
    return ser.order(order)


@router.get("/orders")
async def list_orders(user: CurrentUser, session: Session, limit: int = 30):
    orders = await session.scalars(
        select(Order).where(Order.user_id == user.id).order_by(Order.id.desc()).limit(min(limit, 100))
    )
    return [ser.order(o) for o in orders]


@router.get("/orders/{order_id}")
async def get_order(order_id: int, user: CurrentUser, session: Session):
    return ser.order(await _own_order(session, user, order_id))


@router.post("/orders/{order_id}/pay")
async def pay_order(order_id: int, data: PayIn, user: CurrentUser, session: Session):
    """Демо-оплата: реальные платёжные системы не подключены, заказ сразу помечается оплаченным."""
    order = await _own_order(session, user, order_id)
    try:
        await mark_paid(session, order, user, data.method)
    except StatusError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    await cart_svc.clear_cart(user.tg_id)
    await notify_staff_new_order(order, user)
    await notify_client(order, user)
    return ser.order(order)


@router.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: int, user: CurrentUser, session: Session):
    order = await _own_order(session, user, order_id)
    if order.status != OrderStatus.new:
        raise HTTPException(status.HTTP_409_CONFLICT, "Оплаченный заказ можно отменить только через кофейню")
    await set_status(session, order, OrderStatus.cancelled)
    return ser.order(order)


@router.post("/orders/{order_id}/repeat")
async def repeat_order(order_id: int, user: CurrentUser, session: Session):
    order = await _own_order(session, user, order_id)
    lines = await cart_svc.lines_from_order(session, order)
    if not lines:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Этих позиций больше нет в меню")
    await cart_svc.save_cart(user.tg_id, lines)
    return {"items": lines}

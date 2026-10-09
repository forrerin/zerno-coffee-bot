import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api import serialize as ser
from app.api.deps import AdminUser, Session
from app.api.schemas import BroadcastIn, ModifierIn, ProductIn, PromoIn, StatusIn
from app.config import settings
from app.models import Broadcast, Modifier, Order, OrderStatus, Product, ProductSize, Promocode, User
from app.services import stats as stats_svc
from app.services.broadcasts import SEGMENTS, segment_user_ids
from app.services.notify import notify_client
from app.services.orders import StatusError, set_status

router = APIRouter(prefix="/api/admin")

ALLOWED_IMAGES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_UPLOAD = 5 * 1024 * 1024


# ---------- заказы ----------

@router.get("/orders")
async def orders(admin: AdminUser, session: Session, status_filter: str | None = None, limit: int = 50):
    q = select(Order, User).join(User).order_by(Order.id.desc()).limit(min(limit, 200))
    if status_filter == "active":
        q = q.where(Order.status.in_([OrderStatus.paid, OrderStatus.preparing, OrderStatus.ready]))
    elif status_filter:
        q = q.where(Order.status == status_filter)
    else:
        q = q.where(Order.status != OrderStatus.new)  # неоплаченные персоналу неинтересны
    rows = await session.execute(q)
    return [ser.order(o, with_user=u) for o, u in rows]


@router.patch("/orders/{order_id}")
async def change_status(order_id: int, data: StatusIn, admin: AdminUser, session: Session):
    order = await session.get(Order, order_id)
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Заказ не найден")
    try:
        await set_status(session, order, data.status)
    except StatusError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    user = await session.get(User, order.user_id)
    await notify_client(order, user)
    return ser.order(order, with_user=user)


# ---------- меню ----------

@router.get("/menu")
async def full_menu(admin: AdminUser, session: Session):
    products = await session.scalars(select(Product).options(selectinload(Product.sizes)).order_by(Product.sort, Product.id))
    modifiers = await session.scalars(select(Modifier).order_by(Modifier.group, Modifier.id))
    return {"products": [ser.product(p) for p in products], "modifiers": [ser.modifier(m) for m in modifiers]}


def _apply_product(p: Product, data: ProductIn) -> None:
    for field in ("category_id", "name", "description", "photo_url", "base_price", "badges", "modifier_groups", "tags", "is_active"):
        setattr(p, field, getattr(data, field))
    sizes = {s.size: s for s in data.sizes}
    p.sizes = [ProductSize(size=s.size, volume_ml=s.volume_ml, price=s.price) for s in sizes.values()]


async def _load_product(session, product_id: int) -> Product:
    p = await session.scalar(select(Product).where(Product.id == product_id).options(selectinload(Product.sizes)))
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Позиция не найдена")
    return p


@router.post("/products", status_code=201)
async def create_product(data: ProductIn, admin: AdminUser, session: Session):
    p = Product(sort=1000)
    p.sizes = []
    _apply_product(p, data)
    session.add(p)
    await session.commit()
    return ser.product(await _load_product(session, p.id))


@router.put("/products/{product_id}")
async def update_product(product_id: int, data: ProductIn, admin: AdminUser, session: Session):
    p = await _load_product(session, product_id)
    _apply_product(p, data)
    await session.commit()
    return ser.product(await _load_product(session, p.id))


@router.post("/products/{product_id}/toggle")
async def toggle_product(product_id: int, admin: AdminUser, session: Session):
    p = await _load_product(session, product_id)
    p.is_active = not p.is_active
    await session.commit()
    return ser.product(p)


@router.post("/modifiers", status_code=201)
async def create_modifier(data: ModifierIn, admin: AdminUser, session: Session):
    m = Modifier(**data.model_dump())
    session.add(m)
    await session.commit()
    return ser.modifier(m)


@router.put("/modifiers/{modifier_id}")
async def update_modifier(modifier_id: int, data: ModifierIn, admin: AdminUser, session: Session):
    m = await session.get(Modifier, modifier_id)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Добавка не найдена")
    for k, v in data.model_dump().items():
        setattr(m, k, v)
    await session.commit()
    return ser.modifier(m)


@router.post("/upload")
async def upload(file: UploadFile, admin: AdminUser):
    ext = ALLOWED_IMAGES.get(file.content_type or "")
    if not ext:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Нужен JPG, PNG или WebP")
    content = await file.read(MAX_UPLOAD + 1)
    if len(content) > MAX_UPLOAD:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Файл больше 5 МБ")
    os.makedirs(settings.media_dir, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(settings.media_dir, name), "wb") as f:
        f.write(content)
    return {"url": f"/media/{name}"}


# ---------- промокоды ----------

@router.get("/promos")
async def promos(admin: AdminUser, session: Session):
    return [ser.promo(p) for p in await session.scalars(select(Promocode).order_by(Promocode.id.desc()))]


@router.post("/promos", status_code=201)
async def create_promo(data: PromoIn, admin: AdminUser, session: Session):
    if data.type == "percent" and data.value > 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Скидка не может быть больше 100%")
    p = Promocode(**{**data.model_dump(), "code": data.code.upper()})
    session.add(p)
    try:
        await session.commit()
    except IntegrityError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, "Такой промокод уже есть") from e
    return ser.promo(p)


@router.delete("/promos/{promo_id}", status_code=204)
async def expire_promo(promo_id: int, admin: AdminUser, session: Session):
    """Промокод не удаляем (на него ссылаются заказы), а завершаем срок действия."""
    p = await session.get(Promocode, promo_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    p.expires_at = datetime.now(timezone.utc)
    await session.commit()


# ---------- рассылки ----------

@router.get("/broadcasts")
async def broadcasts(admin: AdminUser, session: Session):
    items = await session.scalars(select(Broadcast).order_by(Broadcast.id.desc()).limit(50))
    counts = {seg: len(await segment_user_ids(session, seg)) for seg in SEGMENTS}
    return {
        "items": [ser.broadcast(b) for b in items],
        "segments": [{"id": k, "title": v, "count": counts[k]} for k, v in SEGMENTS.items()],
    }


@router.post("/broadcasts", status_code=201)
async def create_broadcast(data: BroadcastIn, admin: AdminUser, session: Session):
    b = Broadcast(**data.model_dump())
    if b.scheduled_at is None:
        b.scheduled_at = datetime.now(timezone.utc)  # планировщик подхватит в течение ~15 секунд
    session.add(b)
    await session.commit()
    return ser.broadcast(b)


@router.delete("/broadcasts/{broadcast_id}", status_code=204)
async def cancel_broadcast(broadcast_id: int, admin: AdminUser, session: Session):
    b = await session.get(Broadcast, broadcast_id)
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if b.status != "scheduled":
        raise HTTPException(status.HTTP_409_CONFLICT, "Рассылка уже отправляется")
    b.status = "cancelled"
    await session.commit()


# ---------- статистика ----------

@router.get("/stats")
async def stats(admin: AdminUser, session: Session, period: str = "day"):
    return await stats_svc.collect(session, period)

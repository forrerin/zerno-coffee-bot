from app.models import Broadcast, Category, Modifier, Order, OrderStatus, Product, Promocode, User
from app.services.orders import STATUS_TITLES
from app.services.pricing import Quote, aware


def iso(dt):
    return aware(dt).isoformat() if dt else None


def category(c: Category) -> dict:
    return {"id": c.id, "name": c.name, "icon": c.icon, "sort": c.sort}


def product(p: Product) -> dict:
    return {
        "id": p.id,
        "category_id": p.category_id,
        "name": p.name,
        "description": p.description,
        "photo_url": p.photo_url,
        "base_price": p.base_price,
        "badges": p.badges or [],
        "modifier_groups": p.modifier_groups or [],
        "tags": p.tags,
        "is_active": p.is_active,
        "sizes": [{"size": s.size, "volume_ml": s.volume_ml, "price": s.price} for s in p.sizes],
    }


def modifier(m: Modifier) -> dict:
    return {"id": m.id, "group": m.group, "name": m.name, "price": m.price, "is_active": m.is_active}


def user(u: User, is_admin: bool) -> dict:
    return {
        "id": u.id,
        "tg_id": u.tg_id,
        "name": u.name,
        "username": u.username,
        "birthday": u.birthday.isoformat() if u.birthday else None,
        "bonus_count": u.bonus_count,
        "notifications_on": u.notifications_on,
        "is_admin": is_admin,
    }


def order(o: Order, with_user: User | None = None) -> dict:
    data = {
        "id": o.id,
        "number": o.number,
        "status": o.status,
        "status_title": STATUS_TITLES[OrderStatus(o.status)],
        "subtotal": o.subtotal,
        "discount": o.discount,
        "total": o.total,
        "bonus_used": o.bonus_used,
        "ready_at": iso(o.ready_at),
        "comment": o.comment,
        "payment_method": o.payment_method,
        "paid_at": iso(o.paid_at),
        "status_changed_at": iso(o.status_changed_at),
        "created_at": iso(o.created_at),
        "items": [
            {
                "product_id": i.product_id,
                "name": i.product_name,
                "size": i.size,
                "modifiers": i.modifiers,
                "qty": i.qty,
                "price": i.price,
            }
            for i in o.items
        ],
    }
    if with_user is not None:
        data["user"] = {"name": with_user.name, "username": with_user.username, "tg_id": with_user.tg_id}
    return data


def quote(q: Quote) -> dict:
    return {
        "subtotal": q.subtotal,
        "bonus_discount": q.bonus_discount,
        "promo_discount": q.promo_discount,
        "discount": q.discount,
        "total": q.total,
        "promo_code": q.promo.code if q.promo else None,
        "promo_error": q.promo_error,
        "lines": [
            {
                "product_id": line.product.id,
                "size": line.size,
                "modifiers": line.modifiers,
                "qty": line.qty,
                "unit_price": line.unit_price,
            }
            for line in q.lines
        ],
    }


def promo(p: Promocode) -> dict:
    return {
        "id": p.id,
        "code": p.code,
        "type": p.type,
        "value": p.value,
        "expires_at": iso(p.expires_at),
        "usage_limit": p.usage_limit,
        "used_count": p.used_count,
    }


def broadcast(b: Broadcast) -> dict:
    return {
        "id": b.id,
        "text": b.text,
        "photo": b.photo,
        "button_text": b.button_text,
        "button_url": b.button_url,
        "segment": b.segment,
        "scheduled_at": iso(b.scheduled_at),
        "sent_count": b.sent_count,
        "failed_count": b.failed_count,
        "total_count": b.total_count,
        "status": b.status,
        "created_at": iso(b.created_at),
    }

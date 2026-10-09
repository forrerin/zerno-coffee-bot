from sqlalchemy import select

from app.models import Modifier, Product


async def _ids(session):
    products = {p.name: p for p in await session.scalars(select(Product))}
    mods = {m.name: m for m in await session.scalars(select(Modifier))}
    return products, mods


async def test_requires_init_data(client):
    r = await client.get("/api/me")
    assert r.status_code == 401


async def test_menu(client, auth):
    r = await client.get("/api/menu", headers=auth())
    assert r.status_code == 200
    data = r.json()
    assert [c["name"] for c in data["categories"]][:2] == ["Кофе", "Холодные напитки"]
    assert len(data["products"]) > 20


async def test_server_recalculates_price(client, auth, session):
    products, mods = await _ids(session)
    cap = products["Капучино"]
    body = {
        "items": [{"product_id": cap.id, "size": "L", "modifier_ids": [mods["Овсяное"].id, mods["Карамель"].id], "qty": 2}],
        "total": 1,  # клиентская «цена» игнорируется
    }
    r = await client.post("/api/orders", json=body, headers=auth())
    assert r.status_code == 201, r.text
    order = r.json()
    unit = 220 + 80 + 60 + 40
    assert order["items"][0]["price"] == unit
    assert order["total"] == unit * 2
    assert order["status"] == "new"


async def test_invalid_modifier_rejected(client, auth, session):
    products, mods = await _ids(session)
    r = await client.post(
        "/api/orders",
        json={"items": [{"product_id": products["Лимонад маракуйя-мята"].id, "size": "M", "modifier_ids": [mods["Овсяное"].id]}]},
        headers=auth(),
    )
    assert r.status_code == 400


async def test_two_milks_rejected(client, auth, session):
    products, mods = await _ids(session)
    r = await client.post(
        "/api/quote",
        json={"items": [{"product_id": products["Латте"].id, "size": "M", "modifier_ids": [mods["Овсяное"].id, mods["Кокосовое"].id]}]},
        headers=auth(),
    )
    assert r.status_code == 400


async def test_promo_applied(client, auth, session):
    products, _ = await _ids(session)
    items = [{"product_id": products["Чизкейк Нью-Йорк"].id, "qty": 2}]
    r = await client.post("/api/quote", json={"items": items, "promo_code": "zerno10"}, headers=auth())
    q = r.json()
    assert q["subtotal"] == 580 and q["promo_discount"] == 58 and q["total"] == 522


async def test_full_flow_and_unpaid_limit(client, auth, session):
    products, _ = await _ids(session)
    items = [{"product_id": products["Американо"].id, "size": "M", "qty": 1}]
    h = auth(tg_id=77)

    ids = []
    for _ in range(5):
        r = await client.post("/api/orders", json={"items": items}, headers=h)
        assert r.status_code == 201
        ids.append(r.json()["id"])
    r = await client.post("/api/orders", json={"items": items}, headers=h)
    assert r.status_code == 429  # не более 5 неоплаченных

    r = await client.post(f"/api/orders/{ids[0]}/pay", json={"method": "card"}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "paid"
    r = await client.post(f"/api/orders/{ids[0]}/pay", json={"method": "card"}, headers=h)
    assert r.status_code == 409

    # чужой заказ недоступен
    r = await client.get(f"/api/orders/{ids[0]}", headers=auth(tg_id=78))
    assert r.status_code == 404

    # админка: обычному пользователю нельзя, админу можно
    r = await client.patch(f"/api/admin/orders/{ids[0]}", json={"status": "preparing"}, headers=h)
    assert r.status_code == 403
    admin = auth(tg_id=999)
    for st in ("preparing", "ready", "completed"):
        r = await client.patch(f"/api/admin/orders/{ids[0]}", json={"status": st}, headers=admin)
        assert r.status_code == 200 and r.json()["status"] == st

    me = (await client.get("/api/me", headers=h)).json()
    assert me["bonus_count"] == 1

    stats = (await client.get("/api/admin/stats?period=day", headers=admin)).json()
    assert stats["orders"] == 1 and stats["revenue"] == 210 and stats["top"][0]["name"] == "Американо"


async def test_bonus_sixth_drink_free(client, auth, session):
    products, _ = await _ids(session)
    h = auth(tg_id=55)
    await client.get("/api/me", headers=h)
    from app.models import User

    user = await session.scalar(select(User).where(User.tg_id == 55))
    user.bonus_count = 5
    await session.commit()

    items = [
        {"product_id": products["Капучино"].id, "size": "S", "qty": 1},
        {"product_id": products["Круассан"].id, "qty": 1},
    ]
    q = (await client.post("/api/quote", json={"items": items}, headers=h)).json()
    assert q["bonus_discount"] == 220 and q["total"] == 160


async def test_cart_roundtrip(client, auth, session):
    products, _ = await _ids(session)
    items = [{"product_id": products["Латте"].id, "size": "M", "modifier_ids": [], "qty": 3}]
    await client.put("/api/cart", json={"items": items}, headers=auth())
    r = await client.get("/api/cart", headers=auth())
    assert r.json()["items"][0]["qty"] == 3


async def test_order_numbers_continue_after_restart(client, auth, session):
    """Счётчик в Redis пропал (перезапуск) — номера продолжаются, а не начинаются с 001."""
    from app.redis import get_redis

    products, _ = await _ids(session)
    items = [{"product_id": products["Круассан"].id, "qty": 1}]
    h = auth(tg_id=91)
    first = (await client.post("/api/orders", json={"items": items}, headers=h)).json()["number"]
    await get_redis().flushall()
    second = (await client.post("/api/orders", json={"items": items}, headers=h)).json()["number"]
    assert first == "001" and second == "002"

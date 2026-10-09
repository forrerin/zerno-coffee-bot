import time

from sqlalchemy import select

from app.bot.middlewares import FloodGuard
from app.models import Product
from app.redis import get_redis
from app.services import barista
from app.services.broadcasts import send_in_batches


async def test_flood_50_messages_bans_user():
    guard = FloodGuard(get_redis(), per_second=1, per_minute=30, ban_seconds=600)
    now = time.time()
    verdicts = [await guard.check(1, now=now + i * 0.02) for i in range(50)]
    assert verdicts[0] == "ok"
    assert "banned" in verdicts
    assert verdicts[-1] == "blocked"
    assert verdicts.count("ok") <= 2


async def test_normal_pace_not_banned():
    guard = FloodGuard(get_redis(), per_second=1, per_minute=30, ban_seconds=600)
    start = time.time() // 60 * 60  # начало минуты, чтобы не пересечь границу
    verdicts = [await guard.check(2, now=start + i * 1.5) for i in range(20)]
    assert set(verdicts) == {"ok"}


async def test_broadcast_rate_limit_1000():
    sent_at: list[float] = []

    async def fake_send(chat_id: int) -> None:
        sent_at.append(time.monotonic())

    rate = 250  # масштабируем, чтобы тест шёл ~4 с вместо 40
    sent, failed = await send_in_batches(list(range(1000)), fake_send, rate)
    assert (sent, failed) == (1000, 0)
    # ни в одном окне в 1 секунду не больше rate сообщений
    j = 0
    for i, t in enumerate(sent_at):
        while sent_at[j] < t - 0.999:
            j += 1
        assert i - j + 1 <= rate


def _menu_names(answer):
    return [p.name for p in answer.products]


async def test_barista_cold_not_sweet(session):
    menu = await barista.load_menu(session)
    ans = barista.rule_based("хочу что-то холодное и не сладкое", menu)
    assert ans.products
    assert "Колд брю" in _menu_names(ans)
    for p in ans.products:
        assert "холодный" in p.tags


async def test_barista_decaf(session):
    menu = await barista.load_menu(session)
    ans = barista.rule_based("посоветуй без кофеина", menu)
    assert ans.products and all("decaf" in p.badges for p in ans.products)


async def test_barista_off_topic(session):
    menu = await barista.load_menu(session)
    ans = barista.rule_based("кто выиграет чемпионат мира?", menu)
    assert ans.products == []
    assert "бариста" in ans.text


async def test_barista_describes_named_drink(session):
    menu = await barista.load_menu(session)
    ans = barista.rule_based("А что такое айс латте, расскажи подробнее?", menu)
    assert _menu_names(ans) == ["Айс-латте"]
    assert "эспрессо" in ans.text


async def test_barista_only_menu_items(session):
    menu = await barista.load_menu(session)
    ids = {p.id for p in await session.scalars(select(Product).where(Product.is_active.is_(True)))}
    for q in ["бодрящее и холодное", "что-нибудь к кофе", "согреться", "сладкое молочное", "чай"]:
        ans = barista.rule_based(q, menu)
        assert 1 <= len(ans.products) <= 3, q
        assert {p.id for p in ans.products} <= ids

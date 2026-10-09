from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.bot import scheduler
from app.models import Broadcast, Order, OrderStatus, User
from app.services import notify


class FakeBot:
    def __init__(self):
        self.sent: list[tuple[int, str]] = []

    async def send_message(self, chat_id, text, **kwargs):
        self.sent.append((chat_id, text))


async def test_scheduled_broadcast_is_sent(session):
    for i in range(30):
        session.add(User(tg_id=1000 + i, name=f"u{i}", notifications_on=i != 0))
    session.add(Broadcast(text="Скидка!", segment="all", scheduled_at=datetime.now(timezone.utc) - timedelta(seconds=1)))
    session.add(Broadcast(text="Позже", segment="all", scheduled_at=datetime.now(timezone.utc) + timedelta(hours=1)))
    await session.commit()

    bot = FakeBot()
    await scheduler.process_broadcasts(bot)

    assert len(bot.sent) == 29  # один пользователь отключил уведомления
    done = await session.scalar(select(Broadcast).where(Broadcast.text == "Скидка!").execution_options(populate_existing=True))
    later = await session.scalar(select(Broadcast).where(Broadcast.text == "Позже"))
    assert done.status == "done" and done.sent_count == 29
    assert later.status == "scheduled"


async def test_autopilot_moves_orders(session):
    bot = FakeBot()
    notify.set_bot(bot)
    try:
        user = User(tg_id=5, name="Гость")
        session.add(user)
        await session.flush()
        old = datetime.now(timezone.utc) - timedelta(minutes=2)
        order = Order(user_id=user.id, number="007", status=OrderStatus.paid, total=100, status_changed_at=old)
        session.add(order)
        await session.commit()

        await scheduler.demo_autopilot()
        order = await session.scalar(select(Order).execution_options(populate_existing=True))
        assert order.status == OrderStatus.preparing
        assert bot.sent and "готовится" in bot.sent[-1][1]
    finally:
        notify._bot = None

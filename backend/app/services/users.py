from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import User


async def get_or_create_user(
    session: AsyncSession, tg_id: int, name: str = "", username: str | None = None
) -> User:
    user = await session.scalar(select(User).where(User.tg_id == tg_id))
    is_admin = tg_id in settings.admin_ids
    if user is None:
        user = User(tg_id=tg_id, name=name or "Гость", username=username, is_admin=is_admin)
        session.add(user)
        try:
            await session.commit()
            return user
        except IntegrityError:
            # Mini App при первом открытии шлёт несколько запросов параллельно —
            # пользователя мог только что создать соседний запрос
            await session.rollback()
            user = await session.scalar(select(User).where(User.tg_id == tg_id))
            if user is None:
                raise

    changed = False
    if name and user.name != name:
        user.name, changed = name, True
    if username != user.username and username is not None:
        user.username, changed = username, True
    if is_admin and not user.is_admin:
        user.is_admin, changed = True, True
    if changed:
        await session.commit()
    return user

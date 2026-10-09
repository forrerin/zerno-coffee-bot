from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_session
from app.models import User
from app.security import InitDataError, validate_init_data
from app.services.users import get_or_create_user

DEMO_TG_ID = 100_000_001

Session = Annotated[AsyncSession, Depends(get_session)]


async def current_user(
    session: Session,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    """Mini App шлёт заголовок `Authorization: tma <initData>`, подпись проверяем на каждом запросе."""
    init_data = ""
    if authorization and authorization.lower().startswith("tma "):
        init_data = authorization[4:]

    if not init_data:
        if settings.demo_mode:
            user = await get_or_create_user(session, DEMO_TG_ID, "Алексей", "demo")
            if not user.is_admin:
                user.is_admin = True  # в демо-режиме гость видит и админку
                await session.commit()
            return user
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Откройте приложение из Telegram")

    try:
        tg = validate_init_data(init_data, settings.bot_token, settings.init_data_ttl)
    except InitDataError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"initData: {e}") from e
    return await get_or_create_user(session, tg.id, tg.full_name, tg.username)


CurrentUser = Annotated[User, Depends(current_user)]


def can_admin(user: User) -> bool:
    return user.is_admin or user.tg_id in settings.admin_ids or settings.demo_open_admin


async def admin_user(user: CurrentUser) -> User:
    if not can_admin(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Только для администраторов")
    return user


AdminUser = Annotated[User, Depends(admin_user)]

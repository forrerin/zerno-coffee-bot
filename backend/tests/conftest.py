import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="zerno-test-")
os.environ.update(
    DATABASE_URL=f"sqlite+aiosqlite:///{_tmp}/test.db",
    REDIS_URL="memory://",
    BOT_TOKEN="123456:TEST-TOKEN",
    MEDIA_DIR=f"{_tmp}/media",
    LOG_FILE="",
    ADMIN_IDS="999",
    ANTHROPIC_API_KEY="",
    DEMO_MODE="false",
    DEMO_OPEN_ADMIN="false",
    DEMO_AUTOPILOT="false",
    WEBAPP_URL="",
    WEBAPP_STATIC_URL="",
    STAFF_CHAT_ID="",
)

import json  # noqa: E402
import time  # noqa: E402

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.config import settings  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.redis import get_redis  # noqa: E402
from app.security import sign_init_data  # noqa: E402
from app.seed import seed  # noqa: E402


@pytest_asyncio.fixture(autouse=True)
async def db():
    from app import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as session:
        await seed(session)
    await get_redis().flushall()
    yield


@pytest_asyncio.fixture
async def session():
    async with SessionLocal() as s:
        yield s


def auth_header(tg_id: int = 42, name: str = "Алексей") -> dict:
    fields = {
        "auth_date": str(int(time.time())),
        "query_id": "AAE",
        "user": json.dumps({"id": tg_id, "first_name": name, "username": f"u{tg_id}"}, ensure_ascii=False),
    }
    return {"Authorization": "tma " + sign_init_data(fields, settings.bot_token)}


@pytest_asyncio.fixture
async def client():
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def auth():
    return auth_header

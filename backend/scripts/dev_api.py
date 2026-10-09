"""Быстрый просмотр интерфейса без Docker: SQLite + in-memory Redis + демо-режим.

Только для разработки UI. Боевой запуск — docker compose up (PostgreSQL + Redis).
    python scripts/dev_api.py
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{ROOT}/dev.db")
os.environ.setdefault("REDIS_URL", "memory://")
os.environ.setdefault("DEMO_MODE", "true")
os.environ.setdefault("MEDIA_DIR", os.path.join(ROOT, "media"))
os.environ.setdefault("LOG_FILE", "")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=False)

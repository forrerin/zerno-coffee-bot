"""FastAPI-приложение: общий API для Mini App и админки."""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from urllib.parse import urlsplit

from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import routes_admin, routes_public
from app.config import settings
from app.db import SessionLocal, init_db
from app.logging_setup import setup_logging
from app.seed import seed


@asynccontextmanager
async def lifespan(_: FastAPI):
    setup_logging("api")
    await init_db()
    async with SessionLocal() as session:
        await seed(session)
    yield


app = FastAPI(title="Зерно API", lifespan=lifespan)

def _origin(url: str) -> str | None:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}" if parts.scheme and parts.netloc else None


# Mini App может лежать на отдельном статическом хостинге (например, GitHub Pages)
origins = [o for o in (_origin(settings.webapp_url), _origin(settings.webapp_static_url)) if o]
if settings.demo_mode:
    origins += ["http://localhost:5173", "http://127.0.0.1:5173"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(routes_public.router)
app.include_router(routes_admin.router)

os.makedirs(settings.media_dir, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")


@app.get("/api/health")
async def health():
    return {"ok": True}

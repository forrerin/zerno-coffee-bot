import logging
import os
from logging.handlers import RotatingFileHandler

from app.config import settings


def setup_logging(service: str) -> None:
    handlers: list[logging.Handler] = [logging.StreamHandler()]
    if settings.log_file:
        os.makedirs(os.path.dirname(settings.log_file) or ".", exist_ok=True)
        handlers.append(RotatingFileHandler(settings.log_file, maxBytes=5_000_000, backupCount=5, encoding="utf-8"))
    logging.basicConfig(
        level=logging.INFO,
        format=f"%(asctime)s [{service}] %(levelname)s %(name)s: %(message)s",
        handlers=handlers,
        force=True,
    )
    # планировщик пишет о каждом запуске задачи — оставляем только предупреждения
    logging.getLogger("apscheduler").setLevel(logging.WARNING)
    logging.getLogger("aiogram.event").setLevel(logging.WARNING)
    if settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.0, environment=service)

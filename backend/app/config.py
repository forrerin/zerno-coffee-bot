from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("config.env", "../config.env", ".env", "../.env"), extra="ignore", populate_by_name=True)

    # Telegram
    bot_token: str = ""
    webapp_url: str = ""  # публичный HTTPS-адрес Mini App
    # Mini App на статическом хостинге (GitHub Pages и т.п.); API тогда передаётся параметром ?api=
    webapp_static_url: str = ""
    api_gist_id: str = ""  # gist, куда локальный запуск пишет текущий адрес туннеля
    staff_chat_id: int | None = None  # служебный чат для новых заказов
    admin_ids_raw: str = Field("", alias="ADMIN_IDS")  # "123,456"

    # Инфраструктура
    database_url: str = "postgresql+asyncpg://zerno:zerno@db:5432/zerno"
    redis_url: str = "redis://redis:6379/0"
    media_dir: str = "/app/media"
    public_api_url: str = ""  # для ссылок на загруженные фото в рассылках

    # AI
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-5-5"
    ai_daily_limit: int = 20
    ai_history_size: int = 10

    # Безопасность
    demo_mode: bool = False  # позволяет открыть Mini App в браузере без Telegram
    demo_open_admin: bool = False  # админка открыта всем (для публичного демо-бота)
    demo_autopilot: bool = False  # заказы сами переходят «готовится» → «готов»
    init_data_ttl: int = 24 * 3600
    max_unpaid_orders: int = 5

    # Антиспам
    flood_per_second: int = 1
    flood_per_minute: int = 30
    flood_ban_seconds: int = 600

    # Рассылки
    broadcast_rate: int = 25  # сообщений в секунду

    # Логи
    sentry_dsn: str = ""
    log_file: str = "logs/zerno.log"

    # Кофейня
    cafe_name: str = "Зерно"
    cafe_address: str = "ул. Утренняя, 7"
    cafe_hours: str = "Ежедневно 8:00–22:00"
    cafe_phone: str = "+7 (900) 000-00-00"
    timezone: str = "Europe/Moscow"

    @property
    def admin_ids(self) -> set[int]:
        return {int(x) for x in self.admin_ids_raw.replace(" ", "").split(",") if x}

    @field_validator("staff_chat_id", mode="before")
    @classmethod
    def _empty_none(cls, v):
        return None if v in ("", None) else v

    @property
    def ai_enabled(self) -> bool:
        return bool(self.anthropic_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

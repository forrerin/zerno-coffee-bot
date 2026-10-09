"""Проверка подписи initData Telegram Mini App.

https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
"""

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl


class InitDataError(Exception):
    pass


@dataclass
class TgUser:
    id: int
    first_name: str = ""
    last_name: str = ""
    username: str | None = None

    @property
    def full_name(self) -> str:
        return " ".join(p for p in (self.first_name, self.last_name) if p) or "Гость"


def _secret_key(bot_token: str) -> bytes:
    return hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()


def sign_init_data(fields: dict[str, str], bot_token: str) -> str:
    """Собирает корректно подписанную строку initData (используется в тестах)."""
    from urllib.parse import urlencode

    data_check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    h = hmac.new(_secret_key(bot_token), data_check.encode(), hashlib.sha256).hexdigest()
    return urlencode({**fields, "hash": h})


def validate_init_data(init_data: str, bot_token: str, ttl: int, now: float | None = None) -> TgUser:
    if not init_data or not bot_token:
        raise InitDataError("empty init data")
    pairs = dict(parse_qsl(init_data, keep_blank_values=True, strict_parsing=False))
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        raise InitDataError("no hash")
    # поле signature (Ed25519 для third-party проверки) участвует в data_check_string как есть

    data_check = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    expected = hmac.new(_secret_key(bot_token), data_check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received_hash):
        raise InitDataError("bad signature")

    try:
        auth_date = int(pairs.get("auth_date", "0"))
    except ValueError as e:
        raise InitDataError("bad auth_date") from e
    now = now or time.time()
    if auth_date <= 0 or now - auth_date > ttl:
        raise InitDataError("init data expired")

    try:
        raw = json.loads(pairs["user"])
    except (KeyError, json.JSONDecodeError) as e:
        raise InitDataError("no user") from e
    return TgUser(
        id=int(raw["id"]),
        first_name=raw.get("first_name", ""),
        last_name=raw.get("last_name", ""),
        username=raw.get("username"),
    )

import json
import time

import pytest

from app.security import InitDataError, sign_init_data, validate_init_data

TOKEN = "123456:TEST-TOKEN"


def make(auth_date: int | None = None, token: str = TOKEN) -> str:
    return sign_init_data(
        {"auth_date": str(auth_date or int(time.time())), "user": json.dumps({"id": 7, "first_name": "Ира"})},
        token,
    )


def test_valid_init_data():
    user = validate_init_data(make(), TOKEN, ttl=86400)
    assert user.id == 7 and user.full_name == "Ира"


def test_tampered_signature_rejected():
    data = make().replace("%22id%22%3A+7", "%22id%22%3A+8")
    with pytest.raises(InitDataError):
        validate_init_data(data, TOKEN, ttl=86400)


def test_other_bot_token_rejected():
    with pytest.raises(InitDataError):
        validate_init_data(make(token="999:OTHER"), TOKEN, ttl=86400)


def test_expired_init_data_rejected():
    old = int(time.time()) - 25 * 3600
    with pytest.raises(InitDataError):
        validate_init_data(make(auth_date=old), TOKEN, ttl=24 * 3600)


def test_empty_rejected():
    with pytest.raises(InitDataError):
        validate_init_data("", TOKEN, ttl=86400)

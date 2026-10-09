from redis.asyncio import Redis

from app.config import settings

_redis: Redis | None = None


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        if settings.redis_url.startswith("memory://"):
            # Только для тестов: in-process реализация Redis
            from fakeredis import FakeAsyncRedis

            _redis = FakeAsyncRedis(decode_responses=True)
        else:
            _redis = Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def set_redis(client: Redis) -> None:
    global _redis
    _redis = client

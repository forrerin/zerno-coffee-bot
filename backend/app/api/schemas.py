from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class CartLineIn(BaseModel):
    product_id: int
    size: str | None = None
    modifier_ids: list[int] = Field(default_factory=list, max_length=12)
    qty: int = Field(1, ge=1, le=20)


class CartIn(BaseModel):
    items: list[CartLineIn] = Field(default_factory=list, max_length=30)


class QuoteIn(BaseModel):
    items: list[CartLineIn] = Field(max_length=30)
    promo_code: str | None = Field(None, max_length=32)


class OrderIn(QuoteIn):
    ready_at: str | None = Field(None, pattern=r"^\d{2}:\d{2}$")  # None = как можно скорее
    comment: str = Field("", max_length=300)


class PayIn(BaseModel):
    method: Literal["card", "stars"]


class ProfileIn(BaseModel):
    birthday: date | None = None
    notifications_on: bool | None = None


class PromoCheckIn(BaseModel):
    code: str = Field(max_length=32)


# ---------- админка ----------

class SizeIn(BaseModel):
    size: Literal["S", "M", "L"]
    volume_ml: int = Field(ge=30, le=1000)
    price: int = Field(ge=0, le=100_000)


class ProductIn(BaseModel):
    category_id: int
    name: str = Field(min_length=1, max_length=128)
    description: str = Field("", max_length=1000)
    photo_url: str = Field("art:cappuccino", max_length=512)
    base_price: int = Field(ge=0, le=100_000)
    badges: list[Literal["hit", "new", "decaf"]] = Field(default_factory=list)
    modifier_groups: list[Literal["milk", "syrup", "extra"]] = Field(default_factory=list)
    tags: str = Field("", max_length=256)
    is_active: bool = True
    sizes: list[SizeIn] = Field(default_factory=list, max_length=3)


class ModifierIn(BaseModel):
    group: Literal["milk", "syrup", "extra"]
    name: str = Field(min_length=1, max_length=64)
    price: int = Field(ge=0, le=10_000)
    is_active: bool = True


class StatusIn(BaseModel):
    status: Literal["paid", "preparing", "ready", "completed", "cancelled"]


class PromoIn(BaseModel):
    code: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    type: Literal["percent", "fixed"]
    value: int = Field(ge=1, le=100_000)
    expires_at: datetime | None = None
    usage_limit: int | None = Field(None, ge=1)


class BroadcastIn(BaseModel):
    text: str = Field(min_length=1, max_length=1024)
    photo: str | None = Field(None, max_length=512)
    button_text: str | None = Field(None, max_length=64)
    button_url: str | None = Field(None, max_length=512, pattern=r"^https://")
    segment: Literal["all", "sleeping", "regular"] = "all"
    scheduled_at: datetime | None = None  # None = отправить сразу

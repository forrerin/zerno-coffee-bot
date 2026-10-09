from aiogram.filters.callback_data import CallbackData


class StaffStatus(CallbackData, prefix="st"):
    order_id: int
    status: str


class AddToCart(CallbackData, prefix="add"):
    product_id: int


class RepeatOrder(CallbackData, prefix="rep"):
    order_id: int

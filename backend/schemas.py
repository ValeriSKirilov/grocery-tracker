from datetime import date as DateType

from pydantic import BaseModel, Field


class SettlementSchema(BaseModel):
    ekatte_code: str
    name: str


class CategorySchema(BaseModel):
    id: int
    name: str
    group_name: str | None = None


class MetaInitResponse(BaseModel):
    settlements: list[SettlementSchema]
    categories: list[CategorySchema]
    chains: list[str]


class ProductPriceResponse(BaseModel):
    product_id: int
    name: str
    chain_name: str
    category_id: int
    regular_price: float
    promo_price: float | None
    effective_price: float
    date: DateType


class BasketItemRequest(BaseModel):
    category_id: int
    qty: int = Field(default=1, gt=0)


class BasketOptimizeRequest(BaseModel):
    ekatte_code: str
    items: list[BasketItemRequest]
    include_promos: bool = True


class MatchedBasketItem(BaseModel):
    category_id: int
    product_id: int
    product_name: str
    qty: int
    unit_regular_price: float
    unit_promo_price: float | None
    line_total: float


class ChainBasketRanking(BaseModel):
    chain_name: str
    total_cost: float
    total_promo_savings: float
    matched_items: list[MatchedBasketItem]


class BasketOptimizeResponse(BaseModel):
    ekatte_code: str
    rankings: list[ChainBasketRanking]


class ProductHistoryResponse(BaseModel):
    product_id: int
    product_name: str
    chain_name: str
    dates: list[str]
    regular_prices: list[float]
    promo_prices: list[float | None]
    fake_discount_warning: bool

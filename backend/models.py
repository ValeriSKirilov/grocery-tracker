from datetime import date as DateType
from decimal import Decimal

from database import Base
from sqlalchemy import (
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column


class Settlement(Base):
    __tablename__ = "settlements"

    ekatte_code: Mapped[str] = mapped_column(String, primary_key=True, index=True)

    name: Mapped[str] = mapped_column(String, nullable=False)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    name: Mapped[str] = mapped_column(String, nullable=False)

    group_name: Mapped[str | None] = mapped_column(String, nullable=True)


class Product(Base):
    __tablename__ = "products"

    __table_args__ = (
        UniqueConstraint(
            "chain_name", "retailer_code", name="uq_products_chain_retailer"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    chain_name: Mapped[str] = mapped_column(String, nullable=False)

    retailer_code: Mapped[str] = mapped_column(String, nullable=False)

    name: Mapped[str] = mapped_column(String, nullable=False)

    category_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("categories.id"), nullable=False
    )


class PriceRecord(Base):
    __tablename__ = "price_records"

    __table_args__ = (
        UniqueConstraint(
            "product_id",
            "ekatte_code",
            "date",
            name="uq_price_records_product_city_date",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("products.id"), nullable=False
    )

    ekatte_code: Mapped[str] = mapped_column(
        Integer, ForeignKey("settlements.ekatte_code"), nullable=False
    )

    date: Mapped[DateType] = mapped_column(Date, nullable=False, index=True)

    regular_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    promo_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)

    effective_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

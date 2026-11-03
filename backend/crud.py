from sqlalchemy import select, func
from sqlalchemy.orm import Session
from models import Category, Product, Settlement, PriceRecord
from collections import defaultdict
from schemas import BasketOptimizeRequest
from datetime import timedelta


def get_settlements(db: Session):
    statement = select(Settlement)
    return list(db.scalars(statement).all())

def get_categories(db: Session):
    statement = select(Category)
    return list(db.scalars(statement).all())

def get_chains(db: Session):
    statement = select(Product.chain_name).distinct()
    return list(db.scalars(statement).all())

def get_products(
        db: Session,
        ekatte_code: str | None = None,
        chain: str | None = None,
        category_id: int | None = None,
        promo_only: bool = False
):
    latest_date_subq = select(func.max(PriceRecord.date)).scalar_subquery()

    statement = (
        select(
            Product.id.label("product_id"),
            Product.name,
            Product.chain_name,
            Product.category_id,
            PriceRecord.regular_price,
            PriceRecord.promo_price,
            PriceRecord.effective_price,
            PriceRecord.date
        )
        .join(PriceRecord, Product.id == PriceRecord.product_id)
        .where(PriceRecord.date == latest_date_subq)
    )

    if ekatte_code:
        statement = statement.where(PriceRecord.ekatte_code == ekatte_code)
    if chain:
        statement = statement.where(Product.chain_name == chain)
    if category_id:
        statement = statement.where(Product.category_id == category_id)
    if promo_only:
        statement = statement.where(PriceRecord.promo_price.isnot(None))

    return db.execute(statement).mappings().all()

def optimize_basket(db: Session, payload: BasketOptimizeRequest):
    req_q = {item.category_id: item.qty for item in payload.items}

    latest_date_subq = select(func.max(PriceRecord.date)).where(
        PriceRecord.ekatte_code == payload.ekatte_code).scalar_subquery()

    statement = (
        select(
            Product.id.label("product_id"),
            Product.name.label("product_name"),
            Product.chain_name,
            Product.category_id,
            PriceRecord.regular_price,
            PriceRecord.promo_price,
            PriceRecord.effective_price
        )
        .join(PriceRecord, Product.id == PriceRecord.product_id)
        .where(PriceRecord.ekatte_code == payload.ekatte_code)
        .where(PriceRecord.date == latest_date_subq)
        .where(Product.category_id.in_(req_q.keys()))
    )

    records = db.execute(statement).mappings().all()

    chains_data = defaultdict(list)
    for r in records:
        chains_data[r.chain_name].append(r)

    rankings = []

    for chain_name, items in chains_data.items():
        total_cost = 0.0
        total_savings = 0.0
        matched_items = []

        categories_in_chain = defaultdict(list)
        for item in items:
            categories_in_chain[item.category_id].append(item)

        if len(categories_in_chain) != len(req_q):
            continue

        for cat_id, cat_items in categories_in_chain.items():
            cheapest_item = min(cat_items, key=lambda x: x.effective_price)
            qty = req_q[cat_id]

            line_total = float(cheapest_item.effective_price) * qty
            savings = float(cheapest_item.regular_price - cheapest_item.effective_price) * qty

            total_cost += line_total
            total_savings += savings

            matched_items.append({
                "category_id": cat_id,
                "product_id": cheapest_item.product_id,
                "product_name": cheapest_item.product_name,
                "qty": qty,
                "unit_regular_price": float(cheapest_item.regular_price),
                "unit_promo_price": float(cheapest_item.promo_price) if cheapest_item.promo_price else None,
                "line_total": line_total
            })

        rankings.append({
            "chain_name": chain_name,
            "total_cost": total_cost,
            "total_promo_savings": total_savings,
            "matched_items": matched_items
        })
    rankings.sort(key=lambda x: x["total_cost"])

    return {"ekatte_code": payload.ekatte_code, "rankings": rankings}


def get_product_history(db: Session, product_id: int, ekatte_code: str):
    statement = (
        select(
            Product.name,
            Product.chain_name,
            PriceRecord.date,
            PriceRecord.regular_price,
            PriceRecord.promo_price
        )
        .join(Product, Product.id == PriceRecord.product_id)
        .where(PriceRecord.product_id == product_id)
        .where(PriceRecord.ekatte_code == ekatte_code)
        .order_by(PriceRecord.date.asc())
    )
    records = db.execute(statement).mappings().all()

    if not records:
        return None

    fake_discount_warning = False
    latest = records[-1]

    if latest.promo_price is not None:
        promo_start_idx = len(records) - 1
        while promo_start_idx > 0 and records[promo_start_idx - 1].promo_price is not None:
            promo_start_idx -= 1

        promo_start_date = records[promo_start_idx].date
        baseline_date = promo_start_date - timedelta(days=7)

        prices_in_7d_window  = [r.regular_price for r in records if baseline_date <= r.date < promo_start_date]
        prices_before_window = [r.regular_price for r in records if r.date < baseline_date]

        if prices_in_7d_window and prices_before_window:
            if max(prices_in_7d_window) > prices_before_window[-1]:
                fake_discount_warning = True

    return {
        "product_id": product_id,
        "product_name": records[0].name,
        "chain_name": records[0].chain_name,
        "dates": [str(r.date) for r in records],
        "regular_prices": [float(r.regular_price) for r in records],
        "promo_prices": [float(r.promo_price) if r.promo_price else None for r in records],
        "fake_discount_warning": fake_discount_warning
    }
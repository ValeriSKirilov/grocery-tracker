import crud
from database import get_db
from fastapi import APIRouter, Depends, HTTPException
from schemas import (
    BasketOptimizeRequest,
    BasketOptimizeResponse,
    MetaInitResponse,
    ProductHistoryResponse,
    ProductPriceResponse,
)
from sqlalchemy.orm import Session

router = APIRouter()
DB_DEPENDENCY = Depends(get_db)


@router.get("/api/v1/meta/init", response_model=MetaInitResponse)
def get_meta_init(db: Session = DB_DEPENDENCY):
    return {
        "settlements": crud.get_settlements(db),
        "categories": crud.get_categories(db),
        "chains": crud.get_chains(db),
    }


@router.get("/api/v1/products", response_model=list[ProductPriceResponse])
def get_products(
    ekatte_code: str | None = None,
    chain: str | None = None,
    category_id: int | None = None,
    promo_only: bool = False,
    db: Session = DB_DEPENDENCY,
):
    return crud.get_products(
        db=db,
        ekatte_code=ekatte_code,
        chain=chain,
        category_id=category_id,
        promo_only=promo_only,
    )


@router.post("/api/v1/basket/optimize", response_model=BasketOptimizeResponse)
def optimize_basket(payload: BasketOptimizeRequest, db: Session = DB_DEPENDENCY):
    return crud.optimize_basket(db=db, payload=payload)


@router.get(
    "/api/v1/products/{product_id}/history", response_model=ProductHistoryResponse
)
def get_product_history(product_id: int, ekatte_code: str, db: Session = DB_DEPENDENCY):
    history = crud.get_product_history(
        db=db, product_id=product_id, ekatte_code=ekatte_code
    )

    if not history:
        raise HTTPException(
            status_code=404, detail="Product history not found for this location."
        )

    return history

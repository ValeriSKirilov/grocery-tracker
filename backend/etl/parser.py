import csv
import io
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, BinaryIO, TextIO

COLUMN_MAP = {
    "Населено място": "Settlement_EKATTE",
    "Търговски обект": "Store_Address",
    "Наименование на продукта": "Product_Name",
    "Код на продукта": "Retailer_Product_Code",
    "Категория": "Category_ID",
    "Цена на дребно": "Regular_Price",
    "Цена в промоция": "Promo_Price",
}

REQUIRED_COLUMNS = tuple(COLUMN_MAP.values())


def _read_csv_text(csv_file: Any) -> str:
    """Read a path or file-like object as UTF-8 text."""

    if isinstance(csv_file, (str, Path)):
        with open(csv_file, "r", encoding="utf-8-sig", newline="") as file:
            return file.read()

    if isinstance(csv_file, bytes):
        return csv_file.decode("utf-8-sig")

    if hasattr(csv_file, "read"):
        content = csv_file.read()

        if isinstance(content, bytes):
            return content.decode("utf-8-sig")

        if isinstance(content, str):
            return content.removeprefix("\ufeff")

    raise TypeError(
        "csv_file must be a file path, bytes, or a readable file-like object"
    )


def _parse_price(value: Any) -> Decimal | None:
    """Convert a price to Decimal, returning None for empty values."""

    if value is None:
        return None

    value = str(value).strip().replace(",", ".")

    if not value:
        return None

    try:
        return Decimal(value)
    except InvalidOperation:
        return None


def parse_and_clean_csv(
    csv_file: str | Path | BinaryIO | TextIO,
    chain_name: str,
    target_date: date,
) -> list[dict[str, Any]]:
    """
    Parse and clean a KZP retailer CSV.

    Returns one dictionary per valid row, ready for the database
    ingestion layer.
    """

    text = _read_csv_text(csv_file)
    header = text.splitlines()[0] if text.splitlines() else ""

    delimiter = ";" if header.count(";") > header.count(",") else ","

    reader = csv.DictReader(
        io.StringIO(text, newline=""),
        delimiter=delimiter,
        skipinitialspace=True,
    )

    if not reader.fieldnames:
        raise ValueError("CSV file is empty or has no header row")

    reader.fieldnames = [
        name.strip() if name else name
        for name in reader.fieldnames
    ]

    available_columns = set(reader.fieldnames)
    missing_columns = [
        name
        for name in COLUMN_MAP
        if name not in available_columns
    ]

    if missing_columns:
        missing_english = [
            name for name in REQUIRED_COLUMNS
            if name not in available_columns
        ]
        if missing_english:
            raise ValueError(
                "CSV is missing expected columns. "
                f"Found: {reader.fieldnames}"
            )

    rows = []

    for row in reader:
        if not row or all(
            value is None or not value.strip()
            for value in row.values()
        ):
            continue

        cleaned = {
            (key.strip() if key else key): (
                value.strip() if isinstance(value, str) else value
            )
            for key, value in row.items()
        }

        if "Населено място" in cleaned:
            normalized = {
                COLUMN_MAP[key]: value
                for key, value in cleaned.items()
                if key in COLUMN_MAP
            }
        else:
            normalized = {
                key: value
                for key, value in cleaned.items()
                if key in REQUIRED_COLUMNS
            }

        regular_price = _parse_price(
            normalized.get("Regular_Price")
        )

        if regular_price is None or regular_price <= 0:
            continue

        promo_price = _parse_price(
            normalized.get("Promo_Price")
        )

        if promo_price == 0:
            promo_price = None

        raw_promo = normalized.get("Promo_Price")
        promo_price = _parse_price(raw_promo)

        if promo_price == 0:
            promo_price = None

        if (
            raw_promo is not None
            and str(raw_promo).strip()
            and _parse_price(raw_promo) is None
        ):
            continue


        settlement = str(normalized.get("Settlement_EKATTE", "")).strip()

        if settlement:
            settlement = settlement.zfill(5)
        
        product_code = normalized.get("Retailer_Product_Code", "")
        category_id = normalized.get("Category_ID", "")

        if not settlement or not product_code:
            continue


        try:
            category_id = int(category_id)
        except (ValueError, TypeError):
            category_id = 102

        if category_id not in range(1, 102):
            category_id = 102


        effective_price = promo_price or regular_price

        rows.append(
            {
                "Settlement_EKATTE": settlement,
                "Store_Address": normalized.get("Store_Address", ""),
                "Product_Name": normalized.get("Product_Name", ""),
                "Retailer_Product_Code": product_code,
                "Category_ID": category_id,
                "Regular_Price": regular_price,
                "Promo_Price": promo_price,
                "effective_price": effective_price,
                "chain_name": chain_name,
                "target_date": target_date,
            }
        )

    return rows

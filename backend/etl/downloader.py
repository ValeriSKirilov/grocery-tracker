import io
import logging
import re
import sys
import zipfile

from collections import Counter
from datetime import date, timedelta
from time import perf_counter

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from backend.database import engine
from backend.etl.parser import parse_and_clean_csv
from backend.models import Category, PriceRecord, Product, Settlement



BASE_URL = "https://kolkostruva.bg/opendata_files"
BATCH_SIZE = 1000

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)

logger = logging.getLogger(__name__)

def fetch_daily_zip(target_date: date) -> dict[str, bytes]:
    """
    Download the ZIP archive for a specific date
    and extract all CSV files in memory.

    Returns:
        Dictionary where:
        - key = CSV filename
        - value = CSV file contents as bytes
    """

    date_string = target_date.isoformat()
    url = f"{BASE_URL}/{date_string}.zip"

    response = httpx.get(url, timeout=60.0)
    response.raise_for_status()

    zip_buffer = io.BytesIO(response.content)

    csv_files = {}

    with zipfile.ZipFile(zip_buffer, "r") as archive:

        for filename in archive.namelist():

            if filename.endswith("/"):
                continue

            if not filename.lower().endswith(".csv"):
                continue

            csv_content = archive.read(filename)

            csv_files[filename] = csv_content

    if not csv_files:
        raise ValueError(
            f"No CSV files found in archive for {date_string}"
        )

    return csv_files


def get_chain_name(filename: str) -> str:
    """
    Extract the retailer/chain name from the CSV filename.
    """
    name = filename.rsplit("/", 1)[-1]
    name = name.rsplit(".", 1)[0]

    name = name.split("_", 1)[0]
    

    return name.strip()


def chunks(items: list, size: int = BATCH_SIZE):
    """Split a list into smaller batches."""
    for start in range(0, len(items), size):
        yield items[start:start + size]


def sync_daily_data(target_date: date) -> None:
    """
    Download, parse and insert all retailer CSV files for a date.
    Existing products and price records are not duplicated.
    """
    total_start = perf_counter()

    logger.info("Starting daily sync for %s", target_date)

    download_start = perf_counter()
    csv_files = fetch_daily_zip(target_date)
    download_time = perf_counter() - download_start

    logger.info(
        "Downloaded %s CSV files in %.2f seconds",
        len(csv_files),
        download_time,
    )

    total_parsed = 0
    total_valid = 0
    total_skipped_settlement_rows = 0
    total_products_inserted = 0
    total_prices_inserted = 0

    with engine.begin() as connection:

        settlements = dict(
            connection.execute(
                select(Settlement.ekatte_code, Settlement.name)
            ).all()
        )

        categories = {
            category_id
            for (category_id,) in connection.execute(
                select(Category.id)
            ).all()
        }

        if not settlements:
            raise RuntimeError(
                "The settlements table is empty. "
                "Load the settlements reference data first."
            )

        if not categories:
            raise RuntimeError(
                "The categories table is empty. "
                "Load the category reference data first."
            )

        logger.info(
            "Loaded reference data: %s settlements, %s categories",
            len(settlements),
            len(categories),
        )

        for filename, csv_content in csv_files.items():
            chain_name = get_chain_name(filename)

            logger.info("Processing %s | retailer: %s", filename, chain_name)

            parse_start = perf_counter()

            rows = parse_and_clean_csv(
                csv_file=csv_content,
                chain_name=chain_name,
                target_date=target_date,
            )

            parse_time = perf_counter() - parse_start
            total_parsed += len(rows)

            logger.info(
                "%s | parsed %s rows in %.2f seconds",
                filename,
                len(rows),
                parse_time,
            )

            if not rows:
                logger.warning("%s | no valid rows found. Skipping.", filename)
                continue

            invalid_settlements = Counter()
            valid_rows = []

            for row in rows:
                ekatte = row["Settlement_EKATTE"]

                if ekatte not in settlements:
                    invalid_settlements[ekatte] += 1
                    continue

                valid_rows.append(row)

            skipped_count = sum(invalid_settlements.values())
            total_skipped_settlement_rows += skipped_count

            if invalid_settlements:
                logger.warning(
                    "%s | skipped %s rows with unknown EKATTE codes: %s",
                    filename,
                    skipped_count,
                    dict(invalid_settlements),
                )

            rows = valid_rows

            if not rows:
                logger.warning(
                    "%s | no rows with valid settlements. Skipping file.",
                    filename,
                )
                continue

            total_valid += len(rows)

            missing_categories = {
                int(row["Category_ID"])
                for row in rows
                if int(row["Category_ID"]) not in categories
            }

            if missing_categories:
                raise ValueError(
                    f"Missing categories in {filename}: "
                    f"{list(missing_categories)[:10]}"
                )

            product_data = {}

            for row in rows:
                retailer_code = row["Retailer_Product_Code"]

                product_data[retailer_code] = {
                    "chain_name": chain_name,
                    "retailer_code": retailer_code,
                    "name": row["Product_Name"],
                    "category_id": int(row["Category_ID"]),
                }

            product_values = list(product_data.values())

            for batch in chunks(product_values):
                statement = (
                    insert(Product)
                    .values(batch)
                    .on_conflict_do_nothing(
                        index_elements=[
                            Product.chain_name,
                            Product.retailer_code,
                        ]
                    )
                )

                result = connection.execute(statement)
                total_products_inserted += result.rowcount or 0

            product_ids = {}

            retailer_codes = list(product_data.keys())

            for batch in chunks(retailer_codes):
                result = connection.execute(
                    select(
                        Product.retailer_code,
                        Product.id,
                    ).where(
                        Product.chain_name == chain_name,
                        Product.retailer_code.in_(batch),
                    )
                )

                product_ids.update(dict(result.all()))

            price_values = []

            for row in rows:
                retailer_code = row["Retailer_Product_Code"]
                product_id = product_ids.get(retailer_code)

                if product_id is None:
                    raise RuntimeError(
                        f"Could not find product ID for {chain_name} "
                        f"product {retailer_code}"
                    )

                price_values.append({
                    "product_id": product_id,
                    "ekatte_code": row["Settlement_EKATTE"],
                    "store_address": row["Store_Address"],
                    "date": target_date,
                    "regular_price": row["Regular_Price"],
                    "promo_price": row["Promo_Price"],
                    "effective_price": row["effective_price"],
                })

            for batch in chunks(price_values):
                statement = (
                    insert(PriceRecord)
                    .values(batch)
                    .on_conflict_do_nothing(
                        constraint="uq_price_records_product_city_store_date"
                    )
                )

                result = connection.execute(statement)
                total_prices_inserted += result.rowcount or 0

            logger.info(
                "%s | valid rows: %s | unique products: %s | "
                "price records prepared: %s",
                filename,
                len(rows),
                len(product_values),
                len(price_values),
            )

    total_time = perf_counter() - total_start

    logger.info("Daily sync completed successfully!")
    logger.info("Target date: %s", target_date)
    logger.info("CSV files processed: %s", len(csv_files))
    logger.info("Total parsed rows: %s", total_parsed)
    logger.info("Rows with valid settlements: %s", total_valid)
    logger.info("Rows skipped due to unknown settlements: %s",
                total_skipped_settlement_rows)
    logger.info("New products inserted: %s", total_products_inserted)
    logger.info("New price records inserted: %s", total_prices_inserted)
    logger.info("Total execution time: %.2f seconds", total_time)



if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_date = date.fromisoformat(sys.argv[1])
    else:
        target_date = date.today() - timedelta(days=1)

    sync_daily_data(target_date)

import io
from datetime import date
from decimal import Decimal

import pytest

from backend.etl.parser import parse_and_clean_csv

# --------------------------------------------------
# Общи тестови данни и помощни функции
# --------------------------------------------------

BULGARIAN_HEADER = (
    '"Населено място","Търговски обект",'
    '"Наименование на продукта","Код на продукта",'
    '"Категория","Цена на дребно","Цена в промоция"\n'
)

ENGLISH_HEADER = (
    '"Settlement_EKATTE","Store_Address",'
    '"Product_Name","Retailer_Product_Code",'
    '"Category_ID","Regular_Price","Promo_Price"\n'
)

TARGET_DATE = date(2026, 10, 31)


def parse_csv(csv_text, chain_name="DS Home"):
    """Улеснява подаването на CSV текст към парсера."""
    return parse_and_clean_csv(
        io.BytesIO(csv_text.encode("utf-8")),
        chain_name=chain_name,
        target_date=TARGET_DATE,
    )


def make_row(
    settlement="07079",
    store="DS Home - Бургас",
    product="ТЕСТОВ ПРОДУКТ",
    code="000123",
    category="84",
    regular="10.50",
    promo="",
):
    """Създава един CSV ред с възможност да променяме стойностите."""
    return (
        f'"{settlement}","{store}","{product}",'
        f'"{code}","{category}","{regular}","{promo}"\n'
    )


# --------------------------------------------------
# 1. Основни тестове
# --------------------------------------------------
def test_parse_realistic_csv():
    csv_data = """"Населено място","Търговски обект","Наименование на продукта","Код на продукта","Категория","Цена на дребно","Цена в промоция"
"07079","DS Home - Бургас","МОКРИ КЪРПИЧКИ АЛОЕ ВЕРА","76060","84","0.8436",""
"68134","Магазин София","ТЕСТОВ ПРОДУКТ","000123","84","10.50","7.99"
"68134","Магазин София","НЕВАЛИДЕН ПРОДУКТ","000124","84","0",""
"""

    rows = parse_and_clean_csv(
        io.BytesIO(csv_data.encode("utf-8")),
        chain_name="DS Home",
        target_date=date(2026, 10, 31),
    )

    assert len(rows) == 2

    first = rows[0]
    assert first["Settlement_EKATTE"] == "07079"
    assert first["Retailer_Product_Code"] == "76060"
    assert first["Regular_Price"] == Decimal("0.8436")
    assert first["Promo_Price"] is None
    assert first["effective_price"] == Decimal("0.8436")

    second = rows[1]
    assert second["Retailer_Product_Code"] == "000123"
    assert second["Promo_Price"] == Decimal("7.99")
    assert second["effective_price"] == Decimal("7.99")

    print("All parser checks passed!")


def test_parse_realistic_csv():
    """Проверява нормален CSV с няколко продукта."""

    csv_data = BULGARIAN_HEADER

    csv_data += make_row(
        settlement="07079",
        code="76060",
        regular="0.8436",
    )

    csv_data += make_row(
        settlement="68134",
        code="000123",
        regular="10.50",
        promo="7.99",
    )

    csv_data += make_row(
        settlement="68134",
        code="000124",
        regular="0",
    )

    rows = parse_csv(csv_data)

    assert len(rows) == 2

    first = rows[0]

    assert first["Settlement_EKATTE"] == "07079"
    assert first["Retailer_Product_Code"] == "76060"
    assert first["Regular_Price"] == Decimal("0.8436")
    assert first["Promo_Price"] is None
    assert first["effective_price"] == Decimal("0.8436")

    second = rows[1]

    assert second["Retailer_Product_Code"] == "000123"
    assert second["Promo_Price"] == Decimal("7.99")
    assert second["effective_price"] == Decimal("7.99")


def test_empty_csv_returns_empty_list():
    """Празен CSV файл трябва да предизвика ValueError."""
    with pytest.raises(ValueError):
        parse_csv("")


def test_header_only_csv_returns_empty_list():
    """CSV само със заглавия трябва да върне празен списък."""
    rows = parse_csv(BULGARIAN_HEADER)

    assert rows == []


# --------------------------------------------------
# 2. Тестове за цени
# --------------------------------------------------


@pytest.mark.parametrize(
    "regular_price",
    [
        "0",
        "0.0",
        "0.0000",
        "-1",
        "-10.50",
        "",
        "abc",
    ],
)
def test_invalid_regular_prices_are_skipped(regular_price):
    """Редове с невалидна или неположителна редовна цена се пропускат."""

    csv_data = BULGARIAN_HEADER
    csv_data += make_row(regular=regular_price)

    rows = parse_csv(csv_data)

    assert rows == []


@pytest.mark.parametrize(
    "promo_price",
    [
        "",
        "0",
        "0.0",
        "0.0000",
    ],
)
def test_empty_or_zero_promo_price_becomes_none(promo_price):
    """Празна или нулева промоционална цена се преобразува в None."""

    csv_data = BULGARIAN_HEADER
    csv_data += make_row(regular="10.50", promo=promo_price)

    rows = parse_csv(csv_data)

    assert len(rows) == 1
    assert rows[0]["Promo_Price"] is None
    assert rows[0]["effective_price"] == Decimal("10.50")


def test_promo_price_is_used_as_effective_price():
    """При налична промоция ефективната цена трябва да е промоционалната."""

    csv_data = BULGARIAN_HEADER
    csv_data += make_row(regular="10.50", promo="7.99")

    rows = parse_csv(csv_data)

    assert rows[0]["effective_price"] == Decimal("7.99")


def test_regular_price_is_used_when_there_is_no_promotion():
    """Без промоция ефективната цена трябва да е редовната."""

    csv_data = BULGARIAN_HEADER
    csv_data += make_row(regular="5.25", promo="")

    rows = parse_csv(csv_data)

    assert rows[0]["effective_price"] == Decimal("5.25")


def test_malformed_promo_price_is_skipped():
    """Невалиден текст в промоционалната цена не трябва да се приема."""

    csv_data = BULGARIAN_HEADER
    csv_data += make_row(regular="10.50", promo="abc")

    rows = parse_csv(csv_data)

    assert rows == []


# --------------------------------------------------
# 3. Тестове за идентификатори
# --------------------------------------------------


def test_leading_zeroes_are_preserved():
    """Кодовете трябва да останат текст, за да не губят нулите отпред."""

    csv_data = BULGARIAN_HEADER
    csv_data += make_row(
        settlement="07079",
        code="000123",
        category="084",
    )

    rows = parse_csv(csv_data)

    assert rows[0]["Settlement_EKATTE"] == "07079"
    assert rows[0]["Retailer_Product_Code"] == "000123"
    assert rows[0]["Category_ID"] == 84


@pytest.mark.parametrize(
    "field, value",
    [
        ("settlement", ""),
        ("code", ""),
    ],
)
def test_missing_required_identifiers_are_skipped(field, value):
    """Редове без задължителен идентификатор трябва да се пропускат."""

    values = {
        "settlement": "07079",
        "code": "000123",
        "category": "84",
    }

    values[field] = value

    csv_data = BULGARIAN_HEADER
    csv_data += make_row(
        settlement=values["settlement"],
        code=values["code"],
        category=values["category"],
    )

    rows = parse_csv(csv_data)

    assert rows == []


def test_missing_category_defaults_to_other():
    csv_data = BULGARIAN_HEADER
    csv_data += make_row(
        settlement="07079",
        code="000123",
        category="",
    )

    rows = parse_csv(csv_data)

    assert len(rows) == 1
    assert rows[0]["Category_ID"] == 102


# --------------------------------------------------
# 4. Тестове за текст и encoding
# --------------------------------------------------


def test_bulgarian_text_is_preserved():
    """Проверява дали кирилицата се прочита правилно."""

    csv_data = BULGARIAN_HEADER
    csv_data += make_row(
        store="DS Home - Добрич",
        product="МОКРИ КЪРПИЧКИ АЛОЕ ВЕРА",
    )

    rows = parse_csv(csv_data)

    assert rows[0]["Store_Address"] == "DS Home - Добрич"
    assert rows[0]["Product_Name"] == "МОКРИ КЪРПИЧКИ АЛОЕ ВЕРА"


def test_whitespace_is_removed():
    """Премахва интервалите около стойностите."""

    csv_data = BULGARIAN_HEADER
    csv_data += (
        '" 07079 "," DS Home - Бургас ",'
        '" ТЕСТОВ ПРОДУКТ "," 000123 ",'
        '" 84 "," 10.50 "," "\n'
    )

    rows = parse_csv(csv_data)

    assert rows[0]["Settlement_EKATTE"] == "07079"
    assert rows[0]["Store_Address"] == "DS Home - Бургас"
    assert rows[0]["Product_Name"] == "ТЕСТОВ ПРОДУКТ"
    assert rows[0]["Retailer_Product_Code"] == "000123"


def test_empty_lines_are_ignored():
    """Празните редове не трябва да създават записи."""

    csv_data = BULGARIAN_HEADER
    csv_data += "\n"
    csv_data += make_row(code="000123")
    csv_data += "\n\n"

    rows = parse_csv(csv_data)

    assert len(rows) == 1


# --------------------------------------------------
# 5. Тестове за структурата на CSV файла
# --------------------------------------------------


def test_english_column_names_are_supported():
    """Проверява поддръжката на английски имена на колоните."""

    csv_data = ENGLISH_HEADER

    csv_data += (
        '"07079","DS Home - Burgas","TEST PRODUCT","000123","84","10.50","7.99"\n'
    )

    rows = parse_csv(csv_data)

    assert len(rows) == 1
    assert rows[0]["Retailer_Product_Code"] == "000123"
    assert rows[0]["effective_price"] == Decimal("7.99")


def test_missing_columns_raise_value_error():
    """Файл без задължителните колони трябва да предизвика грешка."""

    csv_data = '"Населено място","Търговски обект"\n"07079","DS Home - Бургас"\n'

    with pytest.raises(ValueError):
        parse_csv(csv_data)


# --------------------------------------------------
# 6. Тестове за допълнителните данни
# --------------------------------------------------


def test_chain_name_is_added_to_every_record():
    """Проверява дали името на веригата се добавя правилно."""

    csv_data = BULGARIAN_HEADER
    csv_data += make_row()

    rows = parse_csv(csv_data, chain_name="Kaufland")

    assert rows[0]["chain_name"] == "Kaufland"


def test_target_date_is_added_to_every_record():
    """Проверява дали датата се добавя към всеки запис."""

    csv_data = BULGARIAN_HEADER
    csv_data += make_row()

    rows = parse_csv(csv_data)

    assert rows[0]["target_date"] == TARGET_DATE


def test_multiple_valid_rows_are_returned():
    """Всички валидни редове трябва да бъдат върнати."""

    csv_data = BULGARIAN_HEADER

    for number in range(10):
        csv_data += make_row(code=f"000{number}")

    rows = parse_csv(csv_data)

    assert len(rows) == 10


# --------------------------------------------------
# Край
# --------------------------------------------------

if __name__ == "__main__":
    pytest.main([__file__, "-v"])

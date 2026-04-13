"""
Шаг 3 по ТЗ: Синхронизация заказов из RetailCRM в Supabase.

Что делает скрипт:
1. Загружает из mock_orders.json маппинг phone → utm_source
   (RetailCRM не сохраняет кастомные поля в демо-аккаунте, берём из исходника)
2. Забирает все заказы из RetailCRM API v5 с пагинацией
3. Трансформирует каждый заказ: считает сумму, извлекает город, utm_source
4. Делает upsert в таблицу orders в Supabase (обновляет если уже есть)

Запуск: python3 scripts/sync_to_supabase.py
Зависимости: pip install requests supabase python-dotenv
"""

import json
import os
from datetime import datetime, timedelta
import requests
from supabase import create_client
from dotenv import load_dotenv

# Загружаем переменные из .env
load_dotenv()

RETAILCRM_URL = os.getenv("RETAILCRM_URL")
RETAILCRM_API_KEY = os.getenv("RETAILCRM_API_KEY")
RETAILCRM_SITE = os.getenv("RETAILCRM_SITE")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

MOCK_FILE = os.path.join(os.path.dirname(__file__), "..", "mock_orders.json")

# Инициализируем клиент Supabase
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def load_mock_utm() -> dict:
    """
    Читает mock_orders.json и строит словарь phone → utm_source.
    Нужно потому что RetailCRM демо-аккаунт не хранит кастомные поля.
    """
    with open(MOCK_FILE, encoding="utf-8") as f:
        mocks = json.load(f)
    return {
        m["phone"]: m.get("customFields", {}).get("utm_source", "")
        for m in mocks
    }


def fetch_all_orders() -> list:
    """
    Забирает все заказы из RetailCRM через GET /api/v5/orders.
    Обходит пагинацию — загружает по 100 заказов за запрос.
    RetailCRM принимает limit только 20, 50 или 100.
    """
    orders = []
    page = 1

    while True:
        url = f"{RETAILCRM_URL}/api/v5/orders"
        params = {
            "apiKey": RETAILCRM_API_KEY,
            "site": RETAILCRM_SITE,
            "limit": 100,
            "page": page,
        }
        resp = requests.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

        batch = data.get("orders", [])
        orders.extend(batch)

        pagination = data.get("pagination", {})
        total_pages = pagination.get("totalPageCount", 1)
        print(f"  Страница {page}/{total_pages} — получено {len(batch)} заказов")

        if page >= total_pages:
            break
        page += 1

    return orders


def transform(order: dict, index: int, utm_map: dict) -> dict:
    """
    Преобразует заказ RetailCRM в строку для таблицы Supabase orders.
    - Сумма считается как сумма (initialPrice * quantity) по всем товарам
    - Город берётся из delivery.address.city
    - utm_source ищется в utm_map по номеру телефона
    - created_at распределяется по дням для красивого графика на дашборде
    """
    items = order.get("items", [])
    total = sum(
        float(it.get("initialPrice", 0)) * int(it.get("quantity", 1))
        for it in items
    )
    # Если items пустые — используем поле sumTotal из RetailCRM
    if total == 0:
        total = float(order.get("sumTotal", 0))

    delivery = order.get("delivery", {})
    address = delivery.get("address", {})
    city = address.get("city", "") or address.get("text", "")

    # utm_source берём из mock_orders.json по номеру телефона
    phone = order.get("phone", "")
    utm_source = utm_map.get(phone, "")

    # Распределяем заказы по последним 30 дням для наглядного графика
    base_date = datetime(2026, 3, 15)
    spread_date = (base_date + timedelta(days=index // 2)).isoformat()

    return {
        "id": order["id"],
        "first_name": order.get("firstName", ""),
        "last_name": order.get("lastName", ""),
        "phone": phone,
        "status": order.get("status", ""),
        "total": total,
        "city": city,
        "utm_source": utm_source,
        "created_at": spread_date,
    }


def upsert_to_supabase(rows: list) -> None:
    """
    Делает upsert в таблицу orders в Supabase.
    Upsert = insert + update если запись с таким id уже существует.
    """
    supabase.table("orders").upsert(rows).execute()


def main():
    # Шаг 1: загружаем utm_source из исходного файла
    print("Загружаем utm_source из mock_orders.json...")
    utm_map = load_mock_utm()
    print(f"  Загружено {len(utm_map)} соответствий phone → utm_source")

    # Шаг 2: получаем актуальные заказы из RetailCRM
    print("\nПолучаем заказы из RetailCRM...")
    crm_orders = fetch_all_orders()
    print(f"Итого: {len(crm_orders)} заказов\n")

    # Шаг 3: трансформируем и записываем в Supabase
    rows = [transform(o, i, utm_map) for i, o in enumerate(crm_orders)]

    print("Загружаем в Supabase...")
    upsert_to_supabase(rows)
    print(f"✓ Успешно загружено {len(rows)} записей в таблицу orders")


if __name__ == "__main__":
    main()

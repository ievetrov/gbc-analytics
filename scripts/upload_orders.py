"""
Шаг 2 по ТЗ: Загрузка тестовых заказов из mock_orders.json в RetailCRM через API.

Что делает скрипт:
1. Читает 50 заказов из mock_orders.json
2. Для каждого заказа формирует тело запроса под формат RetailCRM API v5
3. Отправляет POST /api/v5/orders/create (form-data, order передаётся как JSON-строка)
4. Логирует результат: ID созданного заказа, имя клиента, сумма

Запуск: python3 scripts/upload_orders.py
Зависимости: pip install requests python-dotenv
"""

import json
import os
import time
import requests
from dotenv import load_dotenv

# Загружаем переменные из .env
load_dotenv()

RETAILCRM_URL = os.getenv("RETAILCRM_URL")
RETAILCRM_API_KEY = os.getenv("RETAILCRM_API_KEY")
RETAILCRM_SITE = os.getenv("RETAILCRM_SITE")

MOCK_FILE = os.path.join(os.path.dirname(__file__), "..", "mock_orders.json")


def build_order_payload(raw: dict) -> dict:
    """
    Преобразует запись из mock_orders.json в формат RetailCRM API.
    - Товары: offer.name + initialPrice + quantity
    - orderType фиксирован как 'main' (единственный тип в демо-аккаунте)
    - delivery и customFields передаются как есть
    """
    items = [
        {
            "offer": {"name": item["productName"]},
            "initialPrice": item["initialPrice"],
            "quantity": item["quantity"],
        }
        for item in raw.get("items", [])
    ]

    order = {
        "firstName": raw.get("firstName", ""),
        "lastName": raw.get("lastName", ""),
        "phone": raw.get("phone", ""),
        "email": raw.get("email", ""),
        "orderType": "main",  # в демо-аккаунте RetailCRM только этот тип
        "orderMethod": raw.get("orderMethod", "shopping-cart"),
        "status": "new",
        "items": items,
        "delivery": raw.get("delivery", {}),
        "customFields": raw.get("customFields", {}),
    }

    return order


def create_order(order: dict) -> dict:
    """
    Отправляет заказ в RetailCRM через POST /api/v5/orders/create.
    RetailCRM требует form-data, где поле order — это JSON-строка.
    """
    url = f"{RETAILCRM_URL}/api/v5/orders/create"
    data = {
        "apiKey": RETAILCRM_API_KEY,
        "site": RETAILCRM_SITE,
        "order": json.dumps(order, ensure_ascii=False),
    }
    resp = requests.post(url, data=data)
    resp.raise_for_status()
    return resp.json()


def main():
    # Читаем все заказы из файла
    with open(MOCK_FILE, encoding="utf-8") as f:
        orders = json.load(f)

    print(f"Загружаем {len(orders)} заказов в RetailCRM...\n")
    ok, fail = 0, 0

    for i, raw in enumerate(orders, 1):
        try:
            payload = build_order_payload(raw)
            result = create_order(payload)
            if result.get("success"):
                order_id = result.get("id")
                total = sum(it["initialPrice"] * it["quantity"] for it in raw["items"])
                print(f"[{i:02d}] ✓ #{order_id} | {raw['firstName']} {raw['lastName']} | {total} ₸")
                ok += 1
            else:
                print(f"[{i:02d}] ✗ {raw['firstName']} {raw['lastName']} | {result.get('errorMsg', result)}")
                fail += 1
        except Exception as e:
            print(f"[{i:02d}] ✗ Ошибка: {e}")
            fail += 1

        # Пауза между запросами: RetailCRM ограничивает до 20 запросов/сек
        time.sleep(0.1)

    print(f"\nГотово: {ok} успешно, {fail} ошибок")


if __name__ == "__main__":
    main()

import json
import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

RETAILCRM_URL = os.getenv("RETAILCRM_URL")
RETAILCRM_API_KEY = os.getenv("RETAILCRM_API_KEY")
RETAILCRM_SITE = os.getenv("RETAILCRM_SITE")

MOCK_FILE = os.path.join(os.path.dirname(__file__), "..", "mock_orders.json")


def build_order_payload(raw: dict) -> dict:
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
        "orderType": "main",
        "orderMethod": raw.get("orderMethod", "shopping-cart"),
        "status": "new",
        "items": items,
        "delivery": raw.get("delivery", {}),
        "customFields": raw.get("customFields", {}),
    }

    return order


def create_order(order: dict) -> dict:
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

        # RetailCRM rate limit: не более 20 req/sec
        time.sleep(0.1)

    print(f"\nГотово: {ok} успешно, {fail} ошибок")


if __name__ == "__main__":
    main()

# GBC Analytics — Тестовое задание

Мини-дашборд заказов для GBC (бренд Tomyris). Реализован с помощью Claude Code CLI.

**[→ Открыть дашборд](https://gbc-analytics.vercel.app)**

## Стек

| Слой | Технология |
|------|-----------|
| Скрипты | Python 3 + requests + supabase-py |
| База данных | Supabase (PostgreSQL) |
| Фронтенд | Next.js 16 App Router + Recharts + Tailwind |
| Деплой | Vercel |
| Уведомления | Telegram Bot API |
| CRM | RetailCRM API v5 |

## Архитектура

```
mock_orders.json
    ↓ scripts/upload_orders.py
RetailCRM API
    ↓ scripts/sync_to_supabase.py
Supabase (PostgreSQL)
    ↓ @supabase/supabase-js
Next.js Dashboard (Vercel)

RetailCRM webhook → /api/webhook → Telegram Bot (заказы > 50 000 ₸)
```

## Структура проекта

```
gbc-analytics/
├── scripts/
│   ├── upload_orders.py       # Загрузка mock_orders.json → RetailCRM
│   └── sync_to_supabase.py    # RetailCRM → Supabase
├── dashboard/                 # Next.js приложение
│   ├── app/
│   │   ├── page.tsx           # Серверный компонент, загрузка данных
│   │   ├── Dashboard.tsx      # Клиентский компонент с графиками
│   │   └── api/webhook/
│   │       └── route.ts       # Webhook: RetailCRM → Telegram
│   └── lib/supabase.ts        # Supabase клиент
├── mock_orders.json           # 50 тестовых заказов
└── supabase_schema.sql        # SQL схема таблицы orders
```

## Запуск скриптов

```bash
# Установить зависимости
pip install requests supabase python-dotenv

# Загрузить заказы в RetailCRM
python3 scripts/upload_orders.py

# Синхронизировать RetailCRM → Supabase
python3 scripts/sync_to_supabase.py
```

Переменные окружения в `.env`:
```
RETAILCRM_URL=https://yourstore.retailcrm.ru
RETAILCRM_API_KEY=...
RETAILCRM_SITE=...
SUPABASE_URL=...
SUPABASE_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

## Как я работал с Claude Code

### Промпты, которые дали хороший результат

**Загрузка заказов в RetailCRM:**
> "Напиши Python-скрипт который читает mock_orders.json и загружает каждый заказ в RetailCRM через POST /api/v5/orders/create. API принимает form-data, где поле order — JSON-строка. Добавь логирование и rate limiting."

**Дашборд с графиками:**
> "Создай Next.js App Router страницу с дашбордом заказов. Данные из Supabase. Нужны: LineChart заказов по дням, BarChart выручки по utm_source, карточки со статистикой, таблица последних заказов. Используй Recharts и Tailwind."

**Webhook для Telegram:**
> "Напиши Next.js Route Handler (App Router) который принимает POST от RetailCRM webhook, проверяет sumTotal > 50000 и отправляет уведомление в Telegram через Bot API."

### Где застрял и как решил

**Проблема 1: RetailCRM orderType**
RetailCRM вернул ошибку `"OrderType" with "code"="eshop-individual" does not exist`. В демо-аккаунте доступен только тип `main`.

*Решение:* Запросил `/api/v5/reference/order-types` чтобы узнать доступные типы, поправил скрипт.

**Проблема 2: customFields в RetailCRM возвращается как `[]`**
Скрипт падал на `AttributeError: 'list' object has no attribute 'get'` — ожидал словарь, получил список.

*Решение:* Добавил `isinstance(custom, list)` проверку. utm_source восстанавливаю из mock_orders.json по номеру телефона.

**Проблема 3: RLS в Supabase блокировал INSERT**
`new row violates row-level security policy` — у anon-ключа не было прав на запись.

*Решение:* Добавил политику `CREATE POLICY "Allow public insert" ON orders FOR INSERT WITH CHECK (true)`.

**Проблема 4: Vercel не определил Next.js**
После деплоя сайт возвращал 404. Framework Preset стоял "Other".

*Решение:* Вручную выставил Framework Preset = Next.js в Settings → Build and Deployment.

**Проблема 5: Webhooks в RetailCRM демо**
В демо-аккаунте нет UI и API для webhooks. 

*Решение:* Протестировал endpoint `/api/webhook` прямым curl-запросом, имитирующим RetailCRM payload. В продакшне webhook подключается через Настройки → Интеграция → Webhooks.

### Что узнал в процессе

- RetailCRM API v5 принимает параметр `order` как JSON-строку внутри form-data, не как JSON body
- Supabase JS v2 требует явный `.select()` после `.insert()` чтобы вернуть данные
- Next.js 16 App Router: серверные компоненты (`async page.tsx`) и клиентские (`"use client"`) разделены — Recharts работает только в клиентском
- Vercel определяет фреймворк по `package.json`, но при монорепо нужно выставить Root Directory и Framework Preset вручную

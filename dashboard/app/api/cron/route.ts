import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;
const CRM_URL = process.env.RETAILCRM_URL!;
const CRM_KEY = process.env.RETAILCRM_API_KEY!;
const CRM_SITE = process.env.RETAILCRM_SITE!;

async function syncFromCRM() {
  const resp = await fetch(
    `${CRM_URL}/api/v5/orders?apiKey=${CRM_KEY}&site=${CRM_SITE}&limit=100&page=1`
  );
  const data = await resp.json();
  const orders = data.orders ?? [];

  const rows = orders.map((o: Record<string, unknown>, i: number) => {
    const items = (o.items as Record<string, unknown>[] | undefined) ?? [];
    const total =
      items.reduce(
        (s: number, it: Record<string, unknown>) =>
          s +
          Number(it.initialPrice ?? 0) * Number(it.quantity ?? 1),
        0
      ) || Number(o.sumTotal ?? 0);

    const delivery = (o.delivery as Record<string, unknown>) ?? {};
    const address = (delivery.address as Record<string, unknown>) ?? {};
    const city = String(address.city ?? address.text ?? "");

    const baseDate = new Date("2026-03-15");
    baseDate.setDate(baseDate.getDate() + Math.floor(i / 2));

    return {
      id: o.id,
      first_name: o.firstName ?? "",
      last_name: o.lastName ?? "",
      phone: o.phone ?? "",
      status: o.status ?? "",
      total,
      city,
      utm_source: "",
      created_at: baseDate.toISOString(),
    };
  });

  if (rows.length > 0) {
    await supabase.from("orders").upsert(rows);
  }

  return rows.length;
}

async function sendTelegram(order: {
  id: number;
  first_name: string;
  last_name: string;
  total: number;
  city: string;
  status: string;
}) {
  const text =
    `🛍 *Крупный заказ!*\n` +
    `Клиент: ${order.first_name} ${order.last_name}\n` +
    `Сумма: *${order.total.toLocaleString("ru-KZ")} ₸*\n` +
    (order.city ? `Город: ${order.city}\n` : "") +
    `Статус: ${order.status}`;

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "Markdown" }),
  });
}

export async function GET() {
  try {
    // Шаг 1: синхронизируем RetailCRM → Supabase
    const synced = await syncFromCRM();

    // Шаг 2: уведомляем по необработанным заказам > 50k
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, first_name, last_name, total, city, status")
      .gt("total", 50000)
      .eq("telegram_sent", false)
      .order("id", { ascending: true });

    if (error) throw error;

    let notified = 0;
    for (const order of orders ?? []) {
      await sendTelegram(order);
      await supabase
        .from("orders")
        .update({ telegram_sent: true })
        .eq("id", order.id);
      notified++;
    }

    return Response.json({ ok: true, synced, notified });
  } catch (err) {
    console.error("Cron error:", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;

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
    // Берём заказы > 50k₸ которые ещё не уведомлены
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, first_name, last_name, total, city, status")
      .gt("total", 50000)
      .eq("telegram_sent", false)
      .order("id", { ascending: true });

    if (error) throw error;

    if (!orders || orders.length === 0) {
      return Response.json({ ok: true, notified: 0 });
    }

    let notified = 0;
    for (const order of orders) {
      await sendTelegram(order);

      await supabase
        .from("orders")
        .update({ telegram_sent: true })
        .eq("id", order.id);

      notified++;
    }

    return Response.json({ ok: true, notified });
  } catch (err) {
    console.error("Cron error:", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

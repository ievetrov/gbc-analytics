export async function POST(request: Request) {
  try {
    const body = await request.json();

    // RetailCRM шлёт заказ внутри payload
    const order = body?.order ?? body;

    const sumTotal =
      order?.sumTotal ??
      (order?.items ?? []).reduce(
        (s: number, it: { initialPrice?: number; quantity?: number }) =>
          s + (it.initialPrice ?? 0) * (it.quantity ?? 1),
        0
      );

    if (sumTotal > 50000) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;

      const firstName = order?.firstName ?? "";
      const lastName = order?.lastName ?? "";
      const city = order?.delivery?.address?.city ?? "";

      const text =
        `🛍 *Крупный заказ!*\n` +
        `Клиент: ${firstName} ${lastName}\n` +
        `Сумма: *${sumTotal.toLocaleString("ru-KZ")} ₸*\n` +
        (city ? `Город: ${city}\n` : "") +
        `Статус: ${order?.status ?? "—"}`;

      await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "Markdown",
          }),
        }
      );
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("Error", { status: 500 });
  }
}

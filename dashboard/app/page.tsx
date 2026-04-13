import { supabase, type Order } from "@/lib/supabase";
import Dashboard from "./Dashboard";

async function getOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Supabase error:", error.message);
    return [];
  }

  return data ?? [];
}

export default async function Page() {
  const orders = await getOrders();
  return <Dashboard orders={orders} />;
}

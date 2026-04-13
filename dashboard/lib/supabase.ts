import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type Order = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  status: string;
  total: number;
  city: string;
  utm_source: string;
  created_at: string;
};

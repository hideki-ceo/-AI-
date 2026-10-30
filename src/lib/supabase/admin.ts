import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// service_role クライアント（RLS をバイパス）。
// LINE Webhook・Stripe Webhook・property_secrets の読み書きなど、サーバー内部処理でのみ使う。
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

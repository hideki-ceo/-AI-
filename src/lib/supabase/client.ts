import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// Client Component 用（RLS が適用される）
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

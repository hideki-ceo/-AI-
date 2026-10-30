import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function authorizeProperty(propertyId: string) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return { userId: null, property: null, isAdmin: false };

  const admin = createAdminClient();
  const [profileResult, propertyResult] = await Promise.all([
    admin.from("profiles").select("role").eq("id", authData.user.id).single(),
    admin.from("properties").select("id, user_id, tenant_id").eq("id", propertyId).maybeSingle(),
  ]);
  if (profileResult.error || propertyResult.error) {
    throw new Error(`Unable to authorize property: ${profileResult.error?.message ?? propertyResult.error?.message}`);
  }
  const isAdmin = profileResult.data.role === "admin";
  const property = isAdmin || propertyResult.data?.user_id === authData.user.id
    ? propertyResult.data
    : null;
  return { userId: authData.user.id, property, isAdmin };
}

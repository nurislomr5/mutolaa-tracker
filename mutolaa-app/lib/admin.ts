import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/supabase/server";

// Admin — profiles.is_admin (20261110000011). Ustun foydalanuvchi rollariga ochilmagan, shuning uchun service role bilan oʻqiladi.
export const getAdminUser = cache(async () => {
  const user = await getSessionUser();
  if (!user) return null;
  const { data } = await createAdminClient().from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  return data?.is_admin ? user : null;
});

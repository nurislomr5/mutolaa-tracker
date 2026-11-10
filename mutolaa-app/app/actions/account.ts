"use server";

import { cookies } from "next/headers";
import { sendAlert } from "@/lib/alert";
import { uz } from "@/lib/i18n/uz";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";
import type { ActionResult } from "./shelf";

// Hisobni butunlay oʻchirish. auth.users dagi yozuv oʻchsa, qolgani (profil, javon, qaydlar, obunalar, ovozlar,
// klublar, Telegram bogʻlanishi) bazadagi "on delete cascade" orqali oʻzi oʻchadi; foydalanuvchi qoʻshgan kitoblar
// katalogda qoladi (books.created_by → null). Zanjir tests/db-access.test.ts da sinalgan.
export async function deleteAccount(formData: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: uz.common.error };
  if (formData.get("confirm") !== "on") return { ok: false, error: uz.account.confirmRequired };

  // Faqat sessiyadagi foydalanuvchining oʻzi oʻchiriladi — id hech qachon formadan olinmaydi
  const { error } = await createAdminClient().auth.admin.deleteUser(user.id);
  if (error) {
    await sendAlert("delete-account", "Hisobni oʻchirib boʻlmadi", [error.message]);
    return { ok: false, error: uz.account.deleteFailed };
  }

  // Sessiya cookie'larini tozalaymiz. Foydalanuvchi endi yoʻq, shuning uchun server xato qaytarishi mumkin —
  // supabase-js baribir lokal sessiyani oʻchiradi; ehtiyot uchun qolgan sb-* cookie'larni oʻzimiz ham oʻchiramiz.
  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // quyida cookie'lar qoʻlda oʻchiriladi
  }
  const store = await cookies();
  for (const c of store.getAll()) if (c.name.startsWith("sb-")) store.delete(c.name);

  return { ok: true };
}

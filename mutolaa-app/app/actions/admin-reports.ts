"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin";
import { uz } from "@/lib/i18n/uz";
import { createAdminClient } from "@/lib/supabase/admin";

// Shikoyatlar navbati (admin): matnni olib tashlash yoki shikoyatni rad etish. Bitta nishon ustidan tushgan
// hamma ochiq shikoyatlar birga yopiladi.

export type AdminResult = { ok: true; message: string } | { ok: false; error: string };

const id = z.number().int().positive();

type Report = { id: number; target_type: "review" | "club_post" | "profile"; target_id: number | null; target_user_id: string };

export async function resolveContentReport(reportId: number, decision: "remove" | "dismiss"): Promise<AdminResult> {
  if (!(await getAdminUser())) return { ok: false, error: uz.admin.forbidden };
  const parsed = z.object({ reportId: id, decision: z.enum(["remove", "dismiss"]) }).safeParse({ reportId, decision });
  if (!parsed.success) return { ok: false, error: uz.common.error };

  const admin = createAdminClient();
  const { data } = await admin
    .from("content_reports")
    .select("id, target_type, target_id, target_user_id")
    .eq("id", parsed.data.reportId)
    .eq("status", "open")
    .maybeSingle();
  const report = data as Report | null;
  if (!report) return { ok: false, error: uz.common.error };

  if (parsed.data.decision === "remove") {
    if (report.target_type === "review" && report.target_id != null) {
      // Faqat matn oʻchadi: baho va javondagi kitob egasida qoladi. Muallif tekshiruvi — id boshqa odamning
      // yozuviga oʻtib qolgan boʻlsa (kitoblar birlashtirilganda) begona taqrizga tegmaslik uchun.
      const { data: row, error } = await admin
        .from("user_books")
        .update({ review: null, review_is_spoiler: false })
        .eq("id", report.target_id)
        .eq("user_id", report.target_user_id)
        .select("book_id")
        .maybeSingle();
      if (error) return { ok: false, error: uz.common.error };
      if (row?.book_id) {
        await admin.from("review_votes").delete().eq("user_book_id", report.target_id);
        await admin.from("activities").delete().eq("user_id", report.target_user_id).eq("book_id", row.book_id).eq("kind", "reviewed");
        updateTag(`reviews:${row.book_id}`);
      }
    } else if (report.target_type === "club_post" && report.target_id != null) {
      const { error } = await admin.from("club_posts").delete().eq("id", report.target_id).eq("user_id", report.target_user_id);
      if (error) return { ok: false, error: uz.common.error };
    } else if (report.target_type === "profile") {
      const { error } = await admin.from("profiles").update({ is_public: false }).eq("id", report.target_user_id);
      if (error) return { ok: false, error: uz.common.error };
    }
  }

  let close = admin
    .from("content_reports")
    .update({ status: parsed.data.decision === "remove" ? "removed" : "dismissed", resolved_at: new Date().toISOString() })
    .eq("status", "open")
    .eq("target_type", report.target_type)
    .eq("target_user_id", report.target_user_id);
  close = report.target_id == null ? close.is("target_id", null) : close.eq("target_id", report.target_id);
  const { error: closeError } = await close;
  if (closeError) return { ok: false, error: uz.common.error };

  refresh();
  return { ok: true, message: parsed.data.decision === "remove" ? uz.admin.removed : uz.admin.reportDismissed };
}

// Katalogdagi xato haqidagi xabar: kitob tuzatilgach (yoki xabar asossiz boʻlsa) "hal qilindi" deb belgilanadi
export async function resolveBookReport(reportId: number): Promise<AdminResult> {
  if (!(await getAdminUser())) return { ok: false, error: uz.admin.forbidden };
  const parsed = id.safeParse(reportId);
  if (!parsed.success) return { ok: false, error: uz.common.error };
  const { error } = await createAdminClient()
    .from("book_reports")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .is("resolved_at", null);
  if (error) return { ok: false, error: uz.common.error };
  refresh();
  return { ok: true, message: uz.admin.resolved };
}

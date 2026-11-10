"use server";

import { z } from "zod";
import { appUrl, esc, sendMessage } from "@/lib/bot/telegram";
import { uz } from "@/lib/i18n/uz";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

// Taqriz, klubdagi xabar yoki profil ustidan shikoyat → content_reports (admin navbati: /admin/shikoyatlar)
// va admin Telegram chatiga xabar. Faqat tizimga kirgan foydalanuvchi, soatiga REPORTS_PER_HOUR tadan koʻp emas.

export type ReportResult = { ok: true; message: string } | { ok: false; error: string };

const REPORTS_PER_HOUR = 5;
const SNAPSHOT_MAX = 4000;

const schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("review"), id: z.coerce.number().int().positive() }),
  z.object({ type: z.literal("club_post"), id: z.coerce.number().int().positive() }),
  z.object({ type: z.literal("profile"), id: z.uuid() }),
]);
const detailsSchema = z.object({
  reason: z.enum(["spam", "abuse", "inappropriate", "other"]),
  message: z.string().trim().max(500),
});

type Target = { targetId: number | null; authorId: string; snapshot: string; where: string };

// Shikoyat qilinayotgan narsa shikoyatchining oʻziga koʻrinishi shart — bu uning oʻz sessiyasi (RLS) bilan
// tekshiriladi, aks holda id'larni terib yopiq klub xabari yoki yopiq profil taqrizini "koʻrish" mumkin boʻlardi.
// Muallif va matn esa service role bilan olinadi (club_posts.user_id foydalanuvchi rollariga ochilmagan).
async function findTarget(input: z.infer<typeof schema>): Promise<Target | null> {
  const db = await createServerSupabase();
  const admin = createAdminClient();

  if (input.type === "review") {
    const { data: seen } = await db.from("user_books").select("id").eq("id", input.id).not("review", "is", null).maybeSingle();
    if (!seen) return null;
    const { data } = await admin.from("user_books").select("user_id, review, books(title)").eq("id", input.id).maybeSingle();
    const row = data as { user_id: string; review: string | null; books: { title: string } | null } | null;
    if (!row?.review) return null;
    return { targetId: input.id, authorId: row.user_id, snapshot: row.review, where: row.books?.title ?? "" };
  }

  if (input.type === "club_post") {
    const { data: seen } = await db.from("club_posts").select("id").eq("id", input.id).maybeSingle();
    if (!seen) return null;
    const { data } = await admin.from("club_posts").select("user_id, body, clubs(name)").eq("id", input.id).maybeSingle();
    const row = data as { user_id: string; body: string; clubs: { name: string } | null } | null;
    if (!row) return null;
    return { targetId: input.id, authorId: row.user_id, snapshot: row.body, where: row.clubs?.name ?? "" };
  }

  const { data } = await db.from("profiles").select("id, username, display_name").eq("id", input.id).eq("is_public", true).maybeSingle();
  if (!data) return null;
  return {
    targetId: null,
    authorId: data.id as string,
    snapshot: [data.display_name, data.username && `@${data.username}`].filter(Boolean).join(" "),
    where: "",
  };
}

export async function reportContent(_prev: ReportResult | null, formData: FormData): Promise<ReportResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: uz.report.login };

  const fields = Object.fromEntries(formData);
  const target = schema.safeParse(fields);
  const details = detailsSchema.safeParse({ reason: fields.reason, message: fields.message ?? "" });
  if (!target.success || !details.success) return { ok: false, error: uz.common.error };
  const { reason, message } = details.data;

  const found = await findTarget(target.data);
  if (!found) return { ok: false, error: uz.report.notFound };
  if (found.authorId === user.id) return { ok: false, error: uz.report.own };

  const admin = createAdminClient();
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error: countError } = await admin
    .from("content_reports")
    .select("id", { count: "exact", head: true })
    .eq("reporter_id", user.id)
    .gte("created_at", since);
  if (countError) return { ok: false, error: uz.common.error };
  if ((count ?? 0) >= REPORTS_PER_HOUR) return { ok: false, error: uz.report.limit };

  // Avval navbatga yoziladi: yozib boʻlmasa, xabar ham yuborilmaydi (cheklovni chetlab oʻtib boʻlmasin)
  const { error: insertError } = await admin.from("content_reports").insert({
    reporter_id: user.id,
    target_type: target.data.type,
    target_id: found.targetId,
    target_user_id: found.authorId,
    reason,
    message: message || null,
    snapshot: found.snapshot.slice(0, SNAPSHOT_MAX),
  });
  // Shu narsa ustidan ochiq shikoyati bor (content_reports_once_idx) — qayta yozilmaydi, admin ham bezovta qilinmaydi
  if (insertError?.code === "23505") return { ok: true, message: uz.report.already };
  if (insertError) return { ok: false, error: uz.common.error };

  const chatId = Number((process.env.ALERT_TELEGRAM_CHAT_ID ?? process.env.MY_TELEGRAM_ID ?? "").trim());
  if (chatId && !Number.isNaN(chatId)) {
    const excerpt = found.snapshot.length > 300 ? `${found.snapshot.slice(0, 300)}…` : found.snapshot;
    const text =
      `🚩 <b>Shikoyat: ${esc(uz.admin.targetType[target.data.type])}</b>` +
      (found.where ? ` — ${esc(found.where)}` : "") +
      `\n⚠️ ${esc(uz.report.reasons[reason])}` +
      (message ? `\n💬 ${esc(message)}` : "") +
      `\n\n<i>${esc(excerpt)}</i>` +
      `\n\n🔗 ${appUrl()}/admin/shikoyatlar`;
    await sendMessage(chatId, text).catch(() => null);
  } else {
    console.info("[ContentReport]", { type: target.data.type, id: found.targetId, reporter: user.id, reason });
  }

  return { ok: true, message: uz.report.sent };
}

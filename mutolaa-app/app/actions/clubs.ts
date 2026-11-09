"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { uz } from "@/lib/i18n/uz";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

// Kitobxonlik klublari. Ruxsatlar bazada (RLS va funksiyalar, 20261111000013) — bu yerda faqat
// validatsiya, foydalanuvchiga tushunarli xabar va sahifani yangilash.

export type ClubResult = { ok: true; message?: string } | { ok: false; error: string };

const t = uz.clubs;
const id = z.number().int().positive();
const fail = (error: string = uz.common.error): ClubResult => ({ ok: false, error });

async function requireUser() {
  const user = await getSessionUser();
  return user ? { user, db: await createServerSupabase() } : null;
}

const clubSchema = z.object({
  name: z.string().trim().min(3, t.nameShort).max(80),
  description: z.string().trim().max(1000),
  is_public: z.enum(["1", "0"]),
});

export async function createClub(_prev: ClubResult | null, formData: FormData): Promise<ClubResult> {
  const session = await requireUser();
  if (!session) return fail(t.signInFirst);
  const parsed = clubSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    is_public: formData.get("is_public") ?? "1",
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message);
  const { data: slug, error } = await session.db.rpc("create_club", {
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_is_public: parsed.data.is_public === "1",
  });
  if (error) return fail(/kunlik cheklov/.test(error.message) ? t.dailyLimit : undefined);
  redirect(`/klub/${slug}`);
}

export async function updateClub(_prev: ClubResult | null, formData: FormData): Promise<ClubResult> {
  const session = await requireUser();
  if (!session) return fail(t.signInFirst);
  const clubId = id.safeParse(Number(formData.get("clubId")));
  const parsed = clubSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    is_public: formData.get("is_public") ?? "1",
  });
  if (!clubId.success || !parsed.success) return fail(parsed.success ? undefined : parsed.error.issues[0]?.message);
  const { data, error } = await session.db
    .from("clubs")
    .update({ name: parsed.data.name, description: parsed.data.description || null, is_public: parsed.data.is_public === "1" })
    .eq("id", clubId.data)
    .select("id");
  if (error || !data?.length) return fail();
  refresh();
  return { ok: true, message: t.saved };
}

export async function deleteClub(clubId: number): Promise<ClubResult> {
  const session = await requireUser();
  if (!session || !id.safeParse(clubId).success) return fail();
  const { data, error } = await session.db.from("clubs").delete().eq("id", clubId).select("id");
  if (error || !data?.length) return fail();
  redirect("/klublar");
}

export async function joinClub(clubId: number): Promise<ClubResult> {
  const session = await requireUser();
  if (!session) return fail(t.signInFirst);
  if (!id.safeParse(clubId).success) return fail();
  const { error } = await session.db.from("club_members").upsert({ club_id: clubId }, { onConflict: "club_id,user_id", ignoreDuplicates: true });
  if (error) return fail();
  refresh();
  return { ok: true };
}

export async function joinClubByCode(code: string): Promise<ClubResult> {
  const session = await requireUser();
  if (!session) return fail(t.signInFirst);
  if (!/^[0-9a-f]{32}$/.test(code)) return fail(t.inviteInvalid);
  const { data: slug, error } = await session.db.rpc("join_club_by_code", { p_code: code });
  if (error) return fail();
  if (!slug) return fail(t.inviteInvalid);
  redirect(`/klub/${slug}`);
}

// Oʻzi chiqishi yoki egasi aʼzoni chiqarishi (egasining oʻzi chiqa olmaydi — klubni oʻchirishi mumkin)
export async function leaveClub(clubId: number, userId?: string): Promise<ClubResult> {
  const session = await requireUser();
  if (!session || !id.safeParse(clubId).success) return fail();
  const target = userId ?? session.user.id;
  if (!z.uuid().safeParse(target).success) return fail();
  const { data, error } = await session.db.from("club_members").delete().eq("club_id", clubId).eq("user_id", target).select("user_id");
  if (error || !data?.length) return fail(t.ownerCannotLeave);
  refresh();
  return { ok: true };
}

export async function setClubBook(clubId: number, bookId: number | null): Promise<ClubResult> {
  const session = await requireUser();
  if (!session || !id.safeParse(clubId).success || (bookId !== null && !id.safeParse(bookId).success)) return fail();
  const { data, error } = await session.db.from("clubs").update({ current_book_id: bookId }).eq("id", clubId).select("id");
  if (error || !data?.length) return fail();
  refresh();
  return { ok: true };
}

// Egasi joriy kitobni tanlashi uchun qidiruv (katalog qidiruvi bilan bir xil)
export async function searchClubBooks(q: string) {
  const query = String(q ?? "").trim().slice(0, 100);
  if (query.length < 2 || !(await getSessionUser())) return [];
  const { data } = await (await createServerSupabase())
    .rpc("search_books", { q: query })
    .select("id, title, author_names, cover_url")
    .limit(8);
  return (data ?? []) as { id: number; title: string; author_names: string | null; cover_url: string | null }[];
}

export async function resetClubInvite(clubId: number): Promise<ClubResult> {
  const session = await requireUser();
  if (!session || !id.safeParse(clubId).success) return fail();
  const { data, error } = await session.db.rpc("reset_club_invite", { p_club_id: clubId });
  if (error || !data) return fail();
  refresh();
  return { ok: true, message: t.inviteReset };
}

const postSchema = z.object({
  clubId: id,
  parentId: id.nullable(),
  body: z.string().trim().min(1).max(2000),
});

export async function addClubPost(_prev: ClubResult | null, formData: FormData): Promise<ClubResult> {
  const session = await requireUser();
  if (!session) return fail(t.signInFirst);
  const parsed = postSchema.safeParse({
    clubId: Number(formData.get("clubId")),
    parentId: formData.get("parentId") ? Number(formData.get("parentId")) : null,
    body: formData.get("body") ?? "",
  });
  if (!parsed.success) return fail(t.postEmpty);
  const { error } = await session.db
    .from("club_posts")
    .insert({ club_id: parsed.data.clubId, parent_id: parsed.data.parentId, body: parsed.data.body });
  if (error) return fail(/juda koʻp/.test(error.message) ? t.postLimit : t.postNotMember);
  refresh();
  return { ok: true };
}

export async function deleteClubPost(postId: number): Promise<ClubResult> {
  const session = await requireUser();
  if (!session || !id.safeParse(postId).success) return fail();
  const { data, error } = await session.db.from("club_posts").delete().eq("id", postId).select("id");
  if (error || !data?.length) return fail();
  refresh();
  return { ok: true };
}

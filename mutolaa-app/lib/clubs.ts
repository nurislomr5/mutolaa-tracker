import { createServerSupabase } from "@/lib/supabase/server";

// Kitobxonlik klublari — oʻqish bazadagi funksiyalar orqali (20261111000013): ular kirish huquqini oʻzi tekshiradi
// (yopiq klub faqat aʼzolarga, taklif kodi faqat egasiga). Har soʻrov joriy foydalanuvchi sessiyasi bilan.

export type ClubCard = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  is_public: boolean;
  member_count: number;
  book_title: string | null;
  book_cover: string | null;
};

export type ClubPage = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  member_count: number;
  is_member: boolean;
  is_owner: boolean;
  invite_code: string | null;
  book_id: number | null;
  book_slug: string | null;
  book_title: string | null;
  book_authors: string | null;
  book_cover: string | null;
};

export type ClubMember = {
  user_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  role: "owner" | "member";
  joined_at: string;
  status: "want" | "reading" | "read" | "dnf" | null;
  unit: "pages" | "minutes" | "percent" | null;
  current_value: number | null;
  total_value: number | null;
  rating: number | null;
};

export type ClubPost = {
  id: number;
  parent_id: number | null;
  body: string;
  created_at: string;
  user_id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  can_delete: boolean;
};

export type ClubThread = ClubPost & { replies: ClubPost[] };

function fail(what: string, message: string): never {
  throw new Error(`${what}: ${message}`);
}

export async function listClubs(mine = false) {
  const { data, error } = await (await createServerSupabase()).rpc("club_directory", { p_mine: mine, p_limit: 60 });
  if (error) fail("Klublar", error.message);
  return (data ?? []) as ClubCard[];
}

export async function getClub(slug: string) {
  const { data, error } = await (await createServerSupabase()).rpc("club_page", { p_slug: slug }).maybeSingle();
  if (error) fail("Klub", error.message);
  return (data as ClubPage | null) ?? null;
}

export async function getClubMembers(clubId: number) {
  const { data, error } = await (await createServerSupabase()).rpc("club_members_view", { p_club_id: clubId });
  if (error) fail("Klub aʼzolari", error.message);
  return (data ?? []) as ClubMember[];
}

// Muhokama: yuqori darajali xabarlar (yangisi tepada) va ularning javoblari (eskisi tepada)
export async function getClubThreads(clubId: number): Promise<ClubThread[]> {
  const { data, error } = await (await createServerSupabase()).rpc("club_feed", { p_club_id: clubId, p_limit: 50 });
  if (error) fail("Muhokama", error.message);
  const posts = (data ?? []) as ClubPost[];
  const threads = posts.filter((p) => p.parent_id == null).map((p): ClubThread => ({ ...p, replies: [] }));
  const byId = new Map(threads.map((t) => [t.id, t]));
  for (const p of posts) if (p.parent_id != null) byId.get(p.parent_id)?.replies.push(p);
  return threads;
}

export async function getClubByInvite(code: string) {
  const { data, error } = await (await createServerSupabase()).rpc("club_by_invite", { p_code: code }).maybeSingle();
  if (error) fail("Taklif", error.message);
  return (data as { slug: string; name: string; description: string | null; member_count: number; is_member: boolean } | null) ?? null;
}

// Aʼzoning joriy kitobdagi holati: "120 / 400 bet", "45%", "Oʻqidi ★4.5"
export function memberProgress(m: ClubMember): { label: string | null; pct: number | null } {
  if (!m.status) return { label: null, pct: null };
  if (m.status === "read") return { label: m.rating ? `★ ${Number(m.rating).toFixed(1)}` : null, pct: 100 };
  if (m.status !== "reading" || m.current_value == null) return { label: null, pct: null };
  const unit = m.unit === "minutes" ? "daq" : m.unit === "percent" ? "%" : "bet";
  if (m.unit === "percent") return { label: `${m.current_value}%`, pct: m.current_value };
  return {
    label: m.total_value ? `${m.current_value} / ${m.total_value} ${unit}` : `${m.current_value} ${unit}`,
    pct: m.total_value ? Math.round((m.current_value / m.total_value) * 100) : null,
  };
}

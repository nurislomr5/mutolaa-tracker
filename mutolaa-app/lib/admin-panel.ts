import { createAdminClient } from "@/lib/supabase/admin";

// Admin paneli va shikoyatlar navbati uchun maʼlumot. Hammasi service role bilan oʻqiladi —
// chaqiruvchi sahifa avval getAdminUser() ni tekshirishi shart.

export type AdminStats = {
  users_total: number;
  users_7d: number;
  users_30d: number;
  active_7d: number;
  active_30d: number;
  public_profiles: number;
  telegram_linked: number;
  books_total: number;
  books_user_total: number;
  books_user_7d: number;
  shelf_total: number;
  shelf_7d: number;
  reviews_total: number;
  notes_total: number;
  sessions_7d: number;
  clubs_total: number;
  club_posts_7d: number;
  reports_open: number;
  book_reports_open: number;
  signups_by_day: { day: string; count: number }[];
};

export type AdminPerson = { id: string; username: string | null; display_name: string | null; is_public: boolean; created_at: string };

function fail(what: string, message: string): never {
  throw new Error(`${what}: ${message}`);
}

export async function getAdminStats() {
  const { data, error } = await createAdminClient().rpc("admin_stats");
  if (error) fail("Admin sonlari", error.message);
  return data as AdminStats;
}

export async function getRecentSignups(limit = 10) {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, username, display_name, is_public, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("Yangi foydalanuvchilar", error.message);
  return (data ?? []) as AdminPerson[];
}

export type AdminBook = { id: number; slug: string; title: string; author_names: string | null; created_at: string };

export async function getRecentUserBooks(limit = 10) {
  const { data, error } = await createAdminClient()
    .from("books")
    .select("id, slug, title, author_names, created_at")
    .eq("source", "user")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("Yangi kitoblar", error.message);
  return (data ?? []) as AdminBook[];
}

async function peopleById(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map<string, AdminPerson>();
  const { data, error } = await createAdminClient().from("profiles").select("id, username, display_name, is_public, created_at").in("id", unique);
  if (error) fail("Profillar", error.message);
  return new Map(((data ?? []) as AdminPerson[]).map((p) => [p.id, p]));
}

export type ReportTargetType = "review" | "club_post" | "profile";

export type ReportGroup = {
  // Shu nishon boʻyicha eng eski ochiq shikoyat — amal shu id orqali bajariladi (hammasini birga yopadi)
  reportId: number;
  type: ReportTargetType;
  author: AdminPerson | null;
  // Shikoyat paytidagi matn va hozirgisi (oʻchirilgan boʻlsa — null)
  snapshot: string | null;
  current: string | null;
  gone: boolean;
  // Qayerda: kitob yoki klub nomi va havolasi
  where: string | null;
  href: string | null;
  reports: { id: number; reason: string; message: string | null; created_at: string; reporter: AdminPerson | null }[];
};

type ReportRow = {
  id: number;
  reporter_id: string | null;
  target_type: ReportTargetType;
  target_id: number | null;
  target_user_id: string;
  reason: string;
  message: string | null;
  snapshot: string | null;
  created_at: string;
};

// Ochiq shikoyatlar, nishon boʻyicha guruhlangan (bitta taqrizga 3 kishi shikoyat qilsa — bitta karta)
export async function getOpenContentReports(): Promise<ReportGroup[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("content_reports")
    .select("id, reporter_id, target_type, target_id, target_user_id, reason, message, snapshot, created_at")
    .eq("status", "open")
    .order("created_at")
    .limit(300);
  if (error) fail("Shikoyatlar", error.message);
  const rows = (data ?? []) as ReportRow[];
  if (!rows.length) return [];

  const idsOf = (type: ReportTargetType) => [...new Set(rows.filter((r) => r.target_type === type && r.target_id != null).map((r) => r.target_id as number))];
  const [reviewIds, postIds] = [idsOf("review"), idsOf("club_post")];
  const [people, reviews, posts] = await Promise.all([
    peopleById(rows.flatMap((r) => [r.reporter_id, r.target_user_id])),
    reviewIds.length ? admin.from("user_books").select("id, review, books(slug, title)").in("id", reviewIds) : Promise.resolve({ data: [], error: null }),
    postIds.length ? admin.from("club_posts").select("id, body, clubs(slug, name)").in("id", postIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (reviews.error) fail("Taqrizlar", reviews.error.message);
  if (posts.error) fail("Klub xabarlari", posts.error.message);
  const reviewById = new Map(
    ((reviews.data ?? []) as unknown as { id: number; review: string | null; books: { slug: string; title: string } | null }[]).map((r) => [r.id, r]),
  );
  const postById = new Map(
    ((posts.data ?? []) as unknown as { id: number; body: string; clubs: { slug: string; name: string } | null }[]).map((p) => [p.id, p]),
  );

  const groups = new Map<string, ReportGroup>();
  for (const r of rows) {
    const key = `${r.target_type}:${r.target_id ?? r.target_user_id}`;
    let group = groups.get(key);
    if (!group) {
      const author = people.get(r.target_user_id) ?? null;
      let current: string | null = null;
      let where: string | null = null;
      let href: string | null = null;
      if (r.target_type === "review") {
        const review = reviewById.get(r.target_id as number);
        current = review?.review ?? null;
        where = review?.books?.title ?? null;
        href = review?.books ? `/kitob/${review.books.slug}` : null;
      } else if (r.target_type === "club_post") {
        const post = postById.get(r.target_id as number);
        current = post?.body ?? null;
        where = post?.clubs?.name ?? null;
        href = post?.clubs ? `/klub/${post.clubs.slug}` : null;
      } else if (author?.is_public) {
        current = r.snapshot;
        href = author.username ? `/u/${author.username}` : null;
      }
      group = { reportId: r.id, type: r.target_type, author, snapshot: r.snapshot, current, gone: current == null, where, href, reports: [] };
      groups.set(key, group);
    }
    group.reports.push({ id: r.id, reason: r.reason, message: r.message, created_at: r.created_at, reporter: r.reporter_id ? (people.get(r.reporter_id) ?? null) : null });
  }
  return [...groups.values()];
}

export type OpenBookReport = {
  id: number;
  message: string;
  created_at: string;
  book: { slug: string; title: string } | null;
  reporter: AdminPerson | null;
};

// Katalogdagi xato haqidagi xabarlar ("Xatoni bildirish"), hali hal qilinmaganlari
export async function getOpenBookReports(): Promise<OpenBookReport[]> {
  const { data, error } = await createAdminClient()
    .from("book_reports")
    .select("id, user_id, message, created_at, books(slug, title)")
    .is("resolved_at", null)
    .order("created_at")
    .limit(200);
  if (error) fail("Xato xabarlari", error.message);
  const rows = (data ?? []) as unknown as { id: number; user_id: string; message: string; created_at: string; books: { slug: string; title: string } | null }[];
  const people = await peopleById(rows.map((r) => r.user_id));
  return rows.map((r) => ({ id: r.id, message: r.message, created_at: r.created_at, book: r.books, reporter: people.get(r.user_id) ?? null }));
}

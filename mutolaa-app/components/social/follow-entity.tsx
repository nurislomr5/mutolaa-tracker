import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";
import { FollowEntityButton } from "./follow-entity-button";

// Muallif/nashriyot sahifasidagi "Yangi kitoblarini kuzatish" tugmasi (faqat kirgan foydalanuvchiga)
export async function FollowEntity({ kind, id }: { kind: "author" | "publisher"; id: number }) {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createServerSupabase();
  const table = kind === "author" ? "author_follows" : "publisher_follows";
  const column = kind === "author" ? "author_id" : "publisher_id";
  const { data } = await supabase.from(table).select(column).eq("user_id", user.id).eq(column, id).maybeSingle();
  return <FollowEntityButton kind={kind} id={id} following={Boolean(data)} />;
}

import Link from "next/link";
import { ReviewText } from "@/components/shelf/review-form";
import { Avatar } from "@/components/social/avatar";
import { HelpfulButton } from "@/components/social/helpful-button";
import { formatDate } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { getBookReviews, personName } from "@/lib/social";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

// Ochiq profilli kitobxonlarning baho va taqrizlari (bir necha daqiqa keshlanadi)
export async function ReadersSection({ bookId, slug }: { bookId: number; slug: string }) {
  // Ikkinchi darajali boʻlim: yuklanmasa butun kitob sahifasini xatoga tushirmaymiz
  const data = await getBookReviews(bookId).catch((err) => {
    console.error(err);
    return null;
  });
  if (!data) return null;
  const { average, ratingCount, reviews } = data;

  // Joriy foydalanuvchining "Foydali" ovozlari (shaxsiy — keshlanmaydi)
  const me = await getSessionUser();
  const withText = reviews.filter((r) => r.review).map((r) => r.id);
  let myVotes = new Set<number>();
  if (me && withText.length) {
    const supabase = await createServerSupabase();
    const { data: votes } = await supabase.from("review_votes").select("user_book_id").in("user_book_id", withText);
    myVotes = new Set((votes ?? []).map((v) => v.user_book_id as number));
  }
  const loginHref = `/kirish?next=${encodeURIComponent(`/kitob/${slug}`)}`;
  const t = uz.social;
  return (
    <section className="mt-14">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold">{t.readersTitle}</h2>
        {average != null && <span className="text-sm text-muted">{t.readersAverage(average.toFixed(1), ratingCount)}</span>}
      </div>
      {reviews.length === 0 ? (
        <p className="text-sm text-muted">{t.noReaders}</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {reviews.map((r) => {
            const name = personName(r.person);
            return (
              <li key={r.person.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center gap-3">
                  <Link href={`/u/${r.person.username}`} className="flex min-w-0 items-center gap-2 hover:text-accent">
                    <Avatar name={name} src={r.person.avatar_url} size={32} />
                    <span className="truncate text-sm font-semibold">{name}</span>
                  </Link>
                  {r.rating && <span className="ml-auto shrink-0 text-sm text-warning">★ {Number(r.rating).toFixed(1)}</span>}
                </div>
                <ReviewText review={r.review} isSpoiler={r.isSpoiler} className="mt-3 line-clamp-6 whitespace-pre-line text-sm" />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted">{formatDate(r.date)}</p>
                  {r.review && (
                    <HelpfulButton
                      reviewId={r.id}
                      count={r.helpful}
                      voted={myVotes.has(r.id)}
                      mode={!me ? "guest" : me.id === r.person.id ? "own" : "vote"}
                      loginHref={loginHref}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

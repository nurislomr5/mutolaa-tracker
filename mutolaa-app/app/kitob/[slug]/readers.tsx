import Link from "next/link";
import { Avatar } from "@/components/social/avatar";
import { formatDate } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { getBookReviews, personName } from "@/lib/social";

// Ochiq profilli kitobxonlarning baho va taqrizlari (bir necha daqiqa keshlanadi)
export async function ReadersSection({ bookId }: { bookId: number }) {
  // Ikkinchi darajali boʻlim: yuklanmasa butun kitob sahifasini xatoga tushirmaymiz
  const data = await getBookReviews(bookId).catch((err) => {
    console.error(err);
    return null;
  });
  if (!data) return null;
  const { average, ratingCount, reviews } = data;
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
                {r.review && <p className="mt-3 line-clamp-6 whitespace-pre-line text-sm">{r.review}</p>}
                <p className="mt-2 text-xs text-muted">{formatDate(r.date)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

import Link from "next/link";
import { BookCover } from "@/components/book/book-cover";
import { ShareImageButton } from "@/components/share/share-dialog";
import { MonthBars } from "@/components/stats/month-bars";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCount, formatDate, formatDuration, formatRating } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { yearShareCard, type WrapUp, type WrapUpBook } from "@/lib/wrapup";

// Yil sarhisobi sahifasining koʻrinishi: yuqoridan pastga "hikoya" — nechta kitob, raqamlar, oylar,
// sevimlilar, did, yil yoʻli, kitobxon qiyofasi va ulashish.

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-serif text-xl font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

function BookRow({ book, label }: { book: WrapUpBook; label: string }) {
  return (
    <Link href={`/kitob/${book.slug}`} className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-4">
      <BookCover src={book.cover_url} title="" className="w-14 shrink-0" sizes="56px" />
      <div className="min-w-0">
        <p className="text-xs text-muted">
          {label} · {formatDate(book.finished_at)}
        </p>
        <p className="mt-0.5 truncate font-medium group-hover:text-accent">{book.title}</p>
        {book.author_names && <p className="truncate text-sm text-muted">{book.author_names}</p>}
      </div>
    </Link>
  );
}

// Muqovalar yelpigʻichi (sarlavha kartasida)
const FAN = ["-rotate-6 translate-y-2", "z-10 -translate-y-1", "rotate-6 translate-y-2"];

function Hero({ wrap, reader }: { wrap: WrapUp; reader: string | null }) {
  const t = uz.wrapup;
  const covers = wrap.covers.slice(0, 3);
  // yelpigʻichda eng sevimli kitob oʻrtada tursin
  const fan = covers.length === 3 ? [covers[1], covers[0], covers[2]] : covers;
  return (
    <div
      className="relative overflow-hidden rounded-3xl p-6 text-[#f7f4ee] sm:p-10"
      style={{ backgroundImage: "linear-gradient(135deg, #12231a, #214231)" }}
    >
      <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">{site.name}</p>
          <h1 className="mt-2 font-serif text-2xl font-semibold sm:text-3xl">{t.title(wrap.year)}</h1>
          {wrap.books > 0 ? (
            <>
              <p className="mt-6 font-serif text-8xl font-semibold leading-none sm:text-9xl">{wrap.books}</p>
              <p className="mt-3 text-lg text-[#f7f4ee]/80">{t.heroBooks}</p>
            </>
          ) : (
            <p className="mt-6 max-w-sm text-lg text-[#f7f4ee]/80">{t.heroNone}</p>
          )}
          {wrap.goal ? (
            <p className={cn("mt-2 text-sm", wrap.goalReached ? "font-medium text-[#d4af37]" : "text-[#f7f4ee]/60")}>
              {wrap.goalReached ? t.goalReached(wrap.goal) : t.goalProgress(wrap.books, wrap.goal)}
            </p>
          ) : null}
          {reader && <p className="mt-6 text-sm text-[#f7f4ee]/60">{reader}</p>}
        </div>
        {fan.length > 0 && (
          <div className="flex shrink-0 justify-center px-4 sm:px-6" aria-hidden>
            {fan.map((src, i) => (
              <BookCover
                key={src}
                src={src}
                title=""
                sizes="130px"
                className={cn("w-24 shadow-xl sm:w-32", i > 0 && "-ml-6", fan.length === 3 ? FAN[i] : i % 2 ? "rotate-3" : "-rotate-3")}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function YearNav({ years, current }: { years: number[]; current: number }) {
  if (years.length < 2) return null;
  return (
    <nav className="flex flex-wrap gap-1" aria-label={uz.wrapup.yearsLabel}>
      {years.map((y) => (
        <Link
          key={y}
          href={`/sarhisob?yil=${y}`}
          className={cn("rounded-full px-3 py-1 text-sm", y === current ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-text")}
        >
          {y}
        </Link>
      ))}
    </nav>
  );
}

export function WrapUpView({ wrap, reader, years }: { wrap: WrapUp; reader: string | null; years: number[] }) {
  const t = uz.wrapup;
  const statsHref = wrap.isCurrentYear ? "/statistika" : `/statistika?yil=${wrap.year}`;
  const footer = (
    <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
      <Link href={statsHref} className="text-sm text-accent hover:underline">
        {t.backToStats}
      </Link>
      <YearNav years={years} current={wrap.year} />
    </div>
  );

  if (!wrap.hasData) {
    return (
      <>
        <h1 className="font-serif text-3xl font-semibold">{t.title(wrap.year)}</h1>
        <Card className="mt-6 py-10 text-center">
          <p className="mx-auto max-w-md text-muted">{t.empty(wrap.year)}</p>
          <Link href="/kitoblar" className={buttonClasses({ className: "mt-5" })}>
            {t.emptyCta}
          </Link>
        </Card>
        {footer}
      </>
    );
  }

  const persona = t.personas[wrap.persona];
  const taste = [
    wrap.topAuthor && { label: t.topAuthor, value: wrap.topAuthor.name, sub: t.booksCount(wrap.topAuthor.count), href: null },
    wrap.topTopic && { label: t.topTopic, value: wrap.topTopic.name, sub: t.booksCount(wrap.topTopic.count), href: `/kitoblar?rukn=${wrap.topTopic.slug}` },
    wrap.topFormat && { label: t.topFormat, value: uz.format[wrap.topFormat.format], sub: t.formatShare(Math.round(wrap.topFormat.share * 100)), href: null },
  ].filter((x) => !!x);

  return (
    <>
      <Hero wrap={wrap} reader={reader} />
      {wrap.isCurrentYear && <p className="mt-3 text-sm text-muted">{t.soFar}</p>}

      <Section title={t.numbersTitle}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label={t.pages} value={formatCount(wrap.pages)} />
          <Tile label={t.listened} value={formatDuration(wrap.minutes * 60) ?? uz.share.noAudio} />
          <Tile label={t.activeDays} value={t.days(wrap.activeDays)} />
          <Tile label={t.longestStreak} value={t.days(wrap.longestStreak)} />
        </div>
      </Section>

      {wrap.bestMonth && (
        <Section title={t.monthsTitle} hint={t.bestMonth(uz.stats.monthsLong[wrap.bestMonth.index], wrap.bestMonth.count)}>
          <Card>
            <MonthBars values={wrap.monthly} currentMonth={null} />
          </Card>
        </Section>
      )}

      {wrap.favorites.length > 0 && (
        <Section title={t.favoritesTitle} hint={t.favoritesHint}>
          <ul className="grid grid-cols-3 gap-4 sm:max-w-xl">
            {wrap.favorites.map((b) => (
              <li key={b.slug}>
                <Link href={`/kitob/${b.slug}`} className="group block">
                  <BookCover src={b.cover_url} title={b.title} sizes="(min-width: 640px) 180px, 30vw" />
                  <p className="mt-2 line-clamp-2 text-sm font-medium group-hover:text-accent">{b.title}</p>
                  <p className="text-sm text-warning">★ {formatRating(b.rating)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {taste.length > 0 && (
        <Section title={t.tasteTitle}>
          <div className="grid gap-3 sm:grid-cols-3">
            {taste.map((item) => (
              <Card key={item.label} className="p-4">
                <p className="text-xs text-muted">{item.label}</p>
                <p className="mt-1 truncate font-serif text-xl font-semibold">
                  {item.href ? (
                    <Link href={item.href} className="hover:text-accent">
                      {item.value}
                    </Link>
                  ) : (
                    item.value
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted">{item.sub}</p>
              </Card>
            ))}
          </div>
          {wrap.avgRating && (
            <p className="mt-3 text-sm text-muted">
              {t.avgRating}: <span className="font-medium text-text">★ {wrap.avgRating.toFixed(1)}</span>
            </p>
          )}
        </Section>
      )}

      {wrap.first && (
        <Section title={t.journeyTitle}>
          <div className="grid gap-3 sm:grid-cols-2">
            <BookRow book={wrap.first} label={t.first} />
            {wrap.last && <BookRow book={wrap.last} label={t.last} />}
          </div>
        </Section>
      )}

      <Card className="mt-10 border-accent/40 bg-accent/5 p-6 text-center sm:p-8">
        <p className="text-sm text-muted">{t.personaTitle}</p>
        <p className="mt-1 font-serif text-3xl font-semibold">{persona.label}</p>
        <p className="mx-auto mt-2 max-w-md text-muted">{persona.desc}</p>
        <div className="mt-6 border-t border-border pt-6">
          <p className="font-medium">{t.shareTitle}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t.shareHint}</p>
          <ShareImageButton
            card={yearShareCard(wrap, reader)}
            fileName={`${site.slug}-${wrap.year}.png`}
            shareTitle={uz.share.yearTitle(wrap.year)}
            className={buttonClasses({ className: "mt-4" })}
          >
            {uz.share.button}
          </ShareImageButton>
        </div>
      </Card>

      {footer}
    </>
  );
}

import Link from "next/link";
import { CustomShelves } from "@/components/shelf/custom-shelves";
import { NoteForm, NoteItem } from "@/components/shelf/notes";
import { ProgressForm, ReadingSessionList } from "@/components/shelf/progress-form";
import { RatingPicker } from "@/components/shelf/rating-picker";
import { ReviewForm } from "@/components/shelf/review-form";
import { StatusPicker } from "@/components/shelf/status-picker";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import type { BookDetail } from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";
import { getBookShelfState } from "@/lib/shelf";
import { getSessionUser } from "@/lib/supabase/server";

// Sarlavha ostidagi holat tugmalari (mehmon uchun — kirish havolasi)
export async function ShelfActions({ book }: { book: BookDetail }) {
  const user = await getSessionUser();
  if (!user) {
    return (
      <Link href={`/kirish?next=${encodeURIComponent(`/kitob/${book.slug}`)}`} className={buttonClasses({ size: "lg" })}>
        {uz.book.addToShelf}
      </Link>
    );
  }
  const { userBook } = await getBookShelfState(book.id);
  return <StatusPicker bookId={book.id} userBookId={userBook?.id} status={userBook?.status} />;
}

// Foydalanuvchi qoʻshgan kitob — faqat uni qoʻshgan odamga "Tahrirlash" havolasi
export async function EditBookLink({ book }: { book: BookDetail }) {
  if (book.source !== "user" || !book.created_by) return null;
  const user = await getSessionUser();
  if (user?.id !== book.created_by) return null;
  return (
    <Link href={`/kitob/${book.slug}/tahrirlash`} className="text-sm text-accent hover:underline">
      ✎ {uz.editBook.link}
    </Link>
  );
}

// Kitob javonda boʻlsa: progress, baho, taqriz, qaydlar, maxsus javonlar
export async function MyBookSection({ book }: { book: BookDetail }) {
  const user = await getSessionUser();
  if (!user) return null;
  const { userBook, notes, shelves, shelfIds, sessions } = await getBookShelfState(book.id);
  if (!userBook) return null;
  const t = uz.shelf;
  const audioMinutes = book.audio_seconds ? Math.ceil(book.audio_seconds / 60) : null;

  return (
    <section className="mt-12 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle>{t.progress}</CardTitle>
        <div className="mt-4">
          <ProgressForm key={userBook.current_value} userBook={userBook} audioMinutes={audioMinutes} pageCount={book.page_count} />
        </div>
        {(userBook.started_at || userBook.finished_at) && (
          <p className="mt-4 text-xs text-muted">
            {userBook.started_at && `${t.started}: ${formatDate(userBook.started_at)}`}
            {userBook.started_at && userBook.finished_at && " · "}
            {userBook.finished_at && `${t.finished}: ${formatDate(userBook.finished_at)}`}
          </p>
        )}
        <ReadingSessionList sessions={sessions} unit={userBook.unit} />
      </Card>

      <Card className="space-y-5">
        <div>
          <CardTitle>{t.rating}</CardTitle>
          <div className="mt-3">
            <RatingPicker userBookId={userBook.id} rating={userBook.rating} />
          </div>
        </div>
        <div>
          <CardTitle>{t.review}</CardTitle>
          <div className="mt-3">
            <ReviewForm userBookId={userBook.id} review={userBook.review} />
          </div>
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardTitle>{uz.notes.title}</CardTitle>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <NoteForm userBookId={userBook.id} />
          {notes.length > 0 ? (
            <ul className="space-y-3">
              {notes.map((n) => (
                <NoteItem key={n.id} note={n} book={{ slug: book.slug, title: book.title }} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{uz.notes.empty}</p>
          )}
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardTitle>{t.customShelves}</CardTitle>
        <div className="mt-4">
          <CustomShelves bookId={book.id} shelves={shelves} selected={[...shelfIds]} />
        </div>
      </Card>
    </section>
  );
}

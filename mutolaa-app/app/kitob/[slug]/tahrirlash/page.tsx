import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { BookForm } from "@/components/book/book-form";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { getAdminUser } from "@/lib/admin";
import { canEditBook } from "@/lib/book-edit";
import type { BookFormValues } from "@/lib/book-input";
import { getPublishers } from "@/lib/catalog";
import { uz } from "@/lib/i18n/uz";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: uz.editBook.title };

async function EditForm({ params }: { params: PageProps<"/kitob/[slug]/tahrirlash">["params"] }) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/kirish?next=${encodeURIComponent(`/kitob/${slug}/tahrirlash`)}`);

  // Yangi maʼlumot kerak (keshsiz) — tahrirlashdan keyin eski qiymatlar koʻrinmasin
  const supabase = await createServerSupabase();
  const { data: book } = await supabase
    .from("books")
    .select("title, author_names, formats, page_count, published_year, isbn, cover_url, description, publisher, source, created_by, publishers(name)")
    .eq("slug", slug)
    .maybeSingle();
  if (!book) notFound();
  const own = canEditBook(book, user.id, false);
  if (!own && !(await getAdminUser())) {
    return (
      <p className="text-muted">
        {uz.editBook.forbidden}{" "}
        <Link href={`/kitob/${slug}`} className="text-accent hover:underline">
          ← {book.title}
        </Link>
      </p>
    );
  }

  const initial: BookFormValues = {
    title: book.title,
    authors: book.author_names ?? "",
    formats: book.formats,
    page_count: book.page_count,
    publisher: (book.publishers as unknown as { name: string } | null)?.name ?? book.publisher ?? "",
    year: book.published_year,
    isbn: book.isbn ?? "",
    cover_url: book.cover_url ?? "",
    description: book.description ?? "",
  };
  const publishers = (await getPublishers()).map((p) => p.name);
  return (
    <>
      {!own && <p className="mb-5 rounded-lg bg-accent-soft p-3 text-sm">{uz.editBook.adminNote}</p>}
      <BookForm mode="edit" slug={slug} initial={initial} publishers={publishers} />
    </>
  );
}

export default function EditBookPage(props: PageProps<"/kitob/[slug]/tahrirlash">) {
  return (
    <Container className="py-8 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-3xl font-semibold">{uz.editBook.title}</h1>
        <p className="mb-6 mt-1 text-muted">{uz.editBook.subtitle}</p>
        <Card className="p-5 sm:p-6">
          <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-surface-2" />}>
            <EditForm params={props.params} />
          </Suspense>
        </Card>
      </div>
    </Container>
  );
}

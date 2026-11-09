import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { getPublishers } from "@/lib/catalog";
import { uz } from "@/lib/i18n/uz";
import { fetchExternalIsbnMeta } from "@/lib/isbn";
import { BookForm } from "@/components/book/book-form";

export const metadata: Metadata = { title: uz.addBook.title };

// /kitob-qoshish?nom=… — katalog qidiruvidan kelganda nom oldindan toʻldiriladi
async function Form({ searchParams }: { searchParams: PageProps<"/kitob-qoshish">["searchParams"] }) {
  const sp = await searchParams;
  const initialTitle = typeof sp.nom === "string" ? sp.nom.slice(0, 200) : "";
  // skanerdan kelganda ISBN va (xalqaro bazadan topilsa) kitob metamaʼlumoti oldindan toʻldiriladi
  const initialIsbn = typeof sp.isbn === "string" ? sp.isbn.replace(/[^0-9Xx-]/g, "").slice(0, 20) : "";
  const [publishers, external] = await Promise.all([
    getPublishers(),
    initialIsbn && !initialTitle ? fetchExternalIsbnMeta(initialIsbn) : Promise.resolve(null),
  ]);
  return (
    <BookForm
      mode="add"
      initial={{
        title: initialTitle || external?.title || "",
        authors: external?.authors || "",
        isbn: initialIsbn,
        page_count: external?.page_count ?? null,
        year: external?.year ?? null,
        publisher: external?.publisher || "",
        cover_url: external?.cover_url || "",
        description: external?.description || "",
      }}
      publishers={publishers.map((p) => p.name)}
    />
  );
}

export default function AddBookPage(props: PageProps<"/kitob-qoshish">) {
  return (
    <Container className="py-8 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-3xl font-semibold">{uz.addBook.title}</h1>
        <p className="mb-6 mt-1 text-muted">{uz.addBook.subtitle}</p>
        <Card className="p-5 sm:p-6">
          <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-surface-2" />}>
            <Form searchParams={props.searchParams} />
          </Suspense>
        </Card>
      </div>
    </Container>
  );
}

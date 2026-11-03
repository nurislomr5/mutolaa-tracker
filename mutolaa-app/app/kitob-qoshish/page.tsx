import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { getPublishers } from "@/lib/catalog";
import { uz } from "@/lib/i18n/uz";
import { BookForm } from "@/components/book/book-form";

export const metadata: Metadata = { title: uz.addBook.title };

// /kitob-qoshish?nom=… — katalog qidiruvidan kelganda nom oldindan toʻldiriladi
async function Form({ searchParams }: { searchParams: PageProps<"/kitob-qoshish">["searchParams"] }) {
  const sp = await searchParams;
  const initialTitle = typeof sp.nom === "string" ? sp.nom.slice(0, 200) : "";
  const publishers = (await getPublishers()).map((p) => p.name);
  return <BookForm mode="add" initial={{ title: initialTitle }} publishers={publishers} />;
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

import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookGrid, BookGridSkeleton } from "@/components/book/book-card";
import { Container } from "@/components/ui/container";
import { getAuthor, getPopularAuthorSlugs } from "@/lib/catalog";
import { uz } from "@/lib/i18n/uz";

export async function generateStaticParams() {
  const slugs = await getPopularAuthorSlugs(30);
  return slugs.length ? slugs.map((slug) => ({ slug })) : [{ slug: "homer" }];
}

export async function generateMetadata({ params }: PageProps<"/muallif/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const author = await getAuthor(slug);
  return { title: author?.name ?? uz.notFound.title };
}

async function AuthorView({ params }: { params: PageProps<"/muallif/[slug]">["params"] }) {
  const { slug } = await params;
  const author = await getAuthor(slug);
  if (!author) notFound();

  return (
    <>
      <div className="mb-8 flex items-center gap-4">
        {author.image_url && (
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-surface-2">
            <Image src={author.image_url} alt={author.name} fill unoptimized sizes="64px" className="object-cover" />
          </div>
        )}
        <div>
          <h1 className="font-serif text-3xl font-semibold">{author.name}</h1>
          <p className="text-muted">{uz.author.books(author.books.length)}</p>
        </div>
      </div>
      <BookGrid books={author.books} priorityCount={6} />
    </>
  );
}

export default function AuthorPage(props: PageProps<"/muallif/[slug]">) {
  return (
    <Container className="py-8 sm:py-12">
      <Suspense
        fallback={
          <>
            <div className="mb-8 h-16 w-1/2 animate-pulse rounded bg-surface-2" />
            <BookGridSkeleton />
          </>
        }
      >
        <AuthorView params={props.params} />
      </Suspense>
    </Container>
  );
}

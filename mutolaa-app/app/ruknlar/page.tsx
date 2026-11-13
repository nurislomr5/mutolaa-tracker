import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { getTopics } from "@/lib/catalog";
import { formatCount } from "@/lib/format";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = {
  title: uz.topics.title,
  description: uz.topics.description,
};

export default async function TopicsPage() {
  const topics = await getTopics();
  const t = uz.topics;
  return (
    <Container className="py-8 sm:py-10">
      <h1 className="font-serif text-3xl font-semibold">{t.title}</h1>
      <p className="mb-6 mt-1 text-muted">{t.description}</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map((tp) => (
          <li key={tp.slug}>
            <Link
              href={`/kitoblar?rukn=${tp.slug}`}
              prefetch={false}
              className="flex items-baseline justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:bg-surface-2"
            >
              <span className="font-medium">{tp.name}</span>
              <span className="shrink-0 text-sm text-muted">{t.books(formatCount(tp.count))}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}

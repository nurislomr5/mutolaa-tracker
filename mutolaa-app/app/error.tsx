"use client";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { uz } from "@/lib/i18n/uz";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <Container className="py-24 text-center">
      <h1 className="font-serif text-2xl font-semibold">{uz.error.title}</h1>
      <p className="mt-2 text-muted">{uz.error.body}</p>
      <Button className="mt-8" onClick={() => retry()}>
        {uz.error.retry}
      </Button>
    </Container>
  );
}

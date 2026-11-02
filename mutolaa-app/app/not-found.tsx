import Link from "next/link";
import { Container } from "@/components/ui/container";
import { buttonClasses } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";

export default function NotFound() {
  return (
    <Container className="py-24 text-center">
      <p className="font-serif text-6xl font-semibold text-accent">404</p>
      <h1 className="mt-4 font-serif text-2xl font-semibold">{uz.notFound.title}</h1>
      <p className="mt-2 text-muted">{uz.notFound.body}</p>
      <Link href="/" className={buttonClasses({ className: "mt-8" })}>
        {uz.notFound.back}
      </Link>
    </Container>
  );
}

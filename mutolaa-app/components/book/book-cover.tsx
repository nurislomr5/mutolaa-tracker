import Image from "next/image";
import { cn } from "@/lib/utils";

// Mutolaa muqovalari bir xil oʻlchamda (520×697) va kichik (~50 KB) — qayta optimallashtirmaymiz
export function BookCover({
  src,
  title,
  className,
  priority,
  sizes = "(min-width: 1024px) 180px, (min-width: 640px) 25vw, 45vw",
}: {
  src: string | null;
  title: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <div className={cn("relative aspect-[520/697] overflow-hidden rounded-lg bg-surface-2 shadow-sm", className)}>
      {src ? (
        <Image src={src} alt={title} fill unoptimized priority={priority} sizes={sizes} className="object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center p-3 text-center font-serif text-sm text-muted">{title}</div>
      )}
    </div>
  );
}

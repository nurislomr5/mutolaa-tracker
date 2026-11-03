import Image from "next/image";
import { cn } from "@/lib/utils";

// Rasm boʻlmasa — ism bosh harfi
export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft font-semibold uppercase text-accent",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {src ? <Image src={src} alt="" fill unoptimized sizes={`${size}px`} className="object-cover" /> : name.replace(/^@/, "").charAt(0)}
    </span>
  );
}

"use client";

import { useEffect, useRef } from "react";

// Tor ekranda gorizontal aylanadigan blokni oʻng chetga suradi (joriy yil xaritasida oxirgi oylar koʻrinsin)
export function ScrollToEnd({ enabled, className, children }: { enabled: boolean; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (enabled && ref.current) ref.current.scrollLeft = ref.current.scrollWidth;
  }, [enabled]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

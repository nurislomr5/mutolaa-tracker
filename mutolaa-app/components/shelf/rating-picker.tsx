"use client";

import { useId, useOptimistic, useTransition } from "react";
import { setRating } from "@/app/actions/shelf";
import { uz } from "@/lib/i18n/uz";

function Star({ fill, id }: { fill: 0 | 0.5 | 1; id: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <defs>
        <linearGradient id={id}>
          <stop offset="50%" stopColor="currentColor" />
          <stop offset="50%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9L12 2.8Z"
        fill={fill === 1 ? "currentColor" : fill === 0.5 ? `url(#${id})` : "transparent"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 0.5 qadamli baho: yulduzning chap yarmi — yarim, oʻng yarmi — butun. Shu bahoni qayta bossangiz oʻchadi.
export function RatingPicker({ userBookId, rating }: { userBookId: number; rating: number | null }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(rating);
  // useId belgilarini (":" va h.k.) olib tashlaymiz — SVG url(#…) ichida ishlashi uchun
  const gradientId = `star${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  function choose(next: number) {
    const target = next === value ? null : next;
    start(async () => {
      setValue(target);
      await setRating(userBookId, target);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex text-warning" role="radiogroup" aria-label={uz.shelf.rating}>
        {[1, 2, 3, 4, 5].map((n) => {
          const v = value ?? 0;
          const fill = v >= n ? 1 : v >= n - 0.5 ? 0.5 : 0;
          return (
            <span key={n} className="relative">
              <Star fill={fill} id={`${gradientId}-${n}`} />
              <button
                type="button"
                disabled={pending}
                aria-label={`${n - 0.5}`}
                onClick={() => choose(n - 0.5)}
                className="absolute inset-y-0 left-0 w-1/2"
              />
              <button
                type="button"
                disabled={pending}
                aria-label={`${n}`}
                onClick={() => choose(n)}
                className="absolute inset-y-0 right-0 w-1/2"
              />
            </span>
          );
        })}
      </div>
      <span className="text-sm text-muted">{value ? value.toFixed(1) : uz.shelf.noRating}</span>
    </div>
  );
}

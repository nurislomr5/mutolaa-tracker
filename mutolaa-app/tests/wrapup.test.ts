import { describe, expect, it } from "vitest";
import { uz } from "@/lib/i18n/uz";
import { buildWrapUp, PERSONAS, type WrapUpInput } from "@/lib/wrapup";

// Yil sarhisobi: statistikadan "hikoya" faktlari toʻgʻri ajratilishi

type Finished = WrapUpInput["finished"][number];

let seq = 0;
function book(over: Partial<Finished> = {}): Finished {
  seq++;
  return {
    id: seq,
    slug: `kitob-${seq}`,
    title: `Kitob ${seq}`,
    author_names: `Muallif ${seq}`,
    cover_url: `https://example.com/${seq}.jpg`,
    formats: ["paper"],
    mutolaa_rating: null,
    audio_seconds: null,
    is_premium: false,
    finished_at: "2026-03-10",
    rating: null,
    ...over,
  };
}

function input(over: Partial<WrapUpInput> = {}): WrapUpInput {
  const finished = over.finished ?? [];
  const monthly = Array.from({ length: 12 }, () => 0);
  for (const b of finished) monthly[Number(b.finished_at.slice(5, 7)) - 1]++;
  return {
    year: 2026,
    isCurrentYear: true,
    goal: null,
    finished,
    monthly,
    pages: 0,
    minutes: 0,
    activeDays: 0,
    streak: { current: 0, longest: 0 },
    avgRating: null,
    byFormat: [
      { format: "paper", count: finished.length },
      { format: "ebook", count: 0 },
      { format: "audio", count: 0 },
    ],
    byTopic: [],
    ...over,
  };
}

const many = (n: number, over: Partial<Finished> = {}) => Array.from({ length: n }, () => book(over));

describe("buildWrapUp", () => {
  it("boʻsh yil: maʼlumot yoʻq, hech narsa oʻylab topilmaydi", () => {
    const w = buildWrapUp(input());
    expect(w).toMatchObject({ books: 0, hasData: false, persona: "starter", bestMonth: null, topAuthor: null, topTopic: null, topFormat: null, first: null, last: null });
    expect(w.favorites).toEqual([]);
    expect(w.covers).toEqual([]);
  });

  it("kitob tugatilmagan, lekin oʻqilgan kunlar bor — sarhisob koʻrsatiladi", () => {
    const w = buildWrapUp(input({ activeDays: 4 }));
    expect(w.hasData).toBe(true);
    expect(w.persona).toBe("starter");
  });

  it("birinchi va oxirgi kitob — tugatilgan sana boʻyicha", () => {
    const a = book({ finished_at: "2026-09-01" });
    const b = book({ finished_at: "2026-01-15" });
    const c = book({ finished_at: "2026-05-20" });
    // statistikada roʻyxat yangidan eskiga keladi
    const w = buildWrapUp(input({ finished: [a, c, b] }));
    expect(w.first?.slug).toBe(b.slug);
    expect(w.last?.slug).toBe(a.slug);
  });

  it("bitta kitob boʻlsa — «oxirgi kitob» takrorlanmaydi", () => {
    const w = buildWrapUp(input({ finished: [book()] }));
    expect(w.first).not.toBeNull();
    expect(w.last).toBeNull();
  });

  it("eng sermahsul oy; teng boʻlsa — ertarogʻi", () => {
    const w = buildWrapUp(input({ finished: [...many(2, { finished_at: "2026-02-03" }), ...many(2, { finished_at: "2026-07-03" }), book({ finished_at: "2026-04-01" })] }));
    expect(w.bestMonth).toEqual({ index: 1, count: 2 });
  });

  it("sevimlilar: faqat 4+ baho, eng yuqorisi oldinda, koʻpi bilan uchta", () => {
    const five = book({ rating: 5, finished_at: "2026-02-01" });
    const fiveLater = book({ rating: 5, finished_at: "2026-06-01" });
    const fourHalf = book({ rating: 4.5 });
    const four = book({ rating: 4 });
    const three = book({ rating: 3.5 });
    const w = buildWrapUp(input({ finished: [three, four, fourHalf, five, fiveLater, book()] }));
    expect(w.favorites.map((b) => b.slug)).toEqual([fiveLater.slug, five.slug, fourHalf.slug]);
  });

  it("muqovalar: avval sevimlilar, takrorsiz, muqovasiz kitoblarsiz, koʻpi bilan 6 ta", () => {
    const fav = book({ rating: 5, finished_at: "2026-01-01" });
    const noCover = book({ cover_url: null, finished_at: "2026-11-01" });
    const w = buildWrapUp(input({ finished: [fav, noCover, ...many(8)] }));
    expect(w.covers).toHaveLength(6);
    expect(w.covers[0]).toBe(fav.cover_url);
    expect(new Set(w.covers).size).toBe(6);
  });

  it("sevimli muallif: kamida ikkita kitob; hammualliflar alohida sanaladi", () => {
    expect(buildWrapUp(input({ finished: many(3) })).topAuthor).toBeNull();
    const w = buildWrapUp(
      input({ finished: [book({ author_names: "Abdulla Qodiriy, Choʻlpon" }), book({ author_names: "Choʻlpon" }), book({ author_names: null })] }),
    );
    expect(w.topAuthor).toEqual({ name: "Choʻlpon", count: 2 });
  });

  it("asosiy format va ulushi", () => {
    const w = buildWrapUp(
      input({
        finished: many(4),
        byFormat: [
          { format: "paper", count: 1 },
          { format: "ebook", count: 0 },
          { format: "audio", count: 3 },
        ],
      }),
    );
    expect(w.topFormat).toEqual({ format: "audio", count: 3, share: 0.75 });
  });

  it("maqsad: bajarilgan / bajarilmagan / qoʻyilmagan", () => {
    expect(buildWrapUp(input({ finished: many(3), goal: 3 })).goalReached).toBe(true);
    expect(buildWrapUp(input({ finished: many(2), goal: 3 })).goalReached).toBe(false);
    expect(buildWrapUp(input({ finished: many(2) })).goalReached).toBe(false);
  });
});

describe("kitobxon «qiyofasi»", () => {
  const topics = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Rukn ${i}`, slug: `rukn-${i}`, count: 1 }));
  const audio = (count: number, total: number) => [
    { format: "paper" as const, count: total - count },
    { format: "ebook" as const, count: 0 },
    { format: "audio" as const, count },
  ];

  it("tinglovchi: kitoblarning yarmi va undan koʻpi audio (kamida 3 ta kitob)", () => {
    expect(buildWrapUp(input({ finished: many(4), byFormat: audio(3, 4) })).persona).toBe("listener");
    expect(buildWrapUp(input({ finished: many(2), byFormat: audio(2, 2) })).persona).toBe("reader");
  });

  it("ustuvorlik tartibi: intizom → kitob qurti → sayyoh → sodiq → barqaror → kitobxon", () => {
    expect(buildWrapUp(input({ finished: many(30), streak: { current: 0, longest: 30 }, byTopic: topics(6) })).persona).toBe("disciplined");
    expect(buildWrapUp(input({ finished: many(24), byTopic: topics(6) })).persona).toBe("bookworm");
    expect(buildWrapUp(input({ finished: many(12), byTopic: topics(5) })).persona).toBe("explorer");
    expect(buildWrapUp(input({ finished: many(12, { author_names: "Oʻtkir Hoshimov" }), byTopic: topics(2) })).persona).toBe("loyal");
    expect(buildWrapUp(input({ finished: many(12) })).persona).toBe("steady");
    expect(buildWrapUp(input({ finished: many(5) })).persona).toBe("reader");
  });

  it("har bir qiyofaning oʻzbekcha nomi va izohi bor", () => {
    for (const p of PERSONAS) {
      expect(uz.wrapup.personas[p].label).toBeTruthy();
      expect(uz.wrapup.personas[p].desc).toBeTruthy();
    }
  });
});

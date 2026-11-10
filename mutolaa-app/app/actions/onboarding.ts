"use server";

import { redirect } from "next/navigation";
import { uz } from "@/lib/i18n/uz";
import { getOnboarding } from "@/lib/onboarding";
import { createServerSupabase, getSessionUser } from "@/lib/supabase/server";
import type { ActionResult } from "./shelf";

// Tanishuv sahifasi: sevimli ruknlar va yillik maqsad. "Oʻtkazib yuborish" — hech narsani oʻzgartirmay,
// faqat tanishuvdan oʻtilgan deb belgilaydi (qayta taklif qilinmaydi).
export async function saveOnboarding(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: uz.common.error };

  const skip = formData.get("intent") === "skip";
  let topicIds: number[];
  let goal: number | null = null;
  if (skip) {
    topicIds = (await getOnboarding())?.topicIds ?? [];
  } else {
    topicIds = [...new Set(formData.getAll("topic").map(Number))].filter((n) => Number.isInteger(n) && n > 0).slice(0, 40);
    const goalRaw = String(formData.get("yearly_goal") ?? "").trim();
    if (goalRaw !== "") {
      if (!/^\d{1,4}$/.test(goalRaw) || Number(goalRaw) < 1 || Number(goalRaw) > 1000) return { ok: false, error: uz.onboarding.goalInvalid };
      goal = Number(goalRaw);
    }
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("save_onboarding", { p_topic_ids: topicIds, p_yearly_goal: goal });
  if (error) {
    console.error("[tanishuv]", error.message);
    return { ok: false, error: uz.common.error };
  }
  redirect("/");
}

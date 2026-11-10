import type { Instrumentation } from "next";

// Server xatolari (sahifa, route handler, server action, proxy) — production'da Telegram'ga ogohlantirish (lib/alert.ts)
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.VERCEL_ENV !== "production" && process.env.ALERT_ALWAYS !== "1") return;
  const { sendAlert } = await import("@/lib/alert");
  const { site } = await import("@/lib/site");
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : null;
  await sendAlert(digest ?? `${context.routePath}:${message}`, `${site.name}: server xatosi`, [
    `${request.method} ${request.path}`,
    `${context.routeType} · ${context.routePath}`,
    message,
    ...(digest ? [`digest: ${digest}`] : []),
  ]);
};

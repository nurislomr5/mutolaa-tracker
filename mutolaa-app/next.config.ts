import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    // internet uzilganda navigatsiya/server action kutib turadi va qayta yuboriladi; useOffline() banner uchun
    useOffline: true,
  },
  async headers() {
    return [
      {
        // service worker har doim yangi versiyada tekshirilsin
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  // Telegram bot rasmdagi shtrix-kodni serverda oʻqiydi (lib/bot/barcode.ts): paket bundle qilinmaydi,
  // .wasm fayl esa funksiya bilan birga yuklanadi
  serverExternalPackages: ["zxing-wasm"],
  outputFileTracingIncludes: {
    "/api/bot": ["./node_modules/zxing-wasm/dist/reader/zxing_reader.wasm"],
  },
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Mutolaa muqovalari o'z CDN'idan olinadi, biz ularni ko'chirmaymiz
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn-minio.mutolaa.com",
        pathname: "/media/**",
      },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

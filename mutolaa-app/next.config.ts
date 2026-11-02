import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
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

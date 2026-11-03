import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is opened at 127.0.0.1 (ports are bound to loopback only).
  // Next blocks dev assets for any origin other than localhost by default,
  // which prevented the page from hydrating.
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  partialPrefetching: true,
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

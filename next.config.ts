import type { NextConfig } from "next";

// Baseline security headers for every response. The nonce-based Content-Security-Policy
// is set per request in src/proxy.ts.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Ask Chrome and Edge for the real system version (tells Windows 11 from 10, shows the Android
  // version) and the phone model, for the activity log. Other browsers just ignore it.
  { key: "Accept-CH", value: "Sec-CH-UA-Platform-Version, Sec-CH-UA-Model" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Native Argon2 binding must load from node_modules, not be bundled
  serverExternalPackages: ["@node-rs/argon2"],
  env: {
    // Short commit id shown in the footer; Vercel provides it at build time
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The text-reading engine (about 7 MB per visit) is cached by the browser for a week
      {
        source: "/ocr/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
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

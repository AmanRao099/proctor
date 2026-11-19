import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/*
 * Content Security Policy, production only (the dev server needs eval for
 * fast refresh). Everything the app loads is its own:
 *   - Monaco is self-hosted under /vendor/monaco and starts web workers from
 *     blob: URLs, so worker-src allows blob:
 *   - MediaPipe runs WebAssembly from /vendor/mediapipe: 'wasm-unsafe-eval'
 *   - Next.js inlines its bootstrap script and styles: 'unsafe-inline'
 * Judge0 and MongoDB are only ever called from the server, never the browser.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "media-src 'self' blob: mediastream:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  // Camera and microphone are needed by the proctor on our own origin only.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd
    ? [
        { key: "Content-Security-Policy", value: csp },
        // Browsers only ever reach this app over HTTPS from now on.
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Docker builds a self-contained server (see Dockerfile). Vercel packages
  // the app itself and must not get a standalone bundle.
  output: process.env.VERCEL ? undefined : "standalone",
  // Lets a production build run beside a dev server without sharing .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Belt and braces with the per-icon imports: never compile a whole icon set.
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  poweredByHeader: false,
  serverExternalPackages: ["mongodb", "bcryptjs"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // MediaPipe models and wasm never change for a given version.
        source: "/vendor/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/illustrations/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};

export default nextConfig;

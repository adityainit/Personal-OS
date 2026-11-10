import type { NextConfig } from "next";

// Every page in this app is private, per-user and cookie-authenticated, so it is
// rendered dynamically on each request (Cache Components / PPR intentionally off).
const nextConfig: NextConfig = {
  // Make sure a profile photo dropped into /public is available to the server render.
  outputFileTracingIncludes: { "/**": ["./public/profile.*"] },
  experimental: {
    // Keep visited pages in the browser's router cache for 30s so switching back to a
    // tab is instant. Every server action calls revalidatePath, which clears this cache,
    // so your own edits always show straight away.
    staleTimes: { dynamic: 30, static: 300 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

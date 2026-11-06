import type { NextConfig } from "next";

// Every page in this app is private, per-user and cookie-authenticated, so it is
// rendered dynamically on each request (Cache Components / PPR intentionally off).
const nextConfig: NextConfig = {
  // Make sure a profile photo dropped into /public is available to the server render.
  outputFileTracingIncludes: { "/**": ["./public/profile.*"] },
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "prisma"],
  // SECURITY: Do NOT ignore TypeScript build errors in production.
  // Build must pass type-checking to catch type-related bugs.
  typescript: {
    ignoreBuildErrors: false,
  },
  // Enable React strict mode for catching common bugs during development
  reactStrictMode: true,
  // SECURITY: Remove X-Powered-By header to prevent server fingerprinting
  poweredByHeader: false,
  // Security headers and rate limiting are handled in src/middleware.ts (Next.js 16 convention)
};

export default nextConfig;

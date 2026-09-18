import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The codebase has pre-existing `no-explicit-any` lint errors (tracked
  // separately, not introduced by this change). `npm run lint` still reports
  // them; keep them from blocking `next build` the way they didn't under the
  // previous vite-based build.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

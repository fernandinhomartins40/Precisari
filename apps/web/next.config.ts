import type { NextConfig } from 'next';
import { join } from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Docker image only: `next start` (dev and E2E) does not work with standalone output.
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  // Monorepo root (pnpm workspace) for output file tracing.
  outputFileTracingRoot: join(__dirname, '../..'),
  // The floating dev badge overlaps the mobile bottom navigation.
  devIndicators: false,
  // Lint runs as its own task (`pnpm --filter web lint`, flat config); don't repeat it in `next build`.
  eslint: { ignoreDuringBuilds: true },
  images: { formats: ['image/avif', 'image/webp'] },
};

export default nextConfig;

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static export (TECHNICAL_SPEC C.2): output goes to out/.
  output: 'export',
  // Next.js image optimization is not available in a static export (C.3).
  images: { unoptimized: true },
};

export default nextConfig;

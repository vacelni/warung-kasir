import type { NextConfig } from 'next';
import { assertPublishableKey } from './lib/env';

// NEXT_PUBLIC_* values are inlined into the browser bundle, so refuse to run
// dev/build with a secret or service_role key (SECURITY E.7).
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (publishableKey) assertPublishableKey(publishableKey);

const nextConfig: NextConfig = {
  // Static export (TECHNICAL_SPEC C.2): output goes to out/.
  output: 'export',
  // Next.js image optimization is not available in a static export (C.3).
  images: { unoptimized: true },
};

export default nextConfig;

import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

describe('next.config', () => {
  it('uses static export (TECHNICAL_SPEC C.2)', () => {
    expect(nextConfig.output).toBe('export');
  });

  it('disables image optimization, which static export does not support (C.3)', () => {
    expect(nextConfig.images?.unoptimized).toBe(true);
  });
});

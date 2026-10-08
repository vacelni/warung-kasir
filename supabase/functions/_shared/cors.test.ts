import { describe, expect, it } from 'vitest';
import { corsHeaders, isOriginAllowed, parseAllowedOrigins } from './cors.ts';

const APP = 'https://kasir.example.com';

describe('parseAllowedOrigins', () => {
  it('reads a comma-separated list, trimming spaces and trailing slashes', () => {
    expect([...parseAllowedOrigins(` ${APP}/ , http://localhost:3000`)]).toEqual([APP, 'http://localhost:3000']);
  });

  it('allows nothing when unset or empty (fail closed)', () => {
    expect(parseAllowedOrigins(undefined).size).toBe(0);
    expect(parseAllowedOrigins(' , ').size).toBe(0);
  });

  it('never accepts a wildcard', () => {
    expect([...parseAllowedOrigins(`*, ${APP}`)]).toEqual([APP]);
  });
});

describe('isOriginAllowed', () => {
  const allowed = parseAllowedOrigins(APP);

  it('accepts a listed origin and a request without Origin (not a browser)', () => {
    expect(isOriginAllowed(APP, allowed)).toBe(true);
    expect(isOriginAllowed(null, allowed)).toBe(true);
  });

  it('rejects any other origin, including look-alikes', () => {
    expect(isOriginAllowed('https://evil.example', allowed)).toBe(false);
    expect(isOriginAllowed(`${APP}.evil.example`, allowed)).toBe(false);
    expect(isOriginAllowed('http://kasir.example.com', allowed)).toBe(false);
    expect(isOriginAllowed('null', allowed)).toBe(false);
  });
});

describe('corsHeaders', () => {
  const allowed = parseAllowedOrigins(APP);

  it('echoes an allowed origin, never "*"', () => {
    const headers = corsHeaders(APP, allowed);
    expect(headers['Access-Control-Allow-Origin']).toBe(APP);
    expect(headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    expect(headers['Access-Control-Allow-Headers']).toContain('authorization');
    expect(headers.Vary).toBe('Origin');
  });

  it('sends no CORS grant to another origin', () => {
    const headers = corsHeaders('https://evil.example', allowed);
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(Object.values(headers)).not.toContain('*');
  });
});

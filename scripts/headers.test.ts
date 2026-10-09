import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildEnvValue,
  contentSecurityPolicy,
  findInlineAttribute,
  inlineScripts,
  MAX_HEADER_LINE,
  scriptHash,
  supabaseOrigin,
  withContentSecurityPolicy,
} from './headers.mts';

const PAGE = [
  '<!DOCTYPE html><html><head>',
  '<script src="/_next/static/chunks/a.js" async=""></script>',
  '<script>(self.__next_f=self.__next_f||[]).push([0])</script>',
  '</head><body><div id="root"></div>',
  '<script id="_R_">self.__next_f.push([1,"<div style=\\"x\\" onclick=\\"y\\">"])</script>',
  '<SCRIPT>second()</SCRIPT >',
  '</body></html>',
].join('');

describe('inlineScripts', () => {
  it('returns the exact text of every script without src, in order, whatever its other attributes', () => {
    expect(inlineScripts(PAGE)).toEqual([
      '(self.__next_f=self.__next_f||[]).push([0])',
      'self.__next_f.push([1,"<div style=\\"x\\" onclick=\\"y\\">"])',
      'second()',
    ]);
  });

  it('keeps whitespace and newlines, which are part of the hash', () => {
    expect(inlineScripts('<script>\n  a();\n</script>')).toEqual(['\n  a();\n']);
  });

  it('finds nothing in a page with external scripts only', () => {
    expect(inlineScripts('<script src="/x.js"></script><script defer src=/y.js></script>')).toEqual([]);
  });
});

describe('scriptHash', () => {
  it('is the base64 SHA-256 of the UTF-8 text, as a CSP source expression', () => {
    const body = 'console.log("Rp15.000 — ✓")';
    const expected = createHash('sha256').update(Buffer.from(body, 'utf8')).digest('base64');
    expect(scriptHash(body)).toBe(`'sha256-${expected}'`);
  });

  it('differs when a single character differs', () => {
    expect(scriptHash('a()')).not.toBe(scriptHash('a() '));
  });
});

describe('findInlineAttribute', () => {
  it('ignores attribute-like text inside script bodies', () => {
    expect(findInlineAttribute(PAGE)).toBeNull();
  });

  it('reports a style attribute or an inline event handler in the markup', () => {
    expect(findInlineAttribute('<body><h1 style="color:red">x</h1></body>')).toContain('style="color:red"');
    expect(findInlineAttribute('<body><button type="button" onclick="go()">x</button></body>')).toContain('onclick');
    expect(findInlineAttribute('<body><img src="/a.png" onerror=alert(1)></body>')).toContain('onerror');
  });

  it('does not mistake other attributes for them', () => {
    expect(findInlineAttribute('<div data-style="x" aria-controls="y" content="on">z</div>')).toBeNull();
  });
});

describe('supabaseOrigin', () => {
  it('keeps only the origin of the project URL', () => {
    expect(supabaseOrigin('https://abcd.supabase.co/')).toBe('https://abcd.supabase.co');
    expect(supabaseOrigin('http://127.0.0.1:54321/rest/v1')).toBe('http://127.0.0.1:54321');
  });

  it('refuses a missing, invalid, or non-http URL', () => {
    expect(() => supabaseOrigin(undefined)).toThrow(/must be set/);
    expect(() => supabaseOrigin('')).toThrow(/must be set/);
    expect(() => supabaseOrigin('not a url')).toThrow(/not a valid URL/);
    expect(() => supabaseOrigin('javascript:alert(1)')).toThrow(/http\(s\)/);
  });
});

describe('contentSecurityPolicy', () => {
  const policy = contentSecurityPolicy({
    scriptHashes: ["'sha256-b'", "'sha256-a'", "'sha256-b'"],
    supabase: 'https://abcd.supabase.co',
  });
  const directives = new Map(
    policy.split('; ').map((directive) => {
      const [name, ...sources] = directive.split(' ');
      return [name, sources] as const;
    }),
  );

  it('denies by default and allows scripts only from the site and the listed hashes, each once', () => {
    expect(directives.get('default-src')).toEqual(["'none'"]);
    expect(directives.get('script-src')).toEqual(["'self'", "'sha256-a'", "'sha256-b'"]);
  });

  it('never allows inline code or eval', () => {
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|strict-dynamic|\*/);
  });

  it('connects only to the site and the Supabase project', () => {
    expect(directives.get('connect-src')).toEqual(["'self'", 'https://abcd.supabase.co']);
  });

  it('blocks framing, form submission, base changes, and plugins', () => {
    for (const name of ['frame-ancestors', 'form-action', 'base-uri', 'object-src']) {
      expect(directives.get(name)).toEqual(["'none'"]);
    }
  });

  it('allows the manifest, the service worker, styles, images, and fonts from the site only', () => {
    for (const name of ['manifest-src', 'worker-src', 'style-src', 'img-src', 'font-src']) {
      expect(directives.get(name)).toEqual(["'self'"]);
    }
  });
});

describe('withContentSecurityPolicy', () => {
  const file = ['# the Content-Security-Policy is added by the build', '', '/*', '  X-Frame-Options: DENY', '', '/sw.js', '  Cache-Control: no-cache', ''].join('\n');

  it('adds the policy as the first header of the "/*" rule and leaves the rest untouched', () => {
    expect(withContentSecurityPolicy(file, "default-src 'none'")).toBe(
      ['# the Content-Security-Policy is added by the build', '', '/*', "  Content-Security-Policy: default-src 'none'", '  X-Frame-Options: DENY', '', '/sw.js', '  Cache-Control: no-cache', ''].join('\n'),
    );
  });

  it('refuses a file that already sets a policy, or without exactly one "/*" rule', () => {
    expect(() => withContentSecurityPolicy(`${file}\n/x\n  Content-Security-Policy: a\n`, 'b')).toThrow(/already/);
    expect(() => withContentSecurityPolicy('/sw.js\n  Cache-Control: no-cache\n', 'b')).toThrow(/exactly one/);
    expect(() => withContentSecurityPolicy(`${file}/*\n`, 'b')).toThrow(/exactly one/);
  });

  it(`refuses a policy line longer than Cloudflare's ${MAX_HEADER_LINE} characters`, () => {
    expect(() => withContentSecurityPolicy(file, 'x'.repeat(MAX_HEADER_LINE))).toThrow(/Cloudflare allows/);
  });
});

describe('buildEnvValue (the URL next build inlined, without @next/env)', () => {
  const NAME = 'NEXT_PUBLIC_SUPABASE_URL';

  it('prefers the process environment, then the files in Next.js production order', () => {
    const files = ['NEXT_PUBLIC_SUPABASE_URL=https://prod-local.supabase.co', 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321', null, null];
    expect(buildEnvValue(NAME, { [NAME]: 'https://from-env.supabase.co' }, files)).toBe('https://from-env.supabase.co');
    expect(buildEnvValue(NAME, {}, files)).toBe('https://prod-local.supabase.co');
    expect(buildEnvValue(NAME, {}, [null, 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321', null, null])).toBe('http://127.0.0.1:54321');
  });

  it('reads quoted values, export lines, CRLF files and trailing comments; ignores other keys and comments', () => {
    const text = ['# comment', 'OTHER=x', 'export NEXT_PUBLIC_SUPABASE_URL="https://a.supabase.co" ', ''].join('\r\n');
    expect(buildEnvValue(NAME, {}, [text])).toBe('https://a.supabase.co');
    expect(buildEnvValue(NAME, {}, ["NEXT_PUBLIC_SUPABASE_URL='https://b.supabase.co'"])).toBe('https://b.supabase.co');
    expect(buildEnvValue(NAME, {}, ['NEXT_PUBLIC_SUPABASE_URL=https://c.supabase.co # local'])).toBe('https://c.supabase.co');
  });

  it('is undefined when nothing sets it, so the build fails with a clear message', () => {
    expect(buildEnvValue(NAME, { [NAME]: '' }, [null, 'OTHER=1', null, null])).toBeUndefined();
  });
});

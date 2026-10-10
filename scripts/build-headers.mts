/**
 * Post-build step (`npm run build`, after build-sw): adds the Content-Security-Policy to
 * out/_headers (copied from public/_headers by `next build`). The script hashes come from the
 * exported HTML itself and the Supabase origin from NEXT_PUBLIC_SUPABASE_URL, so the policy always
 * matches this build. Fails the build rather than ship a page the policy would break.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildEnvValue,
  contentSecurityPolicy,
  findInlineAttribute,
  inlineScripts,
  PRODUCTION_ENV_FILES,
  requirePublishableKey,
  scriptHash,
  supabaseOrigin,
  withContentSecurityPolicy,
} from './headers.mts';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'out');

async function htmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.html')).map((entry) => path.join(entry.parentPath, entry.name));
}

async function main() {
  // The same value, from the same .env files in the same order, that `next build` inlined.
  const files = await Promise.all(PRODUCTION_ENV_FILES.map((file) => readFile(path.join(root, file), 'utf8').catch(() => null)));
  const supabase = supabaseOrigin(buildEnvValue('NEXT_PUBLIC_SUPABASE_URL', process.env, files));
  // The bundle is already built at this point: a missing key means it cannot log anyone in.
  requirePublishableKey(buildEnvValue('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', process.env, files));
  const pages = await htmlFiles(outDir);
  if (pages.length === 0) throw new Error('out/ has no HTML. Run `next build` first.');

  const hashes = new Set<string>();
  for (const file of pages) {
    const html = await readFile(file, 'utf8');
    const offending = findInlineAttribute(html);
    if (offending) {
      throw new Error(`${path.relative(outDir, file)} has inline markup the policy blocks: ${offending}`);
    }
    for (const body of inlineScripts(html)) hashes.add(scriptHash(body));
  }

  const headersPath = path.join(outDir, '_headers');
  const policy = contentSecurityPolicy({ scriptHashes: [...hashes], supabase });
  await writeFile(headersPath, withContentSecurityPolicy(await readFile(headersPath, 'utf8'), policy));
  console.log(`_headers: Content-Security-Policy with ${hashes.size} script hashes from ${pages.length} pages; connect-src ${supabase}`);
}

await main();

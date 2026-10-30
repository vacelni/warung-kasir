/** Request body helpers shared by the Edge Functions. Plain TypeScript with no Deno globals. */

/**
 * The request body as text, or null when it is larger than `maxBytes` (INFO-4). A declared
 * Content-Length is checked before anything is read, and reading stops as soon as the limit is
 * passed, so an oversized body is never held in memory.
 */
export async function readBodyLimited(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (!Number.isFinite(declared) || declared > maxBytes) return null;
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

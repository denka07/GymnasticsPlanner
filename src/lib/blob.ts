import "server-only";

import { del, get, list } from "@vercel/blob";

/*
 * The private Vercel Blob store that holds session attachments, equipment
 * images and hall feature images. The SDK reads BLOB_READ_WRITE_TOKEN from the environment; the token
 * and the store's URLs never reach the browser, which gets files through
 * /api/attachments/[attachmentId] and /api/equipment-images/[configurationId]
 * only.
 */

export function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** A stored file as a stream with its size, or null when it does not exist. */
export async function readBlob(
  pathname: string,
): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null> {
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return null;
  }
  return { stream: result.stream, size: result.blob.size };
}

/**
 * The first `count` bytes of a stored file and its size, or null when it
 * does not exist. Stops reading once it has them.
 */
export async function readBlobStart(
  pathname: string,
  count: number,
): Promise<{ bytes: Uint8Array; size: number } | null> {
  const blob = await readBlob(pathname);
  if (!blob) {
    return null;
  }
  const reader = blob.stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (length < count) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
      length += value.length;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { bytes: bytes.slice(0, count), size: blob.size };
}

/** Every stored file under `prefix`, with when it was uploaded. */
export async function listBlobs(prefix: string): Promise<{ pathname: string; uploadedAt: Date }[]> {
  const result: { pathname: string; uploadedAt: Date }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    for (const b of page.blobs) {
      result.push({ pathname: b.pathname, uploadedAt: new Date(b.uploadedAt) });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return result;
}

/**
 * Deletes stored files, best effort: a failure is logged and swallowed, so
 * the database change that made them unused still counts. A file left behind
 * costs storage only; nothing refers to it any more.
 */
export async function deleteBlobs(pathnames: string[]): Promise<void> {
  if (pathnames.length === 0) {
    return;
  }
  try {
    await del(pathnames);
  } catch (error) {
    console.error(
      `Could not delete ${pathnames.length} stored file(s):`,
      error instanceof Error ? error.message : error,
    );
  }
}

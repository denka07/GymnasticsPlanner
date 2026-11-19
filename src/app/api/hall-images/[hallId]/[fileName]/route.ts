import { SNIFF_BYTES } from "@/lib/attachments";
import { readBlob, readBlobStart } from "@/lib/blob";
import { getHallImageForDownload } from "@/lib/data/halls";
import { sniffEquipmentImage } from "@/lib/equipment-configurations";

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

/**
 * Sends a hall feature's image to any signed-in user, streamed from the
 * private Blob store; anyone else gets 404 (see getHallImageForDownload).
 * The file name begins with a random part that is new for every upload, so
 * the URL plays the part of equipment images' `?v=` version: it never shows
 * another image and may be cached privately for long.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/hall-images/[hallId]/[fileName]">,
): Promise<Response> {
  const { hallId, fileName } = await ctx.params;
  const image = await getHallImageForDownload(hallId, decodeURIComponent(fileName));
  if (!image) {
    return notFound();
  }
  let contentType = image.contentType;
  if (!contentType) {
    // An administrator's unsaved upload: its type from its first bytes.
    const start = await readBlobStart(image.pathname, SNIFF_BYTES);
    contentType = start ? sniffEquipmentImage(start.bytes) : null;
    if (!contentType) {
      return notFound();
    }
  }
  const blob = await readBlob(image.pathname);
  if (!blob) {
    return notFound();
  }
  return new Response(blob.stream, {
    headers: {
      // Checked against the file's bytes, from the allow-list.
      "Content-Type": contentType,
      "Content-Length": String(blob.size),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": image.contentType
        ? "private, max-age=31536000, immutable"
        : "private, no-cache",
    },
  });
}

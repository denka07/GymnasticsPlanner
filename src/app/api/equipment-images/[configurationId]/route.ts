import { readBlob } from "@/lib/blob";
import { getEquipmentImageForDownload } from "@/lib/data/equipment-configurations";
import { imageVersion } from "@/lib/equipment-configurations";

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

/**
 * Sends a configuration's image to any signed-in user, streamed from the
 * private Blob store; anyone else gets 404. Pages link to it with `?v=` set
 * to the image's version (equipmentImageUrl), which changes when the image
 * is replaced, so such a request may be cached privately for long and reused
 * by every drawing. Without the current version it must be revalidated.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/equipment-images/[configurationId]">,
): Promise<Response> {
  const { configurationId } = await ctx.params;
  const image = await getEquipmentImageForDownload(configurationId);
  if (!image) {
    return notFound();
  }
  const blob = await readBlob(image.pathname);
  if (!blob) {
    console.error("An equipment image's stored file is missing.");
    return notFound();
  }
  const version = new URL(request.url).searchParams.get("v");
  const current = version === imageVersion(image.pathname);
  return new Response(blob.stream, {
    headers: {
      // The type checked against the file's bytes on upload, from the allow-list.
      "Content-Type": image.contentType,
      "Content-Length": String(blob.size),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": current ? "private, max-age=31536000, immutable" : "private, no-cache",
    },
  });
}

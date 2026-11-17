import { inlineDisposition } from "@/lib/attachments";
import { readBlob } from "@/lib/blob";
import { getAttachmentForDownload } from "@/lib/data/attachments";

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}

/**
 * Sends one attachment to someone who can view its session, streamed from
 * the private Blob store. Anyone else gets 404, whether or not it exists.
 * The store's URL and token never reach the browser.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/attachments/[attachmentId]">,
): Promise<Response> {
  const { attachmentId } = await ctx.params;
  const attachment = await getAttachmentForDownload(attachmentId);
  if (!attachment) {
    return notFound();
  }
  const blob = await readBlob(attachment.pathname);
  if (!blob) {
    console.error("An attachment's stored file is missing.");
    return notFound();
  }
  return new Response(blob.stream, {
    headers: {
      // The type checked against the file's bytes on upload, from the allow-list.
      "Content-Type": attachment.contentType,
      "Content-Length": String(blob.size),
      "Content-Disposition": inlineDisposition(attachment.fileName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
}

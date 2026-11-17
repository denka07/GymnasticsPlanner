import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { authorizeAttachmentUpload } from "@/lib/data/attachments";

/**
 * Issues the short-lived client token with which the browser uploads one
 * attachment straight to the private Blob store (step 2 in
 * src/lib/data/attachments.ts). Files never pass through this function, so
 * Vercel's 4.5 MB request body limit does not apply to them. Only token
 * requests are accepted; uploads are registered by a server action instead
 * of the store's completion callback, which cannot reach a local dev server.
 */
export async function POST(request: Request): Promise<Response> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  if (body?.type !== "blob.generate-client-token") {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const options = await authorizeAttachmentUpload(pathname, clientPayload);
        if (!options) {
          throw new Forbidden();
        }
        return options;
      },
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof Forbidden) {
      // Same answer whether the session exists or not.
      return Response.json({ error: "notFound" }, { status: 404 });
    }
    console.error("Could not issue an upload token:", error instanceof Error ? error.message : error);
    return Response.json({ error: "unexpected" }, { status: 500 });
  }
}

class Forbidden extends Error {}

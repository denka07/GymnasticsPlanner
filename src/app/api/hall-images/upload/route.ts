import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { authorizeHallImageUpload } from "@/lib/data/halls";

/**
 * Issues the short-lived client token with which an administrator's browser
 * uploads one hall feature image straight to the private Blob store (step 2 in
 * src/lib/data/halls.ts). Files never pass through this function, so
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
        const options = await authorizeHallImageUpload(pathname, clientPayload);
        if (!options) {
          throw new Forbidden();
        }
        return options;
      },
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof Forbidden) {
      // Same answer for non-administrators and unknown halls.
      return Response.json({ error: "notFound" }, { status: 404 });
    }
    console.error("Could not issue an upload token:", error instanceof Error ? error.message : error);
    return Response.json({ error: "unexpected" }, { status: 500 });
  }
}

class Forbidden extends Error {}

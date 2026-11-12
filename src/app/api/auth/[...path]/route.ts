import type { NextRequest } from "next/server";

import { getAuth } from "@/lib/auth/server";

type Context = { params: Promise<{ path: string[] }> };
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// Proxies the auth client's requests to Neon Auth. The handler is created on
// first use so that builds need no auth secrets.
function forward(method: Method) {
  return (request: NextRequest, context: Context) =>
    getAuth().handler()[method](request, context);
}

export const GET = forward("GET");
export const POST = forward("POST");
export const PUT = forward("PUT");
export const PATCH = forward("PATCH");
export const DELETE = forward("DELETE");

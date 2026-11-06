import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * Compatibility shim for MCP clients that look for authorization-server
 * metadata on the resource's own origin: mirrors Supabase Auth's RFC 8414 document.
 */
export async function GET() {
  const upstream = await fetch(`${env.supabaseUrl()}/.well-known/oauth-authorization-server/auth/v1`, {
    next: { revalidate: 3600 },
  });
  if (!upstream.ok) return NextResponse.json({ error: "Authorization server metadata unavailable" }, { status: 502 });
  return NextResponse.json(await upstream.json(), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
  });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

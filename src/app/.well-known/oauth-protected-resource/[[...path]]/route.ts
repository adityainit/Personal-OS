import { getPublicOrigin, metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";
import { env } from "@/lib/env";

/**
 * RFC 9728 Protected Resource Metadata. Served at both
 * /.well-known/oauth-protected-resource and /.well-known/oauth-protected-resource/api/mcp.
 * Points MCP clients at Supabase Auth's OAuth 2.1 server. The resource URL is
 * derived from the request so it always matches the URL the client connected to.
 */
export function GET(req: Request) {
  return protectedResourceHandler({
    authServerUrls: [`${env.supabaseUrl()}/auth/v1`],
    resourceUrl: `${getPublicOrigin(req)}/api/mcp`,
  })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();

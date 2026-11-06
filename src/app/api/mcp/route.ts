import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyMcpToken } from "@/lib/mcp/auth";
import { registerTools, SERVER_INSTRUCTIONS } from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  {
    serverInfo: { name: "personal-os", version: "1.0.0" },
    instructions: SERVER_INSTRUCTIONS,
  },
);

/**
 * Remote MCP endpoint for Claude.ai custom connectors.
 * Every request must carry a Supabase OAuth access token; tools run as that
 * user through Row Level Security.
 */
const authed = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

export { authed as GET, authed as POST, authed as DELETE };

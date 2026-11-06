import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

const { createMcpHandler } = await import("mcp-handler");
const { registerTools, SERVER_INSTRUCTIONS } = await import("@/lib/mcp/tools");

const handler = createMcpHandler((s) => registerTools(s), {
  serverInfo: { name: "test", version: "0" },
  instructions: SERVER_INSTRUCTIONS,
});

async function rpc(method: string, params: unknown = {}, id = 1) {
  const res = await handler(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }),
  );
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data:"));
  return JSON.parse(line ? line.slice(5) : text);
}

describe("MCP server", () => {
  it("initializes with instructions", async () => {
    const r = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "vitest", version: "0" },
    });
    expect(r.result.serverInfo.name).toBe("test");
    expect(r.result.instructions).toContain("NEVER contact");
  });

  it("lists every tool with a JSON schema and never exposes send/delete tools", async () => {
    const r = await rpc("tools/list");
    const tools = r.result.tools as { name: string; inputSchema: { type: string }; annotations?: { readOnlyHint?: boolean } }[];
    expect(tools).toHaveLength(25);
    for (const t of tools) expect(t.inputSchema.type).toBe("object");
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["create_lead", "mark_outreach_sent", "record_interaction", "list_follow_ups", "create_deal"]));
    expect(names.some((n) => /send_|delete|remove|email_|dm_/.test(n))).toBe(false);
    expect(tools.find((t) => t.name === "get_lead")?.annotations?.readOnlyHint).toBe(true);
  });

  it("refuses tool calls without an authenticated token", async () => {
    const r = await rpc("tools/call", { name: "dashboard_stats", arguments: {} });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/Not authenticated/);
  });

  it("validates tool input", async () => {
    const r = await rpc("tools/call", { name: "create_lead", arguments: { fit_score: "nope" } });
    const failed = r.error || r.result?.isError;
    expect(failed).toBeTruthy();
  });
});

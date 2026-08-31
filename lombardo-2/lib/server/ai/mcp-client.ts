import "server-only";

import { createMCPClient } from "@ai-sdk/mcp";
import type { ZodType } from "zod";
import type { AiSalesConfiguration } from "./config";

export const RUNIA_SALES_TOOLS = [
  "search_products",
  "get_product",
  "recommend_products",
  "get_effective_price",
  "get_opportunities",
  "search_guides",
  "build_selection",
] as const;

export type RuniaSalesToolName = (typeof RUNIA_SALES_TOOLS)[number];

export async function callRuniaTool<T>(input: {
  configuration: AiSalesConfiguration;
  name: RuniaSalesToolName;
  arguments: Record<string, unknown>;
  outputSchema: ZodType<T>;
}) {
  const client = await createMCPClient({
    transport: {
      type: "http",
      url: input.configuration.mcpUrl,
      headers: { Authorization: `Bearer ${input.configuration.mcpAccessToken}` },
      redirect: "error",
    },
    initializationOptions: { timeout: 5_000, maxTotalTimeout: 8_000 },
    maxRetries: 1,
    clientName: "lombardo-ai-sales-host",
    version: "1.0.0",
    onUncaughtError: () => undefined,
  });

  try {
    const definitions = await client.listTools({ options: { timeout: 5_000 } });
    const names = definitions.tools.map((tool) => tool.name).sort();
    const expected = [...RUNIA_SALES_TOOLS].sort();
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      throw new Error("RUNIA_MCP_TOOL_SURFACE_DRIFT");
    }
    const result = await client.callTool({
      name: input.name,
      arguments: input.arguments,
      options: { timeout: 8_000, maxTotalTimeout: 12_000 },
    });
    if ("isError" in result && result.isError) throw new Error("RUNIA_MCP_TOOL_FAILED");
    if (!("structuredContent" in result)) throw new Error("RUNIA_MCP_OUTPUT_MISSING");
    return input.outputSchema.parse(result.structuredContent);
  } finally {
    await client.close().catch(() => undefined);
  }
}

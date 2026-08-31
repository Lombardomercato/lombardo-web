import "server-only";

import { readRuniaConfiguration } from "../environment.ts";

interface EnvironmentSource {
  [key: string]: string | undefined;
}

export interface AiSalesConfiguration {
  mcpUrl: string;
  mcpAccessToken: string;
  model: string;
  rateLimitSecret: string;
  runia: ReturnType<typeof readRuniaConfiguration>;
}

const DEFAULT_MCP_HOST = "runia-catalog-system-94x9.vercel.app";
const DEFAULT_MODEL = "openai/gpt-5.6-luna";

export function readAiSalesConfiguration(
  env: EnvironmentSource = process.env,
): AiSalesConfiguration {
  const runia = readRuniaConfiguration(env);
  const mcpUrl = required(env, "RUNIA_MCP_URL");
  const parsedUrl = new URL(mcpUrl);
  const allowedHost = env.RUNIA_MCP_ALLOWED_HOST?.trim() || DEFAULT_MCP_HOST;
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== allowedHost ||
    parsedUrl.pathname !== "/api/mcp" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error("AI_SALES_MCP_URL_INVALID");
  }

  const mcpAccessToken = required(env, "RUNIA_MCP_ACCESS_TOKEN");
  if (mcpAccessToken.length < 32 || /\s/.test(mcpAccessToken)) {
    throw new Error("AI_SALES_MCP_TOKEN_INVALID");
  }

  const rateLimitSecret = required(env, "AI_RATE_LIMIT_SECRET");
  if (rateLimitSecret.length < 32 || /\s/.test(rateLimitSecret)) {
    throw new Error("AI_RATE_LIMIT_SECRET_INVALID");
  }

  const model = env.AI_SALES_MODEL?.trim() || DEFAULT_MODEL;
  if (!/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*$/i.test(model)) {
    throw new Error("AI_SALES_MODEL_INVALID");
  }

  return { mcpUrl: parsedUrl.href, mcpAccessToken, model, rateLimitSecret, runia };
}

function required(env: EnvironmentSource, name: string) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
}

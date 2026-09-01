import "server-only";

import { readRuniaConfiguration } from "../environment.ts";

interface EnvironmentSource {
  [key: string]: string | undefined;
}

export interface AiSalesConfiguration {
  model: string;
  rateLimitSecret: string;
  runia: ReturnType<typeof readRuniaConfiguration>;
}

const DEFAULT_MODEL = "openai/gpt-5-mini";

export function readAiSalesConfiguration(
  env: EnvironmentSource = process.env,
): AiSalesConfiguration {
  const runia = readRuniaConfiguration(env);
  if (runia.tenantSlug !== "lombardo") {
    throw new Error("AI_SALES_TENANT_INVALID");
  }

  const configuredRateLimitSecret = env.AI_RATE_LIMIT_SECRET?.trim();
  const rateLimitSecret = configuredRateLimitSecret || runia.secretKey;
  if (rateLimitSecret.length < 32 || /\s/.test(rateLimitSecret)) {
    throw new Error("AI_RATE_LIMIT_SECRET_INVALID");
  }

  const model = env.AI_SALES_MODEL?.trim() || DEFAULT_MODEL;
  if (!/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*$/i.test(model)) {
    throw new Error("AI_SALES_MODEL_INVALID");
  }

  return { model, rateLimitSecret, runia };
}

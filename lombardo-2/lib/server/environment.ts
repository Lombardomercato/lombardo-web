import { Buffer } from "node:buffer";
import { ServerOrderError } from "./orders/server-order-error.ts";

type EnvironmentSource = Record<string, string | undefined>;

const RUNIA_PROJECT_REFS = {
  development: "rtnzzfzofeqmtdmbchbw",
  production: "ymowgnjusqzkqjpwokib",
} as const;

export interface RuniaConfiguration {
  environment: "development" | "production";
  tenantSlug: string;
  url: string;
  secretKey: string;
}

export interface MercadoPagoTestConfiguration {
  accessToken: string;
  appUrl: string;
  webhookSecret: string;
}

function configurationError(message: string): never {
  throw new ServerOrderError("SERVER_NOT_CONFIGURED", message, { status: 503 });
}

function requiredEnvironment(env: EnvironmentSource, name: string) {
  const value = env[name]?.trim();
  if (!value) configurationError(`Falta configurar ${name} en el servidor.`);
  return value;
}

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function getSupabaseProjectRef(value: string) {
  try {
    const [projectRef, ...domain] = new URL(value).hostname.split(".");
    return domain.join(".") === "supabase.co" ? projectRef : null;
  } catch {
    return null;
  }
}

function isServiceRoleJwt(value: string) {
  const [, encodedPayload] = value.split(".");
  if (!encodedPayload) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as { role?: unknown };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

export function isServerOnlySupabaseKey(value: string) {
  return (
    (value.startsWith("sb_secret_") && value.length >= 24) || isServiceRoleJwt(value)
  );
}

export function readRuniaConfiguration(
  env: EnvironmentSource = process.env,
): RuniaConfiguration {
  const environment = env.RUNIA_ENVIRONMENT
    ?.trim()
    .toLocaleLowerCase("en-US");
  if (environment !== "development" && environment !== "production") {
    configurationError("RUNIA_ENVIRONMENT debe ser development o production.");
  }

  const vercelEnvironment = env.VERCEL_ENV
    ?.trim()
    .toLocaleLowerCase("en-US");
  if (vercelEnvironment === "production" && environment !== "production") {
    configurationError("Un deployment productivo no puede conectarse a Runia Dev.");
  }
  if (
    vercelEnvironment &&
    vercelEnvironment !== "production" &&
    environment === "production"
  ) {
    configurationError("Preview y Development no pueden conectarse a Runia Production.");
  }

  const tenantSlug = requiredEnvironment(env, "RUNIA_TENANT_SLUG");
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantSlug)) {
    configurationError("RUNIA_TENANT_SLUG no tiene un formato válido.");
  }

  const url = requiredEnvironment(env, "RUNIA_SUPABASE_URL").replace(/\/$/, "");
  if (!isHttpsUrl(url)) {
    configurationError("RUNIA_SUPABASE_URL debe ser una URL HTTPS.");
  }
  if (getSupabaseProjectRef(url) !== RUNIA_PROJECT_REFS[environment]) {
    configurationError(
      `RUNIA_SUPABASE_URL no corresponde al proyecto Runia ${environment}.`,
    );
  }

  const secretKey = requiredEnvironment(env, "RUNIA_SUPABASE_SECRET_KEY");
  if (!isServerOnlySupabaseKey(secretKey)) {
    configurationError(
      "RUNIA_SUPABASE_SECRET_KEY debe ser una Secret Key o service_role server-only.",
    );
  }

  return { environment, tenantSlug, url, secretKey };
}

export function paymentsEnabled(env: EnvironmentSource = process.env) {
  return env.PAYMENTS_ENABLED?.trim().toLocaleLowerCase("en-US") === "true";
}

export function readMercadoPagoTestConfiguration(
  env: EnvironmentSource = process.env,
): MercadoPagoTestConfiguration {
  readRuniaConfiguration(env);
  if (!paymentsEnabled(env)) {
    configurationError("PAYMENTS_ENABLED debe ser true para ejecutar el Sandbox.");
  }
  if (env.VERCEL_ENV?.trim().toLocaleLowerCase("en-US") === "production") {
    configurationError("Mercado Pago TEST no puede habilitarse en Production.");
  }
  if (env.MERCADO_PAGO_MODE?.trim().toUpperCase() !== "TEST") {
    configurationError("MERCADO_PAGO_MODE debe permanecer en TEST.");
  }

  const appUrl = requiredEnvironment(env, "APP_URL");
  if (!isHttpsUrl(appUrl)) {
    configurationError("APP_URL debe ser una URL HTTPS pública de Preview.");
  }
  const hostname = new URL(appUrl).hostname.toLocaleLowerCase("en-US");
  if (hostname === "lombardomercato.com" || hostname === "www.lombardomercato.com") {
    configurationError("APP_URL no puede apuntar al dominio productivo en esta etapa.");
  }

  return {
    accessToken: requiredEnvironment(env, "MERCADO_PAGO_ACCESS_TOKEN"),
    appUrl,
    webhookSecret: requiredEnvironment(env, "MERCADO_PAGO_WEBHOOK_SECRET"),
  };
}

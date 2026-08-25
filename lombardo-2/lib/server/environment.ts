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

export interface AdminConfiguration extends RuniaConfiguration {
  publishableKey: string;
}

export type MercadoPagoMode = "TEST" | "LIVE";

export interface MercadoPagoConfiguration {
  accessToken: string;
  appUrl: string;
  mode: MercadoPagoMode;
  sellerId: string;
  webhookSecret: string;
}

export interface WhatsAppOrderNotificationConfiguration {
  accessToken: string;
  phoneNumberId: string;
  recipient: string;
  templateName: string;
  languageCode: string;
  graphApiVersion: string;
  adminUrl: string;
}

export interface EmailOrderNotificationConfiguration {
  apiKey: string;
  recipient: string;
  sender: string;
  appUrl: string;
  adminUrl: string;
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

export function readAdminConfiguration(
  env: EnvironmentSource = process.env,
): AdminConfiguration {
  const runia = readRuniaConfiguration(env);
  const publishableKey = requiredEnvironment(
    env,
    "RUNIA_SUPABASE_PUBLISHABLE_KEY",
  );
  if (
    !publishableKey.startsWith("sb_publishable_") &&
    publishableKey.split(".").length !== 3
  ) {
    configurationError(
      "RUNIA_SUPABASE_PUBLISHABLE_KEY no tiene un formato válido.",
    );
  }
  return { ...runia, publishableKey };
}

export function paymentsEnabled(env: EnvironmentSource = process.env) {
  return env.PAYMENTS_ENABLED?.trim().toLocaleLowerCase("en-US") === "true";
}

export function whatsAppOrderNotificationsEnabled(
  env: EnvironmentSource = process.env,
) {
  return (
    env.WHATSAPP_ORDER_NOTIFICATIONS_ENABLED
      ?.trim()
      .toLocaleLowerCase("en-US") === "true"
  );
}

export function emailOrderNotificationsEnabled(
  env: EnvironmentSource = process.env,
) {
  return (
    env.EMAIL_ORDER_NOTIFICATIONS_ENABLED
      ?.trim()
      .toLocaleLowerCase("en-US") === "true"
  );
}

function normalizedHttpsOrigin(value: string) {
  if (!isHttpsUrl(value)) return null;
  const url = new URL(value);
  if (url.pathname !== "/" || url.search || url.hash) return null;
  return url.origin;
}

export function readMercadoPagoConfiguration(
  env: EnvironmentSource = process.env,
): MercadoPagoConfiguration {
  const runia = readRuniaConfiguration(env);
  const mode = env.MERCADO_PAGO_MODE?.trim().toUpperCase();
  if (mode !== "TEST" && mode !== "LIVE") {
    configurationError("MERCADO_PAGO_MODE debe ser TEST o LIVE.");
  }

  const appUrl = requiredEnvironment(env, "APP_URL");
  const appOrigin = normalizedHttpsOrigin(appUrl);
  if (!appOrigin) {
    configurationError("APP_URL debe ser un origen HTTPS público sin path ni query.");
  }
  const hostname = new URL(appOrigin).hostname.toLocaleLowerCase("en-US");
  const officialHostname = hostname === "www.lombardomercato.com";
  const apexHostname = hostname === "lombardomercato.com";

  if (mode === "TEST" && (officialHostname || apexHostname)) {
    configurationError("Mercado Pago TEST no puede usar el dominio productivo.");
  }
  if (mode === "LIVE") {
    if (
      env.VERCEL_ENV?.trim().toLocaleLowerCase("en-US") !== "production" ||
      runia.environment !== "production"
    ) {
      configurationError("Mercado Pago LIVE exige Vercel y Runia Production.");
    }
    if (!officialHostname) {
      configurationError(
        "Mercado Pago LIVE exige APP_URL=https://www.lombardomercato.com.",
      );
    }
  }

  const sellerId = requiredEnvironment(env, "MERCADO_PAGO_SELLER_ID");
  if (!/^\d{5,30}$/.test(sellerId)) {
    configurationError("MERCADO_PAGO_SELLER_ID no tiene un formato válido.");
  }

  const accessToken = requiredEnvironment(env, "MERCADO_PAGO_ACCESS_TOKEN");
  if (!accessToken.startsWith("APP_USR-")) {
    configurationError("MERCADO_PAGO_ACCESS_TOKEN no tiene el formato esperado.");
  }

  return {
    accessToken,
    appUrl: appOrigin,
    mode,
    sellerId,
    webhookSecret: requiredEnvironment(env, "MERCADO_PAGO_WEBHOOK_SECRET"),
  };
}

export function readMercadoPagoTestConfiguration(
  env: EnvironmentSource = process.env,
): MercadoPagoConfiguration {
  if (!paymentsEnabled(env)) {
    configurationError("PAYMENTS_ENABLED debe ser true para ejecutar el Sandbox.");
  }
  const configuration = readMercadoPagoConfiguration(env);
  if (configuration.mode !== "TEST") {
    configurationError("El chequeo Sandbox exige MERCADO_PAGO_MODE=TEST.");
  }
  return configuration;
}

export function readWhatsAppOrderNotificationConfiguration(
  env: EnvironmentSource = process.env,
): WhatsAppOrderNotificationConfiguration {
  if (!whatsAppOrderNotificationsEnabled(env)) {
    configurationError(
      "WHATSAPP_ORDER_NOTIFICATIONS_ENABLED debe ser true para enviar avisos.",
    );
  }

  const appUrl = requiredEnvironment(env, "APP_URL");
  const appOrigin = normalizedHttpsOrigin(appUrl);
  if (appOrigin !== "https://www.lombardomercato.com") {
    configurationError(
      "Las notificaciones de pedidos exigen APP_URL=https://www.lombardomercato.com.",
    );
  }

  const phoneNumberId = requiredEnvironment(
    env,
    "WHATSAPP_CLOUD_API_PHONE_NUMBER_ID",
  );
  if (!/^\d{5,30}$/.test(phoneNumberId)) {
    configurationError("WHATSAPP_CLOUD_API_PHONE_NUMBER_ID no es válido.");
  }

  const recipient = requiredEnvironment(
    env,
    "WHATSAPP_ORDER_NOTIFICATION_RECIPIENT",
  ).replace(/^\+/, "");
  if (!/^\d{8,15}$/.test(recipient)) {
    configurationError("WHATSAPP_ORDER_NOTIFICATION_RECIPIENT no es válido.");
  }

  const templateName = requiredEnvironment(
    env,
    "WHATSAPP_ORDER_TEMPLATE_NAME",
  );
  if (!/^[a-z0-9_]{3,128}$/.test(templateName)) {
    configurationError("WHATSAPP_ORDER_TEMPLATE_NAME no es válido.");
  }

  const languageCode = requiredEnvironment(
    env,
    "WHATSAPP_ORDER_TEMPLATE_LANGUAGE",
  );
  if (!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(languageCode)) {
    configurationError("WHATSAPP_ORDER_TEMPLATE_LANGUAGE no es válido.");
  }

  const graphApiVersion = requiredEnvironment(
    env,
    "WHATSAPP_CLOUD_API_VERSION",
  );
  if (!/^v\d{1,2}\.\d$/.test(graphApiVersion)) {
    configurationError("WHATSAPP_CLOUD_API_VERSION no es válida.");
  }

  const accessToken = requiredEnvironment(env, "WHATSAPP_CLOUD_API_ACCESS_TOKEN");
  if (accessToken.length < 40 || /\s/.test(accessToken)) {
    configurationError("WHATSAPP_CLOUD_API_ACCESS_TOKEN no es válido.");
  }

  return {
    accessToken,
    phoneNumberId,
    recipient,
    templateName,
    languageCode,
    graphApiVersion,
    adminUrl: `${appOrigin}/admin`,
  };
}

export function readEmailOrderNotificationConfiguration(
  env: EnvironmentSource = process.env,
): EmailOrderNotificationConfiguration {
  if (!emailOrderNotificationsEnabled(env)) {
    configurationError(
      "EMAIL_ORDER_NOTIFICATIONS_ENABLED debe ser true para enviar avisos.",
    );
  }

  const appUrl = requiredEnvironment(env, "APP_URL");
  const appOrigin = normalizedHttpsOrigin(appUrl);
  if (appOrigin !== "https://www.lombardomercato.com") {
    configurationError(
      "Las notificaciones de pedidos exigen APP_URL=https://www.lombardomercato.com.",
    );
  }

  const apiKey = requiredEnvironment(env, "RESEND_API_KEY");
  if (!apiKey.startsWith("re_") || apiKey.length < 20 || /\s/.test(apiKey)) {
    configurationError("RESEND_API_KEY no es válida.");
  }

  const recipient = requiredEnvironment(env, "ORDER_NOTIFICATION_EMAIL_TO");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    configurationError("ORDER_NOTIFICATION_EMAIL_TO no es válido.");
  }

  const sender = requiredEnvironment(env, "ORDER_NOTIFICATION_EMAIL_FROM");
  const senderAddress = sender.match(/<([^<>]+)>$/)?.[1] ?? sender;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderAddress)) {
    configurationError("ORDER_NOTIFICATION_EMAIL_FROM no es válido.");
  }

  return {
    apiKey,
    recipient,
    sender,
    appUrl: appOrigin,
    adminUrl: `${appOrigin}/admin`,
  };
}

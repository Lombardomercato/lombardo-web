import { getWhatsAppRecipient } from "../lib/checkout/whatsapp-coordination.ts";
import { readRuniaConfiguration } from "../lib/server/environment.ts";

const requiredPublicVariables = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_WHATSAPP_URL",
  "NEXT_PUBLIC_PICKUP_ADDRESS",
  "NEXT_PUBLIC_PICKUP_HOURS",
  "NEXT_PUBLIC_DELIVERY_COST_MODE",
] as const;

const requiredServerVariables = [
  "RUNIA_ENVIRONMENT",
  "RUNIA_SUPABASE_URL",
  "RUNIA_SUPABASE_SECRET_KEY",
  "RUNIA_TENANT_SLUG",
  "DELIVERY_COST_MODE",
  "PAYMENTS_ENABLED",
] as const;

const issues: string[] = [];

for (const name of [...requiredPublicVariables, ...requiredServerVariables]) {
  if (!process.env[name]?.trim()) issues.push(`Falta ${name}.`);
}

try {
  readRuniaConfiguration({ ...process.env, VERCEL_ENV: "production" });
} catch (error) {
  issues.push(error instanceof Error ? error.message : "Runia no está configurado.");
}

try {
  const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "");
  if (siteUrl.protocol !== "https:") issues.push("NEXT_PUBLIC_SITE_URL debe usar HTTPS.");
} catch {
  issues.push("NEXT_PUBLIC_SITE_URL no es una URL válida.");
}

if (!getWhatsAppRecipient(process.env.NEXT_PUBLIC_WHATSAPP_URL)) {
  issues.push("NEXT_PUBLIC_WHATSAPP_URL no contiene un número oficial válido.");
}

if (process.env.PAYMENTS_ENABLED?.trim().toLowerCase() !== "false") {
  issues.push("PAYMENTS_ENABLED debe permanecer false para el lanzamiento inicial.");
}

if (
  process.env.NEXT_PUBLIC_DELIVERY_COST_MODE !== process.env.DELIVERY_COST_MODE
) {
  issues.push("La modalidad de entrega pública y server-side no coincide.");
}

if (process.env.DELIVERY_COST_MODE === "FLAT_RATE") {
  if (!process.env.DELIVERY_FLAT_RATE?.trim()) {
    issues.push("Falta DELIVERY_FLAT_RATE.");
  }
  if (!process.env.NEXT_PUBLIC_DELIVERY_FLAT_RATE?.trim()) {
    issues.push("Falta NEXT_PUBLIC_DELIVERY_FLAT_RATE.");
  }
  if (
    process.env.NEXT_PUBLIC_DELIVERY_FLAT_RATE !==
    process.env.DELIVERY_FLAT_RATE
  ) {
    issues.push("La tarifa de entrega pública y server-side no coincide.");
  }
}

for (const issue of issues) console.error(`FAIL: ${issue}`);
console.log(`PRODUCTION CONFIG READY: ${issues.length ? "NO" : "YES"}`);
process.exitCode = issues.length ? 1 : 0;

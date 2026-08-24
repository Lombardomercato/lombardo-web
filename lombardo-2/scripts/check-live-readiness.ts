import { getWhatsAppRecipient } from "../lib/checkout/whatsapp-coordination.ts";
import { readMercadoPagoConfiguration } from "../lib/server/environment.ts";

const issues: string[] = [];
const required = [
  "APP_URL",
  "MERCADO_PAGO_MODE",
  "MERCADO_PAGO_SELLER_ID",
  "MERCADO_PAGO_ACCESS_TOKEN",
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "NEXT_PUBLIC_WHATSAPP_URL",
] as const;

for (const name of required) {
  if (!process.env[name]?.trim()) issues.push(`Falta ${name}.`);
}

let configuration: ReturnType<typeof readMercadoPagoConfiguration> | null = null;
try {
  configuration = readMercadoPagoConfiguration({
    ...process.env,
    VERCEL_ENV: "production",
  });
  if (configuration.mode !== "LIVE") {
    issues.push("MERCADO_PAGO_MODE debe ser LIVE.");
  }
} catch (error) {
  issues.push(
    error instanceof Error ? error.message : "Mercado Pago LIVE no está configurado.",
  );
}

if (process.env.PAYMENTS_ENABLED?.trim().toLocaleLowerCase("en-US") !== "false") {
  issues.push(
    "PAYMENTS_ENABLED debe existir y permanecer exactamente en false hasta autorizar el primer pago LIVE.",
  );
}

if (!getWhatsAppRecipient(process.env.NEXT_PUBLIC_WHATSAPP_URL)) {
  issues.push("NEXT_PUBLIC_WHATSAPP_URL no contiene un número oficial válido.");
}

if (configuration) {
  try {
    const response = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${configuration.accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) {
      issues.push(`Mercado Pago rechazó la credencial LIVE (HTTP ${response.status}).`);
    } else {
      const user = (await response.json()) as { id?: string | number; site_id?: string };
      if (String(user.id ?? "") !== configuration.sellerId) {
        issues.push("El Access Token no pertenece al seller configurado.");
      }
      if (user.site_id !== "MLA") {
        issues.push("La cuenta Mercado Pago no corresponde a Argentina (MLA).");
      }
    }
  } catch {
    issues.push("No fue posible validar el seller LIVE contra Mercado Pago.");
  }
}

for (const issue of issues) console.error(`FAIL: ${issue}`);
console.log(`LIVE PAYMENT CONFIG READY: ${issues.length ? "NO" : "YES"}`);
console.log("PAYMENTS ENABLED: NO");
console.log("WHATSAPP FALLBACK: PRESERVED");
process.exitCode = issues.length ? 1 : 0;

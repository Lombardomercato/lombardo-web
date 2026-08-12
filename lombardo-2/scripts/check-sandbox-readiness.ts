import { RuniaCommerceProvider } from "../lib/commerce/runia-commerce-provider.ts";
import {
  readMercadoPagoTestConfiguration,
  readRuniaConfiguration,
} from "../lib/server/environment.ts";
import { SupabaseOrderStore } from "../lib/server/orders/supabase-order-store.ts";

interface ReadinessCheck {
  name: string;
  ready: boolean;
  detail: string;
}

const checks: ReadinessCheck[] = [];
let runiaConfiguration: ReturnType<typeof readRuniaConfiguration> | null = null;

try {
  runiaConfiguration = readRuniaConfiguration();
  if (runiaConfiguration.environment !== "development") {
    throw new Error("El chequeo Sandbox sólo admite Runia Dev.");
  }
  checks.push({
    name: "Runia Dev",
    ready: true,
    detail: "entorno, tenant, URL y secreto server-only válidos",
  });
} catch (error) {
  const requiredRuniaVariables = [
    "RUNIA_ENVIRONMENT",
    "RUNIA_SUPABASE_URL",
    "RUNIA_SUPABASE_SECRET_KEY",
    "RUNIA_TENANT_SLUG",
  ];
  const missing = requiredRuniaVariables.filter((name) => !process.env[name]?.trim());
  checks.push({
    name: "Runia Dev",
    ready: false,
    detail: missing.length
      ? `faltan: ${missing.join(", ")}`
      : error instanceof Error
        ? error.message
        : "configuración inválida",
  });
}

if (runiaConfiguration) {
  try {
    const store = new SupabaseOrderStore(runiaConfiguration);
    await store.getByPublicId(
      runiaConfiguration.tenantSlug,
      "00000000-0000-4000-8000-000000000000",
    );
    checks.push({
      name: "Esquema orders",
      ready: true,
      detail: "commerce_orders accesible con service_role",
    });
  } catch {
    checks.push({
      name: "Esquema orders",
      ready: false,
      detail: "aplicar y verificar lombardo_commerce_orders.sql",
    });
  }

  try {
    const page = await new RuniaCommerceProvider(runiaConfiguration).getProductPage({
      limit: 1,
    });
    const validCount = page.total >= 1 && page.products.length === 1;
    checks.push({
      name: "Catálogo Runia Dev",
      ready: validCount,
      detail: validCount
        ? `${page.total} producto(s) SAFE de VINROS visibles`
        : "Runia Dev no devolvió productos SAFE de VINROS",
    });
  } catch {
    checks.push({
      name: "Catálogo Runia Dev",
      ready: false,
      detail: "verificar supplier_products SAFE y precios retail de VINROS",
    });
  }
} else {
  checks.push({
    name: "Esquema orders",
    ready: false,
    detail: "no verificable hasta configurar Runia Dev",
  });
  checks.push({
    name: "Catálogo Runia Dev",
    ready: false,
    detail: "no verificable hasta configurar Runia Dev",
  });
}

try {
  const payment = readMercadoPagoTestConfiguration();
  checks.push({
    name: "Mercado Pago TEST",
    ready: true,
    detail: `credenciales presentes; APP_URL=${new URL(payment.appUrl).origin}`,
  });
} catch (error) {
  const requiredPaymentVariables = [
    "APP_URL",
    "MERCADO_PAGO_ACCESS_TOKEN",
    "MERCADO_PAGO_WEBHOOK_SECRET",
  ];
  const missing = requiredPaymentVariables.filter(
    (name) => !process.env[name]?.trim(),
  );
  checks.push({
    name: "Mercado Pago TEST",
    ready: false,
    detail: missing.length
      ? `faltan: ${missing.join(", ")}`
      : error instanceof Error
        ? error.message
        : "configuración inválida",
  });
}

for (const check of checks) {
  process.stdout.write(`${check.ready ? "✓" : "✗"} ${check.name}: ${check.detail}\n`);
}

const ready = checks.length >= 4 && checks.every((check) => check.ready);
process.stdout.write(`\nSANDBOX INFRA READY: ${ready ? "YES" : "NO"}\n`);
if (!ready) process.exitCode = 1;

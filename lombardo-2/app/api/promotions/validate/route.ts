import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import { noStoreJson } from "@/lib/server/http-response";
import { checkRateLimit, getRequestIp } from "@/lib/server/rate-limit";
import { createOrderServices } from "@/lib/server/services";

function parseBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const code = typeof source.code === "string" ? source.code.trim().slice(0, 40) : "";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/.test(code) || !Array.isArray(source.items)) return null;
  const seen = new Set<string>();
  const items = source.items.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    const productId = typeof item.productId === "string" ? item.productId : "";
    if (!/^[a-zA-Z0-9_-]{3,160}$/.test(productId) || seen.has(productId)) return [];
    if (!Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 99) return [];
    if (!Number.isFinite(item.expectedUnitPrice) || Number(item.expectedUnitPrice) < 0) return [];
    seen.add(productId);
    return [{ productId, quantity: Number(item.quantity), expectedUnitPrice: Number(item.expectedUnitPrice) }];
  });
  return items.length === source.items.length && items.length <= 50 ? { code, items } : null;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return noStoreJson({ valid: false, code: "NOT_FOUND", message: "No pudimos validar la solicitud." }, { status: 403 });
  }
  const rateLimit = checkRateLimit(`promotion:${getRequestIp(request)}`, { limit: 30, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    return noStoreJson({ valid: false, code: "NOT_FOUND", message: "Esperá un momento antes de reintentar." }, { status: 429 });
  }
  let payload: unknown;
  try { payload = await request.json(); } catch { payload = null; }
  const input = parseBody(payload);
  if (!input) {
    return noStoreJson({ valid: false, code: "NOT_FOUND", message: "El código ingresado no es válido." }, { status: 400 });
  }
  try {
    const context = await getCurrentCustomerPricingContext();
    const result = await createOrderServices(context).orders.quotePromotion(input.code, input.items);
    if ("valid" in result && !result.valid && result.code === "PRICE_CHANGED") {
      return noStoreJson({ valid: false, code: "NOT_APPLICABLE", message: "Actualizamos los precios. Revisá el carrito y volvé a aplicar el cupón." }, { status: 409 });
    }
    return noStoreJson(result);
  } catch {
    return noStoreJson({ valid: false, code: "NOT_FOUND", message: "No pudimos validar el cupón en este momento." }, { status: 503 });
  }
}

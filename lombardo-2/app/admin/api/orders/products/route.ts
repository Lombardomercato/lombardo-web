import { quickOrderProvider } from "@/lib/commerce";
import {
  createAdminStore,
  getOptionalAdminSession,
} from "@/lib/server/admin/admin-auth";
import { noStoreJson } from "@/lib/server/http-response";
import { checkRateLimit, getRequestIp } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getOptionalAdminSession();
  if (!session) {
    return noStoreJson({ error: "La sesión de Admin venció." }, { status: 401 });
  }

  const rateLimit = checkRateLimit(
    `admin-order-products:${session.operatorId}:${getRequestIp(request)}`,
    { limit: 120, windowMs: 60_000 },
  );
  if (!rateLimit.allowed) {
    return noStoreJson(
      { error: "Esperá un momento antes de volver a buscar." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const customerId = searchParams.get("customerId")?.trim() ?? "";
  const search = searchParams.get("q")?.trim() ?? "";
  if (!customerId || !search || search.length > 80) {
    return noStoreJson({ products: [], queryTimeMs: 0, truncated: false });
  }

  try {
    const store = createAdminStore();
    const pricingContext = customerId === "guest"
      ? await store.getGuestOrderPricingContext()
      : (await store.getCustomerOrderContext(customerId))?.pricingContext;
    if (!pricingContext) {
      return noStoreJson(
        { error: "Elegí una cuenta activa con una política comercial válida." },
        { status: 422 },
      );
    }
    const result = await quickOrderProvider.searchProducts(
      { search, limit: 24 },
      pricingContext,
    );
    return noStoreJson(result);
  } catch {
    return noStoreJson(
      { error: "No pudimos buscar productos para esta cuenta." },
      { status: 503 },
    );
  }
}

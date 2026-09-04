import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { RuniaCommerceProvider } from "../lib/commerce/runia-commerce-provider.ts";
import { revalidateRepeatOrderItems } from "../lib/quick-order/repeat-order.ts";
import {
  isQuickOrderPricingContext,
  resolveQuickOrderAccess,
} from "../lib/quick-order/types.ts";
import { RuniaOrderRepository } from "../lib/server/orders/runia-order-repository.ts";
import type { RuniaOrderStore } from "../lib/server/orders/order-dependencies.ts";
import type {
  CustomerAccountSummary,
  CustomerPricingContext,
} from "../lib/server/customers/types.ts";
import type { CreateOrderInput, OrderItemSnapshot } from "../types/checkout.ts";
import type { Product } from "../types/commerce.ts";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const SUPPLIER_ID = "22222222-2222-4222-8222-222222222222";
const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";
const AUTH_USER_ID = "55555555-5555-4555-8555-555555555555";

function account(
  accountType: CustomerAccountSummary["accountType"],
): CustomerAccountSummary {
  return {
    id: ACCOUNT_ID,
    tenantId: TENANT_ID,
    authUserId: AUTH_USER_ID,
    name: "Comercio Demo",
    email: "compras@example.com",
    whatsapp: "+5493415550000",
    accountType,
    pricingPolicy: accountType,
    discountPercent: 0,
    status: "active",
  };
}

function pricingContext(
  accountType: "WHOLESALE" | "BUSINESS" = "WHOLESALE",
): CustomerPricingContext {
  const policy = accountType;
  return {
    tenantRecordId: TENANT_ID,
    tenantSlug: "lombardo",
    authUserId: AUTH_USER_ID,
    customerAccountId: ACCOUNT_ID,
    accountType,
    policy,
    basePriceType: accountType === "WHOLESALE" ? "wholesale" : "business",
    discountPercent: 0,
    contextKey: `customer:${ACCOUNT_ID}:${policy}:0`,
  };
}

function currentProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: PRODUCT_ID,
    sourceProductId: PRODUCT_ID,
    sku: "ABS001B",
    slug: `producto-demo--${PRODUCT_ID}`,
    name: "Producto actual",
    description: "",
    presentation: "750 ml",
    brand: { id: "brand-demo", slug: "demo", name: "Demo" },
    category: { id: "category-vinos", slug: "vinos", name: "Vinos" },
    price: 8_500,
    basePrice: 8_500,
    priceType: "wholesale",
    pricingPolicy: "WHOLESALE",
    discountPercent: 0,
    pricingContextKey: pricingContext().contextKey,
    availability: "SUPPLIER_AVAILABLE",
    stock: { available: true, quantity: 0 },
    images: [],
    active: true,
    featured: false,
    situations: [],
    giftLevels: [],
    tags: [],
    ...overrides,
  };
}

test("WHOLESALE y BUSINESS acceden; retail, sesión inactiva y visitante no", () => {
  assert.equal(resolveQuickOrderAccess(AUTH_USER_ID, account("WHOLESALE")).allowed, true);
  assert.equal(resolveQuickOrderAccess(AUTH_USER_ID, account("BUSINESS")).allowed, true);
  assert.deepEqual(resolveQuickOrderAccess(AUTH_USER_ID, account("RETAIL")), {
    allowed: false,
    reason: "RETAIL",
  });
  assert.deepEqual(resolveQuickOrderAccess(AUTH_USER_ID, null), {
    allowed: false,
    reason: "INACTIVE",
  });
  assert.deepEqual(resolveQuickOrderAccess(null, null), {
    allowed: false,
    reason: "SIGNED_OUT",
  });
  assert.equal(isQuickOrderPricingContext(pricingContext("WHOLESALE")), true);
  assert.equal(isQuickOrderPricingContext(pricingContext("BUSINESS")), true);
});

function supplierProductRow() {
  return {
    runia_product_id: PRODUCT_ID,
    supplier_sku: "ABS001B",
    name_raw: "BODEGA DEMO Malbec x 750 c.c.",
    presentation_raw: "750cc",
    normalized_presentation: "750 ml",
    active: true,
    eligibility_status: "safe",
    retail_prices: [{ price_type: "wholesale", current_price: 8_500 }],
    public_prices: [{ price_type: "retail", current_price: 10_000 }],
    editorial: [{ brand_name: "Casa Demo" }],
  };
}

test("SEARCH consulta marca server-side y entrega precio de cuenta sin imágenes", async () => {
  const requests: URL[] = [];
  let fuzzyBody: Record<string, unknown> | undefined;
  const provider = new RuniaCommerceProvider(
    {
      url: "https://example.supabase.co",
      secretKey: "sb_secret_test_value_123456789",
      tenantSlug: "lombardo",
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        requests.push(url);
        if (url.pathname.endsWith("/suppliers")) {
          return Response.json([
            {
              id: SUPPLIER_ID,
              name: "VINROS",
              active: true,
              tenants: { slug: "lombardo", status: "active" },
            },
          ]);
        }
        if (url.pathname.endsWith("/rpc/supplier_search_product_ids")) {
          fuzzyBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return Response.json([
            { product_id: PRODUCT_ID, search_rank: 8, total_count: 1 },
          ]);
        }
        if (url.searchParams.has("id")) {
          return Response.json([supplierProductRow()]);
        }
        return Response.json([]);
      },
    },
    pricingContext(),
  );

  const result = await provider.searchProducts(
    { search: "Casa Demo", limit: 24 },
    pricingContext(),
  );
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0]?.product.brand.name, "Casa Demo");
  assert.equal(result.products[0]?.product.price, 8_500);
  assert.equal(result.products[0]?.publicUnitPrice, 10_000);
  assert.deepEqual(result.products[0]?.product.images, []);
  assert.equal(result.products[0]?.product.availability, "SUPPLIER_AVAILABLE");
  assert.equal(result.products[0]?.product.stock.quantity, 0);

  assert.equal(fuzzyBody?.p_query, "casa demo");
  assert.equal(fuzzyBody?.p_supplier_id, SUPPLIER_ID);
  assert.equal(fuzzyBody?.p_eligibility, "safe");
  assert.equal(fuzzyBody?.p_price_type, "wholesale");
  const productRequest = requests.find(
    (url) => url.pathname.endsWith("/supplier_products") && url.searchParams.has("id"),
  );
  assert.equal(productRequest?.searchParams.get("eligibility_status"), "eq.safe");
  assert.equal(productRequest?.searchParams.get("active"), "is.true");
  assert.equal(productRequest?.searchParams.get("retail_prices.price_type"), "eq.wholesale");
  assert.equal(productRequest?.searchParams.get("public_prices.price_type"), "eq.retail");
});

test("SEARCH grande limita candidatos y nunca devuelve más de 30", async () => {
  let candidateLimit = 0;
  const row = supplierProductRow();
  const provider = new RuniaCommerceProvider(
    {
      url: "https://example.supabase.co",
      secretKey: "sb_secret_test_value_123456789",
      tenantSlug: "lombardo",
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/suppliers")) {
          return Response.json([
            {
              id: SUPPLIER_ID,
              name: "VINROS",
              active: true,
              tenants: { slug: "lombardo", status: "active" },
            },
          ]);
        }
        if (url.pathname.endsWith("/rpc/supplier_search_product_ids")) {
          const body = JSON.parse(String(init?.body)) as { p_limit: number };
          candidateLimit = body.p_limit;
          return Response.json([
            { product_id: PRODUCT_ID, search_rank: 8, total_count: 120 },
          ]);
        }
        return Response.json([row]);
      },
    },
    pricingContext(),
  );

  const result = await provider.searchProducts(
    { search: "demo", limit: 1_000 },
    pricingContext(),
  );
  assert.equal(candidateLimit, 60);
  assert.ok(result.products.length <= 30);
  assert.equal(result.truncated, true);
});

test("REPEAT ORDER ignora precios históricos y omite productos no vigentes", () => {
  const historical = [
    {
      productId: PRODUCT_ID,
      name: "Nombre viejo",
      sku: "ABS001B",
      quantity: 6,
      unitPrice: 1,
      baseUnitPrice: 1,
      priceType: "retail",
      pricingPolicy: "RETAIL",
      discountPercent: 0,
      discountAmount: 0,
      lineBaseTotal: 6,
      lineDiscount: 0,
      lineTotal: 6,
    },
    {
      productId: "99999999-9999-4999-8999-999999999999",
      name: "Ya no disponible",
      sku: "OLD-1",
      quantity: 2,
      unitPrice: 10,
      baseUnitPrice: 10,
      priceType: "retail",
      pricingPolicy: "RETAIL",
      discountPercent: 0,
      discountAmount: 0,
      lineBaseTotal: 20,
      lineDiscount: 0,
      lineTotal: 20,
    },
  ] as OrderItemSnapshot[];
  const current = currentProduct({ price: 8_750, basePrice: 8_750 });

  const result = revalidateRepeatOrderItems(historical, [current]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.quantity, 6);
  assert.equal(result.items[0]?.product.price, 8_750);
  assert.equal(result.items[0]?.product.pricingPolicy, "WHOLESALE");
  assert.equal(result.skippedItemCount, 1);
});

test("CART/CHECKOUT preserva snapshot WHOLESALE resuelto por el servidor", async () => {
  const product = currentProduct();
  const repository = new RuniaOrderRepository({
    tenantId: "lombardo",
    pricingContext: pricingContext(),
    productSource: { async getProductsByIds() { return [product]; } },
    deliveryPricing: {
      getQuote() { return { mode: "FREE", amount: 0, label: "Sin costo" }; },
    },
    store: {} as RuniaOrderStore,
  });
  const input: CreateOrderInput = {
    checkoutSessionId: "checkout_quick_order_123456",
    idempotencyKey: "idempotency_quick_order_123456",
    items: [{ productId: PRODUCT_ID, quantity: 3, expectedUnitPrice: 8_500 }],
    customer: {
      firstName: "Comercio",
      lastName: "Demo",
      whatsapp: "+5493415550000",
      email: "compras@example.com",
    },
    deliveryMethod: "PICKUP",
  };

  const validation = await repository.validateCart(input);
  assert.equal(validation.valid, true);
  if (!validation.valid) return;
  assert.equal(validation.items[0]?.priceType, "wholesale");
  assert.equal(validation.items[0]?.pricingPolicy, "WHOLESALE");
  assert.equal(validation.items[0]?.unitPrice, 8_500);
  assert.equal(validation.items[0]?.quantity, 3);
  assert.equal(validation.items[0]?.lineTotal, 25_500);
});

test("KEYBOARD FLOW, MOBILE y SECURITY quedan cubiertos en la superficie pública", () => {
  const component = readFileSync(
    fileURLToPath(
      new URL("../components/quick-order/QuickOrderWorkspace.tsx", import.meta.url),
    ),
    "utf8",
  );
  const css = readFileSync(
    fileURLToPath(
      new URL("../components/quick-order/QuickOrderWorkspace.module.css", import.meta.url),
    ),
    "utf8",
  );
  const repeatRoute = readFileSync(
    fileURLToPath(
      new URL("../app/api/quick-order/repeat/route.ts", import.meta.url),
    ),
    "utf8",
  );

  assert.match(component, /event\.key === "Enter"/);
  assert.match(component, /event\.key === "ArrowDown"/);
  assert.match(component, /event\.key === "Escape"/);
  assert.match(component, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(component, /openCart: false/);
  assert.match(css, /@media \(max-width: 47\.99rem\)/);
  assert.match(css, /position: sticky/);
  assert.match(repeatRoute, /\.eq\("tenant_record_id", access\.account\.tenantId\)/);
  assert.match(repeatRoute, /\.eq\("customer_account_id", access\.account\.id\)/);
  assert.doesNotMatch(component, /service_role|RUNIA_SUPABASE_SECRET_KEY|sb_secret_/i);
});

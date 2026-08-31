import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  mapRuniaSupplierProduct,
  type RuniaSupplierProductRow,
} from "../lib/commerce/runia-catalog-mapper.ts";
import { RuniaCommerceProvider } from "../lib/commerce/runia-commerce-provider.ts";
import type { CustomerPricingContext } from "../lib/server/customers/types.ts";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const SUPPLIER_ID = "22222222-2222-4222-8222-222222222222";

function pricingContext(
  overrides: Partial<CustomerPricingContext> = {},
): CustomerPricingContext {
  return {
    tenantSlug: "lombardo-dev",
    accountType: "RETAIL",
    policy: "RETAIL",
    basePriceType: "retail",
    discountPercent: 0,
    contextKey: "guest:RETAIL",
    ...overrides,
  };
}

function productRow(
  priceType: CustomerPricingContext["basePriceType"],
  price: number,
): RuniaSupplierProductRow {
  return {
    runia_product_id: PRODUCT_ID,
    supplier_sku: "ABS001B",
    name_raw: "BODEGA RUNIA Malbec x 750 c.c.",
    presentation_raw: "750cc",
    normalized_presentation: "750 ml",
    active: true,
    eligibility_status: "safe",
    retail_prices: [{ price_type: priceType, current_price: price }],
  };
}

test("el mismo SKU resuelve retail, wholesale, business y retail -10%", () => {
  const cases = [
    {
      context: pricingContext(),
      basePrice: 10_000,
      finalPrice: 10_000,
    },
    {
      context: pricingContext({
        accountType: "WHOLESALE",
        policy: "WHOLESALE",
        basePriceType: "wholesale",
        contextKey: "customer:wholesale",
      }),
      basePrice: 8_500,
      finalPrice: 8_500,
    },
    {
      context: pricingContext({
        accountType: "BUSINESS",
        policy: "BUSINESS",
        basePriceType: "business",
        contextKey: "customer:business",
      }),
      basePrice: 8_000,
      finalPrice: 8_000,
    },
    {
      context: pricingContext({
        policy: "CUSTOM_DISCOUNT",
        discountPercent: 10,
        contextKey: "customer:retail-10",
      }),
      basePrice: 10_000,
      finalPrice: 9_000,
    },
  ] as const;

  for (const scenario of cases) {
    const product = mapRuniaSupplierProduct(
      productRow(scenario.context.basePriceType, scenario.basePrice),
      scenario.context,
    );
    assert.equal(product.basePrice, scenario.basePrice);
    assert.equal(product.price, scenario.finalPrice);
    assert.equal(product.priceType, scenario.context.basePriceType);
    assert.equal(product.pricingPolicy, scenario.context.policy);
    assert.equal(
      product.discountPercent,
      scenario.context.policy === "CUSTOM_DISCOUNT" ? 10 : 0,
    );
    assert.equal(product.pricingContextKey, scenario.context.contextKey);
    assert.equal(
      product.compareAtPrice,
      scenario.context.policy === "CUSTOM_DISCOUNT"
        ? scenario.basePrice
        : undefined,
    );
  }
});

test("ABS001B reproduce las cuatro cotizaciones verificadas en Runia Production", () => {
  const retail = mapRuniaSupplierProduct(productRow("retail", 13_050.05), pricingContext());
  const wholesale = mapRuniaSupplierProduct(
    productRow("wholesale", 12_056.4),
    pricingContext({
      accountType: "WHOLESALE",
      policy: "WHOLESALE",
      basePriceType: "wholesale",
      contextKey: "qa:wholesale",
    }),
  );
  const business = mapRuniaSupplierProduct(
    productRow("business", 9_900),
    pricingContext({
      accountType: "BUSINESS",
      policy: "BUSINESS",
      basePriceType: "business",
      contextKey: "qa:business",
    }),
  );
  const retailTen = mapRuniaSupplierProduct(
    productRow("retail", 13_050.05),
    pricingContext({
      policy: "CUSTOM_DISCOUNT",
      discountPercent: 10,
      contextKey: "qa:retail-10",
    }),
  );

  assert.deepEqual(
    [retail.price, wholesale.price, business.price, retailTen.price],
    [13_050.05, 12_056.4, 9_900, 11_745.05],
  );
});

test("CUSTOM_DISCOUNT redondea el precio final a dos decimales", () => {
  const context = pricingContext({
    policy: "CUSTOM_DISCOUNT",
    discountPercent: 10,
    contextKey: "customer:rounding",
  });
  const product = mapRuniaSupplierProduct(productRow("retail", 100.01), context);
  assert.equal(product.basePrice, 100.01);
  assert.equal(product.price, 90.01);
});

test("LOMBARDO SELLING PRICE reemplaza sólo la base retail y conserva VINROS", () => {
  const row = productRow("retail", 20_000);
  row.lombardo_prices = [{
    price_type: "retail",
    current_price: 17_990,
    version: 1,
    active: true,
  }];
  const retail = mapRuniaSupplierProduct(row, pricingContext());
  assert.equal(retail.basePrice, 17_990);
  assert.equal(retail.price, 17_990);
  assert.equal(row.retail_prices && Array.isArray(row.retail_prices) ? row.retail_prices[0]?.current_price : undefined, 20_000);

  const wholesaleRow = productRow("wholesale", 15_000);
  wholesaleRow.lombardo_prices = row.lombardo_prices;
  const wholesale = mapRuniaSupplierProduct(wholesaleRow, pricingContext({
    accountType: "WHOLESALE",
    policy: "WHOLESALE",
    basePriceType: "wholesale",
  }));
  assert.equal(wholesale.price, 15_000);
});

test("una política incoherente no puede seleccionar otra lista", () => {
  const context = pricingContext({
    policy: "WHOLESALE",
    basePriceType: "retail",
  });
  assert.throws(
    () => mapRuniaSupplierProduct(productRow("retail", 10_000), context),
    /política comercial y la lista de precios no coinciden/,
  );
});

test("Runia filtra server-side la lista base de la política", async () => {
  const requestedProductPriceTypes: string[] = [];
  const wholesale = pricingContext({
    accountType: "WHOLESALE",
    policy: "WHOLESALE",
    basePriceType: "wholesale",
    contextKey: "customer:wholesale",
  });
  const provider = new RuniaCommerceProvider(
    {
      url: "https://example.supabase.co",
      secretKey: "sb_secret_test_value_123456789",
      tenantSlug: "lombardo-dev",
      fetcher: async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/suppliers")) {
          return Response.json([
            {
              id: SUPPLIER_ID,
              name: "VINROS",
              active: true,
              tenants: { slug: "lombardo-dev", status: "active" },
            },
          ]);
        }
        if (url.pathname.endsWith("/supplier_product_public_media")) {
          return Response.json([]);
        }

        const selected =
          url.searchParams.get("retail_prices.price_type")?.replace(/^eq\./, "") ??
          "retail";
        requestedProductPriceTypes.push(selected);
        const price = selected === "wholesale" ? 8_500 : 10_000;
        return Response.json(
          [
            productRow(
              selected as CustomerPricingContext["basePriceType"],
              price,
            ),
          ],
          { headers: { "Content-Range": "0-0/1" } },
        );
      },
    },
    wholesale,
  );

  const wholesalePage = await provider.getProductPage();
  assert.equal(wholesalePage.products[0]?.price, 8_500);

  const discountedPage = await provider.getProductPage(
    {},
    pricingContext({
      policy: "CUSTOM_DISCOUNT",
      discountPercent: 10,
      contextKey: "customer:retail-10",
    }),
  );
  assert.equal(discountedPage.products[0]?.basePrice, 10_000);
  assert.equal(discountedPage.products[0]?.price, 9_000);
  assert.deepEqual(requestedProductPriceTypes, ["wholesale", "retail"]);
});

test("el cache usa política, lista y descuento pero adjunta identidad después", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../lib/commerce/index.ts", import.meta.url)),
    "utf8",
  );
  assert.match(
    source,
    /cachedProductPage\(\s*context\.basePriceType,\s*context\.policy,\s*context\.discountPercent/,
  );
  assert.match(
    source,
    /attachPricingIdentity\(product, context\.contextKey\)/,
  );
  assert.match(
    source,
    /cachePricingContext\([\s\S]*?contextKey: ""/,
  );
});

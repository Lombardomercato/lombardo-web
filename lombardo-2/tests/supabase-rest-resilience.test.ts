import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { RuniaCommerceProvider } from "../lib/commerce/runia-commerce-provider.ts";
import {
  fetchSupabaseRest,
  SupabaseRestError,
  supabaseRestResponseError,
} from "../lib/server/supabase-rest.ts";

const PRODUCT_ID = "7396023a-aca1-400a-8421-83e84fc4b9c7";
const SUPPLIER_ID = "31198e56-1111-4111-8111-111111111111";

test("reintenta lecturas ante fallas transitorias y luego entrega la respuesta", async () => {
  let attempts = 0;
  const delays: number[] = [];
  const response = await fetchSupabaseRest(
    "https://example.supabase.co/rest/v1/products",
    { method: "GET" },
    {
      operation: "test GET products",
      fetcher: async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("fetch failed");
        if (attempts === 2) return new Response(null, { status: 503 });
        return Response.json([{ id: "product-1" }]);
      },
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [100, 250]);
});

test("no reintenta errores permanentes ni escrituras", async () => {
  let getAttempts = 0;
  const badRequest = await fetchSupabaseRest(
    "https://example.supabase.co/rest/v1/products",
    { method: "GET" },
    {
      operation: "test GET products",
      fetcher: async () => {
        getAttempts += 1;
        return Response.json({ code: "PGRST100", message: "bad filter" }, { status: 400 });
      },
      sleep: async () => undefined,
    },
  );
  assert.equal(badRequest.status, 400);
  assert.equal(getAttempts, 1);

  let postAttempts = 0;
  const unavailableWrite = await fetchSupabaseRest(
    "https://example.supabase.co/rest/v1/orders",
    { method: "POST" },
    {
      operation: "test POST orders",
      fetcher: async () => {
        postAttempts += 1;
        return new Response(null, { status: 503 });
      },
      sleep: async () => undefined,
    },
  );
  assert.equal(unavailableWrite.status, 503);
  assert.equal(postAttempts, 1);
});

test("conserva causa, status y detalle PostgREST para observabilidad", async () => {
  await assert.rejects(
    fetchSupabaseRest(
      "https://example.supabase.co/rest/v1/products",
      { method: "GET" },
      {
        operation: "test GET products",
        maxAttempts: 2,
        fetcher: async () => {
          throw new TypeError("other side closed");
        },
        sleep: async () => undefined,
      },
    ),
    (error: unknown) =>
      error instanceof SupabaseRestError &&
      error.attempts === 2 &&
      error.cause instanceof TypeError,
  );

  const error = await supabaseRestResponseError(
    Response.json(
      {
        code: "PGRST100",
        message: "failed to parse filter",
        details: "unexpected token",
        hint: "use column=lte.value",
      },
      { status: 400 },
    ),
    "test GET slots",
  );
  assert.equal(error.status, 400);
  assert.equal(error.code, "PGRST100");
  assert.equal(error.hint, "use column=lte.value");
});

test("la rotación diaria usa la sintaxis PostgREST correcta para lte", async () => {
  const store = await readFile(
    new URL("../lib/server/automations/automation-store.ts", import.meta.url),
    "utf8",
  );
  assert.match(store, /selection_date: `lte\.\$\{date\}`/);
  assert.doesNotMatch(store, /"selection_date\.lte"/);
});

test("una caída persistente de imágenes no se informa como producto inválido", async () => {
  const provider = new RuniaCommerceProvider({
    url: "https://example.supabase.co",
    secretKey: "sb_secret_test_value_123456789",
    tenantSlug: "lombardo",
    fetcher: async (input) => {
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
      if (url.pathname.endsWith("/supplier_product_public_media")) {
        throw new TypeError("other side closed");
      }
      return Response.json([
        {
          runia_product_id: PRODUCT_ID,
          supplier_sku: "VLP056B",
          name_raw: "CHAC CHAC MALBEC x 750 c.c.",
          presentation_raw: "750 c.c.",
          normalized_presentation: "750 ml",
          active: true,
          eligibility_status: "safe",
          retail_prices: [{ price_type: "retail", current_price: 8550 }],
          editorial: [{ brand_name: "Chac Chac" }],
        },
      ]);
    },
  });

  await assert.rejects(
    provider.getProductBySlug(`chac-chac-malbec--${PRODUCT_ID}`),
    (error: unknown) => {
      if (!(error instanceof Error) || !(error.cause instanceof Error)) {
        return false;
      }
      const requestError = error.cause.cause;
      return (
        error.message === "Runia no pudo cargar las imágenes públicas del catálogo." &&
        !error.message.includes("datos inválidos") &&
        requestError instanceof SupabaseRestError &&
        requestError.attempts === 3
      );
    },
  );
});

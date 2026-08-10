import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { RuniaCommerceProvider } from "../lib/commerce/runia-commerce-provider.ts";
import { getOrderStatusPresentation } from "../lib/order-status/presentation.ts";
import { logDevCommerce } from "../lib/server/dev-commerce-logger.ts";
import {
  readMercadoPagoTestConfiguration,
  readRuniaDevConfiguration,
} from "../lib/server/environment.ts";
import { parseCreateOrderInput } from "../lib/server/orders/order-input.ts";
import type {
  AtomicInsertResult,
  NewOrderRecord,
  PaymentEventInput,
  PaymentStateUpdate,
  RuniaOrderStore,
  ServerDeliveryPricing,
  ServerProductSource,
} from "../lib/server/orders/order-dependencies.ts";
import { RuniaOrderRepository } from "../lib/server/orders/runia-order-repository.ts";
import { ServerOrderError } from "../lib/server/orders/server-order-error.ts";
import {
  MercadoPagoAdapter,
  preferenceIdempotencyKey,
} from "../lib/server/payments/mercado-pago-adapter.ts";
import { OrderPaymentCoordinator } from "../lib/server/payments/order-payment-coordinator.ts";
import type { PaymentGateway } from "../lib/server/payments/payment-gateway.ts";
import { PaymentWebhookService } from "../lib/server/payments/payment-webhook-service.ts";
import { verifyMercadoPagoWebhookSignature } from "../lib/server/payments/webhook-signature.ts";
import type {
  CreateOrderInput,
  MercadoPagoPayment,
  OrderDraft,
  PaymentPreferenceResult,
} from "../types/checkout.ts";
import type { Product } from "../types/commerce.ts";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    sku: "SKU-1",
    slug: "producto-uno",
    name: "Producto uno",
    description: "Producto de prueba",
    presentation: "Unidad",
    brand: { id: "brand-1", slug: "brand", name: "Brand" },
    category: { id: "category-1", slug: "test", name: "Test" },
    price: 10_000,
    availability: "AVAILABLE_NOW",
    stock: { available: true, quantity: 20 },
    images: [],
    active: true,
    featured: false,
    situations: [],
    giftLevels: [],
    tags: [],
    ...overrides,
  };
}

function input(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    checkoutSessionId: "checkout_1234567890abcdef",
    idempotencyKey: "idempotency_1234567890abcdef",
    items: [{ productId: "product-1", quantity: 2, expectedUnitPrice: 10_000 }],
    customer: {
      firstName: "Alex",
      lastName: "Santillán",
      whatsapp: "+5493415550000",
      email: "alex@example.com",
    },
    deliveryMethod: "PICKUP",
    ...overrides,
  };
}

class FakeProductSource implements ServerProductSource {
  products: Product[];

  constructor(products: Product[]) {
    this.products = products;
  }

  async getProductsByIds(productIds: string[]) {
    return this.products.filter((item) => productIds.includes(item.id));
  }
}

class FreeDelivery implements ServerDeliveryPricing {
  getQuote() {
    return { mode: "FREE" as const, amount: 0, label: "Sin costo" };
  }
}

class FakeOrderStore implements RuniaOrderStore {
  orders: OrderDraft[] = [];
  events = new Map<string, { id: string; processed: boolean }>();
  insertAttempts = 0;
  paymentUpdates = 0;

  async findByIdempotency(
    tenantId: string,
    checkoutSessionId: string,
    idempotencyKey: string,
  ) {
    return (
      this.orders.find(
        (order) =>
          order.tenantId === tenantId &&
          (order.checkoutSessionId === checkoutSessionId ||
            order.idempotencyKey === idempotencyKey),
      ) ?? null
    );
  }

  async insertOrderAtomic(record: NewOrderRecord): Promise<AtomicInsertResult> {
    this.insertAttempts += 1;
    const existing = this.orders.find(
      (order) =>
        order.tenantId === record.tenantId &&
        (order.checkoutSessionId === record.checkoutSessionId ||
          order.idempotencyKey === record.idempotencyKey),
    );
    if (existing) return { order: existing, reused: true };
    const now = new Date().toISOString();
    const order: OrderDraft = {
      ...record,
      id: String(this.orders.length + 1),
      createdAt: now,
      updatedAt: now,
    };
    this.orders.push(order);
    return { order, reused: false };
  }

  async getByPublicId(tenantId: string, publicId: string) {
    return (
      this.orders.find(
        (order) => order.tenantId === tenantId && order.publicId === publicId,
      ) ?? null
    );
  }

  async getById(tenantId: string, orderId: string) {
    return (
      this.orders.find(
        (order) => order.tenantId === tenantId && order.id === orderId,
      ) ?? null
    );
  }

  async savePaymentPreference(
    tenantId: string,
    orderId: string,
    preferenceId: string,
    checkoutUrl: string,
  ) {
    const order = await this.getById(tenantId, orderId);
    assert.ok(order);
    order.paymentPreferenceId = preferenceId;
    order.paymentCheckoutUrl = checkoutUrl;
    return order;
  }

  async applyPaymentEventAtomic(
    inputValue: PaymentEventInput,
    update: PaymentStateUpdate,
  ) {
    const key = `${inputValue.tenantId}:${inputValue.eventId}`;
    const order = await this.getById(inputValue.tenantId, inputValue.orderId);
    assert.ok(order);
    const existing = this.events.get(key);
    if (existing) return { duplicate: true, order };
    const claimed = { id: String(this.events.size + 1), processed: false };
    this.events.set(key, claimed);
    this.paymentUpdates += 1;
    order.paymentStatus = update.paymentStatus;
    order.orderStatus = update.orderStatus;
    order.paymentProviderId = update.paymentProviderId;
    claimed.processed = true;
    return { duplicate: false, order };
  }
}

class FakeGateway implements PaymentGateway {
  payment: MercadoPagoPayment;
  preferenceFailures = 0;
  preferenceAttempts = 0;

  constructor(payment: MercadoPagoPayment) {
    this.payment = payment;
  }

  async createPreference(): Promise<PaymentPreferenceResult> {
    this.preferenceAttempts += 1;
    if (this.preferenceFailures > 0) {
      this.preferenceFailures -= 1;
      throw new Error("temporary preference error");
    }
    return {
      preferenceId: "preference-test",
      checkoutUrl: "https://sandbox.mercadopago.com.ar/checkout/v1/redirect",
    };
  }

  async getPayment() {
    return this.payment;
  }
}

function setup(products = [product()]) {
  const store = new FakeOrderStore();
  const repository = new RuniaOrderRepository({
    tenantId: "lombardo-test",
    productSource: new FakeProductSource(products),
    deliveryPricing: new FreeDelivery(),
    store,
  });
  return { store, repository };
}

async function createOrderForWebhook() {
  const setupValue = setup();
  const result = await setupValue.repository.createOrder(input());
  return { ...setupValue, order: result.order };
}

function paymentFor(order: OrderDraft, status: string): MercadoPagoPayment {
  return {
    id: "900001",
    status,
    externalReference: order.id,
    transactionAmount: order.total,
    currencyId: order.currency,
    liveMode: false,
    metadata: { order_id: order.id },
  };
}

test("order idempotente reutiliza la misma orden", async () => {
  const { store, repository } = setup();
  const first = await repository.createOrder(input());
  const second = await repository.createOrder(input());
  assert.equal(first.order.id, second.order.id);
  assert.equal(second.reused, true);
  assert.equal(store.orders.length, 1);
});

test("doble create concurrente no duplica órdenes", async () => {
  const { store, repository } = setup();
  const [first, second] = await Promise.all([
    repository.createOrder(input()),
    repository.createOrder(input()),
  ]);
  assert.equal(first.order.id, second.order.id);
  assert.equal(store.orders.length, 1);
});

test("PRICE_CHANGED incluye el precio autoritativo", async () => {
  const { repository } = setup([product({ price: 12_500 })]);
  await assert.rejects(
    repository.createOrder(input()),
    (error: unknown) =>
      error instanceof ServerOrderError &&
      error.code === "PRICE_CHANGED" &&
      error.priceChanges?.[0]?.currentUnitPrice === 12_500,
  );
});

test("producto inexistente es rechazado", async () => {
  const { repository } = setup([]);
  await assert.rejects(
    repository.createOrder(input()),
    (error: unknown) => error instanceof ServerOrderError && error.code === "INVALID_PRODUCT",
  );
});

test("producto no disponible es rechazado", async () => {
  const { repository } = setup([
    product({ availability: "UNAVAILABLE", stock: { available: false, quantity: 0 } }),
  ]);
  await assert.rejects(
    repository.createOrder(input()),
    (error: unknown) =>
      error instanceof ServerOrderError && error.code === "PRODUCT_UNAVAILABLE",
  );
});

test("cantidad superior al stock es rechazada", async () => {
  const { repository } = setup([product({ stock: { available: true, quantity: 1 } })]);
  await assert.rejects(
    repository.createOrder(input()),
    (error: unknown) => error instanceof ServerOrderError && error.code === "QUANTITY_INVALID",
  );
});

test("un total manipulado del navegador se ignora y se recalcula", async () => {
  const parsed = parseCreateOrderInput({ ...input(), subtotal: 1, total: 1 });
  const { repository } = setup();
  const result = await repository.createOrder(parsed);
  assert.equal(result.order.subtotal, 20_000);
  assert.equal(result.order.total, 20_000);
});

test("preference retry reutiliza la orden y vuelve a intentar", async () => {
  const { store, repository } = setup();
  const gateway = new FakeGateway({
    id: "1",
    status: "pending",
    externalReference: "1",
    transactionAmount: 20_000,
    currencyId: "ARS",
    liveMode: false,
  });
  gateway.preferenceFailures = 1;
  const coordinator = new OrderPaymentCoordinator({ orders: repository, paymentGateway: gateway });
  const first = await coordinator.createOrder(input());
  const second = await coordinator.createOrder(input());
  assert.equal(first.paymentError?.code, "PAYMENT_PREFERENCE_FAILED");
  assert.equal(second.payment?.preferenceId, "preference-test");
  assert.equal(gateway.preferenceAttempts, 2);
  assert.equal(store.orders.length, 1);
});

test("Mercado Pago usa la misma idempotency key en cada retry", async () => {
  const { repository } = setup();
  const order = (await repository.createOrder(input())).order;
  const keys: string[] = [];
  const adapter = new MercadoPagoAdapter({
    accessToken: "APP_USR_TEST_ONLY",
    appUrl: "https://sandbox.lombardo.test",
    mode: "TEST",
    fetcher: async (_url, initValue) => {
      keys.push(new Headers(initValue?.headers).get("X-Idempotency-Key") ?? "");
      return Response.json({
        id: "preference-test",
        sandbox_init_point: "https://sandbox.mercadopago.com.ar/checkout",
      });
    },
  });
  await adapter.createPreference(order);
  await adapter.createPreference(order);
  assert.deepEqual(keys, [
    preferenceIdempotencyKey(order.id),
    preferenceIdempotencyKey(order.id),
  ]);
});

test("Mercado Pago TEST exige sandbox_init_point y rechaza init_point", async () => {
  const { repository } = setup();
  const order = (await repository.createOrder(input())).order;
  const adapter = new MercadoPagoAdapter({
    accessToken: "APP_USR_TEST_ONLY",
    appUrl: "https://sandbox.lombardo.test",
    mode: "TEST",
    fetcher: async () =>
      Response.json({
        id: "preference-live-looking",
        init_point: "https://www.mercadopago.com.ar/checkout",
      }),
  });
  await assert.rejects(adapter.createPreference(order));
});

async function processStatus(status: string) {
  const { store, repository, order } = await createOrderForWebhook();
  const gateway = new FakeGateway(paymentFor(order, status));
  const service = new PaymentWebhookService({
    tenantId: "lombardo-test",
    orders: repository,
    store,
    paymentGateway: gateway,
    testMode: true,
  });
  const result = await service.process({ eventId: `event-${status}`, paymentId: "900001", payload: {} });
  return { ...result, store };
}

test("webhook approved confirma orden y pago", async () => {
  const result = await processStatus("approved");
  assert.equal(result.order.paymentStatus, "approved");
  assert.equal(result.order.orderStatus, "confirmed");
});

test("webhook rejected mantiene la orden disponible para reintento", async () => {
  const result = await processStatus("rejected");
  assert.equal(result.order.paymentStatus, "rejected");
  assert.equal(result.order.orderStatus, "pending_payment");
});

test("webhook pending mantiene pago y orden pendientes", async () => {
  const result = await processStatus("pending");
  assert.equal(result.order.paymentStatus, "pending");
  assert.equal(result.order.orderStatus, "pending_payment");
});

test("webhook duplicado no repite efectos", async () => {
  const { store, repository, order } = await createOrderForWebhook();
  const service = new PaymentWebhookService({
    tenantId: "lombardo-test",
    orders: repository,
    store,
    paymentGateway: new FakeGateway(paymentFor(order, "approved")),
  });
  const webhookInput = { eventId: "event-duplicate", paymentId: "900001", payload: {} };
  await service.process(webhookInput);
  const duplicate = await service.process(webhookInput);
  assert.equal(duplicate.duplicate, true);
  assert.equal(store.paymentUpdates, 1);
});

test("webhooks duplicados concurrentes aplican una sola transición", async () => {
  const { store, repository, order } = await createOrderForWebhook();
  const service = new PaymentWebhookService({
    tenantId: "lombardo-test",
    orders: repository,
    store,
    paymentGateway: new FakeGateway(paymentFor(order, "approved")),
  });
  const webhookInput = {
    eventId: "event-concurrent-duplicate",
    paymentId: "900001",
    payload: {},
  };
  const results = await Promise.all([
    service.process(webhookInput),
    service.process(webhookInput),
  ]);
  assert.equal(results.filter((result) => result.duplicate).length, 1);
  assert.equal(store.paymentUpdates, 1);
});

test("return success sin webhook nunca presenta pago confirmado", async () => {
  const { repository } = setup();
  const order = (await repository.createOrder(input())).order;
  const presentation = getOrderStatusPresentation(
    repository.toPublicStatus(order),
    "success",
  );
  assert.equal(presentation.heading, "PAGO PENDIENTE.");
  assert.equal(order.paymentStatus, "pending");
});

test("mapping de Mercado Pago a una orden incorrecta es rechazado", async () => {
  const { store, repository, order } = await createOrderForWebhook();
  const wrongPayment = paymentFor(order, "approved");
  wrongPayment.metadata = { order_id: "999999" };
  const service = new PaymentWebhookService({
    tenantId: "lombardo-test",
    orders: repository,
    store,
    paymentGateway: new FakeGateway(wrongPayment),
  });
  await assert.rejects(
    service.process({ eventId: "event-wrong", paymentId: "900001", payload: {} }),
    (error: unknown) => error instanceof ServerOrderError && error.code === "INVALID_REQUEST",
  );
});

test("firma de webhook válida usa HMAC y tolerancia temporal", () => {
  const timestamp = "1786377600";
  const secret = "test-webhook-secret";
  const manifest = `id:900001;request-id:request-1;ts:${timestamp};`;
  const signature = createHmac("sha256", secret).update(manifest).digest("hex");
  assert.equal(
    verifyMercadoPagoWebhookSignature({
      xSignature: `ts=${timestamp},v1=${signature}`,
      xRequestId: "request-1",
      dataId: "900001",
      secret,
      now: Number(timestamp) * 1000,
    }),
    true,
  );
});

const runiaDevEnvironment = {
  RUNIA_ENVIRONMENT: "development",
  RUNIA_TENANT_SLUG: "lombardo-dev",
  RUNIA_SUPABASE_URL: "https://runia-dev.supabase.co",
  RUNIA_SUPABASE_SECRET_KEY: "sb_secret_12345678901234567890",
  VERCEL_ENV: "preview",
};

test("Runia Dev rechaza deployments productivos", () => {
  assert.throws(
    () =>
      readRuniaDevConfiguration({
        ...runiaDevEnvironment,
        VERCEL_ENV: "production",
      }),
    (error: unknown) =>
      error instanceof ServerOrderError && error.code === "SERVER_NOT_CONFIGURED",
  );
});

test("Mercado Pago TEST rechaza el dominio productivo", () => {
  assert.throws(
    () =>
      readMercadoPagoTestConfiguration({
        ...runiaDevEnvironment,
        PAYMENTS_ENABLED: "true",
        MERCADO_PAGO_MODE: "TEST",
        MERCADO_PAGO_ACCESS_TOKEN: "APP_USR_TEST",
        MERCADO_PAGO_WEBHOOK_SECRET: "webhook-test",
        APP_URL: "https://www.lombardomercato.com",
      }),
    (error: unknown) =>
      error instanceof ServerOrderError && error.code === "SERVER_NOT_CONFIGURED",
  );
});

test("RuniaCommerceProvider consume sólo el mapping SAFE habilitado", async () => {
  let requestedUrl = "";
  const provider = new RuniaCommerceProvider({
    url: runiaDevEnvironment.RUNIA_SUPABASE_URL,
    secretKey: runiaDevEnvironment.RUNIA_SUPABASE_SECRET_KEY,
    tenantSlug: runiaDevEnvironment.RUNIA_TENANT_SLUG,
    fetcher: async (url) => {
      requestedUrl = String(url);
      return Response.json([
        {
          public_product_id: "mock-casa-nueve-malbec",
          runia_product_id: "runia-product-001",
          runia_sku: "RUNIA-SAFE-001",
          display_name: "Producto Runia Dev",
          eligibility_status: "safe",
          lombardo_sale_price: 17_500,
          currency: "ARS",
          available_now: true,
          sandbox_quantity: 4,
          enabled_for_sandbox: true,
        },
      ]);
    },
  });
  const products = await provider.getProducts();
  assert.match(requestedUrl, /eligibility_status=eq\.safe/);
  assert.match(requestedUrl, /enabled_for_sandbox=is\.true/);
  assert.equal(products.length, 1);
  assert.equal(products[0]?.sourceProductId, "runia-product-001");
  assert.equal(products[0]?.price, 17_500);
  assert.equal(products[0]?.stock.quantity, 4);
});

test("RuniaCommerceProvider rechaza filas no SAFE aunque el backend las entregue", async () => {
  const provider = new RuniaCommerceProvider({
    url: runiaDevEnvironment.RUNIA_SUPABASE_URL,
    secretKey: runiaDevEnvironment.RUNIA_SUPABASE_SECRET_KEY,
    tenantSlug: runiaDevEnvironment.RUNIA_TENANT_SLUG,
    fetcher: async () =>
      Response.json([
        {
          public_product_id: "mock-casa-nueve-malbec",
          runia_product_id: "runia-product-blocked",
          runia_sku: "RUNIA-BLOCKED",
          display_name: "Producto bloqueado",
          eligibility_status: "blocked",
          lombardo_sale_price: 17_500,
          currency: "ARS",
          available_now: true,
          sandbox_quantity: 4,
          enabled_for_sandbox: true,
        },
      ]),
  });
  await assert.rejects(
    provider.getProducts(),
    (error: unknown) =>
      error instanceof ServerOrderError && error.code === "SERVER_NOT_CONFIGURED",
  );
});

test("Runia Dev rechaza una publishable key en el servidor", () => {
  assert.throws(
    () =>
      readRuniaDevConfiguration({
        ...runiaDevEnvironment,
        RUNIA_SUPABASE_SECRET_KEY: "sb_publishable_public_value",
      }),
    (error: unknown) =>
      error instanceof ServerOrderError && error.code === "SERVER_NOT_CONFIGURED",
  );
});

test("logging DEV limita la salida a identificadores operativos", () => {
  const lines: string[] = [];
  logDevCommerce(
    "payment.transition",
    {
      orderId: "1\nforged",
      publicId: "public-1",
      paymentId: "payment-1",
      toPaymentStatus: "approved",
    },
    {
      env: { RUNIA_ENVIRONMENT: "development" },
      sink: (line) => lines.push(line),
    },
  );
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0] ?? "", /\nforged/);
  assert.doesNotMatch(lines[0] ?? "", /token|email|whatsapp/i);
});

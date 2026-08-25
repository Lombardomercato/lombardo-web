import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { RuniaCommerceProvider } from "../lib/commerce/runia-commerce-provider.ts";
import {
  buildWhatsAppCoordinationMessage,
  buildWhatsAppCoordinationUrl,
} from "../lib/checkout/whatsapp-coordination.ts";
import { getOrderStatusPresentation } from "../lib/order-status/presentation.ts";
import { logDevCommerce } from "../lib/server/dev-commerce-logger.ts";
import {
  readMercadoPagoConfiguration,
  readMercadoPagoTestConfiguration,
  readRuniaConfiguration,
  readWhatsAppOrderNotificationConfiguration,
} from "../lib/server/environment.ts";
import { readJsonBody } from "../lib/server/request-body.ts";
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
import type {
  ClaimedOrderNotification,
  NewOrderNotifier,
} from "../lib/server/notifications/types.ts";
import { PaymentWebhookService } from "../lib/server/payments/payment-webhook-service.ts";
import {
  inspectMercadoPagoWebhookSignature,
  verifyMercadoPagoWebhookSignature,
} from "../lib/server/payments/webhook-signature.ts";
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

  async savePaymentMethod(
    tenantId: string,
    orderId: string,
    paymentMethod: OrderDraft["paymentMethod"],
  ) {
    const order = await this.getById(tenantId, orderId);
    assert.ok(order);
    assert.equal(order.orderStatus, "pending_payment");
    assert.equal(order.paymentStatus, "pending");
    order.paymentMethod = paymentMethod;
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

class FakeNewOrderNotifier implements NewOrderNotifier {
  attempts = 0;
  shouldFail = false;

  async notify(order: OrderDraft): Promise<ClaimedOrderNotification> {
    this.attempts += 1;
    if (this.shouldFail) throw new Error("notification store unavailable");
    return this.result(order);
  }

  async retry(order: OrderDraft): Promise<ClaimedOrderNotification> {
    return this.result(order);
  }

  private result(order: OrderDraft): ClaimedOrderNotification {
    const now = new Date().toISOString();
    return {
      claimed: true,
      notification: {
        id: "notification-1",
        orderId: order.id,
        kind: "new_order",
        channel: "whatsapp_cloud_api",
        status: "sent",
        attemptCount: 1,
        createdAt: now,
        updatedAt: now,
      },
    };
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

test("sin gateway la orden queda pendiente y pasa a coordinación por WhatsApp", async () => {
  const { repository } = setup();
  const coordinator = new OrderPaymentCoordinator({
    orders: repository,
    paymentGateway: null,
  });
  const result = await coordinator.createOrder(input());
  assert.equal(result.order.paymentMethod, "whatsapp_coordination");
  assert.equal(result.order.orderStatus, "pending_payment");
  assert.equal(result.order.paymentStatus, "pending");
  assert.equal(result.payment, null);
  assert.equal(result.paymentError, undefined);
});

test("el aviso de orden nueva no se duplica cuando la API reutiliza la orden", async () => {
  const { repository } = setup();
  const notifier = new FakeNewOrderNotifier();
  const coordinator = new OrderPaymentCoordinator({
    orders: repository,
    paymentGateway: null,
    newOrderNotifier: notifier,
  });
  await coordinator.createOrder(input());
  await coordinator.createOrder(input());
  assert.equal(notifier.attempts, 1);
});

test("una falla del aviso no impide crear ni devolver la orden", async () => {
  const { store, repository } = setup();
  const notifier = new FakeNewOrderNotifier();
  notifier.shouldFail = true;
  const coordinator = new OrderPaymentCoordinator({
    orders: repository,
    paymentGateway: null,
    newOrderNotifier: notifier,
  });
  const result = await coordinator.createOrder(input());
  assert.equal(result.order.id, "1");
  assert.equal(store.orders.length, 1);
  assert.equal(result.order.paymentStatus, "pending");
});

test("aviso interno y confirmación al cliente se ejecutan una vez y se aíslan entre sí", async () => {
  const { repository } = setup();
  const operationalNotifier = new FakeNewOrderNotifier();
  const customerNotifier = new FakeNewOrderNotifier();
  operationalNotifier.shouldFail = true;
  const coordinator = new OrderPaymentCoordinator({
    orders: repository,
    paymentGateway: null,
    newOrderNotifiers: [operationalNotifier, customerNotifier],
  });
  const first = await coordinator.createOrder(input());
  const second = await coordinator.createOrder(input());
  assert.equal(first.order.id, second.order.id);
  assert.equal(second.reused, true);
  assert.equal(operationalNotifier.attempts, 1);
  assert.equal(customerNotifier.attempts, 1);
});

test("el mensaje de coordinación contiene el pedido y omite email y DNI", async () => {
  const { repository } = setup();
  const order = (
    await repository.createOrder(
      input({
        customer: {
          firstName: "Alex",
          lastName: "Santillán",
          whatsapp: "+5493415550000",
          email: "sensible@example.com",
          dni: "12345678",
        },
      }),
    )
  ).order;
  const message = buildWhatsAppCoordinationMessage(order);
  const url = buildWhatsAppCoordinationUrl(order, "https://wa.me/5493415887708");
  assert.match(message, new RegExp(order.publicId.slice(0, 8).toUpperCase()));
  assert.match(message, /2 × Producto uno/);
  assert.match(message, /\$ 20\.000/);
  assert.match(message, /Retiro en Lombardo/);
  assert.match(message, /Alex Santillán/);
  assert.match(message, /\+5493415550000/);
  assert.doesNotMatch(message, /sensible@example\.com/);
  assert.doesNotMatch(message, /12345678/);
  assert.equal(url ? new URL(url).pathname : "", "/5493415887708");
});

test("una orden coordinada muestra PAGO A COORDINAR sin confirmarla", async () => {
  const { repository } = setup();
  const order = (await repository.createOrder(input())).order;
  order.paymentMethod = "whatsapp_coordination";
  const presentation = getOrderStatusPresentation(repository.toPublicStatus(order));
  assert.equal(presentation.heading, "PAGO A COORDINAR.");
  assert.equal(order.orderStatus, "pending_payment");
  assert.equal(order.paymentStatus, "pending");
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
    sellerId: "3605075037",
    fetcher: async (_url, initValue) => {
      keys.push(new Headers(initValue?.headers).get("X-Idempotency-Key") ?? "");
      return Response.json({
        collector_id: 3605075037,
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
    sellerId: "3605075037",
    fetcher: async () =>
      Response.json({
        collector_id: 3605075037,
        id: "preference-live-looking",
        init_point: "https://www.mercadopago.com.ar/checkout",
      }),
  });
  await assert.rejects(adapter.createPreference(order));
});

test("Mercado Pago LIVE usa init_point y valida el seller", async () => {
  const { repository } = setup();
  const order = (await repository.createOrder(input())).order;
  const adapter = new MercadoPagoAdapter({
    accessToken: "APP_USR_LIVE_ONLY",
    appUrl: "https://www.lombardomercato.com",
    mode: "LIVE",
    sellerId: "123456789",
    fetcher: async () =>
      Response.json({
        collector_id: 123456789,
        id: "preference-live",
        init_point: "https://www.mercadopago.com.ar/checkout",
        sandbox_init_point: "https://sandbox.mercadopago.com.ar/checkout",
      }),
  });
  const preference = await adapter.createPreference(order);
  assert.equal(preference.preferenceId, "preference-live");
  assert.match(preference.checkoutUrl, /^https:\/\/www\.mercadopago\.com\.ar\//);
});

test("Mercado Pago rechaza una preferencia de otro seller", async () => {
  const { repository } = setup();
  const order = (await repository.createOrder(input())).order;
  const adapter = new MercadoPagoAdapter({
    accessToken: "APP_USR_LIVE_ONLY",
    appUrl: "https://www.lombardomercato.com",
    mode: "LIVE",
    sellerId: "123456789",
    fetcher: async () =>
      Response.json({
        collector_id: 987654321,
        id: "preference-wrong-seller",
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
    expectedLiveMode: false,
  });
  const result = await service.process({ eventId: `event-${status}`, paymentId: "900001", payload: {} });
  return { ...result, store };
}

test("webhook approved confirma orden y pago", async () => {
  const result = await processStatus("approved");
  assert.equal(result.order.paymentStatus, "approved");
  assert.equal(result.order.orderStatus, "confirmed");
});

test("webhook LIVE rechaza un payment TEST", async () => {
  const { store, repository, order } = await createOrderForWebhook();
  const service = new PaymentWebhookService({
    tenantId: "lombardo-test",
    orders: repository,
    store,
    paymentGateway: new FakeGateway(paymentFor(order, "approved")),
    expectedLiveMode: true,
  });
  await assert.rejects(
    service.process({ eventId: "event-test-in-live", paymentId: "900001", payload: {} }),
    (error: unknown) =>
      error instanceof ServerOrderError && error.code === "INVALID_REQUEST",
  );
  assert.equal(store.paymentUpdates, 0);
});

test("webhook LIVE aprobado confirma orden y pago LIVE", async () => {
  const { store, repository, order } = await createOrderForWebhook();
  const livePayment = { ...paymentFor(order, "approved"), liveMode: true };
  const service = new PaymentWebhookService({
    tenantId: "lombardo-test",
    orders: repository,
    store,
    paymentGateway: new FakeGateway(livePayment),
    expectedLiveMode: true,
  });
  const result = await service.process({
    eventId: "event-approved-live",
    paymentId: "900001",
    payload: {},
  });
  assert.equal(result.order.paymentStatus, "approved");
  assert.equal(result.order.orderStatus, "confirmed");
  assert.equal(store.paymentUpdates, 1);
});

test("webhook TEST rechaza un payment LIVE", async () => {
  const { store, repository, order } = await createOrderForWebhook();
  const livePayment = { ...paymentFor(order, "approved"), liveMode: true };
  const service = new PaymentWebhookService({
    tenantId: "lombardo-test",
    orders: repository,
    store,
    paymentGateway: new FakeGateway(livePayment),
    expectedLiveMode: false,
  });
  await assert.rejects(
    service.process({ eventId: "event-live-in-test", paymentId: "900001", payload: {} }),
    (error: unknown) =>
      error instanceof ServerOrderError && error.code === "INVALID_REQUEST",
  );
  assert.equal(store.paymentUpdates, 0);
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

test("fixture LIVE observado valida payment.created con data.id numérico", () => {
  const timestamp = "1787586833";
  const secret = "live-fixture-secret";
  const requestId = "4ed4fa2b-0b31-42ec-a62f-ad793c486c59";
  const dataId = "174467953181";
  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const signature = createHmac("sha256", secret).update(manifest).digest("hex");

  assert.deepEqual(
    inspectMercadoPagoWebhookSignature({
      xSignature: `ts=${timestamp},v1=${signature}`,
      xRequestId: requestId,
      dataId,
      secret,
      now: Date.parse("2026-08-24T15:53:53Z"),
    }),
    { valid: true },
  );
});

test("manifest omite pares ausentes y preserva el case de data.id", () => {
  const timestamp = "1787586833";
  const secret = "case-sensitive-fixture-secret";
  const dataId = "ORD01JQ4S4KY8HWQ6NA5PXB65B3D3";
  const signature = createHmac("sha256", secret)
    .update(`id:${dataId};ts:${timestamp};`)
    .digest("hex");

  assert.equal(
    verifyMercadoPagoWebhookSignature({
      xSignature: `TS=${timestamp},V1=${signature}`,
      xRequestId: null,
      dataId,
      secret,
      now: Number(timestamp) * 1000,
    }),
    true,
  );
});

test("firma realmente inválida conserva 401 diagnosticable", () => {
  const timestamp = "1787586833";
  assert.deepEqual(
    inspectMercadoPagoWebhookSignature({
      xSignature: `ts=${timestamp},v1=${"0".repeat(64)}`,
      xRequestId: "request-live-fixture",
      dataId: "174467953181",
      secret: "live-fixture-secret",
      now: Number(timestamp) * 1000,
    }),
    { valid: false, reason: "signature_mismatch" },
  );
});

const runiaDevEnvironment = {
  RUNIA_ENVIRONMENT: "development",
  RUNIA_TENANT_SLUG: "lombardo-dev",
  RUNIA_SUPABASE_URL: "https://rtnzzfzofeqmtdmbchbw.supabase.co",
  RUNIA_SUPABASE_SECRET_KEY: "sb_secret_12345678901234567890",
  VERCEL_ENV: "preview",
};

test("un deployment productivo rechaza Runia Dev", () => {
  assert.throws(
    () =>
      readRuniaConfiguration({
        ...runiaDevEnvironment,
        VERCEL_ENV: "production",
      }),
    (error: unknown) =>
      error instanceof ServerOrderError && error.code === "SERVER_NOT_CONFIGURED",
  );
});

test("Production acepta únicamente una configuración Runia Production server-only", () => {
  const configuration = readRuniaConfiguration({
    ...runiaDevEnvironment,
    RUNIA_ENVIRONMENT: "production",
    RUNIA_TENANT_SLUG: "lombardo-production",
    RUNIA_SUPABASE_URL: "https://ymowgnjusqzkqjpwokib.supabase.co",
    VERCEL_ENV: "production",
  });
  assert.equal(configuration.environment, "production");
  assert.equal(configuration.tenantSlug, "lombardo-production");
});

test("Production rechaza el project ref de Runia Dev aunque el flag diga production", () => {
  assert.throws(
    () =>
      readRuniaConfiguration({
        ...runiaDevEnvironment,
        RUNIA_ENVIRONMENT: "production",
        VERCEL_ENV: "production",
      }),
    (error: unknown) =>
      error instanceof ServerOrderError && error.code === "SERVER_NOT_CONFIGURED",
  );
});

test("Preview rechaza credenciales de Runia Production", () => {
  assert.throws(
    () =>
      readRuniaConfiguration({
        ...runiaDevEnvironment,
        RUNIA_ENVIRONMENT: "production",
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
        MERCADO_PAGO_SELLER_ID: "3605075037",
        MERCADO_PAGO_ACCESS_TOKEN: "APP_USR_TEST",
        MERCADO_PAGO_WEBHOOK_SECRET: "webhook-test",
        APP_URL: "https://www.lombardomercato.com",
      }),
    (error: unknown) =>
      error instanceof ServerOrderError && error.code === "SERVER_NOT_CONFIGURED",
  );
});

test("Mercado Pago TEST admite un proyecto Sandbox productivo fuera del dominio oficial", () => {
  const configuration = readMercadoPagoTestConfiguration({
    ...runiaDevEnvironment,
    RUNIA_ENVIRONMENT: "production",
    RUNIA_SUPABASE_URL: "https://ymowgnjusqzkqjpwokib.supabase.co",
    VERCEL_ENV: "production",
    PAYMENTS_ENABLED: "true",
    MERCADO_PAGO_MODE: "TEST",
    MERCADO_PAGO_SELLER_ID: "3605075037",
    MERCADO_PAGO_ACCESS_TOKEN: "APP_USR-TEST",
    MERCADO_PAGO_WEBHOOK_SECRET: "webhook-test",
    APP_URL: "https://lombardo-sandbox-dev.vercel.app",
  });
  assert.equal(configuration.mode, "TEST");
});

test("Mercado Pago LIVE exige Runia Production y el dominio www oficial", () => {
  const configuration = readMercadoPagoConfiguration({
    ...runiaDevEnvironment,
    RUNIA_ENVIRONMENT: "production",
    RUNIA_SUPABASE_URL: "https://ymowgnjusqzkqjpwokib.supabase.co",
    VERCEL_ENV: "production",
    PAYMENTS_ENABLED: "false",
    MERCADO_PAGO_MODE: "LIVE",
    MERCADO_PAGO_SELLER_ID: "123456789",
    MERCADO_PAGO_ACCESS_TOKEN: "APP_USR-LIVE",
    MERCADO_PAGO_WEBHOOK_SECRET: "webhook-live",
    APP_URL: "https://www.lombardomercato.com",
  });
  assert.equal(configuration.mode, "LIVE");
  assert.equal(configuration.appUrl, "https://www.lombardomercato.com");
});

test("WhatsApp Cloud API exige configuración server-only y dominio Admin oficial", () => {
  const configuration = readWhatsAppOrderNotificationConfiguration({
    WHATSAPP_ORDER_NOTIFICATIONS_ENABLED: "true",
    APP_URL: "https://www.lombardomercato.com",
    WHATSAPP_CLOUD_API_PHONE_NUMBER_ID: "123456789012345",
    WHATSAPP_CLOUD_API_ACCESS_TOKEN: `test-token-${"x".repeat(60)}`,
    WHATSAPP_ORDER_NOTIFICATION_RECIPIENT: "+5493415887708",
    WHATSAPP_ORDER_TEMPLATE_NAME: "lombardo_nuevo_pedido",
    WHATSAPP_ORDER_TEMPLATE_LANGUAGE: "es_AR",
    WHATSAPP_CLOUD_API_VERSION: "v25.0",
  });
  assert.equal(configuration.recipient, "5493415887708");
  assert.equal(
    configuration.adminUrl,
    "https://www.lombardomercato.com/admin",
  );
  assert.equal("accessToken" in configuration, true);
});

test("RuniaCommerceProvider pagina directamente los supplier_products SAFE", async () => {
  const requestedUrls: string[] = [];
  const provider = new RuniaCommerceProvider({
    url: runiaDevEnvironment.RUNIA_SUPABASE_URL,
    secretKey: runiaDevEnvironment.RUNIA_SUPABASE_SECRET_KEY,
    tenantSlug: runiaDevEnvironment.RUNIA_TENANT_SLUG,
    fetcher: async (url) => {
      requestedUrls.push(String(url));
      if (String(url).includes("/rest/v1/suppliers?")) {
        return Response.json([
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "VINROS",
            active: true,
            tenants: { slug: "lombardo-dev", status: "active" },
          },
        ]);
      }
      return Response.json(
        [
          {
            runia_product_id: "11111111-1111-4111-8111-111111111111",
            supplier_sku: "VIN001B",
            name_raw: "BODEGA RUNIA Malbec x 750 c.c.",
            presentation_raw: "750cc",
            normalized_presentation: "750 ml",
            active: true,
            eligibility_status: "safe",
            retail_prices: [{ price_type: "retail", current_price: 17_500 }],
          },
        ],
        { headers: { "Content-Range": "0-0/3265" } },
      );
    },
  });
  const page = await provider.getProductPage();
  assert.equal(requestedUrls.length, 2);
  assert.match(requestedUrls[0] ?? "", /\/rest\/v1\/suppliers\?/);
  assert.equal(
    new URL(requestedUrls[0] ?? "https://invalid").searchParams.get("code"),
    "eq.vinros",
  );
  assert.match(requestedUrls[1] ?? "", /\/rest\/v1\/supplier_products\?/);
  assert.match(requestedUrls[1] ?? "", /eligibility_status=eq\.safe/);
  assert.match(requestedUrls[1] ?? "", /retail_prices\.price_type=eq\.retail/);
  assert.doesNotMatch(requestedUrls.join("\n"), /commerce_lombardo_dev_product_adapter/);
  assert.equal(page.total, 3265);
  assert.equal(page.products.length, 1);
  assert.equal(
    page.products[0]?.sourceProductId,
    "11111111-1111-4111-8111-111111111111",
  );
  assert.equal(page.products[0]?.sku, "VIN001B");
  assert.equal(page.products[0]?.name, "BODEGA RUNIA Malbec x 750 c.c.");
  assert.equal(page.products[0]?.brand.name, "BODEGA RUNIA");
  assert.equal(page.products[0]?.category.name, "Vinos");
  assert.equal(page.products[0]?.presentation, "750 ml");
  assert.equal(page.products[0]?.price, 17_500);
  assert.equal(page.products[0]?.availability, "SUPPLIER_AVAILABLE");
  assert.equal(page.products[0]?.stock.quantity, 0);

  const product = page.products[0];
  assert.ok(product);
  const detail = await provider.getProductBySlug(product.slug);
  const cartProducts = await provider.getProductsByIds([product.id]);
  assert.equal(detail?.id, product.id);
  assert.equal(cartProducts[0]?.id, product.id);
  assert.equal(requestedUrls.length, 4);
  assert.equal(
    new URL(requestedUrls[2] ?? "https://invalid").searchParams.get("id"),
    "eq.11111111-1111-4111-8111-111111111111",
  );
  assert.equal(
    new URL(requestedUrls[3] ?? "https://invalid").searchParams.get("id"),
    "in.(11111111-1111-4111-8111-111111111111)",
  );
});

test("RuniaCommerceProvider rechaza filas no SAFE aunque el backend las entregue", async () => {
  const provider = new RuniaCommerceProvider({
    url: runiaDevEnvironment.RUNIA_SUPABASE_URL,
    secretKey: runiaDevEnvironment.RUNIA_SUPABASE_SECRET_KEY,
    tenantSlug: runiaDevEnvironment.RUNIA_TENANT_SLUG,
    fetcher: async (url) => {
      if (String(url).includes("/rest/v1/suppliers?")) {
        return Response.json([
          {
            id: "22222222-2222-4222-8222-222222222222",
            name: "VINROS",
            active: true,
            tenants: { slug: "lombardo-dev", status: "active" },
          },
        ]);
      }
      return Response.json(
        [
          {
            runia_product_id: "33333333-3333-4333-8333-333333333333",
            supplier_sku: "RUNIABLOCKED",
            name_raw: "Producto bloqueado",
            presentation_raw: "750cc",
            normalized_presentation: "750 ml",
            active: true,
            eligibility_status: "blocked",
            retail_prices: [{ price_type: "retail", current_price: 17_500 }],
          },
        ],
        { headers: { "Content-Range": "0-0/1" } },
      );
    },
  });
  await assert.rejects(
    provider.getProductPage(),
    (error: unknown) =>
      error instanceof ServerOrderError && error.code === "SERVER_NOT_CONFIGURED",
  );
});

test("Runia rechaza una publishable key en el servidor", () => {
  assert.throws(
    () =>
      readRuniaConfiguration({
        ...runiaDevEnvironment,
        RUNIA_SUPABASE_SECRET_KEY: "sb_publishable_public_value",
      }),
    (error: unknown) =>
      error instanceof ServerOrderError && error.code === "SERVER_NOT_CONFIGURED",
  );
});

test("logging estructurado limita la salida a identificadores operativos", () => {
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

test("logging estructurado permanece activo en Production sin datos personales", () => {
  const lines: string[] = [];
  logDevCommerce(
    "order.created",
    { orderId: "42", requestId: "gru1::request", publicId: "public-42" },
    {
      env: { RUNIA_ENVIRONMENT: "production", VERCEL_ENV: "production" },
      sink: (line) => lines.push(line),
    },
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? "", /lombardo-commerce/);
  assert.match(lines[0] ?? "", /production/);
  assert.doesNotMatch(lines[0] ?? "", /email|whatsapp|secret|token/i);
});

test("el límite de payload se aplica aunque falte Content-Length", async () => {
  const request = new Request("https://lombardo.test/api/orders", {
    method: "POST",
    body: JSON.stringify({ value: "x".repeat(100) }),
  });
  await assert.rejects(
    readJsonBody(request, 32, "El pedido recibido es demasiado grande."),
    (error: unknown) =>
      error instanceof ServerOrderError && error.status === 413,
  );
});

test("JSON malformado recibe un error controlado", async () => {
  const request = new Request("https://lombardo.test/api/orders", {
    method: "POST",
    body: "{not-json",
  });
  await assert.rejects(
    readJsonBody(request, 1_000, "El pedido recibido es demasiado grande."),
    (error: unknown) =>
      error instanceof ServerOrderError && error.status === 400,
  );
});

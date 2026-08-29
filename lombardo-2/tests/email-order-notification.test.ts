import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNewOrderEmail,
  EmailOrderNotificationService,
} from "../lib/server/notifications/email-order-notification-service.ts";
import { OrderNotificationProviderError } from "../lib/server/notifications/provider-error.ts";
import { ResendEmailApi } from "../lib/server/notifications/resend-email-api.ts";
import type {
  ClaimedOrderNotification,
  EmailOrderMessage,
  EmailOrderProvider,
  OrderNotificationStore,
} from "../lib/server/notifications/types.ts";
import type { OrderDraft } from "../types/checkout.ts";

function order(): OrderDraft {
  const now = new Date().toISOString();
  return {
    id: "42",
    publicId: "12345678-1234-4123-8123-123456789abc",
    tenantId: "lombardo",
    tenantRecordId: "11111111-1111-4111-8111-111111111111",
    pricingPolicy: "RETAIL",
    discountPercent: 0,
    customer: {
      firstName: "Ana",
      lastName: "Pérez",
      whatsapp: "+5493415550000",
      email: "ana@example.com",
      dni: "87654321",
    },
    items: [{
      productId: "product-1",
      sku: "SKU-1",
      name: "Producto uno",
      baseUnitPrice: 10_000,
      priceType: "retail",
      pricingPolicy: "RETAIL",
      discountPercent: 0,
      discountAmount: 0,
      unitPrice: 10_000,
      quantity: 2,
      lineBaseTotal: 20_000,
      lineDiscount: 0,
      lineTotal: 20_000,
    }],
    baseSubtotal: 20_000,
    pricingDiscountAmount: 0,
    subtotal: 20_000,
    deliveryCost: 0,
    total: 20_000,
    currency: "ARS",
    deliveryMethod: "PICKUP",
    deliveryCostMode: "FREE",
    orderStatus: "pending_payment",
    paymentStatus: "pending",
    paymentMethod: "whatsapp_coordination",
    checkoutSessionId: "checkout_1234567890abcdef",
    idempotencyKey: "idempotency_1234567890abcdef",
    createdAt: now,
    updatedAt: now,
  };
}

class FakeStore implements OrderNotificationStore {
  status: "pending" | "sending" | "sent" | "failed" | "unknown" = "pending";
  attempts = 0;

  async claim(
    _tenantId: string,
    orderId: string,
    allowRetry: boolean,
  ): Promise<ClaimedOrderNotification> {
    const claimed = this.status === "pending" || (allowRetry && this.status === "failed");
    if (claimed) {
      this.status = "sending";
      this.attempts += 1;
    }
    const now = new Date().toISOString();
    return {
      claimed,
      notification: {
        id: "1",
        orderId,
        kind: "new_order",
        channel: "email_resend",
        status: this.status,
        attemptCount: this.attempts,
        createdAt: now,
        updatedAt: now,
      },
    };
  }

  async markSent() {
    this.status = "sent";
  }

  async markFailed(
    _tenantId: string,
    _notificationId: string,
    status: "failed" | "unknown",
  ) {
    this.status = status;
  }
}

class FakeEmailProvider implements EmailOrderProvider {
  messages: EmailOrderMessage[] = [];
  error?: OrderNotificationProviderError;

  async send(message: EmailOrderMessage) {
    this.messages.push(message);
    if (this.error) throw this.error;
    return { messageId: "email_test" };
  }
}

function setup() {
  const store = new FakeStore();
  const provider = new FakeEmailProvider();
  const service = new EmailOrderNotificationService({
    store,
    configurationFactory: () => ({
      provider,
      recipient: "operaciones@lombardomercato.com",
      sender: "Lombardo <pedidos@avisos.lombardomercato.com>",
      adminUrl: "https://www.lombardomercato.com/admin",
    }),
  });
  return { store, provider, service };
}

test("el email operativo se envía exactamente una vez por pedido", async () => {
  const { store, provider, service } = setup();
  const value = order();
  await service.notify(value);
  await service.notify(value);
  assert.equal(store.attempts, 1);
  assert.equal(provider.messages.length, 1);
  assert.equal(store.status, "sent");
});

test("el email contiene sólo los datos operativos aprobados", () => {
  const message = buildNewOrderEmail(
    order(),
    "https://www.lombardomercato.com/admin",
  );
  assert.match(message.subject, /12345678/);
  assert.match(message.text, /Ana Pérez/);
  assert.match(message.text, /\$ 20\.000/);
  assert.match(message.text, /Retiro en Lombardo/);
  assert.match(message.text, /Pendiente/);
  assert.match(message.text, /\/admin\/pedidos\/12345678-/);
  assert.doesNotMatch(
    `${message.text}${message.html}`,
    /ana@example\.com|87654321|\+5493415550000|Producto uno|SKU-1/,
  );
});

test("un rechazo de email no falla la orden y admite reintento manual", async () => {
  const { store, provider, service } = setup();
  provider.error = new OrderNotificationProviderError(
    "RESEND_VALIDATION_ERROR",
    "El proveedor rechazó el envío.",
    "rejected",
  );
  await service.notify(order());
  assert.equal(store.status, "failed");
  provider.error = undefined;
  await service.retry(order());
  assert.equal(store.status, "sent");
  assert.equal(store.attempts, 2);
});

test("Resend recibe contenido e idempotencia sólo por server-side", async () => {
  let request: RequestInit | undefined;
  const provider = new ResendEmailApi({
    apiKey: "re_test_secret_value_123456",
    fetcher: async (_input, init) => {
      request = init;
      return new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  const result = await provider.send({
    from: "Lombardo <pedidos@avisos.lombardomercato.com>",
    recipient: "operaciones@lombardomercato.com",
    subject: "Nuevo pedido",
    text: "Pedido",
    html: "<p>Pedido</p>",
    idempotencyKey: "lombardo-new-order-42",
  });
  assert.equal(result.messageId, "email_123");
  assert.equal(
    (request?.headers as Record<string, string>)["Idempotency-Key"],
    "lombardo-new-order-42",
  );
  assert.match(
    (request?.headers as Record<string, string>).Authorization,
    /^Bearer re_/,
  );
});

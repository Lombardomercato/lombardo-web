import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomerOrderConfirmationEmail,
  CustomerOrderConfirmationService,
} from "../lib/server/notifications/customer-order-confirmation-service.ts";
import { OrderNotificationProviderError } from "../lib/server/notifications/provider-error.ts";
import { SupabaseOrderNotificationStore } from "../lib/server/notifications/supabase-order-notification-store.ts";
import type {
  ClaimedOrderNotification,
  EmailOrderMessage,
  EmailOrderProvider,
  OrderNotificationStore,
} from "../lib/server/notifications/types.ts";
import type { OrderDraft } from "../types/checkout.ts";

function order(overrides: Partial<OrderDraft> = {}): OrderDraft {
  const now = new Date().toISOString();
  return {
    id: "77",
    publicId: "87654321-1234-4123-8123-123456789abc",
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
    items: [
      {
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
      },
    ],
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
    ...overrides,
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
    const claimed =
      this.status === "pending" || (allowRetry && this.status === "failed");
    if (claimed) {
      this.status = "sending";
      this.attempts += 1;
    }
    const now = new Date().toISOString();
    return {
      claimed,
      notification: {
        id: "2",
        orderId,
        kind: "customer_order_confirmation",
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

class FakeProvider implements EmailOrderProvider {
  messages: EmailOrderMessage[] = [];
  error?: OrderNotificationProviderError;

  async send(message: EmailOrderMessage) {
    this.messages.push(message);
    if (this.error) throw this.error;
    return { messageId: "email_customer_test" };
  }
}

function setup() {
  const store = new FakeStore();
  const provider = new FakeProvider();
  const service = new CustomerOrderConfirmationService({
    store,
    configurationFactory: () => ({
      provider,
      sender: "Lombardo <pedidos@avisos.lombardomercato.com>",
      appUrl: "https://www.lombardomercato.com",
    }),
  });
  return { store, provider, service };
}

test("la confirmación se envía una sola vez al email del cliente", async () => {
  const { store, provider, service } = setup();
  const value = order();
  await service.notify(value);
  await service.notify(value);
  assert.equal(provider.messages.length, 1);
  assert.equal(provider.messages[0]?.recipient, "ana@example.com");
  assert.equal(store.attempts, 1);
  assert.equal(store.status, "sent");
});

test("la confirmación incluye pedido, productos, total, entrega, pago y estado público", () => {
  const message = buildCustomerOrderConfirmationEmail(
    order(),
    "https://www.lombardomercato.com",
  );
  assert.match(message.subject, /87654321/);
  assert.match(message.text, /2 × Producto uno/);
  assert.match(message.text, /\$ 20\.000/);
  assert.match(message.text, /Retiro en Lombardo/);
  assert.match(message.text, /pago todavía debe coordinarse/i);
  assert.match(message.text, /\/pedido\/87654321-/);
  assert.doesNotMatch(
    `${message.text}${message.html}`,
    /\+5493415550000|ana@example\.com|SKU-1|DNI/,
  );
});

test("una confirmación rechazada no se duplica y admite reintento", async () => {
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

test("el email aprobado informa el pago sin pedir coordinación", () => {
  const message = buildCustomerOrderConfirmationEmail(
    order({ paymentStatus: "approved", paymentMethod: "mercado_pago" }),
    "https://www.lombardomercato.com",
  );
  assert.match(message.text, /Pago aprobado/);
  assert.doesNotMatch(message.text, /coordinarse/);
});

test("el outbox reserva una fila separada para la confirmación del cliente", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const now = new Date().toISOString();
  const store = new SupabaseOrderNotificationStore({
    url: "https://runia.example",
    secretKey: "sb_secret_test_only",
    channel: "email_resend",
    kind: "customer_order_confirmation",
    fetcher: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json([
        {
          claimed: true,
          notification_record: {
            id: 2,
            order_id: 77,
            kind: "customer_order_confirmation",
            channel: "email_resend",
            status: "sending",
            attempt_count: 1,
            provider_message_id: null,
            last_error_code: null,
            last_error_summary: null,
            sent_at: null,
            created_at: now,
            updated_at: now,
          },
        },
      ]);
    },
  });
  const result = await store.claim("lombardo", "77", false);
  assert.equal(result.notification.kind, "customer_order_confirmation");
  assert.equal(requestBody?.p_kind, "customer_order_confirmation");
  assert.equal(requestBody?.p_channel, "email_resend");
});

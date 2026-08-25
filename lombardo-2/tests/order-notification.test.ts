import assert from "node:assert/strict";
import test from "node:test";
import { OrderNotificationService } from "../lib/server/notifications/order-notification-service.ts";
import type {
  ClaimedOrderNotification,
  OrderNotificationStore,
  WhatsAppOrderMessage,
  WhatsAppOrderProvider,
} from "../lib/server/notifications/types.ts";
import { WhatsAppProviderError } from "../lib/server/notifications/whatsapp-cloud-api.ts";
import type { OrderDraft } from "../types/checkout.ts";

function order(): OrderDraft {
  const now = new Date().toISOString();
  return {
    id: "42",
    publicId: "12345678-1234-4123-8123-123456789abc",
    tenantId: "lombardo",
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
        unitPrice: 10_000,
        quantity: 2,
        lineTotal: 20_000,
      },
    ],
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

class FakeNotificationStore implements OrderNotificationStore {
  status: "pending" | "sending" | "sent" | "failed" | "unknown" = "pending";
  attempts = 0;
  sent = 0;

  async claim(
    _tenantId: string,
    orderId: string,
    allowRetry: boolean,
  ): Promise<ClaimedOrderNotification> {
    const canClaim = this.status === "pending" || (allowRetry && this.status === "failed");
    if (canClaim) {
      this.status = "sending";
      this.attempts += 1;
    }
    const now = new Date().toISOString();
    return {
      claimed: canClaim,
      notification: {
        id: "1",
        orderId,
        kind: "new_order",
        channel: "whatsapp_cloud_api",
        status: this.status,
        attemptCount: this.attempts,
        createdAt: now,
        updatedAt: now,
      },
    };
  }

  async markSent() {
    this.status = "sent";
    this.sent += 1;
  }

  async markFailed(
    _tenantId: string,
    _notificationId: string,
    status: "failed" | "unknown",
  ) {
    this.status = status;
  }
}

class FakeProvider implements WhatsAppOrderProvider {
  messages: WhatsAppOrderMessage[] = [];
  error?: WhatsAppProviderError;

  async send(message: WhatsAppOrderMessage) {
    this.messages.push(message);
    if (this.error) throw this.error;
    return { messageId: "wamid.test" };
  }
}

function setup() {
  const store = new FakeNotificationStore();
  const provider = new FakeProvider();
  const service = new OrderNotificationService({
    store,
    configurationFactory: () => ({
      provider,
      recipient: "5493415887708",
      templateName: "lombardo_nuevo_pedido",
      languageCode: "es_AR",
      adminUrl: "https://www.lombardomercato.com/admin",
    }),
  });
  return { store, provider, service };
}

test("una orden nueva genera exactamente un aviso operativo", async () => {
  const { store, provider, service } = setup();
  const value = order();
  await service.notify(value);
  await service.notify(value);
  assert.equal(store.attempts, 1);
  assert.equal(store.sent, 1);
  assert.equal(provider.messages.length, 1);
});

test("el template incluye sólo los datos operativos aprobados", async () => {
  const { provider, service } = setup();
  await service.notify(order());
  const message = provider.messages[0];
  assert.ok(message);
  assert.deepEqual(message.parameters, [
    "12345678",
    "Ana Pérez",
    "$ 20.000",
    "Retiro en Lombardo",
    "Pendiente",
    "https://www.lombardomercato.com/admin/pedidos/12345678-1234-4123-8123-123456789abc",
  ]);
  assert.doesNotMatch(
    JSON.stringify(message),
    /ana@example\.com|87654321|\+5493415550000/,
  );
});

test("un rechazo del proveedor queda fallido y admite reintento manual", async () => {
  const { store, provider, service } = setup();
  provider.error = new WhatsAppProviderError(
    "META_100",
    "Meta rechazó el envío.",
    "rejected",
  );
  await service.notify(order());
  assert.equal(store.status, "failed");
  provider.error = undefined;
  await service.retry(order());
  assert.equal(store.status, "sent");
  assert.equal(store.attempts, 2);
});

test("un resultado ambiguo no se reintenta para evitar duplicados", async () => {
  const { store, provider, service } = setup();
  provider.error = new WhatsAppProviderError(
    "PROVIDER_OUTCOME_UNKNOWN",
    "Resultado desconocido.",
    "unknown",
  );
  await service.notify(order());
  assert.equal(store.status, "unknown");
  provider.error = undefined;
  const result = await service.retry(order());
  assert.equal(result.claimed, false);
  assert.equal(provider.messages.length, 1);
});

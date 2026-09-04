import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  RuniaCustomerOrderUpdateService,
  buildRuniaOrderUpdatePayload,
} from "../lib/server/notifications/runia-order-status-whatsapp.ts";
import type {
  ClaimedOrderNotification,
  OrderNotificationStore,
} from "../lib/server/notifications/types.ts";

const input = {
  kind: "customer_fulfillment_status" as const,
  eventKey: "fulfillment-20260902t120000z",
  order: {
    id: "42",
    tenantId: "lombardo",
    publicId: "123e4567-e89b-42d3-a456-426614174000",
    customer: {
      firstName: "Ana",
      lastName: "López",
      whatsapp: "+54 9 341 555-0000",
      email: "ana@example.com",
    },
    fulfillmentStatus: "ready" as const,
    paymentStatus: "approved" as const,
    paymentMethod: "bank_transfer" as const,
    deliveryMethod: "PICKUP" as const,
    deliveryCost: 0,
    total: 25000,
    currency: "ARS" as const,
  },
};

function claimedNotification(claimed = true): ClaimedOrderNotification {
  return {
    claimed,
    notification: {
      id: "91",
      orderId: "42",
      kind: input.kind,
      channel: "whatsapp_cloud_api",
      eventKey: input.eventKey,
      status: claimed ? "sending" : "sent",
      attemptCount: 1,
      createdAt: "2026-09-02T12:00:00.000Z",
      updatedAt: "2026-09-02T12:00:00.000Z",
    },
  };
}

class MemoryStore implements OrderNotificationStore {
  marks: Array<{ type: "sent" | "failed"; id: string }> = [];
  private readonly claimed: boolean;
  constructor(claimed: boolean) {
    this.claimed = claimed;
  }
  async claim() {
    return claimedNotification(this.claimed);
  }
  async markSent(_tenantId: string, id: string) {
    this.marks.push({ type: "sent", id });
  }
  async markFailed(_tenantId: string, id: string) {
    this.marks.push({ type: "failed", id });
  }
}

test("arma el payload Runia con los seis parámetros de la plantilla", () => {
  const payload = buildRuniaOrderUpdatePayload(
    input,
    "91",
    "https://www.lombardomercato.com",
  );
  assert.equal(payload.customer_whatsapp, "5493415550000");
  assert.equal(payload.status_label, "Tu pedido está listo");
  assert.equal(payload.template_parameters.length, 6);
  assert.equal(payload.total, "$ 25.000");
  assert.equal(
    payload.order_url,
    "https://www.lombardomercato.com/pedido/123e4567-e89b-42d3-a456-426614174000",
  );
});

test("envía el evento firmado y espera el callback de Runia", async () => {
  const store = new MemoryStore(true);
  const webhookCalls: Array<{ headers: Headers; body: Record<string, unknown> }> = [];
  const service = new RuniaCustomerOrderUpdateService({
    store,
    configurationFactory: () => ({
      webhookUrl: "https://runia.example/webhooks/order-status",
      webhookSecret: "a".repeat(40),
      appUrl: "https://www.lombardomercato.com",
    }),
    fetcher: async (_url, init) => {
      webhookCalls.push({
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({ accepted: true });
    },
  });

  const result = await service.notify(input);
  assert.deepEqual(result, { channel: "whatsapp_cloud_api", status: "sending" });
  assert.equal(webhookCalls.length, 1);
  assert.match(
    webhookCalls[0]?.headers.get("x-lombardo-signature") ?? "",
    /^sha256=[a-f0-9]{64}$/,
  );
  assert.equal(store.marks.length, 0);
  assert.doesNotMatch(JSON.stringify(webhookCalls[0]?.body), /service_role|webhookSecret/i);
});

test("un evento ya reclamado no vuelve a disparar WhatsApp", async () => {
  let webhookCalls = 0;
  const service = new RuniaCustomerOrderUpdateService({
    store: new MemoryStore(false),
    configurationFactory: () => ({
      webhookUrl: "https://runia.example/webhooks/order-status",
      webhookSecret: "a".repeat(40),
      appUrl: "https://www.lombardomercato.com",
    }),
    fetcher: async () => {
      webhookCalls += 1;
      return Response.json({ accepted: true });
    },
  });
  const result = await service.notify(input);
  assert.equal(result.status, "sent");
  assert.equal(webhookCalls, 0);
});

test("las migraciones mantienen el outbox privado y la gestión manual vigente", () => {
  const outbox = readFileSync(
    new URL("../supabase/migrations/20260901094500_lombardo_order_status_whatsapp_runia.sql", import.meta.url),
    "utf8",
  );
  const compatibility = readFileSync(
    new URL("../supabase/migrations/20260902143000_restore_admin_order_transition_after_runia_outbox.sql", import.meta.url),
    "utf8",
  );
  assert.match(outbox, /force row level security/i);
  assert.match(
    outbox,
    /revoke all on table public\.commerce_order_status_notifications\s+from public, anon, authenticated/i,
  );
  assert.match(compatibility, /p_target_status not in/i);
  assert.doesNotMatch(compatibility, /commerce_order_status_notifications/i);
});

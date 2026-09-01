import "server-only";

import { createHmac } from "node:crypto";

import { logDevCommerce } from "../dev-commerce-logger.ts";
import {
  buildCustomerOrderUpdateWhatsAppParameters,
  type CustomerOrderUpdateInput,
  type CustomerOrderUpdateNotifier,
  type CustomerOrderUpdateResult,
} from "./customer-order-update-service.ts";
import type { OrderNotificationStore } from "./types.ts";

interface RuniaStatusWebhookConfiguration {
  webhookUrl: string;
  webhookSecret: string;
  appUrl: string;
}

function customerWhatsApp(value: string) {
  let phone = value.replace(/\D/g, "");
  if (phone.startsWith("0")) phone = phone.slice(1);
  if (!phone.startsWith("54")) phone = `54${phone}`;
  return phone;
}

export function buildRuniaOrderUpdatePayload(
  input: CustomerOrderUpdateInput,
  notificationId: string,
  appUrl: string,
) {
  const parameters = buildCustomerOrderUpdateWhatsAppParameters(input, appUrl);
  return {
    event_id: notificationId,
    tenant_id: input.order.tenantId,
    order_id: input.order.id,
    order_public_id: input.order.publicId,
    notification_kind: input.kind,
    event_key: input.eventKey,
    customer_whatsapp: customerWhatsApp(input.order.customer.whatsapp),
    customer_first_name: parameters[0],
    order_number: parameters[1],
    status_label: parameters[2],
    status_detail: parameters[3],
    total: parameters[4],
    order_url: parameters[5],
    template_parameters: parameters,
  };
}

export class RuniaCustomerOrderUpdateService
  implements CustomerOrderUpdateNotifier {
  readonly channel = "whatsapp_cloud_api" as const;
  private readonly store: OrderNotificationStore;
  private readonly configurationFactory: () => RuniaStatusWebhookConfiguration;
  private readonly fetcher: typeof fetch;

  constructor(options: {
    store: OrderNotificationStore;
    configurationFactory: () => RuniaStatusWebhookConfiguration;
    fetcher?: typeof fetch;
  }) {
    this.store = options.store;
    this.configurationFactory = options.configurationFactory;
    this.fetcher = options.fetcher ?? fetch;
  }

  async notify(input: CustomerOrderUpdateInput): Promise<CustomerOrderUpdateResult> {
    const claim = await this.store.claim(
      input.order.tenantId,
      input.order.id,
      false,
      input.eventKey,
    );
    if (!claim.claimed) {
      return { channel: this.channel, status: claim.notification.status };
    }

    try {
      const configuration = this.configurationFactory();
      const payload = buildRuniaOrderUpdatePayload(
        input,
        claim.notification.id,
        configuration.appUrl,
      );
      const body = JSON.stringify(payload);
      const signature = createHmac("sha256", configuration.webhookSecret)
        .update(body)
        .digest("hex");
      const response = await this.fetcher(configuration.webhookUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${configuration.webhookSecret}`,
          "Content-Type": "application/json",
          "X-Lombardo-Event-ID": claim.notification.id,
          "X-Lombardo-Signature": `sha256=${signature}`,
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        await this.store.markFailed(
          input.order.tenantId,
          claim.notification.id,
          "failed",
          `RUNIA_${response.status}`,
          "Runia rechazó el evento de actualización.",
        );
        return { channel: this.channel, status: "failed" };
      }
      logDevCommerce("order_update_notification.accepted", {
        orderId: input.order.id,
        publicId: input.order.publicId,
        notificationId: claim.notification.id,
        notificationKind: input.kind,
      });
      return { channel: this.channel, status: "sending" };
    } catch {
      await this.store.markFailed(
        input.order.tenantId,
        claim.notification.id,
        "failed",
        "RUNIA_UNREACHABLE",
        "No se pudo entregar el evento de actualización a Runia.",
      );
      return { channel: this.channel, status: "failed" };
    }
  }
}

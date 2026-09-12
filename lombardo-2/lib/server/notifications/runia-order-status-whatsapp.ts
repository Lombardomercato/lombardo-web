import "server-only";

import { createHmac } from "node:crypto";

import type { OrderDraft } from "../../../types/checkout.ts";
import { formatCurrency } from "../../utils/format-currency.ts";
import { logDevCommerce } from "../dev-commerce-logger.ts";
import {
  buildCustomerOrderUpdateWhatsAppParameters,
  type CustomerOrderUpdateInput,
  type CustomerOrderUpdateNotifier,
  type CustomerOrderUpdateResult,
} from "./customer-order-update-service.ts";
import type {
  ClaimedOrderNotification,
  NewOrderNotifier,
  OrderNotificationStore,
} from "./types.ts";

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

function authenticatedWebhookUrl(webhookUrl: string, webhookSecret: string) {
  const url = new URL(webhookUrl);
  url.searchParams.set("secret", webhookSecret);
  return url.toString();
}

function orderUrl(appUrl: string, publicId: string) {
  return `${appUrl.replace(/\/$/, "")}/pedido/${publicId}`;
}

export function buildRuniaOrderConfirmationPayload(
  order: OrderDraft,
  notificationId: string,
  appUrl: string,
) {
  const orderNumber = order.publicId.slice(0, 8).toUpperCase();
  const statusLabel = "Pedido recibido";
  const statusDetail =
    "Recibimos tu pedido en Lombardo. Te avisaremos por este medio cuando cambie su estado.";
  const total = formatCurrency(order.total);
  const url = orderUrl(appUrl, order.publicId);
  const parameters = [
    order.customer.firstName,
    orderNumber,
    statusLabel,
    statusDetail,
    total,
    url,
  ] as const;
  return {
    event_id: notificationId,
    tenant_id: order.tenantId,
    order_id: order.id,
    order_public_id: order.publicId,
    notification_kind: "customer_order_confirmation" as const,
    event_key: "initial",
    customer_whatsapp: customerWhatsApp(order.customer.whatsapp),
    customer_first_name: parameters[0],
    order_number: parameters[1],
    status_label: parameters[2],
    status_detail: parameters[3],
    total: parameters[4],
    order_url: parameters[5],
    template_parameters: parameters,
  };
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
      const response = await this.fetcher(
        authenticatedWebhookUrl(
          configuration.webhookUrl,
          configuration.webhookSecret,
        ),
        {
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
        },
      );
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

export class RuniaCustomerOrderConfirmationService
  implements NewOrderNotifier {
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

  notify(order: OrderDraft) {
    return this.deliver(order, false);
  }

  retry(order: OrderDraft) {
    return this.deliver(order, true);
  }

  private async deliver(
    order: OrderDraft,
    allowRetry: boolean,
  ): Promise<ClaimedOrderNotification> {
    const claim = await this.store.claim(
      order.tenantId,
      order.id,
      allowRetry,
    );
    if (!claim.claimed) return claim;

    try {
      const configuration = this.configurationFactory();
      const payload = buildRuniaOrderConfirmationPayload(
        order,
        claim.notification.id,
        configuration.appUrl,
      );
      const body = JSON.stringify(payload);
      const signature = createHmac("sha256", configuration.webhookSecret)
        .update(body)
        .digest("hex");
      const response = await this.fetcher(
        authenticatedWebhookUrl(
          configuration.webhookUrl,
          configuration.webhookSecret,
        ),
        {
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
        },
      );
      if (!response.ok) {
        await this.store.markFailed(
          order.tenantId,
          claim.notification.id,
          "failed",
          `RUNIA_${response.status}`,
          "Runia rechazó la confirmación inicial del pedido.",
        );
        return claim;
      }
      logDevCommerce("order_update_notification.accepted", {
        orderId: order.id,
        publicId: order.publicId,
        notificationId: claim.notification.id,
        notificationKind: "customer_order_confirmation",
      });
    } catch {
      await this.store.markFailed(
        order.tenantId,
        claim.notification.id,
        "failed",
        "RUNIA_UNREACHABLE",
        "No se pudo entregar la confirmación inicial a Runia.",
      );
    }
    return claim;
  }
}

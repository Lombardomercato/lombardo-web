import { RuniaCommerceProvider } from "../commerce/runia-commerce-provider";
import {
  paymentsEnabled,
  readMercadoPagoConfiguration,
  readRuniaConfiguration,
  readWhatsAppOrderNotificationConfiguration,
  whatsAppOrderNotificationsEnabled,
} from "./environment";
import { OrderNotificationService } from "./notifications/order-notification-service";
import { SupabaseOrderNotificationStore } from "./notifications/supabase-order-notification-store";
import { WhatsAppCloudApi } from "./notifications/whatsapp-cloud-api";
import { RuniaOrderRepository } from "./orders/runia-order-repository";
import { EnvironmentDeliveryPricing } from "./orders/server-delivery-pricing";
import { ServerOrderError } from "./orders/server-order-error";
import { SupabaseOrderStore } from "./orders/supabase-order-store";
import { MercadoPagoAdapter } from "./payments/mercado-pago-adapter";
import { OrderPaymentCoordinator } from "./payments/order-payment-coordinator";
import type { PaymentGateway } from "./payments/payment-gateway";

export function createOrderServices() {
  const configuration = readRuniaConfiguration();
  const tenantId = configuration.tenantSlug;
  const store = new SupabaseOrderStore({
    url: configuration.url,
    secretKey: configuration.secretKey,
  });
  const orders = new RuniaOrderRepository({
    tenantId,
    productSource: new RuniaCommerceProvider(configuration),
    deliveryPricing: new EnvironmentDeliveryPricing(),
    store,
  });
  return { tenantId, store, orders };
}

export function createPaymentGateway(): PaymentGateway | null {
  if (!paymentsEnabled()) return null;
  const configuration = readMercadoPagoConfiguration();
  return new MercadoPagoAdapter({
    accessToken: configuration.accessToken,
    appUrl: configuration.appUrl,
    mode: configuration.mode,
    sellerId: configuration.sellerId,
  });
}

export function createCheckoutCoordinator() {
  const services = createOrderServices();
  return {
    ...services,
    coordinator: new OrderPaymentCoordinator({
      orders: services.orders,
      paymentGateway: createPaymentGateway(),
      newOrderNotifier: createNewOrderNotifier(),
    }),
  };
}

export function createNewOrderNotifier() {
  if (!whatsAppOrderNotificationsEnabled()) return null;
  const runia = readRuniaConfiguration();
  return new OrderNotificationService({
    store: new SupabaseOrderNotificationStore({
      url: runia.url,
      secretKey: runia.secretKey,
    }),
    configurationFactory: () => {
      const configuration = readWhatsAppOrderNotificationConfiguration();
      return {
        provider: new WhatsAppCloudApi({
          accessToken: configuration.accessToken,
          phoneNumberId: configuration.phoneNumberId,
          graphApiVersion: configuration.graphApiVersion,
        }),
        recipient: configuration.recipient,
        templateName: configuration.templateName,
        languageCode: configuration.languageCode,
        adminUrl: configuration.adminUrl,
      };
    },
  });
}

export function requirePaymentGateway() {
  const gateway = createPaymentGateway();
  if (!gateway) {
    throw new ServerOrderError(
      "PAYMENT_NOT_CONFIGURED",
      "Mercado Pago todavía no está habilitado.",
      { status: 503 },
    );
  }
  return gateway;
}

export function getWebhookSecret() {
  return readMercadoPagoConfiguration().webhookSecret;
}

export function paymentUsesLiveMode() {
  return readMercadoPagoConfiguration().mode === "LIVE";
}

import { RuniaCommerceProvider } from "../commerce/runia-commerce-provider";
import {
  paymentsEnabled,
  readMercadoPagoTestConfiguration,
  readRuniaDevConfiguration,
} from "./environment";
import { RuniaOrderRepository } from "./orders/runia-order-repository";
import { EnvironmentDeliveryPricing } from "./orders/server-delivery-pricing";
import { ServerOrderError } from "./orders/server-order-error";
import { SupabaseOrderStore } from "./orders/supabase-order-store";
import { MercadoPagoAdapter } from "./payments/mercado-pago-adapter";
import { OrderPaymentCoordinator } from "./payments/order-payment-coordinator";
import type { PaymentGateway } from "./payments/payment-gateway";

export function createOrderServices() {
  const configuration = readRuniaDevConfiguration();
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
  const configuration = readMercadoPagoTestConfiguration();
  return new MercadoPagoAdapter({
    accessToken: configuration.accessToken,
    appUrl: configuration.appUrl,
    mode: "TEST",
  });
}

export function createCheckoutCoordinator() {
  const services = createOrderServices();
  return {
    ...services,
    coordinator: new OrderPaymentCoordinator({
      orders: services.orders,
      paymentGateway: createPaymentGateway(),
    }),
  };
}

export function requirePaymentGateway() {
  const gateway = createPaymentGateway();
  if (!gateway) {
    throw new ServerOrderError(
      "PAYMENT_NOT_CONFIGURED",
      "Mercado Pago TEST todavía no está habilitado.",
      { status: 503 },
    );
  }
  return gateway;
}

export function getWebhookSecret() {
  return readMercadoPagoTestConfiguration().webhookSecret;
}

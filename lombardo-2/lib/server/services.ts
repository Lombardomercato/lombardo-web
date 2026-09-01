import { RuniaCommerceProvider } from "../commerce/runia-commerce-provider";
import {
  customerStatusWhatsAppNotificationsEnabled,
  emailOrderNotificationsEnabled,
  paymentsEnabled,
  readCustomerStatusWhatsAppNotificationConfiguration,
  readEmailOrderNotificationConfiguration,
  readMercadoPagoConfiguration,
  readRuniaOrderStatusNotificationConfiguration,
  readRuniaConfiguration,
  readWhatsAppOrderNotificationConfiguration,
  whatsAppOrderNotificationsEnabled,
  runiaOrderStatusNotificationsEnabled,
} from "./environment";
import {
  CustomerOrderUpdateEmailService,
  CustomerOrderUpdateWhatsAppService,
  type CustomerOrderUpdateInput,
} from "./notifications/customer-order-update-service";
import { EmailOrderNotificationService } from "./notifications/email-order-notification-service";
import { CustomerOrderConfirmationService } from "./notifications/customer-order-confirmation-service";
import { OrderNotificationService } from "./notifications/order-notification-service";
import { SupabaseOrderNotificationStore } from "./notifications/supabase-order-notification-store";
import { ResendEmailApi } from "./notifications/resend-email-api";
import { WhatsAppCloudApi } from "./notifications/whatsapp-cloud-api";
import { RuniaCustomerOrderUpdateService } from "./notifications/runia-order-status-whatsapp";
import { RuniaOrderRepository } from "./orders/runia-order-repository";
import { EnvironmentDeliveryPricing } from "./orders/server-delivery-pricing";
import { ServerOrderError } from "./orders/server-order-error";
import { SupabaseOrderStore } from "./orders/supabase-order-store";
import { PromotionService } from "./promotions/promotion-service";
import { SupabasePromotionStore } from "./promotions/promotion-store";
import { MercadoPagoAdapter } from "./payments/mercado-pago-adapter";
import { OrderPaymentCoordinator } from "./payments/order-payment-coordinator";
import type { PaymentGateway } from "./payments/payment-gateway";
import {
  retailPricingContext,
  type CustomerPricingContext,
} from "./customers/types";

export function createOrderServices(pricingContext?: CustomerPricingContext) {
  const configuration = readRuniaConfiguration();
  const tenantId = configuration.tenantSlug;
  const resolvedPricingContext =
    pricingContext ?? retailPricingContext(configuration.tenantSlug);
  const store = new SupabaseOrderStore({
    url: configuration.url,
    secretKey: configuration.secretKey,
  });
  const promotionService = new PromotionService(new SupabasePromotionStore({
    url: configuration.url,
    secretKey: configuration.secretKey,
  }));
  const orders = new RuniaOrderRepository({
    tenantId,
    pricingContext: resolvedPricingContext,
    productSource: new RuniaCommerceProvider(configuration, resolvedPricingContext),
    deliveryPricing: new EnvironmentDeliveryPricing(),
    store,
    promotionService,
  });
  return { tenantId, store, orders, promotionService };
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

export function createCheckoutCoordinator(pricingContext: CustomerPricingContext) {
  const services = createOrderServices(pricingContext);
  const newOrderNotifiers = [
    createNewOrderNotifier(),
    createCustomerOrderConfirmationNotifier(),
  ].filter((notifier) => notifier !== null);
  return {
    ...services,
    coordinator: new OrderPaymentCoordinator({
      orders: services.orders,
      paymentGateway: createPaymentGateway(),
      newOrderNotifiers,
    }),
  };
}

export function createCustomerOrderConfirmationNotifier() {
  if (!emailOrderNotificationsEnabled()) return null;
  const runia = readRuniaConfiguration();
  return new CustomerOrderConfirmationService({
    store: new SupabaseOrderNotificationStore({
      url: runia.url,
      secretKey: runia.secretKey,
      channel: "email_resend",
      kind: "customer_order_confirmation",
    }),
    configurationFactory: () => {
      const configuration = readEmailOrderNotificationConfiguration();
      return {
        provider: new ResendEmailApi({ apiKey: configuration.apiKey }),
        sender: configuration.sender,
        appUrl: configuration.appUrl,
      };
    },
  });
}

export function createCustomerOrderUpdateNotifiers(
  kind: CustomerOrderUpdateInput["kind"],
) {
  const runia = readRuniaConfiguration();
  const notifiers = [];
  if (emailOrderNotificationsEnabled()) {
    notifiers.push(new CustomerOrderUpdateEmailService({
      store: new SupabaseOrderNotificationStore({
        url: runia.url,
        secretKey: runia.secretKey,
        channel: "email_resend",
        kind,
      }),
      configurationFactory: () => {
        const configuration = readEmailOrderNotificationConfiguration();
        return {
          provider: new ResendEmailApi({ apiKey: configuration.apiKey }),
          sender: configuration.sender,
          appUrl: configuration.appUrl,
        };
      },
    }));
  }
  if (runiaOrderStatusNotificationsEnabled()) {
    notifiers.push(new RuniaCustomerOrderUpdateService({
      store: new SupabaseOrderNotificationStore({
        url: runia.url,
        secretKey: runia.secretKey,
        channel: "whatsapp_cloud_api",
        kind,
      }),
      configurationFactory: () => readRuniaOrderStatusNotificationConfiguration(),
    }));
  } else if (customerStatusWhatsAppNotificationsEnabled()) {
    notifiers.push(new CustomerOrderUpdateWhatsAppService({
      store: new SupabaseOrderNotificationStore({
        url: runia.url,
        secretKey: runia.secretKey,
        channel: "whatsapp_cloud_api",
        kind,
      }),
      configurationFactory: () => {
        const configuration = readCustomerStatusWhatsAppNotificationConfiguration();
        return {
          provider: new WhatsAppCloudApi({
            accessToken: configuration.accessToken,
            phoneNumberId: configuration.phoneNumberId,
            graphApiVersion: configuration.graphApiVersion,
          }),
          templateName: configuration.templateName,
          languageCode: configuration.languageCode,
          appUrl: configuration.appUrl,
        };
      },
    }));
  }
  return notifiers;
}

export async function notifyCustomerOrderUpdate(input: CustomerOrderUpdateInput) {
  const notifiers = createCustomerOrderUpdateNotifiers(input.kind);
  return Promise.allSettled(notifiers.map((notifier) => notifier.notify(input)));
}

export function createNewOrderNotifier() {
  if (emailOrderNotificationsEnabled()) {
    const runia = readRuniaConfiguration();
    return new EmailOrderNotificationService({
      store: new SupabaseOrderNotificationStore({
        url: runia.url,
        secretKey: runia.secretKey,
        channel: "email_resend",
      }),
      configurationFactory: () => {
        const configuration = readEmailOrderNotificationConfiguration();
        return {
          provider: new ResendEmailApi({ apiKey: configuration.apiKey }),
          recipient: configuration.recipient,
          sender: configuration.sender,
          adminUrl: configuration.adminUrl,
        };
      },
    });
  }
  if (!whatsAppOrderNotificationsEnabled()) return null;
  const runia = readRuniaConfiguration();
  return new OrderNotificationService({
    store: new SupabaseOrderNotificationStore({
      url: runia.url,
      secretKey: runia.secretKey,
      channel: "whatsapp_cloud_api",
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

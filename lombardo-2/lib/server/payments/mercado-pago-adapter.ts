import type {
  MercadoPagoPayment,
  OrderDraft,
  PaymentPreferenceResult,
} from "../../../types/checkout.ts";
import {
  PaymentGatewayError,
  type PaymentGateway,
} from "./payment-gateway.ts";

interface MercadoPagoAdapterOptions {
  accessToken: string;
  appUrl: string;
  mode: "TEST" | "LIVE";
  sellerId: string;
  fetcher?: typeof fetch;
}

interface MercadoPagoPreferenceResponse {
  collector_id?: string | number;
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
}

interface MercadoPagoPaymentResponse {
  id?: string | number;
  status?: string;
  external_reference?: string | null;
  transaction_amount?: number;
  currency_id?: string;
  live_mode?: boolean;
  metadata?: Record<string, unknown>;
}

interface MercadoPagoErrorResponse {
  cause?: Array<{ code?: string | number }>;
  error?: string;
  message?: string;
}

function safeProviderErrorCode(payload: MercadoPagoErrorResponse) {
  const value = payload.error ?? payload.cause?.[0]?.code ?? payload.message;
  if (typeof value !== "string" && typeof value !== "number") return "unknown";
  return String(value).replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 80);
}

function safeAppUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isMercadoPagoCheckoutUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return (
      url.hostname === "mercadopago.com" ||
      url.hostname.endsWith(".mercadopago.com") ||
      url.hostname === "mercadopago.com.ar" ||
      url.hostname.endsWith(".mercadopago.com.ar")
    );
  } catch {
    return false;
  }
}

export function preferenceIdempotencyKey(orderId: string) {
  return `lombardo_preference_${orderId}`;
}

export class MercadoPagoAdapter implements PaymentGateway {
  private readonly accessToken: string;
  private readonly appUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly mode: "TEST" | "LIVE";
  private readonly sellerId: string;

  constructor(options: MercadoPagoAdapterOptions) {
    const appUrl = safeAppUrl(options.appUrl);
    if (
      !options.accessToken ||
      !appUrl ||
      (options.mode !== "TEST" && options.mode !== "LIVE") ||
      !/^\d{5,30}$/.test(options.sellerId)
    ) {
      throw new PaymentGatewayError(
        "Mercado Pago todavía no está configurado.",
        503,
      );
    }
    this.accessToken = options.accessToken;
    this.appUrl = appUrl;
    this.fetcher = options.fetcher ?? fetch;
    this.mode = options.mode;
    this.sellerId = options.sellerId;
  }

  private request(path: string, init: RequestInit = {}) {
    return this.fetcher(`https://api.mercadopago.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
  }

  async createPreference(order: OrderDraft): Promise<PaymentPreferenceResult> {
    const items = order.items.map((item) => ({
      id: item.sourceProductId ?? item.productId,
      title: item.name,
      quantity: item.quantity,
      currency_id: order.currency,
      unit_price: item.unitPrice,
    }));
    if (order.deliveryCost > 0) {
      items.push({
        id: "lombardo-delivery",
        title: "Envío Lombardo",
        quantity: 1,
        currency_id: order.currency,
        unit_price: order.deliveryCost,
      });
    }

    const orderUrl = `${this.appUrl}/pedido/${order.publicId}`;
    const response = await this.request("/checkout/preferences", {
      method: "POST",
      headers: {
        "X-Idempotency-Key": preferenceIdempotencyKey(order.id),
      },
      body: JSON.stringify({
        items,
        payer: {
          name: order.customer.firstName,
          surname: order.customer.lastName,
          email: order.customer.email,
        },
        back_urls: {
          success: `${orderUrl}?return=success`,
          pending: `${orderUrl}?return=pending`,
          failure: `${orderUrl}?return=failure`,
        },
        auto_return: "approved",
        notification_url: `${this.appUrl}/api/payments/mercadopago/webhook`,
        external_reference: order.id,
        metadata: {
          order_id: order.id,
          tenant_id: order.tenantId,
        },
      }),
    });

    if (!response.ok) {
      let providerCode = "unknown";
      try {
        providerCode = safeProviderErrorCode(
          (await response.json()) as MercadoPagoErrorResponse,
        );
      } catch {
        // La respuesta puede no ser JSON; nunca se registra el body crudo.
      }
      throw new PaymentGatewayError(
        `Mercado Pago no pudo preparar el checkout (${providerCode}).`,
        response.status,
      );
    }

    const payload = (await response.json()) as MercadoPagoPreferenceResponse;
    const checkoutUrl =
      this.mode === "LIVE" ? payload.init_point : payload.sandbox_init_point;
    if (
      String(payload.collector_id ?? "") !== this.sellerId ||
      !payload.id ||
      !checkoutUrl ||
      !isMercadoPagoCheckoutUrl(checkoutUrl)
    ) {
      throw new PaymentGatewayError(
        "Mercado Pago devolvió una preferencia incompleta o insegura.",
      );
    }
    return { preferenceId: payload.id, checkoutUrl };
  }

  async getPayment(paymentId: string): Promise<MercadoPagoPayment> {
    if (!/^\d{1,40}$/.test(paymentId)) {
      throw new PaymentGatewayError("El identificador del pago no es válido.", 400);
    }
    const response = await this.request(`/v1/payments/${paymentId}`);
    if (!response.ok) {
      throw new PaymentGatewayError(
        "No pudimos verificar el pago informado por Mercado Pago.",
        response.status,
      );
    }
    const payload = (await response.json()) as MercadoPagoPaymentResponse;
    if (
      payload.id === undefined ||
      !payload.status ||
      typeof payload.transaction_amount !== "number" ||
      !payload.currency_id ||
      typeof payload.live_mode !== "boolean"
    ) {
      throw new PaymentGatewayError("Mercado Pago devolvió un pago incompleto.");
    }
    return {
      id: String(payload.id),
      status: payload.status,
      externalReference: payload.external_reference ?? null,
      transactionAmount: payload.transaction_amount,
      currencyId: payload.currency_id,
      liveMode: payload.live_mode,
      metadata: payload.metadata,
    };
  }
}

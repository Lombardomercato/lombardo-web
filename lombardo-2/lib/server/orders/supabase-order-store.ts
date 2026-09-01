import type {
  CheckoutCustomer,
  DeliveryAddress,
  DeliveryCostMode,
  DeliveryMethod,
  OrderCurrency,
  OrderDraft,
  OrderItemSnapshot,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "../../../types/checkout.ts";
import type { CustomerPricingPolicy } from "../customers/types.ts";
import type {
  AppliedPaymentEvent,
  AtomicInsertResult,
  NewOrderRecord,
  PaymentEventInput,
  PaymentStateUpdate,
  RuniaOrderStore,
} from "./order-dependencies.ts";
import { ServerOrderError } from "./server-order-error.ts";

interface SupabaseOrderStoreOptions {
  url: string;
  secretKey: string;
  fetcher?: typeof fetch;
}

interface OrderRow {
  id: string | number;
  public_id: string;
  tenant_id: string;
  tenant_record_id: string;
  customer_account_id: string | null;
  pricing_policy: CustomerPricingPolicy;
  discount_percent: number | string;
  customer: CheckoutCustomer;
  items: OrderItemSnapshot[];
  base_subtotal: number | string;
  pricing_discount_amount: number | string;
  commercial_subtotal: number | string;
  promotion_id: string | null;
  coupon_code: string | null;
  coupon_discount_type: "PERCENTAGE" | "FIXED_AMOUNT" | null;
  coupon_discount_value: number | string | null;
  coupon_discount_amount: number | string;
  coupon_stackable: boolean | null;
  subtotal: number;
  delivery_cost: number;
  total: number;
  currency: OrderCurrency;
  delivery_method: DeliveryMethod;
  delivery_address: DeliveryAddress | null;
  delivery_cost_mode: DeliveryCostMode;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  checkout_session_id: string;
  idempotency_key: string;
  order_source?: "storefront" | "admin_manual";
  management_customer?: CheckoutCustomer | null;
  management_items?: OrderItemSnapshot[] | null;
  management_delivery_method?: DeliveryMethod | null;
  management_delivery_address?: DeliveryAddress | null;
  management_items_subtotal?: number | string | null;
  management_discount_amount?: number | string | null;
  management_subtotal?: number | string | null;
  management_delivery_cost?: number | string | null;
  management_total?: number | string | null;
  payment_preference_id: string | null;
  payment_checkout_url: string | null;
  payment_provider_id: string | null;
  created_at: string;
  updated_at: string;
}

interface AppliedPaymentEventRow {
  duplicate: boolean;
  order_record: OrderRow;
}

interface PromotionOrderResultRow {
  reused: boolean;
  order_record: OrderRow;
}

function mapOrder(row: OrderRow): OrderDraft {
  const usesAdminManagement =
    row.order_source === "admin_manual" && Array.isArray(row.management_items);
  return {
    id: String(row.id),
    publicId: row.public_id,
    tenantId: row.tenant_id,
    tenantRecordId: row.tenant_record_id,
    customerAccountId: row.customer_account_id ?? undefined,
    pricingPolicy: row.pricing_policy,
    discountPercent: Number(row.discount_percent),
    customer: usesAdminManagement ? row.management_customer ?? row.customer : row.customer,
    items: usesAdminManagement ? row.management_items ?? row.items : row.items,
    baseSubtotal: usesAdminManagement
      ? Number(row.management_items_subtotal)
      : Number(row.base_subtotal),
    pricingDiscountAmount: usesAdminManagement
      ? Number(row.management_discount_amount ?? 0)
      : Number(row.pricing_discount_amount),
    commercialSubtotal: usesAdminManagement
      ? Number(row.management_items_subtotal)
      : Number(row.commercial_subtotal ?? row.subtotal),
    promotionId: row.promotion_id ?? undefined,
    couponCode: row.coupon_code ?? undefined,
    couponDiscountType: row.coupon_discount_type ?? undefined,
    couponDiscountValue: row.coupon_discount_value === null ? undefined : Number(row.coupon_discount_value),
    couponDiscountAmount: Number(row.coupon_discount_amount ?? 0),
    couponStackable: row.coupon_stackable ?? undefined,
    subtotal: usesAdminManagement ? Number(row.management_subtotal) : Number(row.subtotal),
    deliveryCost: usesAdminManagement
      ? Number(row.management_delivery_cost)
      : Number(row.delivery_cost),
    total: usesAdminManagement ? Number(row.management_total) : Number(row.total),
    currency: row.currency,
    deliveryMethod: usesAdminManagement
      ? row.management_delivery_method ?? row.delivery_method
      : row.delivery_method,
    deliveryAddress: (usesAdminManagement
      ? row.management_delivery_address
      : row.delivery_address) ?? undefined,
    deliveryCostMode: row.delivery_cost_mode,
    orderStatus: row.order_status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    checkoutSessionId: row.checkout_session_id,
    idempotencyKey: row.idempotency_key,
    orderSource: row.order_source ?? "storefront",
    paymentPreferenceId: row.payment_preference_id ?? undefined,
    paymentCheckoutUrl: row.payment_checkout_url ?? undefined,
    paymentProviderId: row.payment_provider_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isSafeSupabaseUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

export class SupabaseOrderStore implements RuniaOrderStore {
  private readonly url: string;
  private readonly secretKey: string;
  private readonly fetcher: typeof fetch;

  constructor(options: SupabaseOrderStoreOptions) {
    if (!isSafeSupabaseUrl(options.url) || !options.secretKey) {
      throw new ServerOrderError(
        "SERVER_NOT_CONFIGURED",
        "La persistencia de pedidos todavía no está configurada.",
        { status: 503 },
      );
    }
    this.url = options.url.replace(/\/$/, "");
    this.secretKey = options.secretKey;
    this.fetcher = options.fetcher ?? fetch;
  }

  private async request(path: string, init: RequestInit = {}) {
    return this.fetcher(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.secretKey,
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
  }

  private async readFailure(response: Response, fallback: string): Promise<never> {
    let databaseCode = "";
    let databaseMessage = "";
    try {
      const payload = (await response.json()) as { code?: string; message?: string };
      databaseCode = payload.code ?? "";
      databaseMessage = payload.message ?? "";
    } catch {
      databaseCode = "";
    }
    const promotionFailures = {
      PROMOTION_NOT_FOUND: ["PROMOTION_NOT_FOUND", "El código ingresado no es válido."],
      PROMOTION_INACTIVE: ["PROMOTION_INACTIVE", "Este cupón está desactivado."],
      PROMOTION_SCHEDULED: ["PROMOTION_SCHEDULED", "Este cupón todavía no está vigente."],
      PROMOTION_EXPIRED: ["PROMOTION_EXPIRED", "Este cupón está vencido."],
      PROMOTION_MINIMUM: ["PROMOTION_MINIMUM", "La compra mínima del cupón ya no se cumple."],
      PROMOTION_EXHAUSTED: ["PROMOTION_EXHAUSTED", "Este cupón ya alcanzó su límite de usos."],
      PROMOTION_ALREADY_USED: ["PROMOTION_ALREADY_USED", "Este cupón ya fue utilizado por esta cuenta."],
      PROMOTION_NOT_STACKABLE: ["PROMOTION_NOT_STACKABLE", "Este cupón no es acumulable con tu precio especial."],
      PROMOTION_ACCOUNT_SCOPE: ["PROMOTION_NOT_APPLICABLE", "Este cupón no aplica a tu cuenta."],
      PROMOTION_PRODUCTS_SCOPE: ["PROMOTION_NOT_APPLICABLE", "Este cupón no aplica a tu selección."],
      PROMOTION_FIRST_ORDER_ONLY: ["PROMOTION_FIRST_ORDER_ONLY", "Este cupón es únicamente para la primera compra."],
    } as const;
    const promotionFailure = promotionFailures[databaseMessage as keyof typeof promotionFailures];
    throw new ServerOrderError(promotionFailure?.[0] ?? "CREATE_FAILED", promotionFailure?.[1] ?? fallback, {
      status: promotionFailure ? 422 : databaseCode === "42501" ? 503 : 502,
    });
  }

  private ordersPath(params: Record<string, string>) {
    const search = new URLSearchParams({ select: "*", ...params });
    return `commerce_orders?${search.toString()}`;
  }

  async findByIdempotency(
    tenantId: string,
    checkoutSessionId: string,
    idempotencyKey: string,
  ) {
    const response = await this.request(
      this.ordersPath({
        tenant_id: `eq.${tenantId}`,
        or: `(checkout_session_id.eq.${checkoutSessionId},idempotency_key.eq.${idempotencyKey})`,
        limit: "1",
      }),
    );
    if (!response.ok) {
      return this.readFailure(response, "No pudimos consultar el pedido existente.");
    }
    const rows = (await response.json()) as OrderRow[];
    return rows[0] ? mapOrder(rows[0]) : null;
  }

  async insertOrderAtomic(record: NewOrderRecord): Promise<AtomicInsertResult> {
    const payload = {
      public_id: record.publicId,
      tenant_id: record.tenantId,
      tenant_record_id: record.tenantRecordId,
      customer_account_id: record.customerAccountId ?? null,
      pricing_policy: record.pricingPolicy,
      discount_percent: record.discountPercent,
      customer: record.customer,
      items: record.items,
      base_subtotal: record.baseSubtotal,
      pricing_discount_amount: record.pricingDiscountAmount,
      commercial_subtotal: record.commercialSubtotal ?? record.subtotal,
      promotion_id: record.promotionId ?? null,
      coupon_code: record.couponCode ?? null,
      coupon_discount_type: record.couponDiscountType ?? null,
      coupon_discount_value: record.couponDiscountValue ?? null,
      coupon_discount_amount: record.couponDiscountAmount ?? 0,
      coupon_stackable: record.couponStackable ?? null,
      subtotal: record.subtotal,
      delivery_cost: record.deliveryCost,
      total: record.total,
      currency: record.currency,
      delivery_method: record.deliveryMethod,
      delivery_address: record.deliveryAddress ?? null,
      delivery_cost_mode: record.deliveryCostMode,
      order_status: record.orderStatus,
      payment_status: record.paymentStatus,
      payment_method: record.paymentMethod,
      checkout_session_id: record.checkoutSessionId,
      idempotency_key: record.idempotencyKey,
      order_source: record.orderSource ?? "storefront",
    };
    const response = await this.request(record.promotionId
      ? "rpc/lombardo_create_order_with_promotion"
      : "commerce_orders?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(record.promotionId ? { p_order: payload } : payload),
    });

    if (response.status === 409) {
      const existing = await this.findByIdempotency(
        record.tenantId,
        record.checkoutSessionId,
        record.idempotencyKey,
      );
      if (existing) return { order: existing, reused: true };
    }
    if (!response.ok) {
      return this.readFailure(response, "No pudimos guardar el pedido.");
    }
    const responsePayload = (await response.json()) as OrderRow[] | OrderRow | PromotionOrderResultRow[];
    if (record.promotionId) {
      const result = (responsePayload as PromotionOrderResultRow[])[0];
      if (!result?.order_record) {
        throw new ServerOrderError("CREATE_FAILED", "Runia no devolvió el pedido creado.", { status: 502 });
      }
      return { order: mapOrder(result.order_record), reused: result.reused };
    }
    const rows = Array.isArray(responsePayload) ? responsePayload as OrderRow[] : [responsePayload as OrderRow];
    if (!rows[0]) {
      throw new ServerOrderError("CREATE_FAILED", "Runia no devolvió el pedido creado.", {
        status: 502,
      });
    }
    return { order: mapOrder(rows[0]), reused: false };
  }

  async getByPublicId(tenantId: string, publicId: string) {
    const response = await this.request(
      this.ordersPath({
        tenant_id: `eq.${tenantId}`,
        public_id: `eq.${publicId}`,
        limit: "1",
      }),
    );
    if (!response.ok) {
      return this.readFailure(response, "No pudimos consultar el estado del pedido.");
    }
    const rows = (await response.json()) as OrderRow[];
    return rows[0] ? mapOrder(rows[0]) : null;
  }

  async getById(tenantId: string, orderId: string) {
    const response = await this.request(
      this.ordersPath({ tenant_id: `eq.${tenantId}`, id: `eq.${orderId}`, limit: "1" }),
    );
    if (!response.ok) {
      return this.readFailure(response, "No pudimos verificar la orden del pago.");
    }
    const rows = (await response.json()) as OrderRow[];
    return rows[0] ? mapOrder(rows[0]) : null;
  }

  async savePaymentPreference(
    tenantId: string,
    orderId: string,
    preferenceId: string,
    checkoutUrl: string,
  ) {
    const response = await this.request(
      this.ordersPath({ tenant_id: `eq.${tenantId}`, id: `eq.${orderId}` }),
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          payment_preference_id: preferenceId,
          payment_checkout_url: checkoutUrl,
        }),
      },
    );
    if (!response.ok) {
      return this.readFailure(response, "La preferencia se creó, pero no pudimos guardarla.");
    }
    const rows = (await response.json()) as OrderRow[];
    if (!rows[0]) {
      throw new ServerOrderError("ORDER_NOT_FOUND", "No encontramos el pedido.", {
        status: 404,
      });
    }
    return mapOrder(rows[0]);
  }

  async savePaymentMethod(
    tenantId: string,
    orderId: string,
    paymentMethod: PaymentMethod,
  ) {
    const response = await this.request(
      this.ordersPath({
        tenant_id: `eq.${tenantId}`,
        id: `eq.${orderId}`,
        order_status: "eq.pending_payment",
        payment_status: "eq.pending",
      }),
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ payment_method: paymentMethod }),
      },
    );
    if (!response.ok) {
      return this.readFailure(response, "No pudimos guardar la modalidad de pago.");
    }
    const rows = (await response.json()) as OrderRow[];
    if (!rows[0]) {
      throw new ServerOrderError(
        "INVALID_REQUEST",
        "El pedido ya no admite cambios en la modalidad de pago.",
        { status: 409 },
      );
    }
    return mapOrder(rows[0]);
  }

  async applyPaymentEventAtomic(
    input: PaymentEventInput,
    update: PaymentStateUpdate,
  ): Promise<AppliedPaymentEvent> {
    const response = await this.request("rpc/lombardo_apply_payment_event", {
      method: "POST",
      body: JSON.stringify({
        p_tenant_id: input.tenantId,
        p_order_id: input.orderId,
        p_provider_event_id: input.eventId,
        p_provider_payment_id: input.providerPaymentId,
        p_provider_status: input.providerStatus,
        p_payload: input.payload,
        p_payment_status: update.paymentStatus,
        p_order_status: update.orderStatus,
      }),
    });
    if (!response.ok) {
      return this.readFailure(
        response,
        "No pudimos aplicar el evento de pago de forma atómica.",
      );
    }
    const rows = (await response.json()) as AppliedPaymentEventRow[];
    if (!rows[0]?.order_record) {
      throw new ServerOrderError("CREATE_FAILED", "Runia no devolvió la transición.", {
        status: 502,
      });
    }
    return {
      duplicate: rows[0].duplicate,
      order: mapOrder(rows[0].order_record),
    };
  }
}

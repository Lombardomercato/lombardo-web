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
  customer: CheckoutCustomer;
  items: OrderItemSnapshot[];
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

function mapOrder(row: OrderRow): OrderDraft {
  return {
    id: String(row.id),
    publicId: row.public_id,
    tenantId: row.tenant_id,
    customer: row.customer,
    items: row.items,
    subtotal: Number(row.subtotal),
    deliveryCost: Number(row.delivery_cost),
    total: Number(row.total),
    currency: row.currency,
    deliveryMethod: row.delivery_method,
    deliveryAddress: row.delivery_address ?? undefined,
    deliveryCostMode: row.delivery_cost_mode,
    orderStatus: row.order_status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    checkoutSessionId: row.checkout_session_id,
    idempotencyKey: row.idempotency_key,
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
    try {
      const payload = (await response.json()) as { code?: string };
      databaseCode = payload.code ?? "";
    } catch {
      databaseCode = "";
    }
    throw new ServerOrderError("CREATE_FAILED", fallback, {
      status: databaseCode === "42501" ? 503 : 502,
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
    const response = await this.request("commerce_orders?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        public_id: record.publicId,
        tenant_id: record.tenantId,
        customer: record.customer,
        items: record.items,
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
      }),
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
    const rows = (await response.json()) as OrderRow[];
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

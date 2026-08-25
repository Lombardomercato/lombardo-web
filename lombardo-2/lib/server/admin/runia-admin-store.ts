import "server-only";

import { categoryForSupplierSku } from "../../commerce/runia-catalog-mapper";
import type {
  CheckoutCustomer,
  DeliveryAddress,
  DeliveryMethod,
  OrderCurrency,
  OrderItemSnapshot,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "../../../types/checkout";
import type {
  AdminCustomer,
  AdminDashboard,
  AdminOrder,
  AdminOrderFilters,
  AdminProduct,
  AdminProductPage,
  AdminSession,
  FulfillmentStatus,
  FulfillmentTransitionResult,
} from "./types";
import type {
  OrderNotification,
  OrderNotificationStatus,
} from "../notifications/types";

interface RuniaAdminStoreOptions {
  url: string;
  secretKey: string;
  tenantId: string;
  fetcher?: typeof fetch;
}

interface AdminOperatorRow {
  id: string;
  auth_user_id: string;
  tenant_id: string;
  display_name: string;
  role: "admin" | "operator";
  active: boolean;
}

interface AdminSessionRow {
  expires_at: string;
  operator: AdminOperatorRow | AdminOperatorRow[] | null;
}

interface OrderRow {
  id: string | number;
  public_id: string;
  customer: CheckoutCustomer;
  items: OrderItemSnapshot[];
  subtotal: number | string;
  delivery_cost: number | string;
  total: number | string;
  currency: OrderCurrency;
  delivery_method: DeliveryMethod;
  delivery_address: DeliveryAddress | null;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  payment_provider_id: string | null;
  payment_preference_id: string | null;
  fulfillment_status: FulfillmentStatus | null;
  fulfillment_updated_at: string | null;
  confirmed_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ProductRow {
  id: string;
  supplier_sku: string;
  name_raw: string;
  presentation_raw: string | null;
  normalized_presentation: string | null;
  active: boolean;
  eligibility_status: AdminProduct["eligibilityStatus"];
  retail_prices:
    | Array<{ price_type: string; current_price: number | string }>
    | { price_type: string; current_price: number | string }
    | null;
}

interface SupplierRow {
  id: string;
}

interface TransitionRow {
  changed: boolean;
  order_record: OrderRow;
}

interface NotificationRow {
  id: string | number;
  order_id: string | number;
  channel: OrderNotification["channel"];
  status: OrderNotificationStatus;
  attempt_count: number;
  provider_message_id: string | null;
  last_error_code: string | null;
  last_error_summary: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapNotification(row: NotificationRow): OrderNotification {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    channel: row.channel,
    status: row.status,
    attemptCount: Number(row.attempt_count),
    providerMessageId: row.provider_message_id ?? undefined,
    lastErrorCode: row.last_error_code ?? undefined,
    lastErrorSummary: row.last_error_summary ?? undefined,
    sentAt: row.sent_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ORDER_SELECT = [
  "id",
  "public_id",
  "customer",
  "items",
  "subtotal",
  "delivery_cost",
  "total",
  "currency",
  "delivery_method",
  "delivery_address",
  "order_status",
  "payment_status",
  "payment_method",
  "payment_provider_id",
  "payment_preference_id",
  "fulfillment_status",
  "fulfillment_updated_at",
  "confirmed_at",
  "preparing_at",
  "ready_at",
  "delivered_at",
  "cancelled_at",
  "created_at",
  "updated_at",
].join(",");

function mapOrder(row: OrderRow): AdminOrder {
  const fulfillmentStatus =
    row.fulfillment_status ??
    (row.order_status === "cancelled"
      ? "cancelled"
      : row.order_status === "confirmed"
        ? "confirmed"
        : "new");
  return {
    id: String(row.id),
    publicId: row.public_id,
    displayId: row.public_id.slice(0, 8).toUpperCase(),
    customer: row.customer,
    items: row.items,
    subtotal: Number(row.subtotal),
    deliveryCost: Number(row.delivery_cost),
    total: Number(row.total),
    currency: row.currency,
    deliveryMethod: row.delivery_method,
    deliveryAddress: row.delivery_address ?? undefined,
    orderStatus: row.order_status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    paymentProviderId: row.payment_provider_id ?? undefined,
    paymentPreferenceId: row.payment_preference_id ?? undefined,
    fulfillmentStatus,
    fulfillmentUpdatedAt: row.fulfillment_updated_at ?? row.created_at,
    confirmedAt: row.confirmed_at ?? undefined,
    preparingAt: row.preparing_at ?? undefined,
    readyAt: row.ready_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeSearch(value: string | undefined) {
  return value
    ?.trim()
    .slice(0, 80)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/[^a-z0-9@.+\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchableOrder(order: AdminOrder) {
  return [
    order.publicId,
    order.displayId,
    order.customer.firstName,
    order.customer.lastName,
    order.customer.whatsapp,
    order.customer.email,
    ...order.items.flatMap((item) => [item.sku, item.name]),
  ]
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR");
}

function argentinaDayKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

function contentRangeTotal(response: Response, fallback: number) {
  const value = response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
  return value ? Number(value) : fallback;
}

export class AdminStoreError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
  }
}

export class RuniaAdminStore {
  private readonly url: string;
  private readonly secretKey: string;
  private readonly tenantId: string;
  private readonly fetcher: typeof fetch;
  private supplierIdPromise: Promise<string> | null = null;

  constructor(options: RuniaAdminStoreOptions) {
    this.url = options.url.replace(/\/$/, "");
    this.secretKey = options.secretKey;
    this.tenantId = options.tenantId;
    this.fetcher = options.fetcher ?? fetch;
  }

  private headers(prefer?: string) {
    const headers: Record<string, string> = {
      apikey: this.secretKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (!this.secretKey.startsWith("sb_secret_")) {
      headers.Authorization = `Bearer ${this.secretKey}`;
    }
    if (prefer) headers.Prefer = prefer;
    return headers;
  }

  private async request(path: string, init: RequestInit = {}, prefer?: string) {
    return this.fetcher(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: { ...this.headers(prefer), ...init.headers },
      cache: "no-store",
    });
  }

  private async rows<T>(path: string, fallback: string, prefer?: string) {
    const response = await this.request(path, {}, prefer);
    if (!response.ok) throw new AdminStoreError(fallback, 502);
    return { rows: (await response.json()) as T[], response };
  }

  async findOperatorByAuthUser(authUserId: string) {
    const search = new URLSearchParams({
      select: "id,auth_user_id,tenant_id,display_name,role,active",
      tenant_id: `eq.${this.tenantId}`,
      auth_user_id: `eq.${authUserId}`,
      active: "is.true",
      limit: "1",
    });
    const { rows } = await this.rows<AdminOperatorRow>(
      `lombardo_admin_operators?${search}`,
      "No pudimos validar el acceso del operador.",
    );
    return rows[0] ?? null;
  }

  async createSession(operatorId: string, tokenHash: string, expiresAt: Date) {
    const response = await this.request("lombardo_admin_sessions", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: this.tenantId,
        operator_id: operatorId,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      }),
    });
    if (!response.ok) {
      throw new AdminStoreError("No pudimos iniciar la sesión del Admin.", 502);
    }
  }

  async getSession(tokenHash: string): Promise<AdminSession | null> {
    const search = new URLSearchParams({
      select:
        "expires_at,operator:operator_id!inner(id,auth_user_id,tenant_id,display_name,role,active)",
      tenant_id: `eq.${this.tenantId}`,
      token_hash: `eq.${tokenHash}`,
      revoked_at: "is.null",
      expires_at: `gt.${new Date().toISOString()}`,
      "operator.active": "is.true",
      "operator.tenant_id": `eq.${this.tenantId}`,
      limit: "1",
    });
    const { rows } = await this.rows<AdminSessionRow>(
      `lombardo_admin_sessions?${search}`,
      "No pudimos validar la sesión del Admin.",
    );
    const row = rows[0];
    const operator = Array.isArray(row?.operator)
      ? row.operator[0]
      : row?.operator;
    if (!row || !operator?.active) return null;
    return {
      operatorId: operator.id,
      authUserId: operator.auth_user_id,
      tenantId: operator.tenant_id,
      displayName: operator.display_name,
      role: operator.role,
      expiresAt: row.expires_at,
    };
  }

  async revokeSession(tokenHash: string) {
    const search = new URLSearchParams({
      tenant_id: `eq.${this.tenantId}`,
      token_hash: `eq.${tokenHash}`,
      revoked_at: "is.null",
    });
    await this.request(`lombardo_admin_sessions?${search}`, {
      method: "PATCH",
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    });
  }

  private orderSearch(filters: AdminOrderFilters, limit: number) {
    const search = new URLSearchParams({
      select: ORDER_SELECT,
      tenant_id: `eq.${this.tenantId}`,
      order: "created_at.desc",
      limit: String(limit),
    });
    if (filters.fulfillment) {
      search.set("fulfillment_status", `eq.${filters.fulfillment}`);
    }
    if (filters.payment) search.set("payment_status", `eq.${filters.payment}`);
    if (filters.delivery) search.set("delivery_method", `eq.${filters.delivery}`);
    if (filters.from) {
      search.append("created_at", `gte.${filters.from}T00:00:00-03:00`);
    }
    if (filters.to) {
      search.append("created_at", `lte.${filters.to}T23:59:59.999-03:00`);
    }
    return search;
  }

  async listOrders(filters: AdminOrderFilters = {}, limit = 250) {
    const { rows } = await this.rows<OrderRow>(
      `commerce_orders?${this.orderSearch(filters, limit)}`,
      "No pudimos cargar los pedidos.",
    );
    const orders = rows.map(mapOrder);
    const term = safeSearch(filters.search);
    return term
      ? orders.filter((order) => searchableOrder(order).includes(term))
      : orders;
  }

  async getOrder(publicId: string) {
    const search = new URLSearchParams({
      select: ORDER_SELECT,
      tenant_id: `eq.${this.tenantId}`,
      public_id: `eq.${publicId}`,
      limit: "1",
    });
    const { rows } = await this.rows<OrderRow>(
      `commerce_orders?${search}`,
      "No pudimos cargar el pedido.",
    );
    if (!rows[0]) return null;
    const order = mapOrder(rows[0]);
    const notificationSearch = new URLSearchParams({
      select:
        "id,order_id,channel,status,attempt_count,provider_message_id,last_error_code,last_error_summary,sent_at,created_at,updated_at",
      tenant_id: `eq.${this.tenantId}`,
      order_id: `eq.${order.id}`,
      kind: "eq.new_order",
      order: "created_at.desc",
      limit: "1",
    });
    const notificationResult = await this.rows<NotificationRow>(
      `commerce_order_notifications?${notificationSearch}`,
      "No pudimos cargar el estado de la notificación.",
    );
    return {
      ...order,
      newOrderNotification: notificationResult.rows[0]
        ? mapNotification(notificationResult.rows[0])
        : undefined,
    };
  }

  async getDashboard(): Promise<AdminDashboard> {
    const orders = await this.listOrders({}, 500);
    const today = argentinaDayKey(new Date());
    const todayOrders = orders.filter((order) => argentinaDayKey(order.createdAt) === today);
    return {
      todayOrders: todayOrders.length,
      todayRevenue: todayOrders
        .filter((order) => order.fulfillmentStatus !== "cancelled")
        .reduce((sum, order) => sum + order.total, 0),
      newOrders: orders.filter((order) => order.fulfillmentStatus === "new").length,
      preparingOrders: orders.filter(
        (order) => order.fulfillmentStatus === "preparing",
      ).length,
      readyOrders: orders.filter((order) => order.fulfillmentStatus === "ready").length,
      pendingPaymentOrders: orders.filter(
        (order) => order.paymentStatus === "pending",
      ).length,
      recentOrders: orders.slice(0, 8),
    };
  }

  async transitionFulfillment(
    orderId: string,
    expectedStatus: FulfillmentStatus,
    targetStatus: FulfillmentStatus,
    operatorUserId: string,
  ): Promise<FulfillmentTransitionResult> {
    if (!/^\d{1,18}$/.test(orderId)) {
      throw new AdminStoreError("El pedido no es válido.", 400);
    }
    const response = await this.request("rpc/lombardo_transition_fulfillment_status", {
      method: "POST",
      body: JSON.stringify({
        p_tenant_id: this.tenantId,
        p_order_id: Number(orderId),
        p_expected_status: expectedStatus,
        p_target_status: targetStatus,
        p_operator_user_id: operatorUserId,
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        code?: string;
        message?: string;
      };
      if (payload.code === "40001") {
        throw new AdminStoreError(
          "El pedido cambió en otra pantalla. Actualizá y volvé a intentar.",
          409,
        );
      }
      if (payload.code === "22023") {
        throw new AdminStoreError(
          payload.message === "approved order requires refund workflow"
            ? "Un pedido aprobado requiere un flujo de devolución antes de cancelarse."
            : "Esa transición no está permitida.",
          422,
        );
      }
      throw new AdminStoreError("No pudimos actualizar el pedido.", 502);
    }
    const rows = (await response.json()) as TransitionRow[];
    if (!rows[0]?.order_record) {
      throw new AdminStoreError("Runia no devolvió el pedido actualizado.", 502);
    }
    return { changed: rows[0].changed, order: mapOrder(rows[0].order_record) };
  }

  private async supplierId() {
    this.supplierIdPromise ??= (async () => {
      const search = new URLSearchParams({
        select: "id,tenants:tenant_id!inner(slug,status)",
        code: "eq.vinros",
        "tenants.slug": `eq.${this.tenantId}`,
        "tenants.status": "eq.active",
        active: "is.true",
        limit: "1",
      });
      const { rows } = await this.rows<SupplierRow>(
        `suppliers?${search}`,
        "No pudimos resolver el catálogo de Lombardo.",
      );
      if (!rows[0]?.id) throw new AdminStoreError("Proveedor no disponible.", 502);
      return rows[0].id;
    })();
    return this.supplierIdPromise;
  }

  async listProducts(input: {
    offset?: number;
    limit?: number;
    search?: string;
    eligibility?: AdminProduct["eligibilityStatus"];
  }): Promise<AdminProductPage> {
    const supplierId = await this.supplierId();
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const limit = Math.min(100, Math.max(20, Math.trunc(input.limit ?? 50)));
    const search = new URLSearchParams({
      select:
        "id,supplier_sku,name_raw,presentation_raw,normalized_presentation,active,eligibility_status,retail_prices:supplier_prices(price_type,current_price)",
      supplier_id: `eq.${supplierId}`,
      order: "normalized_name.asc,id.asc",
      offset: String(offset),
      limit: String(limit),
    });
    if (input.eligibility) {
      search.set("eligibility_status", `eq.${input.eligibility}`);
    }
    const term = safeSearch(input.search);
    if (term) {
      search.set(
        "or",
        `(normalized_name.ilike.*${term}*,supplier_sku.ilike.*${term}*)`,
      );
    }
    const { rows, response } = await this.rows<ProductRow>(
      `supplier_products?${search}`,
      "No pudimos cargar los productos.",
      "count=exact",
    );
    const products = rows.map((row): AdminProduct => {
      const prices = Array.isArray(row.retail_prices)
        ? row.retail_prices
        : row.retail_prices
          ? [row.retail_prices]
          : [];
      const retail = Number(
        prices.find((price) => price.price_type === "retail")?.current_price,
      );
      const retailPrice = Number.isFinite(retail) && retail > 0 ? retail : null;
      const published =
        row.active && row.eligibility_status === "safe" && retailPrice !== null;
      return {
        id: row.id,
        sku: row.supplier_sku,
        name: row.name_raw,
        presentation:
          row.normalized_presentation || row.presentation_raw || "Unidad",
        category: categoryForSupplierSku(row.supplier_sku).name,
        retailPrice,
        active: row.active,
        eligibilityStatus: row.eligibility_status,
        publicationStatus: published ? "published" : "not_published",
      };
    });
    const total = contentRangeTotal(response, offset + products.length);
    return {
      products,
      total,
      offset,
      limit,
      hasMore: offset + products.length < total,
    };
  }

  async listCustomers(): Promise<AdminCustomer[]> {
    const orders = await this.listOrders({}, 1000);
    const grouped = new Map<string, AdminCustomer>();
    for (const order of orders) {
      const whatsapp = order.customer.whatsapp.trim();
      const email = order.customer.email.trim().toLocaleLowerCase("es-AR");
      const key = whatsapp.replace(/\D/g, "") || email;
      const name = `${order.customer.firstName} ${order.customer.lastName}`.trim();
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          key,
          name,
          whatsapp,
          orderCount: 1,
          lastOrderAt: order.createdAt,
          historicalTotal: order.total,
        });
      } else {
        existing.orderCount += 1;
        existing.historicalTotal += order.total;
        if (order.createdAt > existing.lastOrderAt) {
          existing.lastOrderAt = order.createdAt;
          existing.name = name;
          existing.whatsapp = whatsapp;
        }
      }
    }
    return [...grouped.values()].sort((a, b) =>
      b.lastOrderAt.localeCompare(a.lastOrderAt),
    );
  }
}

import "server-only";

import type { PromotionRuntimeRecord } from "@/lib/promotions/types";

interface PromotionStoreOptions {
  url: string;
  secretKey: string;
  fetcher?: typeof fetch;
}

interface PromotionRow {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  discount_type: PromotionRuntimeRecord["discountType"];
  discount_value: number | string;
  start_at: string | null;
  end_at: string | null;
  minimum_order_amount: number | string;
  max_total_uses: number | null;
  max_uses_per_customer: number | null;
  applies_to: PromotionRuntimeRecord["appliesTo"];
  customer_scope: PromotionRuntimeRecord["customerScope"];
  stackable: boolean;
  first_order_only: boolean;
}

interface RedemptionRow {
  customer_key: string;
  status: "RESERVED" | "CONSUMED" | "RELEASED";
  reservation_expires_at: string;
}

export class SupabasePromotionStore {
  private readonly url: string;
  private readonly secretKey: string;
  private readonly fetcher: typeof fetch;

  constructor(options: PromotionStoreOptions) {
    this.url = options.url.replace(/\/$/, "");
    this.secretKey = options.secretKey;
    this.fetcher = options.fetcher ?? fetch;
  }

  private async rows<T>(path: string): Promise<T[]> {
    const response = await this.fetcher(`${this.url}/rest/v1/${path}`, {
      headers: {
        apikey: this.secretKey,
        Authorization: `Bearer ${this.secretKey}`,
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("No se pudo consultar el motor de promociones.");
    return (await response.json()) as T[];
  }

  async getRuntime(input: {
    tenantId: string;
    code: string;
    customerAccountId?: string;
    customerKey?: string;
  }): Promise<PromotionRuntimeRecord | null> {
    const search = new URLSearchParams({
      select: "id,tenant_id,code,name,status,discount_type,discount_value,start_at,end_at,minimum_order_amount,max_total_uses,max_uses_per_customer,applies_to,customer_scope,stackable,first_order_only",
      tenant_id: `eq.${input.tenantId}`,
      code: `eq.${input.code}`,
      limit: "1",
    });
    const promotion = (await this.rows<PromotionRow>(`commerce_promotions?${search}`))[0];
    if (!promotion) return null;

    const scoped = new URLSearchParams({
      tenant_id: `eq.${input.tenantId}`,
      promotion_id: `eq.${promotion.id}`,
      limit: "10000",
    });
    const [products, categories, customers, redemptions, orders] = await Promise.all([
      this.rows<{ product_id: string }>(`commerce_promotion_products?select=product_id&${scoped}`),
      this.rows<{ category_slug: string }>(`commerce_promotion_categories?select=category_slug&${scoped}`),
      this.rows<{ customer_account_id: string }>(`commerce_promotion_customers?select=customer_account_id&${scoped}`),
      this.rows<RedemptionRow>(`commerce_promotion_redemptions?select=customer_key,status,reservation_expires_at&${scoped}`),
      input.customerAccountId
        ? this.rows<{ id: number }>(
            `commerce_orders?select=id&tenant_record_id=eq.${encodeURIComponent(input.tenantId)}&customer_account_id=eq.${encodeURIComponent(input.customerAccountId)}&order_status=neq.cancelled&payment_status=not.in.(rejected,cancelled,refunded)&limit=1`,
          )
        : Promise.resolve([]),
    ]);
    const now = Date.now();
    const active = redemptions.filter((redemption) =>
      redemption.status === "CONSUMED" ||
      (redemption.status === "RESERVED" && new Date(redemption.reservation_expires_at).getTime() > now),
    );
    return {
      id: promotion.id,
      tenantId: promotion.tenant_id,
      code: promotion.code,
      name: promotion.name,
      status: promotion.status,
      discountType: promotion.discount_type,
      discountValue: Number(promotion.discount_value),
      startAt: promotion.start_at ?? undefined,
      endAt: promotion.end_at ?? undefined,
      minimumOrderAmount: Number(promotion.minimum_order_amount),
      maxTotalUses: promotion.max_total_uses ?? undefined,
      maxUsesPerCustomer: promotion.max_uses_per_customer ?? undefined,
      appliesTo: promotion.applies_to,
      customerScope: promotion.customer_scope,
      stackable: promotion.stackable,
      firstOrderOnly: promotion.first_order_only,
      productIds: products.map((row) => row.product_id),
      categorySlugs: categories.map((row) => row.category_slug),
      customerAccountIds: customers.map((row) => row.customer_account_id),
      activeUses: active.length,
      customerActiveUses: input.customerKey
        ? active.filter((redemption) => redemption.customer_key === input.customerKey).length
        : 0,
      validOrderCount: orders.length,
    };
  }
}

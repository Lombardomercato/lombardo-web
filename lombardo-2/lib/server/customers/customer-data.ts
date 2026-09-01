import "server-only";

import type {
  OrderCurrency,
  OrderItemSnapshot,
  OrderStatus,
  PaymentStatus,
} from "@/types/checkout";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  getActiveCustomerAccountForClient,
  getClaimsSubjectForClient,
} from "./customer-auth";
import { loadCustomerDefaultAddress } from "./default-address";
import type { CustomerAccountSummary } from "./types";

interface CustomerOrderRow {
  public_id: string;
  items: OrderItemSnapshot[];
  management_items?: OrderItemSnapshot[] | null;
  total: number | string;
  management_total?: number | string | null;
  currency: OrderCurrency;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  created_at: string;
}

export interface CustomerOrderSummary {
  publicId: string;
  displayId: string;
  itemCount: number;
  total: number;
  currency: OrderCurrency;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
}

export interface CustomerAccountData {
  account: CustomerAccountSummary;
  defaultAddress: Awaited<ReturnType<typeof loadCustomerDefaultAddress>>;
  orders: CustomerOrderSummary[];
}

export interface RepeatableOrderSummary {
  publicId: string;
  displayId: string;
  itemCount: number;
  createdAt: string;
}

function mapOrder(row: CustomerOrderRow): CustomerOrderSummary {
  const items = Array.isArray(row.management_items)
    ? row.management_items
    : row.items;
  return {
    publicId: row.public_id,
    displayId: row.public_id.slice(0, 8).toUpperCase(),
    itemCount: Array.isArray(items)
      ? items.reduce((total, item) => total + Number(item.quantity || 0), 0)
      : 0,
    total: Number(row.management_total ?? row.total),
    currency: row.currency,
    orderStatus: row.order_status,
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
  };
}

/** Loads account and order history with the customer's publishable-key client.
 * Explicit ownership filters complement (and never replace) database RLS.
 */
export async function getCurrentCustomerAccountData(
  expectedAccount: CustomerAccountSummary,
): Promise<CustomerAccountData | null> {
  const supabase = await createSupabaseServerClient();
  const authUserId = await getClaimsSubjectForClient(supabase);
  if (!authUserId || authUserId !== expectedAccount.authUserId) return null;

  const account = await getActiveCustomerAccountForClient(
    supabase,
    expectedAccount.tenantId,
    authUserId,
  );
  if (!account || account.id !== expectedAccount.id) return null;

  const [ordersResult, defaultAddress] = await Promise.all([
    supabase
      .from("commerce_orders")
      .select(
        "public_id,items,management_items,total,management_total,currency,order_status,payment_status,created_at",
      )
      .eq("tenant_record_id", account.tenantId)
      .eq("customer_account_id", account.id)
      .order("created_at", { ascending: false })
      .limit(50),
    loadCustomerDefaultAddress(supabase, account),
  ]);

  if (ordersResult.error) {
    throw new Error("No se pudieron cargar los pedidos de la cuenta.", {
      cause: ordersResult.error,
    });
  }

  return {
    account,
    defaultAddress,
    orders: ((ordersResult.data ?? []) as CustomerOrderRow[]).map(mapOrder),
  };
}

export async function getLatestRepeatableOrder(
  expectedAccount: CustomerAccountSummary,
): Promise<RepeatableOrderSummary | null> {
  const supabase = await createSupabaseServerClient();
  const authUserId = await getClaimsSubjectForClient(supabase);
  if (!authUserId || authUserId !== expectedAccount.authUserId) return null;

  const account = await getActiveCustomerAccountForClient(
    supabase,
    expectedAccount.tenantId,
    authUserId,
  );
  if (!account || account.id !== expectedAccount.id) return null;

  const { data, error } = await supabase
    .from("commerce_orders")
    .select("public_id,items,management_items,created_at")
    .eq("tenant_record_id", account.tenantId)
    .eq("customer_account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("No se pudo cargar el último pedido de la cuenta.", {
      cause: error,
    });
  }
  if (!data) return null;

  const effectiveItems = Array.isArray(data.management_items)
    ? data.management_items
    : data.items;
  const items = Array.isArray(effectiveItems)
    ? (effectiveItems as OrderItemSnapshot[])
    : [];
  return {
    publicId: String(data.public_id),
    displayId: String(data.public_id).slice(0, 8).toUpperCase(),
    itemCount: items.reduce(
      (total, item) => total + Number(item.quantity || 0),
      0,
    ),
    createdAt: String(data.created_at),
  };
}

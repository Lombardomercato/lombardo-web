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
import type { CustomerAccountSummary } from "./types";

interface CustomerOrderRow {
  public_id: string;
  items: OrderItemSnapshot[];
  total: number | string;
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
  orders: CustomerOrderSummary[];
}

function mapOrder(row: CustomerOrderRow): CustomerOrderSummary {
  return {
    publicId: row.public_id,
    displayId: row.public_id.slice(0, 8).toUpperCase(),
    itemCount: Array.isArray(row.items)
      ? row.items.reduce((total, item) => total + Number(item.quantity || 0), 0)
      : 0,
    total: Number(row.total),
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

  const { data, error } = await supabase
    .from("commerce_orders")
    .select(
      "public_id,items,total,currency,order_status,payment_status,created_at",
    )
    .eq("tenant_record_id", account.tenantId)
    .eq("customer_account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error("No se pudieron cargar los pedidos de la cuenta.", {
      cause: error,
    });
  }

  return {
    account,
    orders: ((data ?? []) as CustomerOrderRow[]).map(mapOrder),
  };
}

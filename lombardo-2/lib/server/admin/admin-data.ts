import "server-only";

import { createAdminStore, requireAdminSession } from "./admin-auth";
import type { AdminOrderFilters, AdminProduct } from "./types";

export async function loadAdminDashboard() {
  await requireAdminSession();
  return createAdminStore().getDashboard();
}

export async function loadAdminOrders(filters: AdminOrderFilters = {}) {
  await requireAdminSession();
  return createAdminStore().listOrders(filters);
}

export async function loadAdminOrder(publicId: string) {
  await requireAdminSession();
  return createAdminStore().getOrder(publicId);
}

export async function loadAdminProducts(input: {
  offset?: number;
  limit?: number;
  search?: string;
  eligibility?: AdminProduct["eligibilityStatus"];
}) {
  await requireAdminSession();
  return createAdminStore().listProducts(input);
}

export async function loadAdminCustomers() {
  await requireAdminSession();
  return createAdminStore().listCustomers();
}

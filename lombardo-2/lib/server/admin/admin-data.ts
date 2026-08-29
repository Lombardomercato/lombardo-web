import "server-only";

import { createAdminStore, requireAdminSession } from "./admin-auth";
import type { AdminOrderFilters, AdminProduct, MatchConfidenceBand, MatchReviewStatus } from "./types";

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
  category?: string;
}) {
  await requireAdminSession();
  return createAdminStore().listProducts(input);
}

export async function loadAdminProduct(productId: string) {
  await requireAdminSession();
  return createAdminStore().getProduct(productId);
}

export async function loadVinrosHealth() {
  await requireAdminSession();
  return createAdminStore().getVinrosHealth();
}

export async function loadVinrosReviewProducts(
  status: "blocked" | "pending_review",
) {
  await requireAdminSession();
  return createAdminStore().listVinrosReviewProducts(status);
}

export async function loadAdminImageCandidates(input: {
  offset?: number;
  limit?: number;
  status?: MatchReviewStatus;
  confidenceBand?: MatchConfidenceBand;
  publicationStatus?: "pending" | "approved" | "rejected";
  approvalMode?: "auto_exact_high";
} = {}) {
  await requireAdminSession();
  return createAdminStore().listImageCandidates(input);
}

export async function loadProductsWithoutImageMatch(input: { offset?: number; limit?: number } = {}) {
  await requireAdminSession();
  return createAdminStore().listProductsWithoutImageMatch(input);
}

export async function loadProductImageSystemPilot() {
  await requireAdminSession();
  return createAdminStore().listProductImageSystemPilot();
}

export async function loadAdminCustomers() {
  await requireAdminSession();
  return createAdminStore().listCustomers();
}

export async function loadAdminCustomer(customerId: string) {
  await requireAdminSession();
  return createAdminStore().getCustomer(customerId);
}

export async function loadAdminPromotions() {
  await requireAdminSession();
  return createAdminStore().listPromotions();
}

export async function loadAdminPromotion(promotionId: string) {
  await requireAdminSession();
  return createAdminStore().getPromotion(promotionId);
}

export async function loadAdminSecretCellar() {
  await requireAdminSession();
  const { createSecretCellarService } = await import("../secret-cellar/secret-cellar-service");
  return createSecretCellarService().getAdminDashboard();
}

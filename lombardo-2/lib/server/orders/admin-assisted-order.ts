import "server-only";

import type { AdminOrderManagementInput } from "../admin/types.ts";
import type { OrderDraft, OrderItemSnapshot } from "../../../types/checkout.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AdminAssistedOrderItem {
  productId: string;
  quantity: number;
  expectedUnitPrice: number;
  manualUnitPrice: number;
}

export class AdminAssistedOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAssistedOrderError";
  }
}

function money(value: unknown, label: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    throw new AdminAssistedOrderError(`${label} no es válido.`);
  }
  return Math.round(amount * 100) / 100;
}

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

export function parseAdminAssistedOrderItems(
  value: unknown,
): AdminAssistedOrderItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new AdminAssistedOrderError(
      "El pedido debe tener entre 1 y 50 productos.",
    );
  }

  const seen = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new AdminAssistedOrderError("Hay una línea de producto inválida.");
    }
    const item = entry as Record<string, unknown>;
    const productId = typeof item.productId === "string"
      ? item.productId.trim()
      : "";
    const quantity = Number(item.quantity);
    if (
      !UUID_PATTERN.test(productId) ||
      seen.has(productId) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      throw new AdminAssistedOrderError(
        "Hay productos, cantidades o líneas repetidas inválidas.",
      );
    }
    seen.add(productId);
    return {
      productId,
      quantity,
      expectedUnitPrice: money(item.expectedUnitPrice, "El precio vigente"),
      manualUnitPrice: money(item.manualUnitPrice, "El precio manual"),
    };
  });
}

export function hasAdminManualPrices(items: AdminAssistedOrderItem[]) {
  return items.some(
    (item) => Math.abs(item.manualUnitPrice - item.expectedUnitPrice) >= 0.01,
  );
}

export function buildAdminAssistedManagement(
  order: OrderDraft,
  submittedItems: AdminAssistedOrderItem[],
  reasonValue: string,
): AdminOrderManagementInput | null {
  const submittedById = new Map(
    submittedItems.map((item) => [item.productId, item]),
  );
  if (
    submittedById.size !== order.items.length ||
    order.items.some((item) => !submittedById.has(item.productId))
  ) {
    throw new AdminAssistedOrderError(
      "No pudimos validar todos los productos del pedido.",
    );
  }

  const reason = reasonValue.trim().slice(0, 500);
  const hasManualPrice = hasAdminManualPrices(submittedItems);
  if (!hasManualPrice) return null;
  if (reason.length < 3) {
    throw new AdminAssistedOrderError(
      "Indicá el motivo del cambio de precio.",
    );
  }

  const items: OrderItemSnapshot[] = order.items.map((item) => {
    const submitted = submittedById.get(item.productId)!;
    if (
      submitted.quantity !== item.quantity ||
      Math.abs(submitted.expectedUnitPrice - (item.commercialUnitPrice ?? item.unitPrice)) >= 0.01
    ) {
      throw new AdminAssistedOrderError(
        "El producto o su precio vigente cambió. Actualizá el pedido.",
      );
    }

    const unitPrice = submitted.manualUnitPrice;
    const manualPriceOverride =
      Math.abs(unitPrice - submitted.expectedUnitPrice) >= 0.01;
    const lineTotal = rounded(unitPrice * submitted.quantity);
    return {
      ...item,
      catalogUnitPrice: submitted.expectedUnitPrice,
      manualPriceOverride,
      commercialUnitPrice: unitPrice,
      couponDiscountAmount: 0,
      finalUnitPrice: unitPrice,
      unitPrice,
      lineCommercialTotal: lineTotal,
      lineCouponDiscount: 0,
      lineFinalTotal: lineTotal,
      lineTotal,
    };
  });
  const itemsSubtotal = rounded(
    items.reduce((sum, item) => sum + item.lineTotal, 0),
  );

  return {
    customer: order.customer,
    items,
    deliveryMethod: order.deliveryMethod,
    deliveryAddress: order.deliveryAddress,
    itemsSubtotal,
    discountAmount: 0,
    discountReason: reason,
    subtotal: itemsSubtotal,
    deliveryCost: order.deliveryCost,
    total: rounded(itemsSubtotal + order.deliveryCost),
    paymentStatus: "pending",
  };
}

export function adminAssistedManagementMatches(
  orderItems: OrderItemSnapshot[],
  submittedItems: AdminAssistedOrderItem[],
) {
  const submittedById = new Map(
    submittedItems.map((item) => [item.productId, item]),
  );
  return orderItems.length === submittedById.size && orderItems.every((item) => {
    const submitted = submittedById.get(item.productId);
    return Boolean(
      submitted &&
      submitted.quantity === item.quantity &&
      Math.abs(submitted.manualUnitPrice - item.unitPrice) < 0.01,
    );
  });
}

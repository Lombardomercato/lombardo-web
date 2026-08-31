import "server-only";

import type { AdminOrderFormPayload } from "@/lib/admin/order-management";
import {
  isActiveDeliveryMethod,
  isDeliveryCityAllowed,
  requiresDeliveryAddress,
} from "../../checkout/delivery-methods.ts";
import type {
  AdminOrderManagementInput,
  AdminProduct,
} from "@/lib/server/admin/types";
import type {
  CheckoutCustomer,
  DeliveryAddress,
  DeliveryMethod,
  OrderItemSnapshot,
} from "@/types/checkout";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[1-9][0-9]{7,14}$/;

export class AdminOrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminOrderValidationError";
  }
}

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function amount(value: unknown, label: string, maximum = 1_000_000_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) {
    throw new AdminOrderValidationError(`${label} no es válido.`);
  }
  return Math.round(parsed * 100) / 100;
}

function customer(value: unknown): CheckoutCustomer {
  if (!value || typeof value !== "object") {
    throw new AdminOrderValidationError("Completá los datos del cliente.");
  }
  const source = value as Record<string, unknown>;
  const firstName = text(source.firstName, 80);
  const lastName = text(source.lastName, 80);
  const whatsapp = text(source.whatsapp, 24).replace(/[\s()-]/g, "");
  const email = text(source.email, 254).toLocaleLowerCase("es-AR");
  const dni = text(source.dni, 24);
  if (!firstName) throw new AdminOrderValidationError("Ingresá el nombre del cliente.");
  if (whatsapp && !PHONE_PATTERN.test(whatsapp)) {
    throw new AdminOrderValidationError("El WhatsApp no es válido.");
  }
  if (email && !EMAIL_PATTERN.test(email)) {
    throw new AdminOrderValidationError("El email no es válido.");
  }
  return { firstName, lastName, whatsapp, email, dni: dni || undefined };
}

function address(value: unknown): DeliveryAddress {
  if (!value || typeof value !== "object") {
    throw new AdminOrderValidationError("Completá la dirección de entrega.");
  }
  const source = value as Record<string, unknown>;
  const result: DeliveryAddress = {
    street: text(source.street, 120),
    number: text(source.number, 20),
    floorApartment: text(source.floorApartment, 50) || undefined,
    city: text(source.city, 80),
    province: text(source.province, 80),
    postalCode: text(source.postalCode, 16) || undefined,
    references: text(source.references, 500) || undefined,
  };
  if (!result.street || !result.number || !result.city || !result.province) {
    throw new AdminOrderValidationError("La dirección de entrega está incompleta.");
  }
  return result;
}

export function parseAdminOrderPayload(
  raw: string,
  options: { allowLegacyDeliveryMethods?: boolean } = { allowLegacyDeliveryMethods: true },
): AdminOrderFormPayload {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AdminOrderValidationError("El formulario del pedido no es válido.");
  }
  if (!value || typeof value !== "object") {
    throw new AdminOrderValidationError("El formulario del pedido no es válido.");
  }
  const source = value as Record<string, unknown>;
  const rawItems = Array.isArray(source.items) ? source.items : [];
  if (!rawItems.length || rawItems.length > 50) {
    throw new AdminOrderValidationError("El pedido debe tener entre 1 y 50 productos.");
  }
  const seen = new Set<string>();
  const items = rawItems.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new AdminOrderValidationError("Hay una línea de producto inválida.");
    }
    const item = entry as Record<string, unknown>;
    const productId = text(item.productId, 36);
    const quantity = Number(item.quantity);
    const unitPrice = amount(item.unitPrice, "El precio unitario");
    if (!UUID_PATTERN.test(productId) || seen.has(productId)) {
      throw new AdminOrderValidationError("Hay productos inválidos o repetidos.");
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999 || unitPrice <= 0) {
      throw new AdminOrderValidationError("La cantidad o el precio no son válidos.");
    }
    seen.add(productId);
    return { productId, quantity, unitPrice };
  });
  const rawDeliveryMethod = source.deliveryMethod;
  const deliveryMethod: DeliveryMethod =
    rawDeliveryMethod === "PICKUP" ||
    rawDeliveryMethod === "DELIVERY" ||
    rawDeliveryMethod === "DELIVERY_ROSARIO" ||
    rawDeliveryMethod === "DELIVERY_SOUTH"
      ? rawDeliveryMethod
      : "DELIVERY_ROSARIO";
  if (!options.allowLegacyDeliveryMethods && !isActiveDeliveryMethod(deliveryMethod)) {
    throw new AdminOrderValidationError("Elegí una zona de entrega vigente.");
  }
  const deliveryAddress = requiresDeliveryAddress(deliveryMethod)
    ? address(source.deliveryAddress)
    : undefined;
  if (
    isActiveDeliveryMethod(deliveryMethod) &&
    deliveryAddress &&
    !isDeliveryCityAllowed(deliveryMethod, deliveryAddress.city)
  ) {
    throw new AdminOrderValidationError("La localidad no corresponde a la zona elegida.");
  }
  const paymentStatus = source.paymentStatus === "approved" ? "approved" : "pending";
  return {
    customer: customer(source.customer),
    items,
    deliveryMethod,
    deliveryAddress,
    deliveryCost: requiresDeliveryAddress(deliveryMethod)
      ? amount(source.deliveryCost, "El costo de entrega")
      : 0,
    discountAmount: amount(source.discountAmount, "El descuento"),
    discountReason: text(source.discountReason, 500) || undefined,
    notes: text(source.notes, 4000) || undefined,
    paymentStatus,
  };
}

export function buildAdminOrderManagementInput(
  payload: AdminOrderFormPayload,
  products: AdminProduct[],
): AdminOrderManagementInput {
  const productsById = new Map(products.map((product) => [product.id, product]));
  let hasPriceOverride = false;
  const items: OrderItemSnapshot[] = payload.items.map((line) => {
    const product = productsById.get(line.productId);
    if (!product || product.retailPrice === null || !product.active || product.eligibilityStatus !== "safe") {
      throw new AdminOrderValidationError("Uno de los productos ya no está disponible en Runia.");
    }
    const catalogUnitPrice = Math.round(product.retailPrice * 100) / 100;
    const manualPriceOverride = Math.abs(catalogUnitPrice - line.unitPrice) >= 0.01;
    hasPriceOverride ||= manualPriceOverride;
    const lineTotal = Math.round(line.unitPrice * line.quantity * 100) / 100;
    return {
      productId: product.id,
      sourceProductId: product.id,
      sku: product.sku,
      name: product.name,
      categorySlug: product.categorySlug,
      catalogUnitPrice,
      manualPriceOverride,
      baseUnitPrice: line.unitPrice,
      priceType: "retail",
      pricingPolicy: "RETAIL",
      discountPercent: 0,
      discountAmount: 0,
      commercialUnitPrice: line.unitPrice,
      policyDiscountAmount: 0,
      couponDiscountAmount: 0,
      finalUnitPrice: line.unitPrice,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      lineBaseTotal: lineTotal,
      lineDiscount: 0,
      lineCommercialTotal: lineTotal,
      lineCouponDiscount: 0,
      lineFinalTotal: lineTotal,
      lineTotal,
    };
  });
  if (productsById.size !== payload.items.length) {
    throw new AdminOrderValidationError("No pudimos validar todos los productos del pedido.");
  }
  const itemsSubtotal = Math.round(
    items.reduce((sum, item) => sum + item.lineTotal, 0) * 100,
  ) / 100;
  if (payload.discountAmount > itemsSubtotal) {
    throw new AdminOrderValidationError("El descuento no puede superar el valor de los productos.");
  }
  if ((payload.discountAmount > 0 || hasPriceOverride) && !payload.discountReason) {
    throw new AdminOrderValidationError("Indicá el motivo del descuento o cambio de precio.");
  }
  const subtotal = Math.round((itemsSubtotal - payload.discountAmount) * 100) / 100;
  const total = Math.round((subtotal + payload.deliveryCost) * 100) / 100;
  return {
    customer: payload.customer,
    items,
    deliveryMethod: payload.deliveryMethod,
    deliveryAddress: payload.deliveryAddress,
    itemsSubtotal,
    discountAmount: payload.discountAmount,
    discountReason: payload.discountReason,
    subtotal,
    deliveryCost: payload.deliveryCost,
    total,
    notes: payload.notes,
    paymentStatus: payload.paymentStatus,
  };
}

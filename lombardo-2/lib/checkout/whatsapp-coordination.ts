import type { OrderDraft } from "../../types/checkout.ts";
import { formatCurrency } from "../utils/format-currency.ts";
import {
  DELIVERY_COORDINATION_NOTICE,
  deliveryMethodLabel,
  requiresDeliveryAddress,
} from "./delivery-methods.ts";

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function getWhatsAppRecipient(configuredUrl: string | null | undefined) {
  if (!configuredUrl) return null;
  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "https:") return null;

    const hostname = url.hostname.toLowerCase();
    const rawPhone = hostname === "wa.me"
      ? url.pathname.split("/").filter(Boolean)[0]
      : ["api.whatsapp.com", "web.whatsapp.com"].includes(hostname)
        ? url.searchParams.get("phone")
        : null;
    const phone = rawPhone?.replace(/\D/g, "") ?? "";
    return /^\d{10,15}$/.test(phone) ? phone : null;
  } catch {
    return null;
  }
}

export function buildWhatsAppCoordinationMessage(order: OrderDraft) {
  const lines = [
    `Hola Lombardo. Quiero coordinar el pago del pedido #${order.publicId.slice(0, 8).toUpperCase()}.`,
    "",
    "Productos:",
    ...order.items.map(
      (item) =>
        `- ${item.quantity} × ${compact(item.name)} — ${formatCurrency(item.lineTotal)}`,
    ),
    "",
    `${order.deliveryCostMode === "TO_BE_CONFIRMED" ? "Total provisorio" : "Total"}: ${formatCurrency(order.total)}`,
    `Entrega: ${deliveryMethodLabel(order.deliveryMethod)}`,
  ];

  if (requiresDeliveryAddress(order.deliveryMethod) && order.deliveryAddress) {
    const address = [
      `${compact(order.deliveryAddress.street)} ${compact(order.deliveryAddress.number)}`,
      order.deliveryAddress.floorApartment
        ? compact(order.deliveryAddress.floorApartment)
        : "",
      compact(order.deliveryAddress.city),
      compact(order.deliveryAddress.province),
      order.deliveryAddress.postalCode
        ? `CP ${compact(order.deliveryAddress.postalCode)}`
        : "",
    ].filter(Boolean);
    lines.push(`Dirección: ${address.join(", ")}`);
  }

  lines.push(
    `Cliente: ${compact(order.customer.firstName)} ${compact(order.customer.lastName)}`,
    `WhatsApp de contacto: ${compact(order.customer.whatsapp)}`,
    DELIVERY_COORDINATION_NOTICE,
    "",
    "Entiendo que el pedido fue recibido y que el pago todavía está pendiente de coordinación.",
  );

  return lines.join("\n");
}

export function buildWhatsAppCoordinationUrl(
  order: OrderDraft,
  configuredUrl: string | null | undefined,
) {
  const recipient = getWhatsAppRecipient(configuredUrl);
  if (!recipient) return null;
  const url = new URL(`https://wa.me/${recipient}`);
  url.searchParams.set("text", buildWhatsAppCoordinationMessage(order));
  return url.toString();
}

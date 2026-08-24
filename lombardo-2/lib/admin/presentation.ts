import type {
  AdminOrder,
  AdminProduct,
  FulfillmentStatus,
} from "@/lib/server/admin/types";
import type {
  DeliveryMethod,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/types/checkout";

export const FULFILLMENT_LABELS: Record<FulfillmentStatus, string> = {
  new: "NUEVO",
  confirmed: "CONFIRMADO",
  preparing: "PREPARANDO",
  ready: "LISTO",
  delivered: "ENTREGADO",
  cancelled: "CANCELADO",
};

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: "PENDIENTE",
  approved: "APROBADO",
  rejected: "RECHAZADO",
  cancelled: "CANCELADO",
  refunded: "DEVUELTO",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "PENDIENTE DE PAGO",
  confirmed: "CONFIRMADO",
  cancelled: "CANCELADO",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  mercado_pago: "MERCADO PAGO",
  whatsapp_coordination: "COORDINAR POR WHATSAPP",
};

export const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  PICKUP: "RETIRO",
  DELIVERY: "ENVÍO",
};

export const ELIGIBILITY_LABELS: Record<
  AdminProduct["eligibilityStatus"],
  string
> = {
  safe: "SAFE",
  blocked: "BLOCKED",
  pending_review: "PENDING REVIEW",
  supplier_only_cost: "SOLO COSTO",
};

const adminDateFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Cordoba",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatAdminDate(value: string) {
  return adminDateFormatter.format(new Date(value)).replace(",", " ·");
}

export function customerName(order: AdminOrder) {
  return `${order.customer.firstName} ${order.customer.lastName}`.trim();
}

export function customerWhatsAppUrl(order: AdminOrder) {
  let phone = order.customer.whatsapp.replace(/\D/g, "");
  if (phone.startsWith("0")) phone = phone.slice(1);
  if (!phone.startsWith("54")) phone = `54${phone}`;
  const message = [
    `Hola ${order.customer.firstName}, te escribimos de Lombardo por tu pedido #${order.displayId}.`,
    `Queríamos contarte que estamos revisándolo y coordinar los próximos pasos.`,
  ].join(" ");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export const NEXT_FULFILLMENT_ACTIONS: Record<
  FulfillmentStatus,
  Array<{ target: FulfillmentStatus; label: string; dangerous?: boolean }>
> = {
  new: [
    { target: "confirmed", label: "CONFIRMAR" },
    { target: "cancelled", label: "CANCELAR", dangerous: true },
  ],
  confirmed: [
    { target: "preparing", label: "PREPARAR" },
    { target: "cancelled", label: "CANCELAR", dangerous: true },
  ],
  preparing: [
    { target: "ready", label: "MARCAR LISTO" },
    { target: "cancelled", label: "CANCELAR", dangerous: true },
  ],
  ready: [
    { target: "delivered", label: "MARCAR ENTREGADO" },
    { target: "cancelled", label: "CANCELAR", dangerous: true },
  ],
  delivered: [],
  cancelled: [],
};

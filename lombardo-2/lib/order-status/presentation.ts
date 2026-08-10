import type { PublicOrderStatus } from "../../types/checkout.ts";

export type ReturnHint = "success" | "pending" | "failure" | undefined;

export interface OrderStatusPresentation {
  kicker: string;
  heading: string;
  message: string;
  tone: "confirmed" | "pending" | "problem";
}

export function getOrderStatusPresentation(
  order: PublicOrderStatus,
  returnHint?: ReturnHint,
): OrderStatusPresentation {
  if (order.paymentStatus === "approved") {
    return {
      kicker: "LISTO.",
      heading: "PAGO CONFIRMADO.",
      message: "Recibimos el pago y tu pedido ya quedó confirmado.",
      tone: "confirmed",
    };
  }
  if (order.paymentStatus === "rejected" || order.paymentStatus === "cancelled") {
    return {
      kicker: "PAGO NO CONFIRMADO.",
      heading: "NO PUDIMOS CONFIRMAR EL PAGO.",
      message: "Tu pedido sigue guardado. Podés volver a Mercado Pago e intentarlo otra vez.",
      tone: "problem",
    };
  }
  if (order.paymentStatus === "refunded") {
    return {
      kicker: "ACTUALIZACIÓN DEL PEDIDO.",
      heading: "PAGO DEVUELTO.",
      message: "El pago fue devuelto y el pedido quedó cancelado.",
      tone: "problem",
    };
  }
  return {
    kicker: returnHint === "success" ? "VOLVISTE DE MERCADO PAGO." : "EN PROCESO.",
    heading: "PAGO PENDIENTE.",
    message:
      returnHint === "success"
        ? "Mercado Pago informó el regreso, pero todavía estamos esperando la confirmación segura del pago."
        : "El pedido está recibido. Actualizaremos este estado cuando Mercado Pago confirme el pago.",
    tone: "pending",
  };
}

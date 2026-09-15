import type { AdminOrder } from "../server/admin/types.ts";

export function orderDeletionBlocker(order: Pick<AdminOrder,
  "paymentStatus" | "paymentMethod" | "fulfillmentStatus" | "paymentPreferenceId" | "paymentProviderId" | "paymentProofs"
>) {
  if (!(["pending", "rejected", "cancelled"] as string[]).includes(order.paymentStatus)) {
    return "Un pedido pagado o devuelto debe conservarse en el historial.";
  }
  if (!(order.fulfillmentStatus === "new" || order.fulfillmentStatus === "cancelled")) {
    return "Sólo se pueden eliminar pedidos nuevos o cancelados, no pedidos en proceso.";
  }
  if (order.paymentMethod === "mercado_pago" || order.paymentPreferenceId || order.paymentProviderId) {
    return "Un pedido con Mercado Pago debe resolverse por el flujo de cancelación de pago.";
  }
  if (order.paymentProofs?.some((proof) => proof.reviewStatus === "pending_review")) {
    return "Primero hay que revisar el comprobante recibido.";
  }
  return null;
}

export function parseOrderDeletionInput(formData: FormData) {
  const text = (key: string) => typeof formData.get(key) === "string" ? String(formData.get(key)).trim() : "";
  const publicId = text("publicId");
  const expectedUpdatedAt = text("expectedUpdatedAt");
  const action = text("deletionAction");
  const reason = text("reason");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(publicId)
    || !/^\d{4}-\d{2}-\d{2}T/.test(expectedUpdatedAt) || !Number.isFinite(Date.parse(expectedUpdatedAt))
    || expectedUpdatedAt.length > 64 || !["delete", "restore"].includes(action)
    || reason.length < 3 || reason.length > 500 || text("confirmed") !== "yes") {
    throw new Error("Confirmá la acción e ingresá un motivo de entre 3 y 500 caracteres.");
  }
  return { publicId, expectedUpdatedAt, deleted: action === "delete", reason };
}

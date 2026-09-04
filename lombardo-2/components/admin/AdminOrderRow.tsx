import Link from "next/link";
import { formatAdminDate, customerName, DELIVERY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/admin/presentation";
import type { AdminOrder } from "@/lib/server/admin/types";
import { formatCurrency } from "@/lib/utils/format-currency";
import { FulfillmentBadge, PaymentBadge } from "./OrderStatusBadge";
import styles from "@/app/admin/admin.module.css";

export function AdminOrderRow({ order }: { order: AdminOrder }) {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <Link className={styles.orderRow} href={`/admin/pedidos/${order.publicId}`}>
      <span>
        <strong className={styles.orderNumber}>#{order.displayId}</strong>
        <small className={styles.muted}>{formatAdminDate(order.createdAt)}</small>
      </span>
      <span>
        <strong>{customerName(order)}</strong>
        <small className={styles.muted}>
          {itemCount} {itemCount === 1 ? "producto" : "productos"} · {PAYMENT_METHOD_LABELS[order.paymentMethod]}{order.orderSource === "whatsapp" ? " · WHATSAPP" : ""}
        </small>
      </span>
      <strong>{formatCurrency(order.total)}</strong>
      <span>{DELIVERY_LABELS[order.deliveryMethod]}</span>
      <FulfillmentBadge status={order.fulfillmentStatus} />
      <PaymentBadge status={order.paymentStatus} />
    </Link>
  );
}

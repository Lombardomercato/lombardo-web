import {
  FULFILLMENT_LABELS,
  PAYMENT_LABELS,
} from "@/lib/admin/presentation";
import type {
  FulfillmentStatus,
} from "@/lib/server/admin/types";
import type { PaymentStatus } from "@/types/checkout";
import styles from "@/app/admin/admin.module.css";

export function FulfillmentBadge({ status }: { status: FulfillmentStatus }) {
  return (
    <span className={styles.statusBadge} data-status={status}>
      {FULFILLMENT_LABELS[status]}
    </span>
  );
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return (
    <span className={styles.paymentBadge} data-payment={status}>
      PAGO {PAYMENT_LABELS[status]}
    </span>
  );
}

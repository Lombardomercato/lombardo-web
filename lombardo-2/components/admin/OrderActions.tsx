import { transitionOrderAction } from "@/app/admin/actions";
import { NEXT_FULFILLMENT_ACTIONS } from "@/lib/admin/presentation";
import type { AdminOrder } from "@/lib/server/admin/types";
import styles from "@/app/admin/admin.module.css";

export function OrderActions({ order }: { order: AdminOrder }) {
  const actions = NEXT_FULFILLMENT_ACTIONS[order.fulfillmentStatus].filter(
    (action) => !(action.target === "cancelled" && order.paymentStatus === "approved"),
  );
  if (!actions.length) return null;
  return (
    <div className={styles.orderActions}>
      {actions.map((action) => (
        <form action={transitionOrderAction} key={action.target}>
          <input type="hidden" name="publicId" value={order.publicId} />
          <input
            type="hidden"
            name="expectedStatus"
            value={order.fulfillmentStatus}
          />
          <input type="hidden" name="targetStatus" value={action.target} />
          <button
            className={action.dangerous ? styles.dangerButton : styles.primaryButton}
            type="submit"
          >
            {action.label}
          </button>
        </form>
      ))}
    </div>
  );
}

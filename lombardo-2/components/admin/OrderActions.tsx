import {
  transitionOrderAction,
  updateOrderDeliveryCostAction,
  updateOrderPaymentAction,
} from "@/app/admin/actions";
import {
  FULFILLMENT_LABELS,
  PAYMENT_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/admin/presentation";
import type { AdminOrder, FulfillmentStatus } from "@/lib/server/admin/types";
import type { PaymentMethod, PaymentStatus } from "@/types/checkout";
import styles from "@/app/admin/admin.module.css";

const fulfillmentStatuses = Object.keys(FULFILLMENT_LABELS) as FulfillmentStatus[];
const paymentStatuses = Object.keys(PAYMENT_LABELS) as PaymentStatus[];
const paymentMethods = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

export function OrderActions({ order }: { order: AdminOrder }) {
  const operationalOptions = fulfillmentStatuses.filter((status) => {
    if (order.fulfillmentStatus === "cancelled") return status === "cancelled";
    return !(status === "cancelled" && order.paymentStatus === "approved");
  });

  return (
    <div className={styles.orderManagement}>
      <form action={transitionOrderAction} className={styles.orderManagementForm}>
        <h3>ESTADO DEL PEDIDO</h3>
        <p>Podés avanzar o volver a un estado anterior. Cada cambio notifica al cliente.</p>
        <input type="hidden" name="publicId" value={order.publicId} />
        <input type="hidden" name="expectedStatus" value={order.fulfillmentStatus} />
        <label>
          ESTADO OPERATIVO
          <select
            name="targetStatus"
            defaultValue={order.fulfillmentStatus}
            disabled={order.fulfillmentStatus === "cancelled"}
          >
            {operationalOptions.map((status) => (
              <option key={status} value={status}>{FULFILLMENT_LABELS[status]}</option>
            ))}
          </select>
        </label>
        <button
          className={styles.primaryButton}
          type="submit"
          disabled={order.fulfillmentStatus === "cancelled"}
        >
          GUARDAR ESTADO
        </button>
      </form>

      <form action={updateOrderPaymentAction} className={styles.orderManagementForm}>
        <h3>PAGO MANUAL</h3>
        <p>Para transferencia, efectivo o una corrección administrativa.</p>
        <input type="hidden" name="publicId" value={order.publicId} />
        <input type="hidden" name="expectedPaymentStatus" value={order.paymentStatus} />
        <input type="hidden" name="expectedPaymentMethod" value={order.paymentMethod} />
        <label>
          FORMA DE PAGO
          <select name="paymentMethod" defaultValue={order.paymentMethod}>
            {paymentMethods.map((method) => (
              <option key={method} value={method}>{PAYMENT_METHOD_LABELS[method]}</option>
            ))}
          </select>
        </label>
        <label>
          ESTADO DEL PAGO
          <select name="paymentStatus" defaultValue={order.paymentStatus}>
            {paymentStatuses.map((status) => (
              <option key={status} value={status}>{PAYMENT_LABELS[status]}</option>
            ))}
          </select>
        </label>
        <button className={styles.primaryButton} type="submit">GUARDAR PAGO</button>
      </form>

      {order.deliveryMethod !== "PICKUP" ? (
        <form action={updateOrderDeliveryCostAction} className={styles.orderManagementForm}>
          <h3>COSTO DE ENVÍO</h3>
          <p>Manual por ahora; queda identificado para automatizarlo más adelante.</p>
          <input type="hidden" name="publicId" value={order.publicId} />
          <input type="hidden" name="expectedDeliveryCost" value={order.deliveryCost} />
          <input type="hidden" name="managementRevision" value={order.managementRevision} />
          <label>
            IMPORTE
            <input
              name="deliveryCost"
              type="number"
              min="0"
              max="1000000"
              step="0.01"
              defaultValue={order.deliveryCost}
              inputMode="decimal"
              required
            />
          </label>
          <button className={styles.primaryButton} type="submit">GUARDAR ENVÍO</button>
        </form>
      ) : null}
    </div>
  );
}

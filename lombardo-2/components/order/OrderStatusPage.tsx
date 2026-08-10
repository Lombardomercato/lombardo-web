import Link from "next/link";
import { ClearCartAfterPayment } from "@/components/order/ClearCartAfterPayment";
import { RefreshOrderStatus } from "@/components/order/RefreshOrderStatus";
import {
  getOrderStatusPresentation,
  type ReturnHint,
} from "@/lib/order-status/presentation";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { PublicOrderStatus } from "@/types/checkout";
import styles from "./OrderStatusPage.module.css";

export function OrderStatusPage({
  order,
  returnHint,
}: {
  order: PublicOrderStatus;
  returnHint?: ReturnHint;
}) {
  const presentation = getOrderStatusPresentation(order, returnHint);
  const paymentCanRetry =
    order.paymentCheckoutUrl &&
    ["pending", "rejected", "cancelled"].includes(order.paymentStatus);

  return (
    <main className={styles.page} data-tone={presentation.tone}>
      {order.paymentStatus === "approved" ? <ClearCartAfterPayment /> : null}
      <div className={styles.meta}>
        <span>PEDIDO #{order.displayId}</span>
        <span>{order.currency}</span>
      </div>

      <section className={styles.hero} aria-labelledby="order-status-title">
        <p>{presentation.kicker}</p>
        <h1 id="order-status-title">{presentation.heading}</h1>
      </section>

      <div className={styles.details}>
        <section>
          <h2>{presentation.message}</h2>
          <p>
            La página de regreso no cambia el estado del pedido. La confirmación
            proviene únicamente de la verificación segura con Mercado Pago.
          </p>
          <div className={styles.actions}>
            {paymentCanRetry ? (
              <a href={order.paymentCheckoutUrl}>VOLVER A MERCADO PAGO →</a>
            ) : null}
            {order.paymentStatus === "pending" ? <RefreshOrderStatus /> : null}
            <Link href="/productos">VOLVER AL CATÁLOGO</Link>
          </div>
        </section>

        <aside aria-label="Resumen del pedido">
          <p>ESTADO</p>
          <dl>
            <div>
              <dt>PEDIDO</dt>
              <dd>{order.orderStatus.replace("_", " ")}</dd>
            </div>
            <div>
              <dt>PAGO</dt>
              <dd>{order.paymentStatus}</dd>
            </div>
            <div>
              <dt>TOTAL</dt>
              <dd>{formatCurrency(order.total)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </main>
  );
}

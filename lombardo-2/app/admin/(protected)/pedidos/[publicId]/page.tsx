import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderActions } from "@/components/admin/OrderActions";
import { FulfillmentBadge, PaymentBadge } from "@/components/admin/OrderStatusBadge";
import {
  customerName,
  customerWhatsAppUrl,
  DELIVERY_LABELS,
  formatAdminDate,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/admin/presentation";
import { loadAdminOrder } from "@/lib/server/admin/admin-data";
import { formatCurrency } from "@/lib/utils/format-currency";
import styles from "../../../admin.module.css";
import { retryOrderNotificationAction } from "@/app/admin/actions";

type Query = Record<string, string | string[] | undefined>;

function message(query: Query, name: string) {
  const value = query[name];
  return typeof value === "string" ? value.slice(0, 180) : "";
}

const NOTIFICATION_LABELS = {
  pending: "PENDIENTE",
  sending: "ENVIANDO",
  sent: "ENVIADA",
  failed: "FALLÓ",
  unknown: "RESULTADO A VERIFICAR",
} as const;

const NOTIFICATION_CHANNEL_LABELS = {
  whatsapp_cloud_api: "WHATSAPP",
  email_resend: "EMAIL",
} as const;

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<Query>;
}) {
  const [{ publicId }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(publicId)) notFound();
  const order = await loadAdminOrder(publicId);
  if (!order) notFound();
  const success = message(query, "success");
  const error = message(query, "error");

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>PEDIDO REAL</p>
          <h1>#{order.displayId}</h1>
        </div>
        <Link className={styles.secondaryButton} href="/admin/pedidos">VOLVER A PEDIDOS</Link>
      </header>

      {success ? <p className={styles.notice}>{success}</p> : null}
      {error ? <p className={styles.errorNotice}>{error}</p> : null}

      <div className={styles.detailGrid}>
        <div>
          <section className={styles.detailCard}>
            <h2>PRODUCTOS</h2>
            <div className={styles.lineItems}>
              {order.items.map((item) => (
                <div className={styles.lineItem} key={`${item.productId}-${item.sku}`}>
                  <span>
                    <strong>{item.quantity} × {item.name}</strong>
                    <small className={styles.muted}>SKU {item.sku} · {formatCurrency(item.unitPrice)} c/u</small>
                  </span>
                  <strong>{formatCurrency(item.lineTotal)}</strong>
                </div>
              ))}
              <div className={styles.lineItem}><span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
              <div className={styles.lineItem}><span>Entrega</span><span>{formatCurrency(order.deliveryCost)}</span></div>
              <div className={styles.totalLine}><strong>TOTAL</strong><strong>{formatCurrency(order.total)}</strong></div>
            </div>
          </section>

          <section className={`${styles.detailCard} ${styles.section}`}>
            <h2>CLIENTE Y ENTREGA</h2>
            <div className={styles.detailFields}>
              <div className={styles.detailField}><span className={styles.fieldLabel}>CLIENTE</span><p>{customerName(order)}</p></div>
              <div className={styles.detailField}><span className={styles.fieldLabel}>WHATSAPP</span><p>{order.customer.whatsapp}</p></div>
              <div className={styles.detailField}><span className={styles.fieldLabel}>EMAIL</span><p>{order.customer.email}</p></div>
              {order.customer.dni ? <div className={styles.detailField}><span className={styles.fieldLabel}>DNI</span><p>{order.customer.dni}</p></div> : null}
              <div className={styles.detailField}><span className={styles.fieldLabel}>MODALIDAD</span><p>{DELIVERY_LABELS[order.deliveryMethod]}</p></div>
            </div>
            {order.deliveryAddress ? (
              <>
                <h3>DIRECCIÓN</h3>
                <p>
                  {order.deliveryAddress.street} {order.deliveryAddress.number}
                  {order.deliveryAddress.floorApartment ? ` · ${order.deliveryAddress.floorApartment}` : ""}
                  {` · ${order.deliveryAddress.city}, ${order.deliveryAddress.province}`}
                  {order.deliveryAddress.postalCode ? ` · CP ${order.deliveryAddress.postalCode}` : ""}
                </p>
                {order.deliveryAddress.references ? (
                  <><h3>OBSERVACIONES</h3><p>{order.deliveryAddress.references}</p></>
                ) : null}
              </>
            ) : null}
          </section>
        </div>

        <aside className={styles.detailCard}>
          <h2>ESTADO</h2>
          <div className={styles.detailFields}>
            <div className={styles.detailField}><span className={styles.fieldLabel}>OPERATIVO</span><p><FulfillmentBadge status={order.fulfillmentStatus} /></p></div>
            <div className={styles.detailField}><span className={styles.fieldLabel}>PAGO</span><p><PaymentBadge status={order.paymentStatus} /></p></div>
            <div className={styles.detailField}><span className={styles.fieldLabel}>ORDER STATUS</span><p>{ORDER_STATUS_LABELS[order.orderStatus]}</p></div>
            <div className={styles.detailField}><span className={styles.fieldLabel}>FORMA DE PAGO</span><p>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</p></div>
            <div className={styles.detailField}><span className={styles.fieldLabel}>CREADO</span><p>{formatAdminDate(order.createdAt)}</p></div>
            <div className={styles.detailField}><span className={styles.fieldLabel}>ACTUALIZADO</span><p>{formatAdminDate(order.fulfillmentUpdatedAt)}</p></div>
            {order.paymentProviderId ? <div className={styles.detailField}><span className={styles.fieldLabel}>PROVIDER PAYMENT ID</span><p>{order.paymentProviderId}</p></div> : null}
            <div className={styles.detailField}>
              <span className={styles.fieldLabel}>
                AVISO {order.newOrderNotification
                  ? NOTIFICATION_CHANNEL_LABELS[order.newOrderNotification.channel]
                  : "OPERATIVO"}
              </span>
              <p>
                {order.newOrderNotification
                  ? NOTIFICATION_LABELS[order.newOrderNotification.status]
                  : "NO GENERADO"}
              </p>
              {order.newOrderNotification?.sentAt ? (
                <small className={styles.muted}>
                  Enviado {formatAdminDate(order.newOrderNotification.sentAt)}
                </small>
              ) : null}
              {order.newOrderNotification?.lastErrorSummary ? (
                <small className={styles.muted}>
                  {order.newOrderNotification.lastErrorSummary}
                </small>
              ) : null}
            </div>
          </div>
          {order.newOrderNotification?.status === "failed" ? (
            <form action={retryOrderNotificationAction}>
              <input type="hidden" name="publicId" value={order.publicId} />
              <button className={styles.secondaryButton} type="submit">
                REINTENTAR AVISO
              </button>
            </form>
          ) : null}
          <a className={styles.whatsappButton} href={customerWhatsAppUrl(order)} target="_blank" rel="noreferrer">CONTACTAR POR WHATSAPP</a>
          <OrderActions order={order} />
        </aside>
      </div>
    </>
  );
}

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
import { requireAdminSession } from "@/lib/server/admin/admin-auth";
import { formatCurrency } from "@/lib/utils/format-currency";
import styles from "../../../admin.module.css";
import { retryOrderNotificationAction } from "@/app/admin/actions";
import type {
  OrderNotification,
  OrderNotificationKind,
} from "@/lib/server/notifications/types";

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

const CUSTOMER_UPDATE_LABELS = {
  customer_fulfillment_status: "ESTADO DEL PEDIDO",
  customer_payment_status: "ESTADO DEL PAGO",
  customer_delivery_update: "COSTO DE ENVÍO",
} as const;

const DELIVERY_COST_SOURCE_LABELS = {
  checkout: "CHECKOUT",
  manual: "MANUAL",
  automation: "AUTOMÁTICO",
} as const;

function NotificationStatus({
  label,
  notification,
  kind,
  publicId,
}: {
  label: string;
  notification?: OrderNotification;
  kind: OrderNotificationKind;
  publicId: string;
}) {
  return (
    <>
      <div className={styles.detailField}>
        <span className={styles.fieldLabel}>{label}</span>
        <p>
          {notification
            ? NOTIFICATION_LABELS[notification.status]
            : "NO GENERADA"}
        </p>
        {notification?.sentAt ? (
          <small className={styles.muted}>
            Enviado {formatAdminDate(notification.sentAt)}
          </small>
        ) : null}
        {notification?.lastErrorSummary ? (
          <small className={styles.muted}>
            {notification.lastErrorSummary}
          </small>
        ) : null}
      </div>
      {notification?.status === "failed" ? (
        <form action={retryOrderNotificationAction}>
          <input type="hidden" name="publicId" value={publicId} />
          <input type="hidden" name="kind" value={kind} />
          <button className={styles.secondaryButton} type="submit">
            REINTENTAR {label}
          </button>
        </form>
      ) : null}
    </>
  );
}

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<Query>;
}) {
  const [{ publicId }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(publicId)) notFound();
  const [order, session] = await Promise.all([
    loadAdminOrder(publicId),
    requireAdminSession(),
  ]);
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
        <div className={styles.headerActions}>
          {session.role === "admin" ? <Link className={styles.primaryLink} href={`/admin/pedidos/${publicId}/editar`}>EDITAR PEDIDO</Link> : null}
          <Link className={styles.secondaryButton} href="/admin/pedidos">VOLVER A PEDIDOS</Link>
        </div>
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
              {order.baseSubtotal !== undefined ? <div className={styles.lineItem}><span>Precio base</span><span>{formatCurrency(order.baseSubtotal)}</span></div> : null}
              {order.pricingDiscountAmount ? <div className={styles.lineItem}><span>Descuento comercial</span><span>−{formatCurrency(order.pricingDiscountAmount)}</span></div> : null}
              {order.couponCode ? <div className={styles.lineItem}><span>Cupón · {order.couponCode}</span><span>−{formatCurrency(order.couponDiscountAmount ?? 0)}</span></div> : null}
              {order.manualDiscountAmount ? <div className={styles.lineItem}><span>Descuento manual · {order.manualDiscountReason}</span><span>−{formatCurrency(order.manualDiscountAmount)}</span></div> : null}
              <div className={styles.lineItem}><span>Subtotal final</span><span>{formatCurrency(order.subtotal)}</span></div>
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
              <div className={styles.detailField}><span className={styles.fieldLabel}>COSTO DE ENVÍO</span><p>{formatCurrency(order.deliveryCost)} · {DELIVERY_COST_SOURCE_LABELS[order.deliveryCostSource]}</p></div>
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
              <div className={styles.detailField}><span className={styles.fieldLabel}>ORIGEN</span><p>{order.orderSource === "admin_manual" ? "PEDIDO MANUAL" : order.orderSource === "whatsapp" ? "WHATSAPP" : "TIENDA ONLINE"}</p></div>
              {order.channelContext?.conversationSessionId ? <div className={styles.detailField}><span className={styles.fieldLabel}>SESIÓN RUNIA</span><p>{order.channelContext.conversationSessionId}</p></div> : null}
              {order.hasManagementOverride ? <div className={styles.detailField}><span className={styles.fieldLabel}>GESTIÓN</span><p>EDITADO · REV. {order.managementRevision}</p></div> : null}
            <div className={styles.detailField}><span className={styles.fieldLabel}>CREADO</span><p>{formatAdminDate(order.createdAt)}</p></div>
            <div className={styles.detailField}><span className={styles.fieldLabel}>ACTUALIZADO</span><p>{formatAdminDate(order.fulfillmentUpdatedAt)}</p></div>
            {order.paymentProviderId ? <div className={styles.detailField}><span className={styles.fieldLabel}>PROVIDER PAYMENT ID</span><p>{order.paymentProviderId}</p></div> : null}
            {order.hasManagementOverride && Math.abs(order.commerceTotal - order.total) >= 0.01 ? <div className={styles.detailField}><span className={styles.fieldLabel}>SNAPSHOT COMERCIAL</span><p>{formatCurrency(order.commerceTotal)} · INTACTO</p></div> : null}
            <NotificationStatus
              kind="new_order"
              label={`AVISO ${order.newOrderNotification
                ? NOTIFICATION_CHANNEL_LABELS[order.newOrderNotification.channel]
                : "OPERATIVO"}`}
              notification={order.newOrderNotification}
              publicId={order.publicId}
            />
            <NotificationStatus
              kind="customer_order_confirmation"
              label="CONFIRMACIÓN CLIENTE"
              notification={order.customerOrderConfirmation}
              publicId={order.publicId}
            />
            {order.customerStatusNotifications?.length ? (
              <div className={styles.statusNotificationList}>
                <span className={styles.fieldLabel}>ÚLTIMAS NOTIFICACIONES AL CLIENTE</span>
                {order.customerStatusNotifications.slice(0, 6).map((notification) => (
                  <p key={notification.id}>
                    <strong>{CUSTOMER_UPDATE_LABELS[notification.kind as keyof typeof CUSTOMER_UPDATE_LABELS]}</strong>
                    <small className={styles.muted}>
                      {NOTIFICATION_CHANNEL_LABELS[notification.channel]} · {NOTIFICATION_LABELS[notification.status]} · {formatAdminDate(notification.updatedAt)}
                    </small>
                  </p>
                ))}
              </div>
            ) : null}
          </div>
          {order.customer.whatsapp ? <a className={styles.whatsappButton} href={customerWhatsAppUrl(order)} target="_blank" rel="noreferrer">CONTACTAR POR WHATSAPP</a> : null}
          {order.managementNotes ? <div className={styles.managementNote}><span className={styles.fieldLabel}>NOTAS INTERNAS</span><p>{order.managementNotes}</p></div> : null}
          {order.customerNotes ? <div className={styles.managementNote}><span className={styles.fieldLabel}>OBSERVACIONES DEL CLIENTE</span><p>{order.customerNotes}</p></div> : null}
          {order.invoiceDetails ? <div className={styles.managementNote}><span className={styles.fieldLabel}>FACTURA A</span><p>{order.invoiceDetails.businessName} · CUIT {order.invoiceDetails.cuit}{order.invoiceDetails.taxCondition ? ` · ${order.invoiceDetails.taxCondition}` : ""}</p></div> : null}
          <OrderActions order={order} />
        </aside>
      </div>
    </>
  );
}

import { AdminOrderRow } from "@/components/admin/AdminOrderRow";
import { DELIVERY_LABELS, FULFILLMENT_LABELS, PAYMENT_LABELS } from "@/lib/admin/presentation";
import { loadAdminOrders } from "@/lib/server/admin/admin-data";
import type { AdminOrderFilters, FulfillmentStatus } from "@/lib/server/admin/types";
import type { DeliveryMethod, PaymentStatus } from "@/types/checkout";
import styles from "../../admin.module.css";

type Query = Record<string, string | string[] | undefined>;

function queryValue(query: Query, key: string) {
  const value = query[key];
  return typeof value === "string" ? value : "";
}

const fulfillmentStatuses = Object.keys(FULFILLMENT_LABELS) as FulfillmentStatus[];
const paymentStatuses = Object.keys(PAYMENT_LABELS) as PaymentStatus[];
const deliveryMethods = Object.keys(DELIVERY_LABELS) as DeliveryMethod[];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;
  const fulfillment = queryValue(query, "estado");
  const payment = queryValue(query, "pago");
  const delivery = queryValue(query, "entrega");
  const filters: AdminOrderFilters = {
    fulfillment: fulfillmentStatuses.includes(fulfillment as FulfillmentStatus)
      ? (fulfillment as FulfillmentStatus)
      : undefined,
    payment: paymentStatuses.includes(payment as PaymentStatus)
      ? (payment as PaymentStatus)
      : undefined,
    delivery: deliveryMethods.includes(delivery as DeliveryMethod)
      ? (delivery as DeliveryMethod)
      : undefined,
    from: /^\d{4}-\d{2}-\d{2}$/.test(queryValue(query, "desde"))
      ? queryValue(query, "desde")
      : undefined,
    to: /^\d{4}-\d{2}-\d{2}$/.test(queryValue(query, "hasta"))
      ? queryValue(query, "hasta")
      : undefined,
    search: queryValue(query, "buscar"),
  };
  const orders = await loadAdminOrders(filters);

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>OPERACIÓN</p>
          <h1>PEDIDOS.</h1>
        </div>
        <p>{orders.length} pedidos en esta vista.</p>
      </header>

      {queryValue(query, "error") ? (
        <p className={styles.errorNotice}>{queryValue(query, "error")}</p>
      ) : null}

      <form className={styles.filterForm}>
        <div className={styles.filterField}>
          <label htmlFor="buscar">BUSCAR</label>
          <input id="buscar" name="buscar" defaultValue={filters.search} placeholder="Pedido, cliente, WhatsApp o SKU" />
        </div>
        <div className={styles.filterField}>
          <label htmlFor="estado">ESTADO</label>
          <select id="estado" name="estado" defaultValue={filters.fulfillment || ""}>
            <option value="">TODOS</option>
            {fulfillmentStatuses.map((status) => <option key={status} value={status}>{FULFILLMENT_LABELS[status]}</option>)}
          </select>
        </div>
        <div className={styles.filterField}>
          <label htmlFor="pago">PAGO</label>
          <select id="pago" name="pago" defaultValue={filters.payment || ""}>
            <option value="">TODOS</option>
            {paymentStatuses.map((status) => <option key={status} value={status}>{PAYMENT_LABELS[status]}</option>)}
          </select>
        </div>
        <div className={styles.filterField}>
          <label htmlFor="entrega">ENTREGA</label>
          <select id="entrega" name="entrega" defaultValue={filters.delivery || ""}>
            <option value="">TODAS</option>
            {deliveryMethods.map((method) => <option key={method} value={method}>{DELIVERY_LABELS[method]}</option>)}
          </select>
        </div>
        <div className={styles.filterField}>
          <label htmlFor="desde">DESDE</label>
          <input id="desde" name="desde" type="date" defaultValue={filters.from} />
        </div>
        <div className={styles.filterField}>
          <label htmlFor="hasta">HASTA</label>
          <input id="hasta" name="hasta" type="date" defaultValue={filters.to} />
        </div>
        <button className={styles.primaryButton} type="submit">FILTRAR</button>
      </form>

      {orders.length ? (
        <div className={styles.orderList}>
          {orders.map((order) => <AdminOrderRow key={order.id} order={order} />)}
        </div>
      ) : (
        <p className={styles.emptyState}>No hay pedidos para estos filtros.</p>
      )}
    </>
  );
}

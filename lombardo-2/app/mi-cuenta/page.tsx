import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CustomerDefaultAddressForm } from "@/components/customer/CustomerDefaultAddressForm";
import { CustomerLogoutForm } from "@/components/customer/CustomerLogoutForm";
import styles from "@/components/customer/CustomerAccount.module.css";
import { requireCurrentCustomerAccount } from "@/lib/server/customers/customer-auth";
import { getCurrentCustomerAccountData } from "@/lib/server/customers/customer-data";
import type {
  CustomerAccountType,
  CustomerPricingPolicy,
} from "@/lib/server/customers/types";
import type { OrderStatus, PaymentStatus } from "@/types/checkout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi cuenta | Lombardo",
  description: "Datos, política comercial y pedidos de tu cuenta Lombardo.",
  robots: { index: false, follow: false },
};

const ACCOUNT_LABELS: Record<CustomerAccountType, string> = {
  RETAIL: "Minorista",
  WHOLESALE: "Mayorista",
  BUSINESS: "Negocio",
};

const POLICY_LABELS: Record<CustomerPricingPolicy, string> = {
  RETAIL: "Precio minorista",
  WHOLESALE: "Precio mayorista",
  BUSINESS: "Precio negocio",
  CUSTOM_DISCOUNT: "Descuento personalizado",
};

const ORDER_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Pendiente de pago",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: "Pago pendiente",
  approved: "Pago aprobado",
  rejected: "Pago rechazado",
  cancelled: "Pago cancelado",
  refunded: "Pago devuelto",
};

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

const date = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function policyLabel(policy: CustomerPricingPolicy, discountPercent: number) {
  if (policy !== "CUSTOM_DISCOUNT") return POLICY_LABELS[policy];
  return `${POLICY_LABELS[policy]} · ${discountPercent}%`;
}

export default async function MyAccountPage() {
  const authorizedAccount = await requireCurrentCustomerAccount("/mi-cuenta");
  const data = await getCurrentCustomerAccountData(authorizedAccount);
  if (!data) redirect("/login?next=%2Fmi-cuenta");

  const { account, defaultAddress, orders } = data;

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Mi cuenta</p>
            <h1>{account.name}</h1>
          </div>
          <CustomerLogoutForm />
        </header>

        <dl className={styles.profile} aria-label="Datos de la cuenta">
          <div className={styles.field}>
            <dt>Email</dt>
            <dd>{account.email || "Sin informar"}</dd>
          </div>
          <div className={styles.field}>
            <dt>WhatsApp</dt>
            <dd>{account.whatsapp || "Sin informar"}</dd>
          </div>
          <div className={styles.field}>
            <dt>Tipo de cuenta</dt>
            <dd>{ACCOUNT_LABELS[account.accountType]}</dd>
          </div>
          <div className={styles.field}>
            <dt>Política comercial</dt>
            <dd>
              {policyLabel(account.pricingPolicy, account.discountPercent)}
            </dd>
          </div>
          <div className={styles.field}>
            <dt>Estado de cuenta</dt>
            <dd>Activa</dd>
          </div>
        </dl>

        <section className={styles.addressSection} aria-labelledby="address-title">
          <div className={styles.addressHeading}>
            <div>
              <p className={styles.sectionEyebrow}>Entrega</p>
              <h2 id="address-title">DIRECCIÓN PREDETERMINADA.</h2>
            </div>
            <p>
              Cargala una vez. La próxima compra ya empieza con estos datos completos.
            </p>
          </div>
          <CustomerDefaultAddressForm address={defaultAddress} />
        </section>

        {account.accountType === "WHOLESALE" || account.accountType === "BUSINESS" ? (
          <section className={styles.quickOrderAccess} aria-labelledby="quick-order-title">
            <div>
              <p className={styles.sectionEyebrow}>Compra profesional</p>
              <h2 id="quick-order-title">CATÁLOGO O PEDIDO RÁPIDO.</h2>
              <p>
                Buscá por nombre o marca y armá pedidos grandes sin recorrer fotos.
              </p>
            </div>
            <nav aria-label="Modo de compra B2B">
              <Link href="/productos">CATÁLOGO</Link>
              <Link href="/pedido-rapido">PEDIDO RÁPIDO →</Link>
            </nav>
          </section>
        ) : null}

        <section className={styles.orders} aria-labelledby="orders-title">
          <p className={styles.sectionEyebrow}>Historial</p>
          <h2 className={styles.sectionTitle} id="orders-title">
            Pedidos anteriores
          </h2>

          {orders.length > 0 ? (
            <ol className={styles.orderList}>
              {orders.map((order) => (
                <li key={order.publicId}>
                  <Link
                    className={styles.orderLink}
                    href={`/pedido/${order.publicId}`}
                  >
                    <span className={styles.orderId}>#{order.displayId}</span>
                    <span className={styles.orderMeta}>
                      {date.format(new Date(order.createdAt))} · {order.itemCount}{" "}
                      {order.itemCount === 1 ? "unidad" : "unidades"}
                    </span>
                    <span className={styles.orderMeta}>
                      {ORDER_LABELS[order.orderStatus]} ·{" "}
                      {PAYMENT_LABELS[order.paymentStatus]}
                    </span>
                    <span className={styles.orderTotal}>
                      {money.format(order.total)}
                    </span>
                    <span className={styles.orderArrow} aria-hidden="true">
                      ↗
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.empty}>
              Todavía no hay pedidos asociados a esta cuenta.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

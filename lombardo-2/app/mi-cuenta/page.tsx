import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CustomerDefaultAddressForm } from "@/components/customer/CustomerDefaultAddressForm";
import { CustomerLogoutForm } from "@/components/customer/CustomerLogoutForm";
import {
  CommercialPageView,
  TrackedCommercialLink,
} from "@/components/analytics/CommercialJourney";
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
  RETAIL: "Precio tienda",
  WHOLESALE: "Tu precio mayorista",
  BUSINESS: "Tu precio negocio",
  CUSTOM_DISCOUNT: "Precio tienda con beneficio",
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
  const isProfessional = account.accountType === "WHOLESALE" || account.accountType === "BUSINESS";

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        {isProfessional ? (
          <CommercialPageView
            name="portal_negocios_opened"
            accountType={account.accountType as "WHOLESALE" | "BUSINESS"}
          />
        ) : null}
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Mi cuenta</p>
            <h1>{account.name}</h1>
          </div>
          <CustomerLogoutForm />
        </header>

        <dl className={styles.profile} id="datos-de-cuenta" aria-label="Datos de la cuenta">
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

        {isProfessional ? (
          <section className={styles.quickOrderAccess} aria-labelledby="quick-order-title">
            <div>
              <p className={styles.sectionEyebrow}>Tu espacio de compra</p>
              <h2 id="quick-order-title">PORTAL NEGOCIOS.</h2>
              <p>
                Tus precios ya están activos. Comprá rápido, repetí un pedido o revisá tu historial.
              </p>
            </div>
            <nav aria-label="Modo de compra B2B">
              <TrackedCommercialLink
                href="/pedido-rapido"
                event={{ name: "pedido_rapido_opened", accountType: account.accountType as "WHOLESALE" | "BUSINESS" }}
              >PEDIDO RÁPIDO →</TrackedCommercialLink>
              <Link href="/productos">MIS PRECIOS</Link>
              <Link href="/pedido-rapido#ultimo-pedido">REPETIR PEDIDO</Link>
              <Link href="#mis-pedidos">MIS PEDIDOS</Link>
              <Link href="#datos-de-cuenta">DATOS DE CUENTA</Link>
            </nav>
          </section>
        ) : (
          <section className={styles.retailBusinessCta} aria-labelledby="retail-business-title">
            <div>
              <p className={styles.sectionEyebrow}>¿Comprás seguido o tenés un negocio?</p>
              <h2 id="retail-business-title">HAY UNA FORMA DE COMPRA PARA VOS.</h2>
            </div>
            <p>
              Con 6 botellas surtidas accedés a precio mayorista. Si comprás habitualmente o revendés, podemos habilitarte una cuenta.
            </p>
            <TrackedCommercialLink
              href="/empresas"
              event={{ name: "business_account_requested", source: "mi_cuenta" }}
            >CONOCER OPCIONES →</TrackedCommercialLink>
          </section>
        )}

        <section className={styles.orders} id="mis-pedidos" aria-labelledby="orders-title">
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

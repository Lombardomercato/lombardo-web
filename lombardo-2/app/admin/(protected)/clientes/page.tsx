import Link from "next/link";

import { formatAdminDate } from "@/lib/admin/presentation";
import { loadAdminCustomers } from "@/lib/server/admin/admin-data";
import { requireAdminSession } from "@/lib/server/admin/admin-auth";
import { formatCurrency } from "@/lib/utils/format-currency";

import styles from "../../admin.module.css";

function policyLabel(policy: string, discountPercent: number) {
  return policy === "CUSTOM_DISCOUNT"
    ? `RETAIL −${discountPercent}%`
    : policy;
}

export default async function AdminCustomersPage() {
  const [customers, session] = await Promise.all([
    loadAdminCustomers(),
    requireAdminSession(),
  ]);

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>CUENTAS Y PRECIOS</p>
          <h1>CLIENTES.</h1>
        </div>
        <div className={styles.headerActions}>
          <p>{customers.length} cuentas configuradas en Runia.</p>
          {session.role === "admin" ? (
            <Link className={styles.primaryLink} href="/admin/clientes/nuevo">
              CREAR CLIENTE →
            </Link>
          ) : null}
        </div>
      </header>

      {customers.length ? (
        <div className={styles.customerList}>
          {customers.map((customer) => (
            <Link
              className={styles.customerAccountRow}
              href={`/admin/clientes/${customer.id}`}
              key={customer.id}
            >
              <span>
                <strong>{customer.name}</strong>
                <small>{customer.email}</small>
              </span>
              <span>{customer.whatsapp}</span>
              <span>{customer.accountType}</span>
              <strong>
                {policyLabel(customer.pricingPolicy, customer.discountPercent)}
              </strong>
              <span className={styles.statusBadge} data-status={customer.status}>
                {customer.status.toUpperCase()}
              </span>
              <span>
                {customer.orderCount} {customer.orderCount === 1 ? "pedido" : "pedidos"}
                <small>
                  {customer.lastOrderAt
                    ? `Último ${formatAdminDate(customer.lastOrderAt)}`
                    : "Sin pedidos"}
                </small>
              </span>
              <strong>{formatCurrency(customer.historicalTotal)}</strong>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <p>Todavía no hay cuentas de clientes.</p>
          {session.role === "admin" ? (
            <Link href="/admin/clientes/nuevo">Crear la primera cuenta →</Link>
          ) : null}
        </div>
      )}
    </>
  );
}

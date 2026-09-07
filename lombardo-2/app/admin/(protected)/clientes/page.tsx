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

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ archivados?: string; success?: string }>;
}) {
  const [customers, session, filters] = await Promise.all([
    loadAdminCustomers(),
    requireAdminSession(),
    searchParams,
  ]);
  const archivedCustomers = customers.filter((customer) => customer.status === "inactive");
  const showArchived = filters.archivados === "1";
  const visibleCustomers = showArchived
    ? archivedCustomers
    : customers.filter((customer) => customer.status !== "inactive");

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>CUENTAS Y PRECIOS</p>
          <h1>CLIENTES.</h1>
        </div>
        <div className={styles.headerActions}>
          <p>
            {customers.length} cuentas · {archivedCustomers.length} archivadas.
          </p>
          {archivedCustomers.length ? (
            <Link
              className={styles.secondaryButton}
              href={showArchived ? "/admin/clientes" : "/admin/clientes?archivados=1"}
            >
              {showArchived ? "VER CLIENTES" : "VER ARCHIVADOS"}
            </Link>
          ) : null}
          {session.role === "admin" ? (
            <Link className={styles.primaryLink} href="/admin/clientes/nuevo">
              CREAR CLIENTE →
            </Link>
          ) : null}
        </div>
      </header>

      {filters.success ? <p className={styles.formSuccess}>{filters.success}</p> : null}

      {visibleCustomers.length ? (
        <div className={styles.customerList}>
          {visibleCustomers.map((customer) => (
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
                {customer.status === "inactive" ? "ARCHIVADO" : customer.status.toUpperCase()}
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
          <p>
            {showArchived
              ? "No hay clientes archivados."
              : "Todavía no hay cuentas de clientes activas."}
          </p>
          {session.role === "admin" && !showArchived ? (
            <Link href="/admin/clientes/nuevo">Crear la primera cuenta →</Link>
          ) : null}
        </div>
      )}
    </>
  );
}

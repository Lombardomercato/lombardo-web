import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerAdminForm } from "@/components/admin/CustomerAdminForm";
import { formatAdminDate } from "@/lib/admin/presentation";
import { requireAdminSession } from "@/lib/server/admin/admin-auth";
import { loadAdminCustomer } from "@/lib/server/admin/admin-data";
import { formatCurrency } from "@/lib/utils/format-currency";

import styles from "../../../admin.module.css";

export default async function AdminCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ id }, feedback, session] = await Promise.all([
    params,
    searchParams,
    requireAdminSession(),
  ]);
  const customer = await loadAdminCustomer(id);
  if (!customer) notFound();

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>CUENTA DE CLIENTE</p>
          <h1>{customer.name.toUpperCase()}.</h1>
        </div>
        <Link href="/admin/clientes">← VOLVER A CLIENTES</Link>
      </header>

      {feedback.success ? <p className={styles.formSuccess}>{feedback.success}</p> : null}
      {feedback.error ? <p className={styles.formError}>{feedback.error}</p> : null}

      {session.role === "admin" ? (
        <CustomerAdminForm customer={customer} />
      ) : (
        <p className={styles.emptyState}>Sólo un administrador puede modificar esta cuenta.</p>
      )}

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h2>PEDIDOS ANTERIORES</h2>
          <span>{customer.orders.length}</span>
        </div>
        {customer.orders.length ? (
          <div className={styles.orderList}>
            {customer.orders.map((order) => (
              <Link
                className={styles.customerOrderRow}
                href={`/admin/pedidos/${order.publicId}`}
                key={order.id}
              >
                <strong>#{order.displayId}</strong>
                <span>{formatAdminDate(order.createdAt)}</span>
                <span>{order.paymentStatus.replaceAll("_", " ").toUpperCase()}</span>
                <strong>{formatCurrency(order.total)}</strong>
              </Link>
            ))}
          </div>
        ) : (
          <p className={styles.emptyState}>Este cliente todavía no tiene pedidos.</p>
        )}
      </section>
    </>
  );
}

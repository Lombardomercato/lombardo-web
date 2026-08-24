import { loadAdminCustomers } from "@/lib/server/admin/admin-data";
import { formatAdminDate } from "@/lib/admin/presentation";
import { formatCurrency } from "@/lib/utils/format-currency";
import styles from "../../admin.module.css";

function whatsappUrl(phoneValue: string) {
  let phone = phoneValue.replace(/\D/g, "");
  if (phone.startsWith("0")) phone = phone.slice(1);
  if (!phone.startsWith("54")) phone = `54${phone}`;
  return `https://wa.me/${phone}`;
}

export default async function AdminCustomersPage() {
  const customers = await loadAdminCustomers();
  return (
    <>
      <header className={styles.pageHeader}>
        <div><p className={styles.eyebrow}>VISTA OPERATIVA SIMPLE</p><h1>CLIENTES.</h1></div>
        <p>{customers.length} clientes agrupados por WhatsApp o email.</p>
      </header>
      {customers.length ? (
        <div className={styles.customerList}>
          {customers.map((customer) => (
            <article className={styles.customerRow} key={customer.key}>
              <strong>{customer.name}</strong>
              <a href={whatsappUrl(customer.whatsapp)} target="_blank" rel="noreferrer">{customer.whatsapp}</a>
              <span>{customer.orderCount} {customer.orderCount === 1 ? "pedido" : "pedidos"}</span>
              <span>{formatAdminDate(customer.lastOrderAt)}</span>
              <strong>{formatCurrency(customer.historicalTotal)}</strong>
            </article>
          ))}
        </div>
      ) : <p className={styles.emptyState}>Todavía no hay clientes.</p>}
    </>
  );
}

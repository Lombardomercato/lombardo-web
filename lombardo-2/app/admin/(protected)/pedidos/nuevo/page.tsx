import { randomUUID } from "node:crypto";
import Link from "next/link";

import { AdminOrderCreateForm } from "@/components/admin/AdminOrderCreateForm";
import { loadAdminCustomers } from "@/lib/server/admin/admin-data";

import styles from "../../../admin.module.css";

export const dynamic = "force-dynamic";

export default async function NewAdminOrderPage() {
  const customers = (await loadAdminCustomers()).filter(
    (customer) => customer.status === "active",
  );

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>VENTA ASISTIDA</p>
          <h1>NUEVO PEDIDO.</h1>
        </div>
        <Link href="/admin/pedidos">← VOLVER A PEDIDOS</Link>
      </header>

      <AdminOrderCreateForm
        customers={customers.map((customer) => ({
          id: customer.id,
          name: customer.name,
          email: customer.email,
          whatsapp: customer.whatsapp,
          pricingPolicy: customer.pricingPolicy,
          discountPercent: customer.discountPercent,
        }))}
        checkoutSessionId={`admin_${randomUUID()}`}
        idempotencyKey={`admin_order_${randomUUID()}`}
      />
    </>
  );
}

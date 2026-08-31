import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminOrderForm } from "@/components/admin/AdminOrderForm";
import { loadAdminOrder } from "@/lib/server/admin/admin-data";
import { requireAdminSession } from "@/lib/server/admin/admin-auth";

import styles from "../../../../admin.module.css";

export default async function EditAdminOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ publicId }, feedback, session] = await Promise.all([
    params,
    searchParams,
    requireAdminSession(),
  ]);
  if (session.role !== "admin") redirect(`/admin/pedidos/${publicId}`);
  if (!/^[0-9a-f-]{36}$/i.test(publicId)) notFound();
  const order = await loadAdminOrder(publicId);
  if (!order) notFound();
  return (
    <>
      <header className={styles.pageHeader}>
        <div><p className={styles.eyebrow}>GESTIÓN · REV. {order.managementRevision}</p><h1>EDITAR #{order.displayId}.</h1></div>
        <Link className={styles.secondaryButton} href={`/admin/pedidos/${publicId}`}>CANCELAR</Link>
      </header>
      {feedback.error ? <p className={styles.errorNotice}>{feedback.error}</p> : null}
      <AdminOrderForm
        mode="edit"
        orderId={order.id}
        publicId={order.publicId}
        revision={order.managementRevision}
        customer={order.customer}
        lines={order.items.map((item) => ({
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          catalogUnitPrice: item.catalogUnitPrice ?? item.baseUnitPrice,
        }))}
        deliveryMethod={order.deliveryMethod}
        deliveryAddress={order.deliveryAddress}
        deliveryCost={order.deliveryCost}
        discountAmount={order.manualDiscountAmount}
        discountReason={order.manualDiscountReason}
        notes={order.managementNotes}
        commerceTotal={order.commerceTotal}
      />
    </>
  );
}

"use client";

import {
  archiveCustomerAction,
  deleteCustomerAction,
  reactivateCustomerAction,
} from "@/app/admin/actions";
import type { AdminCustomer } from "@/lib/server/admin/types";

import styles from "@/app/admin/admin.module.css";

export function CustomerLifecycleActions({
  customer,
}: {
  customer: Pick<AdminCustomer, "id" | "name" | "status" | "orderCount">;
}) {
  const archived = customer.status === "inactive";
  const canDelete = archived && customer.orderCount === 0;

  return (
    <section className={styles.customerLifecycle} aria-labelledby="customer-lifecycle-title">
      <div>
        <p className={styles.eyebrow}>GESTIÓN DE LA CUENTA</p>
        <h2 id="customer-lifecycle-title">
          {archived ? "CLIENTE ARCHIVADO" : "ARCHIVAR O ELIMINAR"}
        </h2>
        <p>
          {archived
            ? "La cuenta está fuera del listado habitual. Podés reactivarla sin perder sus datos."
            : "Archivar oculta al cliente del listado habitual y conserva toda su información."}
        </p>
      </div>

      <div className={styles.customerLifecycleActions}>
        <form action={archived ? reactivateCustomerAction : archiveCustomerAction}>
          <input name="customerId" type="hidden" value={customer.id} />
          <button className={styles.secondaryButton} type="submit">
            {archived ? "REACTIVAR CLIENTE" : "ARCHIVAR CLIENTE"}
          </button>
        </form>

        <form
          action={deleteCustomerAction}
          onSubmit={(event) => {
            if (!window.confirm(
              `¿Eliminar definitivamente a ${customer.name}? Esta acción no se puede deshacer.`,
            )) event.preventDefault();
          }}
        >
          <input name="customerId" type="hidden" value={customer.id} />
          <button
            aria-describedby="customer-delete-note"
            className={styles.dangerButton}
            disabled={!canDelete}
            type="submit"
          >
            ELIMINAR DEFINITIVAMENTE
          </button>
        </form>
      </div>

      <small id="customer-delete-note">
        {!archived
          ? "Para eliminar definitivamente, primero archivá la cuenta y revisá que no tenga pedidos."
          : canDelete
          ? "La eliminación sólo se completa si la cuenta no conserva ninguna actividad relacionada."
          : "No se puede eliminar porque tiene pedidos. Archivala para conservar el historial."}
      </small>
    </section>
  );
}

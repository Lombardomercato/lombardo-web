import { setOrderDeletedAction } from "@/app/admin/actions";
import { orderDeletionBlocker } from "@/lib/admin/order-deletion";
import type { AdminOrder } from "@/lib/server/admin/types";
import styles from "@/app/admin/admin.module.css";

export function OrderDeletionActions({ order }: { order: AdminOrder }) {
  const deleted = Boolean(order.deletedAt);
  const blocker = deleted ? null : orderDeletionBlocker(order);
  return (
    <section className={styles.orderDeletion} aria-label={deleted ? "Restaurar pedido" : "Eliminar pedido"}>
      {blocker ? <p className={styles.muted}>{blocker}</p> : (
        <details>
          <summary className={deleted ? styles.secondaryButton : styles.dangerButton}>
            {deleted ? "RESTAURAR PEDIDO" : "ELIMINAR PEDIDO"}
          </summary>
          <form action={setOrderDeletedAction} className={styles.orderManagementForm}>
            <h3>{deleted ? "RESTAURAR" : "ELIMINAR"} #{order.displayId}</h3>
            <p>{deleted
              ? "El pedido volverá a la lista con los mismos productos, importes y estados."
              : "Se quitará de la operación y del seguimiento público. Podés recuperarlo desde la papelera."}
              {" "}No notifica al cliente, no cambia pagos ni stock.
            </p>
            <input type="hidden" name="publicId" value={order.publicId} />
            <input type="hidden" name="expectedUpdatedAt" value={order.updatedAt} />
            <input type="hidden" name="deletionAction" value={deleted ? "restore" : "delete"} />
            <label>MOTIVO
              <input name="reason" minLength={3} maxLength={500} required
                placeholder={deleted ? "Ej.: eliminado por error" : "Ej.: pedido duplicado o de prueba"} />
            </label>
            <label className={styles.deletionConfirmation}>
              <input type="checkbox" name="confirmed" value="yes" required />
              Confirmo {deleted ? "restaurar" : "eliminar"} exclusivamente el pedido #{order.displayId}.
            </label>
            <button type="submit" className={deleted ? styles.primaryButton : styles.dangerButton}>
              {deleted ? "CONFIRMAR RESTAURACIÓN" : "CONFIRMAR ELIMINACIÓN"}
            </button>
          </form>
        </details>
      )}
    </section>
  );
}

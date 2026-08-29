import { logoutCustomer } from "@/app/auth/actions";

import styles from "./CustomerAccount.module.css";

export function CustomerLogoutForm() {
  return (
    <form action={logoutCustomer}>
      <button className={styles.logout} type="submit">
        Cerrar sesión
      </button>
    </form>
  );
}

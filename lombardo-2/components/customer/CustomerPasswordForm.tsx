"use client";

import { useActionState } from "react";

import {
  updateCustomerPassword,
  type CustomerAccessActionState,
} from "@/app/auth/actions";

import styles from "./CustomerLoginForm.module.css";

const initialState: CustomerAccessActionState = {
  status: "idle",
  message: "",
};

export function CustomerPasswordForm() {
  const [state, formAction, pending] = useActionState(
    updateCustomerPassword,
    initialState,
  );

  return (
    <form className={styles.form} action={formAction} noValidate>
      <label className={styles.field}>
        <span>Nueva contraseña</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={256}
          required
          autoFocus
        />
      </label>
      <label className={styles.field}>
        <span>Repetir contraseña</span>
        <input
          type="password"
          name="passwordConfirmation"
          autoComplete="new-password"
          minLength={10}
          maxLength={256}
          required
        />
      </label>
      <p className={styles.feedback} role="status" aria-live="polite">
        {state.status === "error" ? state.message : ""}
      </p>
      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </button>
    </form>
  );
}

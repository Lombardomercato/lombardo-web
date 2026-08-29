"use client";

import { useActionState } from "react";

import {
  requestCustomerPasswordRecovery,
  type CustomerAccessActionState,
} from "@/app/auth/actions";

import styles from "./CustomerLoginForm.module.css";

const initialState: CustomerAccessActionState = {
  status: "idle",
  message: "",
};

export function CustomerRecoveryForm() {
  const [state, formAction, pending] = useActionState(
    requestCustomerPasswordRecovery,
    initialState,
  );

  return (
    <form className={styles.form} action={formAction} noValidate>
      <label className={styles.field}>
        <span>Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          required
          autoFocus
        />
      </label>
      <p
        className={state.status === "success" ? styles.success : styles.feedback}
        role="status"
        aria-live="polite"
      >
        {state.message}
      </p>
      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviar enlace"}
      </button>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  loginCustomer,
  type CustomerLoginActionState,
} from "@/app/auth/actions";

import styles from "./CustomerLoginForm.module.css";

const initialState: CustomerLoginActionState = {
  status: "idle",
  message: "",
};

export function CustomerLoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(
    loginCustomer,
    initialState,
  );

  return (
    <form className={styles.form} action={formAction} noValidate>
      <input type="hidden" name="next" value={next} />

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

      <label className={styles.field}>
        <span>Contraseña</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          minLength={8}
          maxLength={256}
          required
        />
      </label>

      <p className={styles.feedback} role="status" aria-live="polite">
        {state.status === "error" ? state.message : ""}
      </p>

      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? "Ingresando…" : "Ingresar"}
      </button>
      <Link className={styles.secondaryLink} href="/recuperar-clave">
        ¿Olvidaste tu contraseña?
      </Link>
      <Link className={styles.createAccountLink} href="/crear-cuenta">
        Crear cuenta de consumidor final →
      </Link>
    </form>
  );
}

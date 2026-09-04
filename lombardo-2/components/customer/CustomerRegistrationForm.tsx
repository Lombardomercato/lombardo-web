"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  registerRetailCustomer,
  type CustomerRegistrationActionState,
} from "@/app/auth/actions";

import styles from "./CustomerLoginForm.module.css";

const initialState: CustomerRegistrationActionState = {
  status: "idle",
  message: "",
};

export function CustomerRegistrationForm() {
  const [state, formAction, pending] = useActionState(
    registerRetailCustomer,
    initialState,
  );

  if (state.status === "success") {
    return (
      <div className={styles.completion} role="status" aria-live="polite">
        <p>{state.message}</p>
        <Link className={styles.createAccountLink} href="/login">
          Ir a ingresar →
        </Link>
      </div>
    );
  }

  return (
    <form className={styles.form} action={formAction} noValidate>
      <p className={styles.policyNote}>
        La cuenta se crea como Consumidor Final, con precio minorista y sin
        descuentos. Los permisos comerciales sólo los administra Lombardo.
      </p>

      <label className={styles.field}>
        <span>Nombre y apellido</span>
        <input
          type="text"
          name="name"
          autoComplete="name"
          minLength={2}
          maxLength={120}
          required
          autoFocus
        />
      </label>

      <label className={styles.field}>
        <span>Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          required
        />
      </label>

      <label className={styles.field}>
        <span>WhatsApp</span>
        <input
          type="tel"
          name="whatsapp"
          autoComplete="tel"
          inputMode="tel"
          maxLength={24}
          placeholder="+5493415551234"
          required
        />
      </label>

      <label className={styles.field}>
        <span>Contraseña</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={256}
          required
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
        {pending ? "Creando cuenta…" : "Crear cuenta"}
      </button>
      <Link className={styles.secondaryLink} href="/login">
        Ya tengo cuenta
      </Link>
    </form>
  );
}

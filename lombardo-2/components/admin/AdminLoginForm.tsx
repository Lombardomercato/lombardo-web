"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  loginAdminAction,
  type AdminLoginState,
} from "@/app/admin/actions";
import styles from "@/app/admin/admin.module.css";

const initialState: AdminLoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className={styles.primaryButton} type="submit" disabled={pending}>
      {pending ? "INGRESANDO…" : "INGRESAR"}
    </button>
  );
}

export function AdminLoginForm() {
  const [state, action] = useActionState(loginAdminAction, initialState);
  return (
    <form className={styles.loginForm} action={action}>
      <label htmlFor="admin-email">EMAIL</label>
      <input
        id="admin-email"
        name="email"
        type="email"
        autoComplete="username"
        inputMode="email"
        required
      />
      <label htmlFor="admin-password">CONTRASEÑA</label>
      <input
        id="admin-password"
        name="password"
        type="password"
        autoComplete="current-password"
        minLength={8}
        required
      />
      {state.error ? <p className={styles.formError}>{state.error}</p> : null}
      <SubmitButton />
    </form>
  );
}

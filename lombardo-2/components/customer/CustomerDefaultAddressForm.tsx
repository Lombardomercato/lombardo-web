"use client";

import { useActionState } from "react";

import {
  updateCustomerDefaultAddress,
  type CustomerAddressActionState,
} from "@/app/mi-cuenta/actions";
import { CUSTOMER_DELIVERY_CITIES } from "@/lib/customer-address";
import type { DeliveryAddress } from "@/types/checkout";

import styles from "./CustomerAccount.module.css";

const initialState: CustomerAddressActionState = {
  status: "idle",
  message: "",
};

export function CustomerDefaultAddressForm({
  address,
}: {
  address: DeliveryAddress | null;
}) {
  const [state, formAction, pending] = useActionState(
    updateCustomerDefaultAddress,
    initialState,
  );

  return (
    <form className={styles.addressForm} action={formAction} noValidate>
      <div className={styles.addressGrid}>
        <label className={styles.addressField}>
          <span>Calle</span>
          <input
            autoComplete="address-line1"
            defaultValue={address?.street}
            maxLength={160}
            name="street"
            required
          />
        </label>
        <label className={styles.addressField}>
          <span>Número</span>
          <input
            autoComplete="address-line1"
            defaultValue={address?.number}
            maxLength={30}
            name="number"
            required
          />
        </label>
        <label className={styles.addressField}>
          <span>Piso / departamento</span>
          <input
            autoComplete="address-line2"
            defaultValue={address?.floorApartment}
            maxLength={80}
            name="floorApartment"
          />
        </label>
        <label className={styles.addressField}>
          <span>Localidad</span>
          <select
            autoComplete="address-level2"
            defaultValue={address?.city ?? "Rosario"}
            name="city"
            required
          >
            {CUSTOMER_DELIVERY_CITIES.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.addressField}>
          <span>Provincia</span>
          <input
            autoComplete="address-level1"
            defaultValue={address?.province ?? "Santa Fe"}
            maxLength={100}
            name="province"
            required
          />
        </label>
        <label className={styles.addressField}>
          <span>Código postal</span>
          <input
            autoComplete="postal-code"
            defaultValue={address?.postalCode}
            maxLength={20}
            name="postalCode"
          />
        </label>
        <label className={`${styles.addressField} ${styles.addressWideField}`}>
          <span>Referencias</span>
          <input
            defaultValue={address?.references}
            maxLength={500}
            name="references"
            placeholder="Entre calles, portón, indicaciones de entrega…"
          />
        </label>
      </div>

      <div className={styles.addressActions}>
        <p
          className={state.status === "error" ? styles.addressError : styles.addressFeedback}
          role="status"
          aria-live="polite"
        >
          {state.message || "La usaremos para completar tus próximos pedidos."}
        </p>
        <button type="submit" disabled={pending}>
          {pending
            ? "GUARDANDO…"
            : address
              ? "ACTUALIZAR DIRECCIÓN"
              : "GUARDAR DIRECCIÓN"}
        </button>
      </div>
    </form>
  );
}

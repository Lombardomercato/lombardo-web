"use client";

import { useState } from "react";

import {
  createCustomerAction,
  updateCustomerAction,
} from "@/app/admin/actions";
import type { AdminCustomer } from "@/lib/server/admin/types";
import type {
  CustomerAccountType,
  CustomerPricingPolicy,
} from "@/lib/server/customers/types";

import styles from "@/app/admin/admin.module.css";

const policyForAccount: Record<
  Exclude<CustomerAccountType, "RETAIL">,
  CustomerPricingPolicy
> = {
  WHOLESALE: "WHOLESALE",
  BUSINESS: "BUSINESS",
};

export function CustomerAdminForm({ customer }: { customer?: AdminCustomer }) {
  const [accountType, setAccountType] = useState<CustomerAccountType>(
    customer?.accountType ?? "RETAIL",
  );
  const [pricingPolicy, setPricingPolicy] = useState<CustomerPricingPolicy>(
    customer?.pricingPolicy ?? "RETAIL",
  );

  const changeAccountType = (next: CustomerAccountType) => {
    setAccountType(next);
    setPricingPolicy(next === "RETAIL" ? "RETAIL" : policyForAccount[next]);
  };

  return (
    <form
      action={customer ? updateCustomerAction : createCustomerAction}
      className={styles.customerForm}
    >
      {customer ? <input name="customerId" type="hidden" value={customer.id} /> : null}

      <label>
        <span>Nombre</span>
        <input
          autoComplete="name"
          defaultValue={customer?.name}
          maxLength={120}
          name="name"
          required
        />
      </label>
      <label>
        <span>Email de acceso</span>
        <input
          autoComplete="email"
          defaultValue={customer?.email}
          maxLength={254}
          name="email"
          readOnly={Boolean(customer)}
          required
          type="email"
        />
        {customer ? <small>El email de acceso queda fijo para proteger la cuenta.</small> : null}
      </label>
      <label>
        <span>WhatsApp</span>
        <input
          autoComplete="tel"
          defaultValue={customer?.whatsapp}
          maxLength={24}
          name="whatsapp"
          pattern="\+[1-9][0-9]{7,14}"
          placeholder="+5493415551234"
          required
          type="tel"
        />
      </label>
      <label>
        <span>Tipo de cuenta</span>
        <select
          name="accountType"
          onChange={(event) =>
            changeAccountType(event.target.value as CustomerAccountType)
          }
          value={accountType}
        >
          <option value="RETAIL">Minorista</option>
          <option value="WHOLESALE">Mayorista</option>
          <option value="BUSINESS">Negocio</option>
        </select>
      </label>
      <label>
        <span>Política comercial</span>
        <select
          name="pricingPolicy"
          onChange={(event) =>
            setPricingPolicy(event.target.value as CustomerPricingPolicy)
          }
          value={pricingPolicy}
        >
          {accountType === "RETAIL" ? (
            <>
              <option value="RETAIL">Precio minorista</option>
              <option value="CUSTOM_DISCOUNT">Minorista con descuento fijo</option>
            </>
          ) : accountType === "WHOLESALE" ? (
            <option value="WHOLESALE">Lista mayorista</option>
          ) : (
            <option value="BUSINESS">Lista negocio</option>
          )}
        </select>
      </label>
      <label>
        <span>Descuento personalizado (%)</span>
        <input
          defaultValue={customer?.discountPercent ?? 0}
          disabled={pricingPolicy !== "CUSTOM_DISCOUNT"}
          max="99.99"
          min="0.01"
          name="discountPercent"
          required={pricingPolicy === "CUSTOM_DISCOUNT"}
          step="0.01"
          type="number"
        />
        {pricingPolicy !== "CUSTOM_DISCOUNT" ? (
          <input name="discountPercent" type="hidden" value="0" />
        ) : null}
      </label>
      <label>
        <span>Estado</span>
        <select defaultValue={customer?.status ?? "active"} name="status">
          <option value="active">Activa</option>
          <option value="inactive">Inactiva</option>
          <option value="pending">Pendiente</option>
          <option value="blocked">Bloqueada</option>
        </select>
      </label>

      <div className={styles.customerFormNote}>
        {customer
          ? "Los cambios de lista, descuento o estado impactan de inmediato en el próximo acceso y checkout."
          : "Al crear la cuenta, el cliente recibirá un email seguro para definir su contraseña."}
      </div>
      <button className={styles.primaryButton} type="submit">
        {customer ? "GUARDAR CAMBIOS" : "CREAR Y ENVIAR INVITACIÓN"}
      </button>
    </form>
  );
}

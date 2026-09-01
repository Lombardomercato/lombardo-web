import {
  ACTIVE_DELIVERY_METHODS,
  deliveryCities,
  deliveryMethodForCity,
} from "./checkout/delivery-methods.ts";
import type { DeliveryAddress } from "../types/checkout.ts";

const MAX_LENGTHS = {
  street: 160,
  number: 30,
  floorApartment: 80,
  city: 100,
  province: 100,
  postalCode: 20,
  references: 500,
} as const;

export const CUSTOMER_DELIVERY_CITIES = ACTIVE_DELIVERY_METHODS.flatMap(
  deliveryCities,
);

export type CustomerAddressValidation =
  | { valid: true; address: DeliveryAddress }
  | { valid: false; message: string };

function formText(formData: FormData, name: keyof typeof MAX_LENGTHS) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function validateCustomerDefaultAddress(
  formData: FormData,
): CustomerAddressValidation {
  const values = Object.fromEntries(
    Object.keys(MAX_LENGTHS).map((name) => [
      name,
      formText(formData, name as keyof typeof MAX_LENGTHS),
    ]),
  ) as Record<keyof typeof MAX_LENGTHS, string>;

  for (const [name, maxLength] of Object.entries(MAX_LENGTHS)) {
    if (values[name as keyof typeof MAX_LENGTHS].length > maxLength) {
      return {
        valid: false,
        message: "Uno de los datos de la dirección es demasiado largo.",
      };
    }
  }

  if (values.street.length < 2) {
    return { valid: false, message: "Ingresá la calle." };
  }
  if (!values.number) {
    return { valid: false, message: "Ingresá el número." };
  }
  if (!deliveryMethodForCity(values.city)) {
    return {
      valid: false,
      message: "Elegí una localidad dentro de las zonas de entrega disponibles.",
    };
  }
  if (values.province.length < 2) {
    return { valid: false, message: "Ingresá la provincia." };
  }

  return {
    valid: true,
    address: {
      street: values.street,
      number: values.number,
      floorApartment: values.floorApartment || undefined,
      city: values.city,
      province: values.province,
      postalCode: values.postalCode || undefined,
      references: values.references || undefined,
    },
  };
}

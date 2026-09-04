import { CHECKOUT_CONFIG } from "@/lib/config/checkout";
import {
  defaultDeliveryCity,
  deliveryCities,
  isActiveDeliveryMethod,
  isDeliveryCityAllowed,
} from "@/lib/checkout/delivery-methods";
import type {
  CheckoutCustomer,
  DeliveryAddress,
  DeliveryMethod,
  DeliveryService,
} from "@/types/checkout";

export interface CheckoutFormValues {
  customer: CheckoutCustomer;
  deliveryMethod: DeliveryMethod;
  deliveryService: DeliveryService;
  deliveryAddress: DeliveryAddress;
}

export type CheckoutFieldName =
  | "firstName"
  | "lastName"
  | "whatsapp"
  | "email"
  | "dni"
  | "street"
  | "number"
  | "floorApartment"
  | "city"
  | "province"
  | "postalCode"
  | "references";

export type CheckoutErrors = Partial<Record<CheckoutFieldName, string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emptyCheckoutForm: CheckoutFormValues = {
  customer: {
    firstName: "",
    lastName: "",
    whatsapp: "",
    email: "",
    dni: "",
  },
  deliveryMethod: "DELIVERY_ROSARIO",
  deliveryService: "standard",
  deliveryAddress: {
    street: "",
    number: "",
    floorApartment: "",
    city: defaultDeliveryCity("DELIVERY_ROSARIO"),
    province: CHECKOUT_CONFIG.delivery.allowedProvince,
    postalCode: "",
    references: "",
  },
};

export function normalizeWhatsApp(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);

  if (digits.startsWith("54")) {
    let national = digits.slice(2);
    if (national.startsWith("9") && national.length === 11) return `+54${national}`;
    national = national.replace(/^(\d{2,4})15(\d{6,8})$/, "$1$2");
    if (national.length === 10) return `+549${national}`;
    return `+${digits}`;
  }

  digits = digits.replace(/^(\d{2,4})15(\d{6,8})$/, "$1$2");
  if (digits.length === 10) return `+549${digits}`;
  if (digits.startsWith("9") && digits.length === 11) return `+54${digits}`;
  return digits ? `+${digits}` : "";
}

export function validateCheckoutForm(values: CheckoutFormValues) {
  const errors: CheckoutErrors = {};
  const firstName = values.customer.firstName.trim();
  const lastName = values.customer.lastName.trim();
  const normalizedWhatsApp = normalizeWhatsApp(values.customer.whatsapp);
  const email = values.customer.email.trim().toLocaleLowerCase("es-AR");
  const dni = values.customer.dni?.replace(/\D/g, "") ?? "";

  if (firstName.length < 2) errors.firstName = "Ingresá tu nombre.";
  if (lastName.length < 2) errors.lastName = "Ingresá tu apellido.";
  if (!/^\+[1-9]\d{9,14}$/.test(normalizedWhatsApp)) {
    errors.whatsapp = "Ingresá un WhatsApp válido con código de área.";
  }
  if (!emailPattern.test(email)) errors.email = "Ingresá un email válido.";
  if (dni && !/^\d{7,9}$/.test(dni)) {
    errors.dni = "Revisá el DNI o dejalo vacío.";
  }

  if (!isActiveDeliveryMethod(values.deliveryMethod)) {
    errors.city = "Elegí una zona de envío disponible.";
  } else {
    const address = values.deliveryAddress;
    if (address.street.trim().length < 2) errors.street = "Ingresá la calle.";
    if (!address.number.trim()) errors.number = "Ingresá el número.";
    if (!isDeliveryCityAllowed(values.deliveryMethod, address.city)) {
      errors.city = `Elegí una de estas localidades: ${deliveryCities(values.deliveryMethod).join(", ")}.`;
    }
    if (!address.province.trim()) errors.province = "Ingresá la provincia.";
  }
  if (values.deliveryService === "priority" && values.deliveryMethod !== "DELIVERY_ROSARIO") {
    errors.city = "El envío prioritario está disponible únicamente en Rosario.";
  }

  return {
    errors,
    normalized: {
      ...values,
      customer: {
        firstName,
        lastName,
        whatsapp: normalizedWhatsApp,
        email,
        dni: dni || undefined,
      },
      deliveryAddress: {
        street: values.deliveryAddress.street.trim(),
        number: values.deliveryAddress.number.trim(),
        floorApartment: values.deliveryAddress.floorApartment?.trim() || undefined,
        city: values.deliveryAddress.city.trim(),
        province: values.deliveryAddress.province.trim(),
        postalCode: values.deliveryAddress.postalCode?.trim() || undefined,
        references: values.deliveryAddress.references?.trim() || undefined,
      },
    },
  };
}

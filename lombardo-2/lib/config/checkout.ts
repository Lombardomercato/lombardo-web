import type {
  DeliveryCostMode,
  DeliveryMethod,
  DeliveryQuote,
} from "@/types/checkout";

const configuredPickupAddress = process.env.NEXT_PUBLIC_PICKUP_ADDRESS?.trim();
const configuredPickupHours = process.env.NEXT_PUBLIC_PICKUP_HOURS?.trim();
const configuredDeliveryMode = process.env.NEXT_PUBLIC_DELIVERY_COST_MODE?.trim();
const configuredFlatRate = Number(process.env.NEXT_PUBLIC_DELIVERY_FLAT_RATE);

const deliveryMode: DeliveryCostMode =
  configuredDeliveryMode === "FREE" ||
  configuredDeliveryMode === "FLAT_RATE" ||
  configuredDeliveryMode === "TO_BE_CONFIRMED"
    ? configuredDeliveryMode
    : "TO_BE_CONFIRMED";

const flatRate =
  deliveryMode === "FLAT_RATE" &&
  Number.isFinite(configuredFlatRate) &&
  configuredFlatRate >= 0
    ? configuredFlatRate
    : 0;

export const CHECKOUT_CONFIG = {
  currency: "ARS",
  pickup: {
    label: "Retiro en Lombardo",
    address: configuredPickupAddress || "Dirección a confirmar",
    hours: configuredPickupHours || "Horario a confirmar",
    notice: "Te avisamos cuando esté listo.",
    courtesyParkingNote: null,
  },
  delivery: {
    allowedCity: "Rosario",
    allowedProvince: "Santa Fe",
    pricingMode: deliveryMode,
    flatRate,
  },
} as const;

export function getDeliveryQuote(method: DeliveryMethod): DeliveryQuote {
  if (method === "PICKUP") {
    return { mode: "FREE", amount: 0, label: "Sin costo" };
  }

  if (CHECKOUT_CONFIG.delivery.pricingMode === "FREE") {
    return { mode: "FREE", amount: 0, label: "Sin costo" };
  }

  if (CHECKOUT_CONFIG.delivery.pricingMode === "FLAT_RATE") {
    return {
      mode: "FLAT_RATE",
      amount: CHECKOUT_CONFIG.delivery.flatRate,
      label: "Tarifa fija",
    };
  }

  return { mode: "TO_BE_CONFIRMED", amount: 0, label: "A confirmar" };
}

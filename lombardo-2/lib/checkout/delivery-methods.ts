import type { DeliveryMethod } from "../../types/checkout.ts";

export const ACTIVE_DELIVERY_METHODS = [
  "DELIVERY_ROSARIO",
  "DELIVERY_SOUTH",
] as const satisfies readonly DeliveryMethod[];

export type ActiveDeliveryMethod = (typeof ACTIVE_DELIVERY_METHODS)[number];

export const DELIVERY_COORDINATION_NOTICE =
  "Día y horario a coordinar con el comprador.";

const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  PICKUP: "Retiro en Lombardo",
  DELIVERY: "Envío a domicilio",
  DELIVERY_ROSARIO: "Envío a Rosario",
  DELIVERY_SOUTH: "Envío a Pueblo Esther, Lagos o Alvear",
};

const DELIVERY_CITIES: Record<ActiveDeliveryMethod, readonly string[]> = {
  DELIVERY_ROSARIO: ["Rosario"],
  DELIVERY_SOUTH: ["Pueblo Esther", "Lagos", "Alvear"],
};

function normalizeLocation(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR");
}

export function isActiveDeliveryMethod(
  method: unknown,
): method is ActiveDeliveryMethod {
  return ACTIVE_DELIVERY_METHODS.includes(method as ActiveDeliveryMethod);
}

export function deliveryMethodLabel(method: DeliveryMethod) {
  return DELIVERY_LABELS[method];
}

export function deliveryCities(method: ActiveDeliveryMethod) {
  return DELIVERY_CITIES[method];
}

export function defaultDeliveryCity(method: ActiveDeliveryMethod) {
  return DELIVERY_CITIES[method][0];
}

export function isDeliveryCityAllowed(
  method: ActiveDeliveryMethod,
  city: string,
) {
  const normalizedCity = normalizeLocation(city);
  return DELIVERY_CITIES[method].some(
    (allowedCity) => normalizeLocation(allowedCity) === normalizedCity,
  );
}

export function deliveryMethodForCity(
  city: string,
): ActiveDeliveryMethod | null {
  return ACTIVE_DELIVERY_METHODS.find((method) =>
    isDeliveryCityAllowed(method, city),
  ) ?? null;
}

export function requiresDeliveryAddress(method: DeliveryMethod) {
  return method !== "PICKUP";
}

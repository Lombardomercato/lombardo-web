import type { AvailabilityStatus } from "@/types/commerce";

export const availabilityLabels: Record<AvailabilityStatus, string> = {
  AVAILABLE_NOW: "Disponible",
  SUPPLIER_AVAILABLE: "Disponibilidad a confirmar",
  UNAVAILABLE: "No disponible",
};

export const canAddToCart = (availability: AvailabilityStatus) =>
  availability !== "UNAVAILABLE";

export const getAddLabel = (availability: AvailabilityStatus) => {
  if (availability === "UNAVAILABLE") return "No disponible";
  return "Agregar";
};

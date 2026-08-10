import type { AvailabilityStatus } from "@/types/commerce";

export const availabilityLabels: Record<AvailabilityStatus, string> = {
  AVAILABLE_NOW: "Disponible",
  SUPPLIER_AVAILABLE: "Disponible por encargo",
  UNAVAILABLE: "No disponible",
};

export const canAddToCart = (availability: AvailabilityStatus) =>
  availability !== "UNAVAILABLE";

export const getAddLabel = (availability: AvailabilityStatus) => {
  if (availability === "SUPPLIER_AVAILABLE") return "Agregar por encargo";
  if (availability === "UNAVAILABLE") return "No disponible";
  return "Agregar";
};

import type {
  DeliveryCostMode,
  DeliveryMethod,
  DeliveryQuote,
} from "../../../types/checkout.ts";
import type { ServerDeliveryPricing } from "./order-dependencies.ts";

function readMode(): DeliveryCostMode {
  const value = process.env.DELIVERY_COST_MODE?.trim();
  if (value === "FREE" || value === "FLAT_RATE" || value === "TO_BE_CONFIRMED") {
    return value;
  }
  return "TO_BE_CONFIRMED";
}

function readFlatRate() {
  const value = Number(process.env.DELIVERY_FLAT_RATE);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export class EnvironmentDeliveryPricing implements ServerDeliveryPricing {
  getQuote(method: DeliveryMethod): DeliveryQuote {
    if (method === "PICKUP") {
      return { mode: "FREE", amount: 0, label: "Sin costo" };
    }

    const mode = readMode();
    if (mode === "FREE") return { mode, amount: 0, label: "Sin costo" };
    if (mode === "FLAT_RATE") {
      return { mode, amount: readFlatRate(), label: "Tarifa fija" };
    }
    return { mode, amount: 0, label: "A confirmar" };
  }
}

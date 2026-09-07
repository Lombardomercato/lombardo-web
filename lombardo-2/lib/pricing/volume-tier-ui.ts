import type { CartItem, Product } from "../../types/commerce.ts";
import {
  bottleUnits,
  WHOLESALE_BOTTLE_MINIMUM,
} from "./volume-tier.ts";

export function wholesaleBottleCount(items: CartItem[]) {
  return items.reduce(
    (total, item) => total + bottleUnits(item.product, item.quantity),
    0,
  );
}

export function wholesaleProgressCopy(count: number, priceApplied = true) {
  if (count >= WHOLESALE_BOTTLE_MINIMUM) {
    return priceApplied
      ? "✓ PRECIO MAYORISTA ACTIVADO"
      : "✓ YA TENÉS EL MEJOR PRECIO DISPONIBLE";
  }
  if (count === 5) {
    return "Sumá una más y te aplicamos precio mayorista automáticamente.";
  }
  if (count === 4) {
    return "Te faltan sólo 2 para precio mayorista.";
  }
  if (count === 3) {
    return "Estás a mitad de camino. Sumá 3 más y accedés a precio mayorista.";
  }
  if (count === 2) {
    return "Sumando 4 más accedés a precio mayorista. Pueden ser surtidas.";
  }
  return "Llevando 6 botellas surtidas accedés a precio mayorista.";
}

export function publicPriceLabel(product: Product) {
  if (product.pricingPolicy === "BUSINESS") return "TU PRECIO NEGOCIO";
  if (product.pricingPolicy === "WHOLESALE") return "TU PRECIO MAYORISTA";
  return "PRECIO TIENDA";
}

export function shouldShowWholesaleProgress(items: CartItem[]) {
  const count = wholesaleBottleCount(items);
  if (!count) return false;
  if (items.some((item) => item.product.automaticWholesale)) return true;
  const policy = items[0]?.product.pricingPolicy;
  return policy !== "WHOLESALE" && policy !== "BUSINESS";
}

import type { Product } from "@/types/commerce";

export function priorProductIds(messages: unknown[], latestUserText: string) {
  if (!/\b(compara|comparame|comparar|diferencia)\b/i.test(normalize(latestUserText))) return [];
  const ids: string[] = [];
  for (const message of messages.slice(0, -1)) {
    if (!message || typeof message !== "object" || Reflect.get(message, "role") !== "assistant") continue;
    const parts = Reflect.get(message, "parts");
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const output = part && typeof part === "object" ? Reflect.get(part, "output") : null;
      if (!output || typeof output !== "object") continue;
      const products = Array.isArray(Reflect.get(output, "products"))
        ? Reflect.get(output, "products")
        : Reflect.get(output, "product")
          ? [Reflect.get(output, "product")]
          : [];
      for (const product of products) {
        const id = product && typeof product === "object" ? Reflect.get(product, "id") : null;
        if (typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) && !ids.includes(id)) ids.push(id);
      }
    }
  }
  return ids.slice(-24);
}

export function buildProductComparison(products: Product[], latestUserText: string) {
  const query = normalize(latestUserText);
  const selected = products
    .map((product) => ({ product, score: matchScore(product, query) }))
    .filter((entry) => entry.score >= 2)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((entry) => entry.product);
  if (selected.length < 2) return null;

  const [left, right] = selected;
  const cheaper = left.price === right.price ? null : left.price < right.price ? left : right;
  const difference = Math.abs(left.price - right.price);
  const priceSummary = cheaper
    ? `${cheaper.name} cuesta ${formatArs(difference)} menos.`
    : "Tienen el mismo precio vigente.";
  return [
    `${left.name}: ${formatArs(left.price)} · ${left.presentation}${left.opportunity ? " · oportunidad vigente" : ""}.`,
    `${right.name}: ${formatArs(right.price)} · ${right.presentation}${right.opportunity ? " · oportunidad vigente" : ""}.`,
    priceSummary,
    "La comparación usa los precios reales de tu sesión; otros atributos no informados no se suponen.",
  ].join(" ");
}

function matchScore(product: Product, query: string) {
  const tokens = normalize(`${product.brand.name} ${product.name} ${product.presentation}`)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !["con", "bot", "750", "700", "450"].includes(token));
  return new Set(tokens.filter((token) => query.includes(token))).size;
}

function formatArs(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR");
}

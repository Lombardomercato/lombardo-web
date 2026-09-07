export function classifyTopic(text: string) {
  const value = text.toLocaleLowerCase("es-AR");
  if (/regal|cumple|aniversario/.test(value)) return "regalo";
  if (/asado|parrilla/.test(value)) return "asado";
  if (/brind|espumante|champagne/.test(value)) return "brindis";
  if (/presupuesto|hasta|menos de|\$/.test(value)) return "presupuesto";
  if (/oportunidad|oferta|descuento/.test(value)) return "oportunidades";
  if (/vino|malbec|cabernet|blanco|tinto/.test(value)) return "vinos";
  if (/whisky|gin|vodka|ron|destilado/.test(value)) return "destilados";
  return "general";
}

const normalizedIntent = (text: string) => text
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("es-AR");

export function classifyCommercialIntent(text: string) {
  const value = normalizedIntent(text);
  if (/\b(kiosco|restaurante|bar|vinoteca|comercio|revender|reventa|vendo bebidas)\b/.test(value)) {
    return "business" as const;
  }
  if (/\b(lista( de precios)?|catalogo|lista mayorista|catalogo mayorista|que productos tienen)\b/.test(value)) {
    return "catalog" as const;
  }
  if (/\b(no quiero sumar|no sumo|cerrame las? \d+|dejalo asi|dejalo así)\b/.test(value)) {
    return "decline_upsell" as const;
  }
  return "general" as const;
}

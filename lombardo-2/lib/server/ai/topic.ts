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

const SEARCH_FILLER = new Set([
  "busco", "buscar", "quiero", "quisiera", "tenes", "tienen", "necesito",
  "dame", "mostrame", "producto", "botella", "un", "una", "el", "la", "de",
]);

export function tolerantQueries(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const raw = value.trim();
  const withoutFiller = normalized
    .split(/\s+/)
    .filter((term) => term.length > 1 && !SEARCH_FILLER.has(term))
    .join(" ");
  const tokens = withoutFiller
    .split(/\s+/)
    .filter((term) => term.length >= 4)
    .sort((left, right) => right.length - left.length);
  return [...new Set([raw, withoutFiller, ...tokens.slice(0, 3)].filter(Boolean))];
}

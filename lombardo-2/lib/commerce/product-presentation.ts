const LOWERCASE_WORDS = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "e",
  "el",
  "en",
  "la",
  "las",
  "los",
  "o",
  "para",
  "por",
  "sin",
  "y",
]);

const KEEP_UPPERCASE = new Set([
  "DOC",
  "IGP",
  "IPA",
  "PET",
  "S/A",
]);

function displayWord(word: string, index: number) {
  if (!word) return word;
  const upper = word.toLocaleUpperCase("es-AR");
  const lower = word.toLocaleLowerCase("es-AR");

  if (/^\d/.test(word) || KEEP_UPPERCASE.has(upper) || /^[A-ZÁÉÍÓÚÜÑ]\.[A-ZÁÉÍÓÚÜÑ.]+$/.test(word)) {
    return upper;
  }
  if (index > 0 && LOWERCASE_WORDS.has(lower)) return lower;
  return `${lower.charAt(0).toLocaleUpperCase("es-AR")}${lower.slice(1)}`;
}

/**
 * Storefront-only cleanup for supplier names. It never writes back to VINROS
 * and deliberately avoids guessing wine attributes that are not in the feed.
 */
export function displayProductName(rawName: string) {
  const wasUppercase = rawName === rawName.toLocaleUpperCase("es-AR");
  const compact = rawName
    .replace(/\s+/g, " ")
    .replace(/\b(\d+)\s+(\d)\s*(?:LT|LTS|L)\b/gi, "$1,$2 L")
    .replace(/\s*[-–—|/]\s*(?:CAJA|PACK)?\s*[Xx]?\s*\d+\s*(?:B|BOT(?:ELLAS?)?|U|UN(?:IDADES?)?)\.?$/i, "")
    .replace(/\s+[Xx]\s*\d+\s*(?:B|BOT(?:ELLAS?)?|U|UN(?:IDADES?)?)\.?$/i, "")
    .replace(/\s+[Xx]\s*\d+(?:[.,]\d+)?\s*(?:C\.?\s*C\.?|ML|LT|LTS|L)(?=\s|$|[),–—-]).*$/i, "")
    .replace(/\s+[Xx]\s*\d+(?:[.,]\d+)?\s*(?:C\.?\s*C\.?|ML|LT|LTS|L)\.?\s*$/i, "")
    .replace(/\s+\d+(?:[.,]\d+)?\s*(?:C\.?\s*C\.?|ML)\.?\s*$/i, "")
    .replace(/\s+[Xx]\s*\d+(?:[.,]\d+)?\s*$/i, "")
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(C\.?\s*C\.?|ML)\.?(?=\s|$|[),–—-])/gi, (_, amount: string, unit: string) => `${amount} ${unit.toLocaleUpperCase("es-AR").startsWith("C") ? "cc" : "ml"}`)
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(LT|LTS)\b/gi, (_, amount: string) => `${amount} L`)
    .trim();

  if (!compact || !wasUppercase) return compact;

  return compact
    .split(" ")
    .map(displayWord)
    .join(" ");
}

export function displayPresentation(rawPresentation: string) {
  return rawPresentation
    .replace(/\s+/g, " ")
    .replace(/\b(\d+)\s+(\d)\s*(?:LT|LTS|L)\b/gi, "$1,$2 L")
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(C\.?\s*C\.?|ML)\.?(?=\s|$|[),–—-])/gi, (_, amount: string, unit: string) => `${amount} ${unit.toLocaleUpperCase("es-AR").startsWith("C") ? "cc" : "ml"}`)
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(LT|LTS)\b/gi, (_, amount: string) => `${amount} L`)
    .replace(/\bUNIDADES\b/gi, "unidades")
    .replace(/\bUNIDAD\b/gi, "unidad")
    .trim();
}

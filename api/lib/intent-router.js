const fs = require('node:fs');
const path = require('node:path');

const INTENT_RULES_DOC_PATH = 'docs/AI_INTENT_RULES_LOMBARDO.md';

const INTENTS = {
  CONSULTA_SOCIAL: 'consulta_social',
  CONSULTA_PRODUCTO: 'consulta_producto',
  CONSULTA_EDUCATIVA_VINO: 'consulta_educativa_vino',
  CONSULTA_CAJA: 'consulta_caja',
  CONSULTA_MENSUALIDAD: 'consulta_mensualidad',
  CONSULTA_EXPERIENCIAS: 'consulta_experiencias',
  CONSULTA_CLUB: 'consulta_club',
  CONSULTA_CONTACTO: 'consulta_contacto',
  CONSULTA_GENERAL: 'consulta_general',
};

const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const canonicalPageContext = (pageContext = 'general') => {
  const aliases = {
    vino: 'experiencias',
    vinos: 'experiencias',
    cafe: 'experiencias',
    eventos: 'experiencias',
    catas: 'experiencias',
    galeria: 'experiencias',
    tienda: 'club',
    cajas: 'club',
    membresia: 'club',
    'wine-tinder': 'wine-tinder',
  };

  const normalized = normalizeText(pageContext);
  return aliases[normalized] || normalized || 'general';
};

const containsKeyword = (text, patterns) => patterns.some((pattern) => pattern.test(text));

let docIntentSignalsCache = null;
const getIntentSignalsFromDocs = () => {
  if (docIntentSignalsCache) return docIntentSignalsCache;

  try {
    const raw = fs.readFileSync(path.join(process.cwd(), INTENT_RULES_DOC_PATH), 'utf8');
    const normalized = normalizeText(raw);

    docIntentSignalsCache = {
      producto: /vino para|que vino compro|recomendarme un vino|algo para una cena/.test(normalized),
      educativa: /maridar malbec|diferencia entre malbec y cabernet|temperatura se sirve/.test(normalized),
      caja: /armame una caja|quiero tres vinos/.test(normalized),
      mensualidad: /seleccion mensual|cuanto sale la suscripcion/.test(normalized),
      experiencias: /hacen catas|que experiencias ofrecen/.test(normalized),
      contacto: /quiero hablar con alguien|whatsapp/.test(normalized),
    };
  } catch {
    docIntentSignalsCache = {
      producto: true,
      educativa: true,
      caja: true,
      mensualidad: true,
      experiencias: true,
      contacto: true,
    };
  }

  return docIntentSignalsCache;
};

const DIRECT_PRODUCT_PATTERNS = [/(quiero|busco|dame)\s+algo\s+para/, /vino\s+para/, /(recomend|suger).*(vino|etiqueta)/, /quiero\s+un\s+vino/];

const SOCIAL_PATTERNS = {
  saludo: [/^(hola|holi|holis|holii|buenas|buen\s*d[ií]a|buenas\s+tardes|buenas\s+noches|que\s+tal|c[oó]mo\s+va|c[oó]mo\s+and[aá]s|todo\s+bien)[!,.?\s\u{1F300}-\u{1FAFF}]*$/u],
  agradecimiento: [/^(gracias|muchas gracias|genial gracias|ok gracias|mil gracias)[!.\s]*$/],
  casual: [/^(ok|dale|perfecto|joya|buenisimo|buenisima|entiendo)[!.\s]*$/],
  apertura: [/(no se|nos[eé])\s+que\s+elegir/, /ayudame/, /tengo\s+una\s+duda/],
};

const isDirectProductIntent = (text) => containsKeyword(text, DIRECT_PRODUCT_PATTERNS);

const hasSocialSignal = (text) =>
  Object.values(SOCIAL_PATTERNS).some((patterns) => containsKeyword(text, patterns));

const hasStrongFunctionalSignal = (text) =>
  containsKeyword(text, [
    /(vino|malbec|cabernet|blanco|tinto|maridaje|varietal)/,
    /(caja|box|club|mensualidad|suscrip|membres)/,
    /(cata|experiencia|evento|degustacion|caf[eé])/,
    /(whatsapp|comprar|reservar|pagar|pedido)/,
  ]);

const detectIntent = ({ message, pageContext = 'general', history = [] }) => {
  const rulesEnabled = getIntentSignalsFromDocs();
  const normalized = normalizeText(message);
  const context = history
    .slice(-3)
    .map((item) => normalizeText(item?.content))
    .join(' ');
  const combined = `${context} ${normalized}`.trim();
  const page = canonicalPageContext(pageContext);

  if (hasSocialSignal(normalized) && !hasStrongFunctionalSignal(normalized)) {
    return INTENTS.CONSULTA_SOCIAL;
  }

  if (normalized.split(/\s+/).filter(Boolean).length <= 4 && containsKeyword(normalized, SOCIAL_PATTERNS.saludo)) {
    return INTENTS.CONSULTA_SOCIAL;
  }

  if (rulesEnabled.producto && isDirectProductIntent(normalized)) return INTENTS.CONSULTA_PRODUCTO;

  const patterns = {
    contacto: [
      /whatsapp|asesor|persona|humano|vendedor|contacto|telefono|mail|email/,
      /(comprar|reservar|pagar|avanzar|confirmar|cerrar|pedido)/,
    ],
    mensualidad: [/(mensualidad|suscrip|membresia|seleccion mensual|todos los meses|cada mes|plan mensual)/],
    club: [/(club lombardo|beneficios del club|como funciona el club|que incluye el club|club)/],
    caja: [/(armame|arma|armar|sugerime).*(caja|box|seleccion)/, /(quiero|dame).*(tres|3).*(vinos?)/],
    experiencias: [/(cata|catas|experiencias?|evento|encuentro|degustacion|caf[eé]|after office)/],
    educativa: [
      /maridar|maridaje|temperatura|servicio|decantar|acidez|taninos|cuerpo|varietal|reserva/,
      /(diferencia|diferencias).*(malbec|cabernet|vino)/,
      /(que|que significa|que es).*(cuerpo|acidez|taninos)/,
    ],
    producto: [
      /quiero un vino|recomenda|algo para|vino para|que vino compro|que vino me sugeris|vinos para/,
      /(hasta|por|de)\s?\$?\s?\d{2,}/,
    ],
  };

  if (rulesEnabled.contacto && containsKeyword(combined, patterns.contacto)) return INTENTS.CONSULTA_CONTACTO;
  if (rulesEnabled.mensualidad && containsKeyword(combined, patterns.mensualidad)) return INTENTS.CONSULTA_MENSUALIDAD;
  if (rulesEnabled.caja && containsKeyword(combined, patterns.caja)) return INTENTS.CONSULTA_CAJA;
  if (containsKeyword(combined, patterns.club)) return INTENTS.CONSULTA_CLUB;
  if (rulesEnabled.experiencias && containsKeyword(combined, patterns.experiencias)) return INTENTS.CONSULTA_EXPERIENCIAS;
  if (rulesEnabled.educativa && containsKeyword(normalized, patterns.educativa)) return INTENTS.CONSULTA_EDUCATIVA_VINO;
  if (rulesEnabled.producto && containsKeyword(normalized, patterns.producto)) return INTENTS.CONSULTA_PRODUCTO;

  if (page === 'club') return INTENTS.CONSULTA_CLUB;
  if (page === 'experiencias') return INTENTS.CONSULTA_EXPERIENCIAS;
  if (page === 'wine-tinder') return INTENTS.CONSULTA_PRODUCTO;

  return INTENTS.CONSULTA_GENERAL;
};

module.exports = { INTENTS, INTENT_RULES_DOC_PATH, detectIntent, normalizeText, canonicalPageContext };

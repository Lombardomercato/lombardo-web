const INTENTS = {
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

const detectIntent = ({ message, pageContext = 'general', history = [] }) => {
  const normalized = normalizeText(message);
  const context = history
    .slice(-3)
    .map((item) => normalizeText(item?.content))
    .join(' ');
  const combined = `${context} ${normalized}`.trim();
  const page = canonicalPageContext(pageContext);

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

  if (containsKeyword(combined, patterns.contacto)) return INTENTS.CONSULTA_CONTACTO;
  if (containsKeyword(combined, patterns.mensualidad)) return INTENTS.CONSULTA_MENSUALIDAD;
  if (containsKeyword(combined, patterns.caja)) return INTENTS.CONSULTA_CAJA;
  if (containsKeyword(combined, patterns.club)) return INTENTS.CONSULTA_CLUB;
  if (containsKeyword(combined, patterns.experiencias)) return INTENTS.CONSULTA_EXPERIENCIAS;
  if (containsKeyword(normalized, patterns.educativa)) return INTENTS.CONSULTA_EDUCATIVA_VINO;
  if (containsKeyword(normalized, patterns.producto)) return INTENTS.CONSULTA_PRODUCTO;

  if (page === 'club') return INTENTS.CONSULTA_CLUB;
  if (page === 'experiencias') return INTENTS.CONSULTA_EXPERIENCIAS;
  if (page === 'wine-tinder') return INTENTS.CONSULTA_PRODUCTO;

  return INTENTS.CONSULTA_GENERAL;
};

module.exports = { INTENTS, detectIntent, normalizeText, canonicalPageContext };

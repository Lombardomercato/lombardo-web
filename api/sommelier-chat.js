const fs = require('node:fs/promises');
const path = require('node:path');
const { recordInteraction, inferProfile, intentToCategory } = require('./lib/assistant-interactions');
const { detectIntent: detectIntentByRules, INTENTS } = require('./lib/intent-router');
const { recommendWines } = require('./lib/wine-recommendation-engine');
const { buildSystemPromptFromDocs } = require('./lib/lombardo-ai-config');

const {
  detectConsultCategory,
  detectProfile,
  buildInteractionRecord,
  logInteractionRecord,
} = require('./ai-learning');

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_RECOMMENDATIONS = 3;
const MAX_HISTORY_ITEMS = 14;
const WHATSAPP_PHONE = '543412762319';
const WHATSAPP_BASE_MESSAGE = 'Hola Lombardo, quiero continuar esta consulta.';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const PAGE_CONTEXT_ROLES = {
  home: {
    rol: 'Anfitrión general de Lombardo',
    foco: 'Orientar al cliente, explicar qué ofrece la marca y sugerir próximos pasos claros.',
  },
  sommelier: {
    rol: 'Asistente del recomendador',
    foco: 'Profundizar recomendaciones, refinar gustos y sugerir caja/mensualidad cuando aplique.',
  },
  'wine-tinder': {
    rol: 'Analista de perfil vínico',
    foco: 'Convertir likes/dislikes en perfil y sugerencias de 1 a 3 vinos reales del catálogo.',
  },
  club: {
    rol: 'Asesor del Club Lombardo',
    foco: 'Explicar mensualidades, lógica de selecciones, beneficios y encuadre del club.',
  },
  experiencias: {
    rol: 'Curador de experiencias',
    foco:
      'Guiar sobre vino, café, catas, eventos y galería como subtemas de experiencias, con propuestas concretas.',
  },
  contacto: {
    rol: 'Asistente de cierre',
    foco: 'Facilitar contacto, derivación a WhatsApp y próximos pasos concretos.',
  },
  general: {
    rol: 'Anfitrión comercial de Lombardo',
    foco: 'Resolver dudas generales y orientar al área correcta con tono cálido.',
  },
};

const PAGE_CONTEXT_ALIASES = {
  'wine-tinder': 'wine-tinder',
  vinos: 'experiencias',
  vino: 'experiencias',
  cafe: 'experiencias',
  eventos: 'experiencias',
  catas: 'experiencias',
  galeria: 'experiencias',
  tienda: 'club',
  membresia: 'club',
  cajas: 'club',
  seleccion_mensual: 'club',
};

const OPERATIONAL_PROMPT_FALLBACK = [
  'Actuá como Asistente IA Lombardo en español rioplatense.',
  'Priorizá las reglas de los documentos canónicos cargados por el backend.',
  'Usá solo etiquetas reales del catálogo cuando recomiendes productos Lombardo.',
].join('\n');

let SYSTEM_PROMPT_CACHE = null;

const getCanonicalSystemPrompt = async () => {
  const fromDocs = await buildSystemPromptFromDocs();

  if (!fromDocs?.prompt || fromDocs.prompt.length < 200) {
    const error = new Error('No se pudo construir el prompt canónico desde docs.');
    error.code = 'CANONICAL_PROMPT_BUILD_ERROR';
    throw error;
  }

  const signature = fromDocs?.metadata?.docsSignature || '';
  if (SYSTEM_PROMPT_CACHE && SYSTEM_PROMPT_CACHE.signature === signature) {
    return SYSTEM_PROMPT_CACHE;
  }

  SYSTEM_PROMPT_CACHE = {
    prompt: fromDocs.prompt,
    metadata: {
      ...fromDocs.metadata,
      extraBlocks: [
        {
          name: 'operational_fallback',
          included: false,
          chars: OPERATIONAL_PROMPT_FALLBACK.length,
          reason: 'Disponible solo para fallback de error; no se concatena en condiciones normales.',
        },
      ],
    },
    signature,
  };

  return SYSTEM_PROMPT_CACHE;
};

const parseNumericStock = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBooleanStock = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'si', 'sí', 'yes', 'y', 'activo', 'disponible'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'inactivo', 'agotado', 'sin_stock'].includes(normalized)) return false;
  return fallback;
};

const normalizeCatalogItem = (wine, index) => {
  if (!wine || typeof wine !== 'object') return null;

  const stock = parseNumericStock(wine.stock_actual, 0);
  const disponible = parseBooleanStock(wine.disponible, stock > 0);

  if (!disponible || stock <= 0) return null;

  return {
    id_producto: wine.id_producto || `stock-${index + 1}`,
    nombre: wine.nombre,
    bodega: wine.bodega || '',
    categoria: wine.categoria || 'vino',
    subcategoria: wine.subcategoria || '',
    varietal: wine.varietal || '',
    pais: wine.pais || '',
    region: wine.region || '',
    tipo_vino: wine.tipo_vino || '',
    cuerpo: wine.cuerpo || '',
    intensidad: wine.intensidad || '',
    perfil: wine.perfil || '',
    acidez: wine.acidez || '',
    taninos: wine.taninos || '',
    estilo: wine.estilo || '',
    maridaje_principal: wine.maridaje_principal || '',
    maridaje_secundario: wine.maridaje_secundario || '',
    precio_venta: parseNumericStock(wine.precio_venta, 0),
    stock_actual: stock,
    disponible,
    recomendado_para_regalo: parseBooleanStock(wine.recomendado_para_regalo, false),
    recomendado_para_caja: parseBooleanStock(wine.recomendado_para_caja, false),
    recomendado_para_club: parseBooleanStock(wine.recomendado_para_club, false),
    nivel: wine.nivel || 'clasico',
    descripcion_corta: wine.descripcion_corta || '',
    recomendado_para: Array.isArray(wine.recomendado_para) ? wine.recomendado_para : [],
    combina_con: Array.isArray(wine.combina_con) ? wine.combina_con : [],
    tags: Array.isArray(wine.tags) ? wine.tags : [],
    destacado: Boolean(wine.destacado),
    // Compatibilidad con la lógica de recomendaciones actual:
    precio: parseNumericStock(wine.precio_venta, 0),
    ocasion: wine.recomendado_para_regalo ? 'regalo' : '',
    nivel_precio: wine.nivel || 'clasico',
    activo: true,
    prioridad_venta: wine.recomendado_para_club ? 'alta' : 'media',
  };
};

const readCatalogFile = async (fileName) => {
  const filePath = path.join(process.cwd(), fileName);
  const raw = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(raw);
  return { filePath, data };
};

const readProductCatalog = async () => {
  console.log('[sommelier-chat][debug] intentando leer catálogo principal lombardo_stock_ai.json + lombardo_productos_ai.json');
  try {
    const { data } = await readCatalogFile('lombardo_stock_ai.json');
    if (!Array.isArray(data)) return [];
    const stockItems = data.map(normalizeCatalogItem).filter(Boolean);

    let extraItems = [];
    try {
      const extra = await readCatalogFile('lombardo_productos_ai.json');
      extraItems = Array.isArray(extra.data)
        ? extra.data.map((item, index) => normalizeCatalogItem({
            id_producto: item.id,
            nombre: item.nombre,
            categoria: item.categoria,
            subcategoria: item.subcategoria,
            precio_venta: item.precio,
            stock_actual: item.stock,
            disponible: item.disponible,
            descripcion_corta: item.descripcion_corta,
            recomendado_para: item.recomendado_para,
            combina_con: item.combina_con,
            tags: item.tags,
            nivel: item.nivel,
            destacado: item.destacado,
            tipo_vino: item.subcategoria,
          }, index)).filter(Boolean)
        : [];
    } catch (extraError) {
      if (extraError.code !== 'ENOENT') {
        console.warn('[sommelier-chat][debug] catálogo extendido con error de parseo', { message: extraError?.message || '' });
      }
    }

    return [...stockItems, ...extraItems];
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('[sommelier-chat][debug] error leyendo/parsing catálogo principal', {
        code: error?.code || '',
        message: error?.message || '',
      });
      error.code = 'WINE_CATALOG_PARSE_ERROR';
      throw error;
    }
    console.warn('[sommelier-chat][debug] catálogo principal no encontrado, usando fallback vinos_lombardo_base.json');
  }

  const fallbackPath = path.join(process.cwd(), 'vinos_lombardo_base.json');
  try {
    const raw = await fs.readFile(fallbackPath, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data)
      ? data.map(normalizeCatalogItem).filter((wine) => wine && wine.activo !== false && parseNumericStock(wine.stock_actual, 1) > 0)
      : [];
  } catch (error) {
    console.error('[sommelier-chat][debug] error leyendo/parsing catálogo fallback', {
      code: error?.code || '',
      message: error?.message || '',
      path: fallbackPath,
    });
    error.code = error.code === 'ENOENT' ? 'WINE_CATALOG_NOT_FOUND' : 'WINE_CATALOG_PARSE_ERROR';
    throw error;
  }
};

const sanitizeMessage = (value) => (typeof value === 'string' ? value.trim() : '');

const sanitizePageContext = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) return 'general';
  const canonical = PAGE_CONTEXT_ALIASES[normalized] || normalized;
  return PAGE_CONTEXT_ROLES[canonical] ? canonical : 'general';
};

const normalizeText = (value) =>
  sanitizeMessage(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const sanitizeHistory = (history) => {
  if (!Array.isArray(history)) return [];

  return history
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .map((item) => ({
      role: item.role,
      content: sanitizeMessage(item.content).slice(0, 500),
    }))
    .filter((item) => Boolean(item.content))
    .slice(-MAX_HISTORY_ITEMS);
};

const buildPageContextGuidance = (pageContext) => {
  const config = PAGE_CONTEXT_ROLES[pageContext] || PAGE_CONTEXT_ROLES.general;
  return [
    `Página actual: ${pageContext}`,
    `Rol prioritario en esta sección: ${config.rol}.`,
    `Objetivo de respuesta en esta sección: ${config.foco}`,
    'Ajustá la prioridad del contenido según este rol sin romper las reglas generales.',
  ].join('\n');
};

const containsKeyword = (text, patterns) => patterns.some((pattern) => pattern.test(text));

const extractBudget = (message) => {
  const normalized = normalizeText(message).replace(/\./g, '');
  const match = normalized.match(/(?:\$|de|por|hasta|unos?)\s*(\d{2,6})/);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
};

const RECOMMENDATION_INTENT_PATTERNS = [
  /quiero un vino/,
  /recomend(a|ame|ame un|ame algun|ame algo)/,
  /algo para/,
  /vino para/,
  /vino suave/,
  /vino intenso/,
  /probar algo distinto/,
  /(que|qué) me recomendas/,
];

const FIELD_SYNONYMS = {
  tipo_vino: {
    tinto: ['tinto', 'malbec', 'cabernet', 'syrah', 'blend tinto'],
    blanco: ['blanco', 'chardonnay', 'sauvignon blanc', 'torrontes'],
    rosado: ['rosado', 'rose'],
    espumante: ['espumante', 'burbujas', 'sparkling'],
  },
  maridaje_principal: {
    carne: ['asado', 'carne', 'parrilla', 'bife'],
    pescado: ['sushi', 'pescado', 'mariscos'],
    pasta: ['pasta', 'pastas'],
    queso: ['queso', 'quesos', 'picada'],
    postre: ['postre', 'dulce'],
  },
  ocasion: {
    asado: ['asado', 'parrilla'],
    regalo: ['regalo', 'regalar'],
    celebracion: ['celebrar', 'festejo', 'brindis'],
    cena: ['cena', 'comida'],
  },
  varietal: {
    malbec: ['malbec'],
    cabernet: ['cabernet'],
    pinot: ['pinot'],
    blend: ['blend', 'corte'],
  },
  estilo: {
    suave: ['suave', 'ligero', 'facil de tomar', 'frutado'],
    intenso: ['intenso', 'con cuerpo', 'potente', 'estructurado'],
    distinto: ['distinto', 'diferente', 'nuevo'],
  },
};

const hasRecommendationIntent = (message) => {
  const normalized = normalizeText(message);
  return containsKeyword(normalized, RECOMMENDATION_INTENT_PATTERNS);
};

const startsWithMenuLikePhrase = (answer = '') => {
  const normalized = normalizeText(answer);
  return /(puedo armarte|te puedo armar|puedo ofrecerte).*(recomendacion|caja|mensualidad|plan)/.test(normalized);
};

const rewriteMenuLikeOpening = (answer = '', intent) => {
  if (!startsWithMenuLikePhrase(answer)) return answer;

  const lines = answer.split('\n').filter(Boolean);
  const cleaned = lines.slice(1).join('\n').trim();

  if (intent === INTENTS.CONSULTA_EDUCATIVA_VINO) {
    return [
      'Te respondo primero la parte de vino y después, si querés, lo bajamos a etiquetas concretas de Lombardo.',
      cleaned,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  return cleaned || answer;
};

const findRequestedValues = (normalizedMessage, dictionary) =>
  Object.entries(dictionary)
    .filter(([, aliases]) => aliases.some((alias) => normalizedMessage.includes(alias)))
    .map(([key]) => key);

const buildRecommendationSignals = (message) => {
  const normalizedMessage = normalizeText(message);

  return {
    normalizedMessage,
    tipo_vino: findRequestedValues(normalizedMessage, FIELD_SYNONYMS.tipo_vino),
    maridaje_principal: findRequestedValues(normalizedMessage, FIELD_SYNONYMS.maridaje_principal),
    ocasion: findRequestedValues(normalizedMessage, FIELD_SYNONYMS.ocasion),
    varietal: findRequestedValues(normalizedMessage, FIELD_SYNONYMS.varietal),
    estilo: findRequestedValues(normalizedMessage, FIELD_SYNONYMS.estilo),
  };
};

const buildStyleHints = (wine) => {
  const hints = [];
  const varietal = normalizeText(wine.varietal);
  const tipo = normalizeText(wine.tipo_vino);

  if (tipo === 'blanco' || varietal.includes('pinot')) hints.push('suave');
  if (tipo === 'tinto' || varietal.includes('cabernet') || varietal.includes('syrah')) hints.push('intenso');
  if (varietal.includes('blend')) hints.push('distinto');

  return hints;
};

const matchFieldScore = (wineValue, requestedValues, score) => {
  if (!requestedValues.length) return 0;
  const normalizedWineValue = normalizeText(String(wineValue || ''));
  return requestedValues.some((value) => normalizedWineValue.includes(value)) ? score : 0;
};

const shouldSuggestWhatsApp = ({ message, pageContext, intent }) => {
  if (intent === INTENTS.CONSULTA_EDUCATIVA_VINO) return false;
  if (intent === INTENTS.CONSULTA_CONTACTO) return true;

  const normalized = sanitizeMessage(message).toLowerCase();
  if (!normalized) return false;

  const commercialIntentPatterns = [
    /quiero (comprar|llevar|encargar|reservar)/,
    /(avanzar|cerrar|confirmar) (con|la|el|mi)?/,
    /arm(ar|o).*(caja|box)/,
    /(club|mensualidad|suscrip|membres)/,
    /(evento|reserva|cumple|corporativo|privado)/,
    /(hablar|asesor|persona|humano|vendedor)/,
    /(stock|disponib|precio final|confirmar)/,
    /(pasame|dejame).*(whatsapp)/,
  ];

  const exploratoryPatterns = [
    /(qué|que) vino/,
    /maridaje|varietal|malbec|cabernet|blanco|tinto/,
    /recomendame|sugerime/,
    /(cómo|como) elegir/,
    /orientaci[oó]n|general/,
  ];

  const hasCommercialIntent = containsKeyword(normalized, commercialIntentPatterns);
  const isExploratoryOnly = containsKeyword(normalized, exploratoryPatterns) && !hasCommercialIntent;

  if (isExploratoryOnly) return false;
  if (hasCommercialIntent) return true;

  return ['experiencias', 'contacto', 'club'].includes(pageContext) && normalized.length > 40;
};

const buildWhatsAppSuggestion = (pageContext) => {
  const byContext = {
    sommelier: 'Si querés avanzar con esta selección, te dejamos el acceso directo a WhatsApp.',
    club: 'Para una consulta más puntual del club, también podemos seguir por WhatsApp.',
    experiencias: 'Si querés avanzar con una experiencia puntual, también podemos seguir por WhatsApp.',
    contacto: 'Si preferís, también podemos seguir esta consulta por WhatsApp.',
  };

  return byContext[pageContext] || 'Para una consulta más puntual, también podemos seguir por WhatsApp.';
};

const buildWhatsAppUrl = (message) => {
  const safeMessage = sanitizeMessage(message) || WHATSAPP_BASE_MESSAGE;
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(safeMessage)}`;
};

const CLOSING_TYPES = {
  EDUCATIONAL: 'educational',
  LABELS: 'labels',
  BOX: 'box',
  SUBSCRIPTION: 'subscription',
  WHATSAPP: 'whatsapp',
};


const SOCIAL_REPLY_PATTERNS = {
  saludo: [/^(hola|holis|buenas|buen dia|buen día|buenas tardes|buenas noches|que tal|cómo va|como va|como andas|cómo andás)[!.\s]*$/i],
  agradecimiento: [/^(gracias|muchas gracias|genial gracias|ok gracias|mil gracias|graciass+)[!.\s]*$/i],
  noSeElegir: [/(^|\s)(no se|no sé)\s+que\s+elegir($|\s)/i],
  ayudaAbierta: [/(^|\s)(ayudame|ayúdame|tengo una duda|necesito ayuda)($|\s)/i],
  casual: [/^(ok|dale|perfecto|joya|buenisimo|buenísimo|buenisima|buenísima|entiendo)[!.\s]*$/i],
};

const detectSocialSubtype = (message = '') => {
  const text = sanitizeMessage(message);
  if (!text) return null;

  if (containsKeyword(text, SOCIAL_REPLY_PATTERNS.agradecimiento)) return 'agradecimiento';
  if (containsKeyword(text, SOCIAL_REPLY_PATTERNS.noSeElegir)) return 'no_se_que_elegir';
  if (containsKeyword(text, SOCIAL_REPLY_PATTERNS.ayudaAbierta)) return 'ayuda_abierta';
  if (containsKeyword(text, SOCIAL_REPLY_PATTERNS.saludo)) return 'saludo';
  if (containsKeyword(text, SOCIAL_REPLY_PATTERNS.casual)) return 'casual';
  return null;
};

const buildSocialReply = ({ message, history }) => {
  const subtype = detectSocialSubtype(message);
  const hasRecentAssistant = Array.isArray(history) && history.some((item) => item.role === 'assistant');

  if (subtype === 'agradecimiento') {
    return 'De nada, encantado. Si querés, seguimos viendo opciones.';
  }

  if (subtype === 'no_se_que_elegir') {
    return 'Tranqui, pasa bastante. Decime si lo buscás para comida, regalo o para llevar algo rico y lo vemos juntos.';
  }

  if (subtype === 'ayuda_abierta') {
    return 'Obvio, vamos paso a paso. Contame para qué ocasión lo estás pensando y te ayudo a elegir bien.';
  }

  if (subtype === 'saludo') {
    return hasRecentAssistant
      ? '¡Qué bueno seguir por acá! Decime qué estás buscando y lo vemos juntos.'
      : '¡Hola! ¿Cómo va? Decime qué estás buscando y te doy una mano.';
  }

  if (subtype === 'casual') {
    return 'Perfecto. Cuando quieras, lo aterrizamos a algo puntual y lo resolvemos juntos.';
  }

  return 'Dale, contame un poco más y te ayudo a encontrar algo que te encaje.';
};

const buildConversationText = ({ message, history }) => {
  const chunks = [sanitizeMessage(message), ...history.map((item) => sanitizeMessage(item.content))].filter(Boolean);
  return normalizeText(chunks.join(' | '));
};

const detectClosingType = ({ message, history, pageContext, intent }) => {
  const conversationText = buildConversationText({ message, history });

  const whatsappPatterns = [
    /(avanzar|cerrar|confirmar|coordinar)/,
    /(hablar|asesor|persona|humano|equipo)/,
    /(whatsapp|contacto directo)/,
    /(evento|corporativo|privado|reserva)/,
  ];
  if (containsKeyword(conversationText, whatsappPatterns) || shouldSuggestWhatsApp({ message, pageContext, intent })) {
    return CLOSING_TYPES.WHATSAPP;
  }

  const subscriptionPatterns = [/(mensualidad|suscrip|membres|club)/, /(todos los meses|cada mes|recurrente)/];
  if (containsKeyword(conversationText, subscriptionPatterns)) return CLOSING_TYPES.SUBSCRIPTION;

  const boxPatterns = [/(caja|box)/, /(regalo|regalar)/, /(armar|seleccion|seleccion)/, /(comprar|llevar|encargar)/];
  if (containsKeyword(conversationText, boxPatterns)) return CLOSING_TYPES.BOX;

  const labelsPatterns = [/(recomend|suger)/, /(que vino|vino para|maridaje)/, /(etiqueta|opcion|opcion)/];
  if (containsKeyword(conversationText, labelsPatterns)) return CLOSING_TYPES.LABELS;

  return CLOSING_TYPES.EDUCATIONAL;
};

const buildClosingSuggestion = ({ closingType, pageContext }) => {
  if (closingType === CLOSING_TYPES.WHATSAPP) return buildWhatsAppSuggestion(pageContext);

  const byType = {
    [CLOSING_TYPES.EDUCATIONAL]:
      'Si querés, lo bajo a estilos concretos según la comida o el momento que tengas.',
    [CLOSING_TYPES.LABELS]:
      'Si te sirve, te paso 2 o 3 etiquetas de Lombardo que vayan con eso.',
    [CLOSING_TYPES.BOX]: 'Si querés, te armo una caja de 3 vinos en esa línea (segura, especial y para descubrir).',
    [CLOSING_TYPES.SUBSCRIPTION]:
      'Si ese perfil te representa, te puedo sugerir una mensualidad alineada a tu gusto.',
  };

  return byType[closingType] || byType[CLOSING_TYPES.EDUCATIONAL];
};

const hasNaturalFollowUp = (answer) => {
  const trimmed = sanitizeMessage(answer);
  if (!trimmed) return false;

  const tail = trimmed.slice(-180);
  return /\?/.test(tail) || /(preferis|preferís|buscas|buscás|queres|querés|te sirve|te va)/i.test(tail);
};

const limitQuestionsInAnswer = (answer = '') => {
  const trimmed = sanitizeMessage(answer);
  if (!trimmed) return '';

  const questions = trimmed.match(/\?/g) || [];
  if (questions.length <= 1) return trimmed;

  const lastQuestionIndex = trimmed.lastIndexOf('?');
  if (lastQuestionIndex === -1) return trimmed;

  const beforeQuestion = trimmed.slice(0, lastQuestionIndex + 1);
  const cleanedBeforeQuestion = beforeQuestion.replace(/\?/g, '.').replace(/\.\s*\?/g, '?');
  return `${cleanedBeforeQuestion}${trimmed.slice(lastQuestionIndex + 1)}`.replace(/\s{2,}/g, ' ').trim();
};

const appendAdaptiveClosing = ({ answer, message, history, pageContext, intent }) => {
  const trimmed = sanitizeMessage(answer);
  if (!trimmed) return { answer: '', closingType: CLOSING_TYPES.EDUCATIONAL };

  if (intent === INTENTS.CONSULTA_SOCIAL) {
    return { answer: trimmed, closingType: CLOSING_TYPES.EDUCATIONAL };
  }

  const closingType = detectClosingType({ message, history, pageContext, intent });
  const suggestion = buildClosingSuggestion({ closingType, pageContext });

  if (!suggestion) return { answer: trimmed, closingType };

  if (hasNaturalFollowUp(trimmed)) {
    return { answer: trimmed, closingType };
  }

  const normalizedAnswer = normalizeText(trimmed);
  const normalizedSuggestion = normalizeText(suggestion);
  const keywordByType = {
    [CLOSING_TYPES.WHATSAPP]: /whatsapp/,
    [CLOSING_TYPES.SUBSCRIPTION]: /(mensualidad|club|suscrip)/,
    [CLOSING_TYPES.BOX]: /(caja|box)/,
    [CLOSING_TYPES.LABELS]: /(etiquetas?|opciones?|lombardo)/,
    [CLOSING_TYPES.EDUCATIONAL]: /(estilos?|comidas?|momentos?)/,
  };

  if (normalizedAnswer.includes(normalizedSuggestion) || keywordByType[closingType].test(normalizedAnswer)) {
    return { answer: trimmed, closingType };
  }

  if (closingType !== CLOSING_TYPES.WHATSAPP && trimmed.length > 180) {
    return { answer: trimmed, closingType };
  }

  const shouldAppend = closingType === CLOSING_TYPES.WHATSAPP || trimmed.length < 110;
  if (!shouldAppend) return { answer: trimmed, closingType };

  return { answer: `${trimmed}\n\n${suggestion}`, closingType };
};

const buildUserPrompt = ({ message, wines, pageContext, history, recommendedWines, intent, recommendationContext, recommendationIntro, combinationProposal }) => {
  const compactCatalog = wines.map((wine) => ({
    nombre: wine.nombre,
    categoria: wine.categoria,
    subcategoria: wine.subcategoria,
    precio: wine.precio,
    tipo_vino: wine.tipo_vino,
    varietal: wine.varietal,
    maridaje_principal: wine.maridaje_principal,
    ocasion: wine.ocasion,
    recomendado_para: wine.recomendado_para || [],
    combina_con: wine.combina_con || [],
    tags: wine.tags || [],
    nivel_precio: wine.nivel_precio,
  }));

  const serializedHistory = history.length
    ? history.map((item) => `${item.role === 'assistant' ? 'Asistente' : 'Cliente'}: ${item.content}`).join('\n')
    : 'Sin historial previo en esta sesión.';
  const conversationHints = extractConversationHints({ message, history });

  const requestContext = {
    pagina_actual: pageContext,
    intencion_detectada: intent,
    recomendacion_contexto: recommendationContext || null,
    recomendacion_intro: recommendationIntro || null,
    max_recomendaciones: MAX_RECOMMENDATIONS,
    propuesta_combinada: combinationProposal || null,
  };

  return [
    'Usá como fuente principal las instrucciones canónicas del system prompt cargado desde docs.',
    [
      'Objetivo conversacional prioritario para este turno:',
      '1) Respondé directo y natural, como continuidad del hilo actual.',
      '2) Ampliá solo lo necesario (sin formato rígido ni estructura repetitiva).',
      '3) Recomendá recién después de responder, solo si aporta.',
      '4) Evitá cierres comerciales automáticos (caja, club, WhatsApp) salvo pedido explícito o intención comercial clara.',
      '5) Cerrá con una sola pregunta breve y útil únicamente si realmente hace falta para avanzar.',
      '6) Soná premium pero relajado: asesor humano de vinoteca boutique, cero tono corporativo.',
    ].join('\n'),
    buildPageContextGuidance(pageContext),
    `Mensaje actual del cliente: ${message}`,
    `Historial de conversación:
${serializedHistory}`,
    `Señales conversacionales recientes: ${JSON.stringify(conversationHints)}`,
    `Contexto estructurado de esta consulta: ${JSON.stringify(requestContext)}`,
    `Catálogo Lombardo disponible (vino, café, gourmet, cajas, club y experiencias) (JSON): ${JSON.stringify(compactCatalog)}`,
    [INTENTS.CONSULTA_PRODUCTO, INTENTS.CONSULTA_CAJA, INTENTS.CONSULTA_MENSUALIDAD].includes(intent)
      ? `Preselección sugerida para esta consulta: ${JSON.stringify(recommendedWines)}`
      : 'Sin preselección forzada para esta consulta.',
  ].join('\n\n');
};

const createOpenAIResponse = async ({ message, wines, pageContext, history, recommendedWines, intent, recommendationContext, recommendationIntro, combinationProposal }) => {
  if (intent === INTENTS.CONSULTA_SOCIAL) {
    return buildSocialReply({ message, history });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  console.log('[sommelier-chat][debug] cargando prompt canónico');
  const canonicalPrompt = await getCanonicalSystemPrompt();

  if (!apiKey) {
    console.error('[sommelier-chat][debug] OPENAI_API_KEY faltante');
    const configError = new Error('OPENAI_API_KEY no está configurada en el entorno.');
    configError.code = 'OPENAI_CONFIG_ERROR';
    throw configError;
  }

  let response;
  try {
    console.log('[sommelier-chat][debug] llamando OpenAI', {
      model: OPENAI_MODEL,
      endpoint: OPENAI_URL,
      canonicalDocs: canonicalPrompt.metadata.docs.map((doc) => doc.file),
      extraBlocks: canonicalPrompt.metadata.extraBlocks,
      truncated: canonicalPrompt.metadata.truncated,
    });
    response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [
          { role: 'system', content: canonicalPrompt.prompt },
          {
            role: 'user',
            content: buildUserPrompt({ message, wines, pageContext, history, recommendedWines, intent, recommendationContext, recommendationIntro, combinationProposal }),
          },
        ],
        max_output_tokens: 350,
        temperature: 0.7,
      }),
    });
  } catch (error) {
    error.code = 'OPENAI_NETWORK_ERROR';
    throw error;
  }

  if (!response.ok) {
    const details = await response.text();
    const openAIError = new Error(`OpenAI error (${response.status}): ${details}`);
    openAIError.code = 'OPENAI_HTTP_ERROR';
    throw openAIError;
  }

  const data = await response.json().catch((error) => {
    console.error('[sommelier-chat][debug] error parseando respuesta OpenAI', { message: error?.message || '' });
    error.code = 'OPENAI_PARSE_ERROR';
    throw error;
  });

  console.log('[sommelier-chat][debug] OpenAI response ok', {
    hasOutputText: Boolean(data.output_text),
  });

  return (data.output_text || '').trim();
};

const buildServerErrorPayload = (error) => {
  const code = error?.code || 'INTERNAL_SERVER_ERROR';
  const statusMap = {
    WINE_CATALOG_NOT_FOUND: 500,
    WINE_CATALOG_PARSE_ERROR: 500,
    OPENAI_NETWORK_ERROR: 502,
    OPENAI_CONFIG_ERROR: 500,
    OPENAI_HTTP_ERROR: 502,
    OPENAI_PARSE_ERROR: 502,
    CANONICAL_PROMPT_BUILD_ERROR: 500,
    CANONICAL_DOC_EMPTY: 500,
    ENOENT: 500,
    INTERNAL_SERVER_ERROR: 500,
  };

  const publicMessageMap = {
    WINE_CATALOG_NOT_FOUND: 'No pudimos cargar la base de vinos en este momento.',
    WINE_CATALOG_PARSE_ERROR: 'No pudimos leer la base de vinos en este momento.',
    OPENAI_NETWORK_ERROR: 'Se perdió la conexión con el servicio de IA.',
    OPENAI_CONFIG_ERROR: 'La configuración del servicio de IA está incompleta en el servidor.',
    OPENAI_HTTP_ERROR: 'El servicio de IA devolvió un error.',
    OPENAI_PARSE_ERROR: 'No pudimos interpretar la respuesta del servicio de IA.',
    CANONICAL_PROMPT_BUILD_ERROR: 'No pudimos reconstruir el prompt canónico del asistente.',
    CANONICAL_DOC_EMPTY: 'Hay un documento canónico vacío en la configuración del asistente.',
    ENOENT: 'Falta un documento canónico requerido para el asistente.',
    INTERNAL_SERVER_ERROR: 'No pudimos generar la recomendación en este momento.',
  };

  return {
    status: statusMap[code] || 500,
    payload: {
      error: true,
      message: publicMessageMap[code] || publicMessageMap.INTERNAL_SERVER_ERROR,
      error_code: code,
    },
  };
};

const appendWhatsAppSuggestion = ({ answer, pageContext }) => {
  const trimmed = sanitizeMessage(answer);
  if (!trimmed) return '';

  if (/whatsapp/i.test(trimmed)) return trimmed;

  return `${trimmed}\n\n${buildWhatsAppSuggestion(pageContext)}`;
};

const buildFallbackRecommendationAnswer = ({ message, wines, recommendedWines, pageContext, intent, recommendationContext, recommendationIntro, combinationProposal, history = [] }) => {
  if (intent === INTENTS.CONSULTA_SOCIAL) {
    return buildSocialReply({ message, history });
  }

  if (intent === INTENTS.CONSULTA_EDUCATIVA_VINO) {
    return [
      'Para maridar bien un Malbec conviene ir a platos de intensidad media a alta: carnes rojas, pastas con salsas intensas, empanadas y quesos semiduros suelen funcionar muy bien.',
      'Si querés, después lo bajamos a 2 o 3 etiquetas de Lombardo que encajen con ese estilo.',
    ].join(' ');
  }

  if (intent === INTENTS.CONSULTA_MENSUALIDAD) {
    const selection = wines.slice(0, MAX_RECOMMENDATIONS).map((wine) => wine.nombre).filter(Boolean);
    return [
      'La mensualidad del club está pensada para darte variedad, equilibrio de estilos y alguna etiqueta para descubrir algo nuevo.',
      selection.length
        ? `Una selección mensual sugerida podría ser: ${selection.join(', ')}.`
        : 'Si te gusta, te armo una selección mensual personalizada según tus gustos.',
    ].join(' ');
  }

  if (intent === INTENTS.CONSULTA_CAJA) {
    const options = (recommendedWines.length ? recommendedWines : wines.slice(0, MAX_RECOMMENDATIONS)).slice(
      0,
      MAX_RECOMMENDATIONS
    );
    const [segura, especial, descubrir] = options;
    const pick = (label, wine) =>
      wine
        ? `• ${label}: ${wine.nombre} (${wine.varietal || wine.tipo_vino || 'vino'})`
        : `• ${label}: te la personalizo según comida, ocasión y presupuesto.`;

    return [
      'Te propongo una caja de 3 vinos con esta lógica:',
      pick('Opción segura', segura),
      pick('Opción más especial', especial),
      pick('Opción para descubrir', descubrir),
    ].join('\n');
  }

  if (intent === INTENTS.CONSULTA_CONTACTO) {
    return 'Perfecto, te ayudo a resolverlo. Si te queda cómodo, lo seguimos por WhatsApp.';
  }

  if (intent === INTENTS.CONSULTA_EXPERIENCIAS) {
    return 'Tenemos catas, encuentros y experiencias de vino y café. Si me contás ocasión y cantidad de personas, te sugiero la que mejor encaja.';
  }

  if (intent === INTENTS.CONSULTA_CLUB) {
    return 'El Club Lombardo está pensado para recibir selecciones curadas con beneficios exclusivos. Si querés, te explico fácil cómo funciona la mensualidad y qué incluye.';
  }

  const options = (recommendedWines.length ? recommendedWines : wines.slice(0, MAX_RECOMMENDATIONS)).slice(
    0,
    MAX_RECOMMENDATIONS
  );

  if (!options.length) {
    return [
      'Gracias por la consulta. Ahora no pude cargar recomendaciones específicas.',
      'Si me compartís ocasión, presupuesto aproximado y estilo de vino, te ayudo mejor.',
    ].join(' ');
  }

  const introByContext = {
    club: 'Estas opciones pueden encajar muy bien para tu perfil dentro del club:',
    sommelier: 'Estas etiquetas de Lombardo pueden encajar muy bien con lo que buscás:',
    experiencias: 'Para esta ocasión, estas etiquetas de Lombardo pueden funcionar muy bien:',
  };

  const intro = recommendationIntro || introByContext[pageContext] || 'Estas opciones de Lombardo pueden encajar muy bien con lo que buscás:';
  const contextHint = recommendationContext
    ? `Perfil ${recommendationContext.profile || 'general'} · ocasión ${recommendationContext.ocasion || 'libre'}${recommendationContext.budget ? ` · presupuesto cercano a $${Number(recommendationContext.budget).toLocaleString('es-AR')}` : ''}`
    : '';

  const listed = options
    .map((wine) => {
      const parts = [wine.nombre, wine.categoria, wine.subcategoria || wine.varietal || wine.tipo_vino, wine.precio]
        .map((part) => sanitizeMessage(String(part || '')))
        .filter(Boolean);
      return `• ${parts.join(' · ')}`;
    })
    .join('\n');

  const comboHint = combinationProposal?.pitch ? `Propuesta combinada: ${combinationProposal.pitch}` : '';

  const closing = hasRecommendationIntent(message)
    ? '¿Lo buscás para comida, regalo o para llevar algo rico?'
    : '¿Preferís que te arme una propuesta más clásica o más jugada?';

  return [intro, contextHint, listed, comboHint, closing].filter(Boolean).join('\n');
};

const buildServiceErrorFallbackReply = ({ message, wines = [], recommendedWines = [], pageContext = 'sommelier' }) => {
  const fallbackCatalog = recommendedWines.length ? recommendedWines : wines;
  const malbecCandidate = fallbackCatalog.find((wine) => /malbec/i.test(String(wine?.varietal || wine?.nombre || '')));
  const suggestedLabel = malbecCandidate?.nombre
    ? ` Si querés, te puedo sugerir también ${malbecCandidate.nombre} de Lombardo.`
    : ' Si querés, también te puedo sugerir algunos Malbec de Lombardo.';

  const educationalWineFallback =
    `El Malbec suele ir muy bien con carnes rojas, asado y pastas con salsa intensa.${suggestedLabel}`;

  const recommendationFallback = buildFallbackRecommendationAnswer({
    message,
    wines,
    recommendedWines,
    pageContext,
    intent: detectIntentByRules({ message, pageContext, history: [] }),
    recommendationContext: null,
    recommendationIntro: null,
    combinationProposal: null,
  });

  return sanitizeMessage(recommendationFallback || educationalWineFallback) || educationalWineFallback;
};

const applyCorsHeaders = (res) => {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value));
};

module.exports = async (req, res) => {
  applyCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: true,
      message: 'Method not allowed',
      reply: buildServiceErrorFallbackReply({ message: '', pageContext: 'sommelier' }),
      fallback: {
        used: true,
        mode: 'method-fallback',
      },
    });
  }

  try {
    console.log('[sommelier-chat][debug] request recibido', {
      method: req.method,
      contentType: req.headers?.['content-type'] || '',
      hasBody: Boolean(req.body),
    });

    console.log('[sommelier-chat][debug] validando payload');

    const message = sanitizeMessage(req.body?.message);
    const pageContext = sanitizePageContext(req.body?.pagina_actual);
    const history = sanitizeHistory(req.body?.history);
    const intent = detectIntentByRules({ message, pageContext, history });
    const category = detectConsultCategory({ message, intent, pageContext });
    const profile = detectProfile({ message, category });

    console.log('[sommelier-chat][debug] payload recibido', {
      messageLength: message.length,
      pageContext,
      historyItems: history.length,
      intent,
    });

    if (!message) {
      return res.status(400).json({
        error: true,
        message: 'El campo "message" es obligatorio.',
        reply: buildServiceErrorFallbackReply({ message: '', pageContext }),
        fallback: {
          used: true,
          mode: 'validation-fallback',
        },
      });
    }

    console.log('[sommelier-chat][debug] cargando catálogo');
    const wines = await readProductCatalog();
    console.log('[sommelier-chat][debug] catálogo cargado', { wines: wines.length });

    const {
      recommendations: recommendedWines,
      context: recommendationContext,
      intro: recommendationIntro,
      combinationProposal,
    } = recommendWines({ wines, message, intent, wineProfile: req.body?.wine_profile });
    console.log('[sommelier-chat][debug] preselección', { recommended: recommendedWines.length });
    const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
    console.log('[sommelier-chat][debug] OpenAI key disponible:', hasOpenAIKey);

    let fallbackMode = hasOpenAIKey ? 'openai' : 'local';
    let rawAnswer = '';

    if (hasOpenAIKey) {
      console.log('[sommelier-chat][debug] iniciando llamada a OpenAI');
      try {
        rawAnswer = await createOpenAIResponse({
          message,
          wines,
          pageContext,
          history,
          recommendedWines,
          intent,
          recommendationContext,
          recommendationIntro,
          combinationProposal,
        });
      } catch (openAIError) {
        fallbackMode = 'openai-error-fallback';
        console.warn('[sommelier-chat][debug] OpenAI fallback activado por error:', {
          code: openAIError?.code || 'OPENAI_UNKNOWN_ERROR',
          message: openAIError?.message || '',
        });
      }
    }

    if (!hasOpenAIKey) {
      console.warn('[sommelier-chat][debug] usando fallback local por OPENAI_API_KEY faltante');
    }

    if (!rawAnswer) {
      rawAnswer = buildFallbackRecommendationAnswer({
        message,
        wines,
        recommendedWines,
        pageContext,
        intent,
        recommendationContext,
        recommendationIntro,
        combinationProposal,
        history,
      });
      if (hasOpenAIKey && fallbackMode === 'openai-error-fallback') {
        rawAnswer = buildServiceErrorFallbackReply({ message, wines, recommendedWines, pageContext }) || rawAnswer;
      }
    }

    if (!rawAnswer) {
      const safeReply = buildServiceErrorFallbackReply({ message, wines, recommendedWines, pageContext });
      return res.status(200).json({
        reply: safeReply,
        fallback: {
          used: true,
          mode: 'service-error-fallback',
        },
      });
    }

    console.log('[sommelier-chat][debug] respuesta generada', {
      answerLength: rawAnswer.length,
      via: fallbackMode,
    });

    const normalizedAnswer = rewriteMenuLikeOpening(rawAnswer, intent);

    const { answer, closingType } = appendAdaptiveClosing({
      answer: normalizedAnswer,
      message,
      history,
      pageContext,
      intent,
    });
    const polishedAnswer = limitQuestionsInAnswer(answer);
    const suggestWhatsApp = closingType === CLOSING_TYPES.WHATSAPP;
    const canonicalResponse = {
      reply: polishedAnswer,
      suggestions: suggestWhatsApp ? [buildWhatsAppSuggestion(pageContext)] : [],
      whatsappUrl: suggestWhatsApp ? buildWhatsAppUrl(message) : '',
      fallback: {
        used: fallbackMode !== 'openai',
        mode: fallbackMode,
      },
      combination_proposal: combinationProposal || null,
    };

    const interactionRecord = buildInteractionRecord({
      message,
      pageContext,
      intent,
      profile,
      category,
      suggestedProducts: recommendedWines.map((wine) => wine.nombre).filter(Boolean),
      closingType,
      derivoWhatsapp: suggestWhatsApp,
    });

    try {
      await logInteractionRecord(interactionRecord);

      await recordInteraction({
        mensaje_usuario: message,
        pagina_actual: pageContext,
        intencion_detectada: intent,
        perfil_detectado: profile || inferProfile(message),
        categoria_consulta: intentToCategory(intent),
        productos_sugeridos: recommendedWines.map((wine) => wine.nombre).filter(Boolean),
        tipo_cierre: closingType,
        derivo_whatsapp: suggestWhatsApp,
      });
    } catch (learningError) {
      console.warn('[sommelier-chat][debug] no se pudo persistir aprendizaje, se devuelve respuesta igual', {
        code: learningError?.code || '',
        message: learningError?.message || '',
      });
    }

    return res.status(200).json({
      ...canonicalResponse,
      // Compatibilidad transitoria para consumidores legacy.
      answer: canonicalResponse.reply,
      suggest_whatsapp: suggestWhatsApp,
      whatsapp_label: suggestWhatsApp ? 'Seguir por WhatsApp' : '',
      whatsapp_url: canonicalResponse.whatsappUrl,
      intent,
      learning: {
        categoria_consulta: category,
        perfil_detectado: profile,
        tipo_cierre: interactionRecord.tipo_cierre,
      },
    });
  } catch (error) {
    const { status, payload } = buildServerErrorPayload(error);
    const emergencyReply = buildServiceErrorFallbackReply({ message: sanitizeMessage(req.body?.message), pageContext: sanitizePageContext(req.body?.pagina_actual) });
    console.error(`[sommelier-chat][${payload.error_code}] error en catch final`, {
      message: error?.message || '',
      stack: error?.stack || '',
      code: error?.code || 'INTERNAL_SERVER_ERROR',
    });
    return res.status(status).json({
      ...payload,
      reply: emergencyReply,
      fallback: {
        used: true,
        mode: 'catch-fallback',
      },
    });
  }
};

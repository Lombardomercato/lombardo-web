const fs = require('node:fs/promises');
const path = require('node:path');
const { recordInteraction, inferProfile, intentToCategory } = require('./lib/assistant-interactions');

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
const INTENTS = {
  EDUCATIVA: 'educativa',
  RECOMENDACION: 'recomendacion',
  CAJA: 'caja',
  MENSUALIDAD: 'mensualidad',
  COMERCIAL: 'comercial',
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

const SYSTEM_PROMPT = [
  'Actuá como Asistente IA Lombardo.',
  'Podés responder tanto consultas generales sobre vino como recomendaciones concretas de Lombardo.',
  'Ajustá tu enfoque según la página actual del sitio.',
  'Sos el asistente digital de una vinería boutique con propuesta de vinos, café, regalos, experiencias y club.',
  'Respondé con tono cálido, claro, premium y útil en español rioplatense.',
  'Evitá sonar enciclopédico o pedante: explicá como asesor experto, simple y cercano.',
  'Primero ayudá dentro del chat y no empujes a WhatsApp demasiado rápido.',
  'Sugerí WhatsApp solo cuando tenga sentido comercial o de cierre, de forma opcional y natural.',
  'Manejá tres modos: conocimiento general, catálogo Lombardo y modo mixto.',
  'Modo conocimiento general: si la pregunta es de cultura vínica, maridajes, servicio, varietales o estilos, respondé con conocimiento general claro y útil.',
  'Modo catálogo Lombardo: si piden etiquetas, cajas, mensualidad/club o disponibilidad de Lombardo, usá la base real disponible y no inventes etiquetas, precios ni stock.',
  'Modo mixto: cuando tenga sentido, primero explicá lo general y después ofrecé bajar esa recomendación a opciones reales de Lombardo.',
  'Podés recomendar etiquetas de Lombardo cuando corresponda, pero no fuerces recomendaciones de catálogo si la consulta es puramente educativa.',
  'Si la consulta es general, no inventes políticas comerciales, promociones o condiciones no confirmadas.',
  `Si recomendás vinos, mencioná hasta ${MAX_RECOMMENDATIONS} opciones y explicá brevemente por qué podrían encajar.`,
  'Si la consulta depende de información no confirmada, aclaralo y sugerí consulta por WhatsApp.',
  'Podés responder consultas sobre maridajes, varietales, estilos, temperatura de servicio, copas, ocasiones de consumo, regalos, vinos para principiantes y lógica de cuerpo/acidez/dulzor/estructura.',
  'También respondé sobre regalos y cajas, mensualidades/club, experiencias y eventos, cafetería y dudas generales de Lombardo.',
  'Estructura vigente del sitio: contextos principales = home, sommelier, experiencias, club y contacto.',
  'Dentro de experiencias tratá vino, café, eventos, catas y galería como subtemas, no como páginas independientes.',
  'Dentro de club tratá membresía, cajas, selección mensual y tienda como subtemas, no como páginas independientes.',
  'Si preguntan por compra de vinos o productos, orientá conceptualmente al universo Club.',
  'No sugieras navegar a páginas independientes de vino, café, eventos, catas, galería o tienda.',
  'Tené en cuenta el historial de conversación para mantener coherencia en respuestas de seguimiento.',
  'Cerrá cada respuesta con un siguiente paso útil y natural según intención: educativo, etiquetas, caja ideal, mensualidad o WhatsApp.',
].join('\n');

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

const normalizeStockWine = (wine, index) => {
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

const readWineCatalog = async () => {
  try {
    const { data } = await readCatalogFile('lombardo_stock_ai.json');
    if (!Array.isArray(data)) return [];
    return data.map(normalizeStockWine).filter(Boolean);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      error.code = 'WINE_CATALOG_PARSE_ERROR';
      throw error;
    }
  }

  const fallbackPath = path.join(process.cwd(), 'vinos_lombardo_base.json');
  try {
    const raw = await fs.readFile(fallbackPath, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data)
      ? data.filter((wine) => wine && wine.activo !== false && parseNumericStock(wine.stock_actual, 1) > 0)
      : [];
  } catch (error) {
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

const detectIntent = (message) => {
  const normalized = normalizeText(message);

  const commercialPatterns = [
    /whatsapp|asesor|persona|humano|vendedor/,
    /(comprar|encargar|reservar|pagar|factura|envio|retiro)/,
    /(avanzar|cerrar|confirmar)/,
  ];
  if (containsKeyword(normalized, commercialPatterns)) return INTENTS.COMERCIAL;

  const monthlyPatterns = [/(club|mensualidad|suscrip|membresia|seleccion mensual)/];
  if (containsKeyword(normalized, monthlyPatterns)) return INTENTS.MENSUALIDAD;

  const boxPatterns = [/(armame|arma|armar|sugerime).*(caja|box|seleccion)/, /(quiero|dame).*(tres|3).*(vinos?)/];
  if (containsKeyword(normalized, boxPatterns)) return INTENTS.CAJA;

  const recommendationPatterns = [
    ...RECOMMENDATION_INTENT_PATTERNS,
    /(que|qué) vino me sugeris/,
    /(quiero|busco).*(vino|opciones?)/,
  ];
  if (containsKeyword(normalized, recommendationPatterns)) return INTENTS.RECOMENDACION;

  const educationalPatterns = [
    /maridar|maridaje/,
    /(que|qué) vino va con/,
    /(diferencia|diferencias).*(malbec|cabernet|varietal|vino)/,
    /(temperatura|servicio|decantar|copa|acidez|taninos|cuerpo)/,
    /(que|qué) significa.*(cuerpo|acidez|taninos)/,
    /varietal|estilo de vino/,
  ];

  if (containsKeyword(normalized, educationalPatterns)) return INTENTS.EDUCATIVA;

  return INTENTS.EDUCATIVA;
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

const selectRecommendedWines = ({ wines, message, intent }) => {
  const shouldRecommendCatalog = [INTENTS.RECOMENDACION, INTENTS.CAJA, INTENTS.MENSUALIDAD].includes(intent);
  if (!shouldRecommendCatalog) return [];

  const signals = buildRecommendationSignals(message);

  const ranked = wines
    .map((wine) => {
      let score = 0;
      score += matchFieldScore(wine.tipo_vino, signals.tipo_vino, 4);
      score += matchFieldScore(wine.maridaje_principal, signals.maridaje_principal, 5);
      score += matchFieldScore(wine.ocasion, signals.ocasion, 4);
      score += matchFieldScore(wine.varietal, signals.varietal, 3);
      score += matchFieldScore(buildStyleHints(wine).join(' '), signals.estilo, 3);

      if (wine.prioridad_venta === 'alta') score += 1;

      return { wine, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECOMMENDATIONS)
    .map((entry) => entry.wine);

  return ranked.filter(Boolean);
};

const shouldSuggestWhatsApp = ({ message, pageContext, intent }) => {
  if (intent === INTENTS.EDUCATIVA) return false;
  if (intent === INTENTS.COMERCIAL) return true;

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

const buildConversationText = ({ message, history }) => {
  const chunks = [sanitizeMessage(message), ...history.map((item) => sanitizeMessage(item.content))].filter(Boolean);
  return normalizeText(chunks.join(' | '));
};

const detectClosingType = ({ message, history, pageContext }) => {
  const conversationText = buildConversationText({ message, history });

  const whatsappPatterns = [
    /(avanzar|cerrar|confirmar|coordinar)/,
    /(hablar|asesor|persona|humano|equipo)/,
    /(whatsapp|contacto directo)/,
    /(evento|corporativo|privado|reserva)/,
  ];
  if (containsKeyword(conversationText, whatsappPatterns) || shouldSuggestWhatsApp({ message, pageContext })) {
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
      'Si querés, también te puedo orientar sobre qué estilos van mejor con distintas comidas o momentos.',
    [CLOSING_TYPES.LABELS]:
      'Si querés, también te puedo sugerir algunas etiquetas de Lombardo en esa línea.',
    [CLOSING_TYPES.BOX]: 'Si querés, también te puedo armar una caja de 3 vinos pensada para ese perfil.',
    [CLOSING_TYPES.SUBSCRIPTION]:
      'Si ese estilo es el que más disfrutás, también te puedo sugerir una mensualidad recomendada.',
  };

  return byType[closingType] || byType[CLOSING_TYPES.EDUCATIONAL];
};

const appendAdaptiveClosing = ({ answer, message, history, pageContext }) => {
  const trimmed = sanitizeMessage(answer);
  if (!trimmed) return { answer: '', closingType: CLOSING_TYPES.EDUCATIONAL };

  const closingType = detectClosingType({ message, history, pageContext });
  const suggestion = buildClosingSuggestion({ closingType, pageContext });

  if (!suggestion) return { answer: trimmed, closingType };

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

  return { answer: `${trimmed}

${suggestion}`, closingType };
};

const buildUserPrompt = ({ message, wines, pageContext, history, recommendedWines, intent }) => {
  const compactCatalog = wines.map((wine) => ({
    nombre: wine.nombre,
    precio: wine.precio,
    tipo_vino: wine.tipo_vino,
    varietal: wine.varietal,
    maridaje_principal: wine.maridaje_principal,
    ocasion: wine.ocasion,
    nivel_precio: wine.nivel_precio,
  }));

  const serializedHistory = history.length
    ? history.map((item) => `${item.role === 'assistant' ? 'Asistente' : 'Cliente'}: ${item.content}`).join('\n')
    : 'Sin historial previo en esta sesión.';

  return [
    buildPageContextGuidance(pageContext),
    '',
    `Mensaje actual del cliente: ${message}`,
    '',
    `Historial de conversación:\n${serializedHistory}`,
    '',
    'Usá el historial de conversación para mantener continuidad en preguntas de seguimiento.',
    'Si el último mensaje depende del contexto previo, asumí continuidad temática salvo que el cliente cambie de tema explícitamente.',
    `Intención detectada (detectIntent): ${intent}.`,
    'Reglas por intención: educativa => responder conocimiento general de vino y NO recomendar productos directo; opcional cerrar con “Si querés, también te puedo sugerir algunas opciones de Lombardo en esa línea.”.',
    `Reglas por intención: recomendacion => sugerir hasta ${MAX_RECOMMENDATIONS} vinos reales de la base Lombardo.`,
    'Reglas por intención: caja => proponer exactamente 3 vinos con lógica: opción segura, opción más especial, opción para descubrir.',
    'Reglas por intención: mensualidad => explicar lógica de club/selección mensual y sugerir selección mensual.',
    'Reglas por intención: comercial => priorizar cierre y derivar naturalmente a WhatsApp.',
    'Definí internamente si esta consulta cae en modo conocimiento general, modo catálogo Lombardo o modo mixto, y respondé en consecuencia.',
    'Si es modo mixto, explicá primero la lógica general y luego ofrecé o sugerí opciones de Lombardo alineadas.',
    'Terminá con un cierre breve y útil según intención: educativo, etiquetas, caja ideal, mensualidad o WhatsApp.',
    '',
    `Base de vinos Lombardo (JSON): ${JSON.stringify(compactCatalog)}`,
    '',
    [INTENTS.RECOMENDACION, INTENTS.CAJA, INTENTS.MENSUALIDAD].includes(intent)
      ? `Preselección sugerida para esta consulta (máximo ${MAX_RECOMMENDATIONS}): ${JSON.stringify(
          recommendedWines
        )}`
      : 'No hay preselección forzada para esta consulta.',
    '',
    [INTENTS.RECOMENDACION, INTENTS.CAJA, INTENTS.MENSUALIDAD].includes(intent)
      ? 'Cuando haya intención de recomendación, usá la preselección como base principal y no inventes etiquetas.'
      : 'Si recomendás vinos de todos modos, usá solo etiquetas reales del catálogo.',
    '',
    `Si hacés recomendaciones, máximo ${MAX_RECOMMENDATIONS} opciones.`,
  ].join('\n');
};

const createOpenAIResponse = async ({ message, wines, pageContext, history, recommendedWines, intent }) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const configError = new Error('OPENAI_API_KEY no está configurada en el entorno.');
    configError.code = 'OPENAI_CONFIG_ERROR';
    throw configError;
  }

  let response;
  try {
    console.log('[sommelier-chat][debug] llamando OpenAI', { model: OPENAI_MODEL, endpoint: OPENAI_URL });
    response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: buildUserPrompt({ message, wines, pageContext, history, recommendedWines, intent }),
          },
        ],
        max_output_tokens: 350,
        temperature: 0.4,
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
    INTERNAL_SERVER_ERROR: 500,
  };

  const publicMessageMap = {
    WINE_CATALOG_NOT_FOUND: 'No pudimos cargar la base de vinos en este momento.',
    WINE_CATALOG_PARSE_ERROR: 'No pudimos leer la base de vinos en este momento.',
    OPENAI_NETWORK_ERROR: 'Se perdió la conexión con el servicio de IA.',
    OPENAI_CONFIG_ERROR: 'La configuración del servicio de IA está incompleta en el servidor.',
    OPENAI_HTTP_ERROR: 'El servicio de IA devolvió un error.',
    OPENAI_PARSE_ERROR: 'No pudimos interpretar la respuesta del servicio de IA.',
    INTERNAL_SERVER_ERROR: 'No pudimos generar la recomendación en este momento.',
  };

  return {
    status: statusMap[code] || 500,
    payload: {
      error: publicMessageMap[code] || publicMessageMap.INTERNAL_SERVER_ERROR,
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

const buildFallbackRecommendationAnswer = ({ message, wines, recommendedWines, pageContext, intent }) => {
  if (intent === INTENTS.EDUCATIVA) {
    return [
      '¡Muy buena pregunta! En esta consulta conviene enfocarnos primero en la lógica general del vino antes de bajar a etiquetas concretas.',
      'Si querés, también te puedo sugerir algunas opciones de Lombardo en esa línea.',
    ].join(' ');
  }

  if (intent === INTENTS.MENSUALIDAD) {
    const selection = wines.slice(0, MAX_RECOMMENDATIONS).map((wine) => wine.nombre).filter(Boolean);
    return [
      '¡Excelente! La lógica de mensualidad/club suele combinar variedad, equilibrio de estilos y una etiqueta sorpresa para descubrir algo nuevo.',
      selection.length
        ? `Una selección mensual sugerida podría ser: ${selection.join(', ')}.`
        : 'Si querés, te propongo una selección mensual personalizada según tus gustos.',
    ].join(' ');
  }

  if (intent === INTENTS.CAJA) {
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
      '¡Genial! Te propongo una caja de 3 vinos con esta lógica:',
      pick('Opción segura', segura),
      pick('Opción más especial', especial),
      pick('Opción para descubrir', descubrir),
    ].join('\n');
  }

  if (intent === INTENTS.COMERCIAL) {
    return '¡Perfecto! Te ayudo a avanzar con eso. Si querés, seguimos por WhatsApp y lo cerramos rápido.';
  }

  const options = (recommendedWines.length ? recommendedWines : wines.slice(0, MAX_RECOMMENDATIONS)).slice(
    0,
    MAX_RECOMMENDATIONS
  );

  if (!options.length) {
    return [
      '¡Gracias por tu consulta! En este momento no pude cargar recomendaciones específicas.',
      'Si querés, contame ocasión, presupuesto aproximado y estilo de vino para ayudarte mejor.',
    ].join(' ');
  }

  const introByContext = {
    club: '¡Buenísimo! Para el club, te propongo esta selección inicial:',
    sommelier: '¡Genial! Con lo que me contaste, te recomiendo estas opciones:',
    experiencias: '¡Excelente! Dentro de experiencias, te recomiendo estas opciones de Lombardo:',
  };

  const intro = introByContext[pageContext] || '¡Perfecto! Acá van algunas opciones que te pueden encajar:';

  const listed = options
    .map((wine) => {
      const parts = [wine.nombre, wine.varietal, wine.tipo_vino, wine.precio]
        .map((part) => sanitizeMessage(String(part || '')))
        .filter(Boolean);
      return `• ${parts.join(' · ')}`;
    })
    .join('\n');

  const closing = hasRecommendationIntent(message)
    ? 'Si querés, te ajusto la selección por comida, ocasión o presupuesto.'
    : 'Si me compartís la ocasión o comida principal, te afino la recomendación.';

  return [intro, listed, closing].join('\n');
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[sommelier-chat][debug] request recibido', {
      method: req.method,
      contentType: req.headers?.['content-type'] || '',
      hasBody: Boolean(req.body),
    });

    const message = sanitizeMessage(req.body?.message);
    const pageContext = sanitizePageContext(req.body?.pagina_actual);
    const history = sanitizeHistory(req.body?.history);
    const intent = detectIntent(message);

    console.log('[sommelier-chat][debug] payload recibido', {
      messageLength: message.length,
      pageContext,
      historyItems: history.length,
      intent,
    });

    if (!message) {
      return res.status(400).json({ error: 'El campo "message" es obligatorio.' });
    }

    const wines = await readWineCatalog();
    console.log('[sommelier-chat][debug] catálogo cargado', { wines: wines.length });

    const recommendedWines = selectRecommendedWines({ wines, message, intent });
    console.log('[sommelier-chat][debug] preselección', { recommended: recommendedWines.length });
    const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
    console.log('[sommelier-chat][debug] OpenAI key disponible:', hasOpenAIKey);

    const rawAnswer = hasOpenAIKey
      ? await createOpenAIResponse({
          message,
          wines,
          pageContext,
          history,
          recommendedWines,
          intent,
        })
      : buildFallbackRecommendationAnswer({
          message,
          wines,
          recommendedWines,
          pageContext,
          intent,
        });

    if (!rawAnswer) {
      return res.status(502).json({ error: 'No se obtuvo respuesta del modelo.' });
    }

    console.log('[sommelier-chat][debug] respuesta generada', {
      answerLength: rawAnswer.length,
      via: hasOpenAIKey ? 'openai' : 'fallback-local',
    });

    const { answer, closingType } = appendAdaptiveClosing({
      answer: rawAnswer,
      message,
      history,
      pageContext,
    });
    const suggestWhatsApp = closingType === CLOSING_TYPES.WHATSAPP;
    const canonicalResponse = {
      reply: answer,
      suggestions: suggestWhatsApp ? [buildWhatsAppSuggestion(pageContext)] : [],
      whatsappUrl: suggestWhatsApp ? buildWhatsAppUrl(message) : '',
      fallback: {
        used: !hasOpenAIKey,
        mode: hasOpenAIKey ? 'openai' : 'local',
      },
    };

    await recordInteraction({
      mensaje_usuario: message,
      pagina_actual: pageContext,
      intencion_detectada: intent,
      perfil_detectado: inferProfile(message),
      categoria_consulta: intentToCategory(intent),
      productos_sugeridos: recommendedWines.map((wine) => wine.nombre).filter(Boolean),
      tipo_cierre: closingType,
      derivo_whatsapp: suggestWhatsApp,
    });

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
    console.error(`[sommelier-chat][${payload.error_code}]`, error);
    return res.status(status).json(payload);
  }
};

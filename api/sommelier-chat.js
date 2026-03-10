const fs = require('node:fs/promises');
const path = require('node:path');

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_RECOMMENDATIONS = 3;
const MAX_HISTORY_ITEMS = 8;
const WHATSAPP_PHONE = '543412762319';
const WHATSAPP_BASE_MESSAGE = 'Hola Lombardo, quiero continuar esta consulta.';

const PAGE_CONTEXT_ROLES = {
  home: {
    rol: 'Anfitrión general de Lombardo',
    foco: 'Orientar al cliente, explicar qué ofrece la marca y sugerir próximos pasos claros.',
  },
  vinos: {
    rol: 'Asesor de vinos',
    foco: 'Priorizar recomendaciones, maridajes, perfiles y selección de etiquetas reales.',
  },
  sommelier: {
    rol: 'Asistente del recomendador',
    foco: 'Profundizar recomendaciones, refinar gustos y sugerir caja/mensualidad cuando aplique.',
  },
  club: {
    rol: 'Asesor del Club Lombardo',
    foco: 'Explicar mensualidades, lógica de selecciones, beneficios y encuadre del club.',
  },
  cafe: {
    rol: 'Anfitrión del café',
    foco: 'Responder sobre propuesta de cafetería, desayunos, meriendas y experiencia general.',
  },
  experiencias: {
    rol: 'Curador de experiencias',
    foco: 'Guiar sobre propuestas diferenciales, regalos, catas y momentos especiales.',
  },
  eventos: {
    rol: 'Asesor comercial inicial',
    foco: 'Orientar sobre eventos/encuentros y derivar a WhatsApp cuando haga falta confirmar.',
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

const SYSTEM_PROMPT = [
  'Actuá como Asistente IA Lombardo.',
  'Ajustá tu enfoque según la página actual del sitio.',
  'Sos el asistente digital de una vinería boutique con propuesta de vinos, café, regalos, experiencias y club.',
  'Respondé con tono cálido, claro, premium y útil en español rioplatense.',
  'Primero ayudá dentro del chat y no empujes a WhatsApp demasiado rápido.',
  'Sugerí WhatsApp solo cuando tenga sentido comercial o de cierre, de forma opcional y natural.',
  'Si la consulta es sobre vinos, usá la base real disponible y no inventes etiquetas, precios ni stock.',
  'Si la consulta es general, respondé como anfitrión/comercial de la marca sin prometer condiciones no confirmadas.',
  `Si recomendás vinos, mencioná hasta ${MAX_RECOMMENDATIONS} opciones y explicá brevemente por qué podrían encajar.`,
  'Si la consulta depende de información no confirmada, aclaralo y sugerí consulta por WhatsApp.',
  'Podés responder consultas sobre vinos y maridajes, regalos y cajas, mensualidades/club, experiencias y eventos, cafetería y dudas generales de Lombardo.',
].join('\n');

const readWineCatalog = async () => {
  const filePath = path.join(process.cwd(), 'vinos_lombardo_base.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data.filter((wine) => wine && wine.activo !== false) : [];
};

const sanitizeMessage = (value) => (typeof value === 'string' ? value.trim() : '');

const sanitizePageContext = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) return 'general';
  return PAGE_CONTEXT_ROLES[normalized] ? normalized : 'general';
};

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

const shouldSuggestWhatsApp = ({ message, pageContext }) => {
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

  return ['eventos', 'contacto', 'club'].includes(pageContext) && normalized.length > 40;
};

const buildWhatsAppSuggestion = (pageContext) => {
  const byContext = {
    vinos: 'Si querés, también podés consultarlo directo por WhatsApp y te ayudamos a seguir con la elección.',
    sommelier: 'Si querés avanzar con esta selección, te dejamos el acceso directo a WhatsApp.',
    club: 'Para una consulta más puntual del club, también podemos seguir por WhatsApp.',
    eventos: 'Si querés avanzar con la propuesta del evento, podemos seguir por WhatsApp.',
    contacto: 'Si preferís, también podemos seguir esta consulta por WhatsApp.',
  };

  return byContext[pageContext] || 'Para una consulta más puntual, también podemos seguir por WhatsApp.';
};

const buildWhatsAppUrl = (message) => {
  const safeMessage = sanitizeMessage(message) || WHATSAPP_BASE_MESSAGE;
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(safeMessage)}`;
};

const buildUserPrompt = ({ message, wines, pageContext, history }) => {
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
    `Historial reciente:\n${serializedHistory}`,
    '',
    `Pregunta del cliente: "${message}"`,
    '',
    `Base de vinos Lombardo (JSON): ${JSON.stringify(compactCatalog)}`,
    '',
    `Si hacés recomendaciones, máximo ${MAX_RECOMMENDATIONS} opciones.`,
  ].join('\n');
};

const createOpenAIResponse = async ({ message, wines, pageContext, history }) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY no está configurada en el entorno.');
  }

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt({ message, wines, pageContext, history }) },
      ],
      max_output_tokens: 350,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI error (${response.status}): ${details}`);
  }

  const data = await response.json();
  return (data.output_text || '').trim();
};

const appendWhatsAppSuggestion = ({ answer, pageContext }) => {
  const trimmed = sanitizeMessage(answer);
  if (!trimmed) return '';

  if (/whatsapp/i.test(trimmed)) return trimmed;

  return `${trimmed}\n\n${buildWhatsAppSuggestion(pageContext)}`;
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const message = sanitizeMessage(req.body?.message);
    const pageContext = sanitizePageContext(req.body?.pagina_actual);
    const history = sanitizeHistory(req.body?.history);

    if (!message) {
      return res.status(400).json({ error: 'El campo "message" es obligatorio.' });
    }

    const wines = await readWineCatalog();
    const rawAnswer = await createOpenAIResponse({ message, wines, pageContext, history });

    if (!rawAnswer) {
      return res.status(502).json({ error: 'No se obtuvo respuesta del modelo.' });
    }

    const suggestWhatsApp = shouldSuggestWhatsApp({ message, pageContext });
    const answer = suggestWhatsApp
      ? appendWhatsAppSuggestion({ answer: rawAnswer, pageContext })
      : rawAnswer;

    return res.status(200).json({
      answer,
      suggest_whatsapp: suggestWhatsApp,
      whatsapp_label: suggestWhatsApp ? 'Seguir por WhatsApp' : '',
      whatsapp_url: suggestWhatsApp ? buildWhatsAppUrl(message) : '',
    });
  } catch (error) {
    console.error('Error en /api/sommelier-chat:', error);
    return res.status(500).json({ error: 'No pudimos generar la recomendación en este momento.' });
  }
};

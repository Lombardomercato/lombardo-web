const fs = require('node:fs/promises');
const path = require('node:path');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const WHATSAPP_URL =
  process.env.WHATSAPP_URL ||
  'https://wa.me/543412762319?text=Hola%20Lombardo%2C%20quiero%20asesoramiento%20personalizado%20de%20vinos.';

let catalogCache = null;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

const sendJson = (res, status, payload) => {
  res.status(status).setHeader('Content-Type', CORS_HEADERS['Content-Type']);
  Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(payload));
};

const normalizeRole = (role) => {
  if (role === 'assistant' || role === 'user' || role === 'system') return role;
  return 'user';
};

const sanitizeHistory = (history) => {
  if (!Array.isArray(history)) return [];
  return history
    .map((item) => ({
      role: normalizeRole(item?.role),
      content: typeof item?.content === 'string' ? item.content.trim().slice(0, 500) : '',
    }))
    .filter((item) => item.content)
    .slice(-14);
};

const normalizeText = (value) =>
  (typeof value === 'string' ? value : '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const containsKeyword = (text, patterns) => patterns.some((pattern) => pattern.test(text));

const CLOSING_TYPES = {
  EDUCATIONAL: 'educational',
  LABELS: 'labels',
  BOX: 'box',
  SUBSCRIPTION: 'subscription',
  WHATSAPP: 'whatsapp',
};

const detectClosingType = ({ message, history, paginaActual }) => {
  const conversationText = normalizeText(
    [message, ...history.map((item) => item.content), paginaActual].filter(Boolean).join(' | ')
  );

  const whatsappPatterns = [
    /(avanzar|cerrar|confirmar|coordinar)/,
    /(whatsapp|hablar con|asesor|humano|equipo)/,
    /(evento|corporativo|privado|reserva)/,
  ];
  if (containsKeyword(conversationText, whatsappPatterns)) return CLOSING_TYPES.WHATSAPP;

  if (containsKeyword(conversationText, [/(mensualidad|suscrip|membres|club)/, /(cada mes|todos los meses|recurrente)/])) {
    return CLOSING_TYPES.SUBSCRIPTION;
  }

  if (containsKeyword(conversationText, [/(caja|box)/, /(comprar|llevar|encargar|regalo)/])) {
    return CLOSING_TYPES.BOX;
  }

  if (containsKeyword(conversationText, [/(recomend|suger)/, /(que vino|vino para|maridaje|etiqueta)/])) {
    return CLOSING_TYPES.LABELS;
  }

  return CLOSING_TYPES.EDUCATIONAL;
};

const buildClosingMessage = (closingType) => {
  const map = {
    [CLOSING_TYPES.EDUCATIONAL]:
      'Si querés, también te puedo orientar sobre qué estilos van mejor con distintas comidas o momentos.',
    [CLOSING_TYPES.LABELS]:
      'Si querés, también te puedo sugerir algunas etiquetas de Lombardo en esa línea.',
    [CLOSING_TYPES.BOX]: 'Si querés, también te puedo armar una caja de 3 vinos pensada para ese perfil.',
    [CLOSING_TYPES.SUBSCRIPTION]:
      'Si ese estilo es el que más disfrutás, también te puedo sugerir una mensualidad recomendada.',
    [CLOSING_TYPES.WHATSAPP]:
      'Si querés avanzar con esto o ajustarlo con alguien del equipo, también podés seguir por WhatsApp.',
  };

  return map[closingType] || map[CLOSING_TYPES.EDUCATIONAL];
};

const appendAdaptiveClosing = ({ answer, message, history, paginaActual }) => {
  const trimmed = typeof answer === 'string' ? answer.trim() : '';
  if (!trimmed) return { answer: '', closingType: CLOSING_TYPES.EDUCATIONAL };

  const closingType = detectClosingType({ message, history, paginaActual });
  const closingMessage = buildClosingMessage(closingType);
  const normalizedAnswer = normalizeText(trimmed);

  const alreadySuggested = {
    [CLOSING_TYPES.WHATSAPP]: /whatsapp/,
    [CLOSING_TYPES.SUBSCRIPTION]: /(mensualidad|club|suscrip)/,
    [CLOSING_TYPES.BOX]: /(caja|box)/,
    [CLOSING_TYPES.LABELS]: /(etiquetas?|opciones? de lombardo)/,
    [CLOSING_TYPES.EDUCATIONAL]: /(estilos?|comidas?|momentos?)/,
  }[closingType].test(normalizedAnswer);

  return {
    answer: alreadySuggested ? trimmed : `${trimmed}

${closingMessage}`,
    closingType,
  };
};

const loadWineCatalog = async () => {
  if (Array.isArray(catalogCache)) return catalogCache;

  const catalogPath = path.join(process.cwd(), 'vinos_lombardo_base.json');
  const raw = await fs.readFile(catalogPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error('Formato de catálogo inválido.');
  }

  catalogCache = parsed.filter((wine) => wine && wine.activo !== false);
  return catalogCache;
};

const formatCatalogContext = (wines) =>
  wines
    .slice(0, 30)
    .map((wine) => {
      const parts = [
        wine.nombre,
        wine.varietal,
        wine.tipo_vino,
        wine.maridaje_principal,
        wine.ocasion,
        typeof wine.precio === 'number' ? `$${wine.precio}` : null,
        wine.nivel_precio ? `nivel:${wine.nivel_precio}` : null,
      ].filter(Boolean);
      return `- ${parts.join(' | ')}`;
    })
    .join('\n');

const buildSystemPrompt = ({ paginaActual, catalogContext }) => `
Sos el Asistente IA Lombardo de una marca premium de café y vinos.

Tono y estilo:
- cálido, claro, útil, premium y cercano.
- respuestas en español rioplatense.
- evitá sonar robótico, enciclopédico o pedante.

Alcance:
- combiná 3 modos: conocimiento general, catálogo Lombardo y modo mixto.
- conocimiento general: respondé dudas generales sobre vino, maridajes y cultura vínica con lenguaje simple y confiable.
- catálogo Lombardo: cuando pidan recomendaciones concretas, etiquetas, cajas, club o disponibilidad de Lombardo, usá solo la base real.
- modo mixto: explicá primero la lógica general y luego ofrecé bajar esa recomendación a opciones de Lombardo cuando tenga sentido.
- página actual del usuario: ${paginaActual || 'sin contexto'}.

Reglas críticas:
- Si recomendás etiquetas concretas de Lombardo, apoyate SOLO en esta base local (no inventes etiquetas, precios, ni stock).
- Para consultas generales, podés responder con conocimiento vínico general sin limitarte al catálogo.
- Si faltan datos, decilo con honestidad.
- Si tiene sentido comercial, sugerí continuar por WhatsApp de forma natural.
- Mantené respuestas concretas (ideal 4 a 10 líneas).
- Cerrá cada respuesta con un siguiente paso útil y natural según intención (educativo, etiquetas, caja, mensualidad o WhatsApp).

Temas generales habilitados:
- maridajes, varietales, estilos de vino, diferencias entre tintos/blancos/rosados/espumantes.
- temperatura de servicio, copas, ocasiones de consumo, regalos, vinos para principiantes.
- lógica de cuerpo, acidez, dulzor, frescura y estructura.

Base de vinos Lombardo:
${catalogContext}
`.trim();

const callOpenAI = async ({ message, history, systemPrompt }) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error('Falta OPENAI_API_KEY');
    error.code = 'OPENAI_CONFIG_ERROR';
    throw error;
  }

  const payload = {
    model: OPENAI_MODEL,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message },
    ],
  };

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    const parseError = new Error('Respuesta inválida de OpenAI');
    parseError.code = 'OPENAI_PARSE_ERROR';
    throw parseError;
  }

  if (!response.ok) {
    const apiError = new Error(data?.error?.message || 'Error HTTP de OpenAI');
    apiError.code = 'OPENAI_HTTP_ERROR';
    apiError.status = response.status;
    throw apiError;
  }

  const answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) {
    const emptyError = new Error('OpenAI devolvió respuesta vacía');
    emptyError.code = 'OPENAI_EMPTY_RESPONSE';
    throw emptyError;
  }

  return answer.trim();
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value));
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, {
      ok: false,
      error: 'Method Not Allowed',
      error_code: 'METHOD_NOT_ALLOWED',
    });
    return;
  }

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const history = sanitizeHistory(body.history);
    const paginaActual = typeof body.pagina_actual === 'string' ? body.pagina_actual.trim() : '';

    if (!message) {
      sendJson(res, 400, {
        ok: false,
        error: 'El campo message es obligatorio.',
        error_code: 'INVALID_MESSAGE',
      });
      return;
    }

    const wines = await loadWineCatalog();
    const catalogContext = formatCatalogContext(wines);
    const systemPrompt = buildSystemPrompt({ paginaActual, catalogContext });

    const rawAnswer = await callOpenAI({ message, history, systemPrompt });
    const { answer, closingType } = appendAdaptiveClosing({
      answer: rawAnswer,
      message,
      history,
      paginaActual,
    });

    sendJson(res, 200, {
      ok: true,
      answer,
      suggest_whatsapp: closingType === CLOSING_TYPES.WHATSAPP,
      whatsapp_label: 'Continuar por WhatsApp',
      whatsapp_url: closingType === CLOSING_TYPES.WHATSAPP ? WHATSAPP_URL : '',
      source: 'openai',
    });
  } catch (error) {
    console.error('[sommelier-chat] error:', {
      message: error?.message,
      code: error?.code,
      status: error?.status,
    });

    const status = error?.code === 'OPENAI_CONFIG_ERROR' ? 500 : 502;
    sendJson(res, status, {
      ok: false,
      error: 'No se pudo generar la respuesta del asistente en este momento.',
      error_code: error?.code || 'SOMMELIER_CHAT_ERROR',
    });
  }
};

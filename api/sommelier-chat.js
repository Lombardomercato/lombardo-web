const fs = require('node:fs/promises');
const path = require('node:path');

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_RECOMMENDATIONS = 3;
const MAX_HISTORY_ITEMS = 8;

const SYSTEM_PROMPT = [
  'Actuá como Asistente IA Lombardo.',
  'Sos el asistente digital de una vinería boutique con propuesta de vinos, café, regalos, experiencias y club.',
  'Respondé con tono cálido, claro, premium y útil en español rioplatense.',
  'Si la consulta es sobre vinos, usá la base real disponible y no inventes etiquetas, precios ni stock.',
  'Si la consulta es general, respondé como anfitrión/comercial de la marca sin prometer condiciones no confirmadas.',
  `Si recomendás vinos, mencioná hasta ${MAX_RECOMMENDATIONS} opciones y explicá brevemente por qué podrían encajar.`,
  'Si algo depende de disponibilidad o confirmación humana, aclaralo y ofrecé derivar a WhatsApp.',
  'Cuando tenga sentido, podés usar esta salida: "Si querés, podés consultarlo directo por WhatsApp."',
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
  return normalized || 'general';
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
    `Página actual: ${pageContext}`,
    'Usá este contexto para priorizar la respuesta (por ejemplo: club, vinos, café, experiencias/eventos, etc.).',
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
    const answer = await createOpenAIResponse({ message, wines, pageContext, history });

    if (!answer) {
      return res.status(502).json({ error: 'No se obtuvo respuesta del modelo.' });
    }

    return res.status(200).json({ answer });
  } catch (error) {
    console.error('Error en /api/sommelier-chat:', error);
    return res.status(500).json({ error: 'No pudimos generar la recomendación en este momento.' });
  }
};

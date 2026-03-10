const fs = require('node:fs/promises');
const path = require('node:path');

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_RECOMMENDATIONS = 3;

const SYSTEM_PROMPT = [
  'Actuá como Sommelier IA de Lombardo, una vinería boutique.',
  'Respondé en español rioplatense de forma breve, clara y útil.',
  'Tono: cercano, premium, cálido y confiable. Evitá lenguaje técnico complejo.',
  'Usá solamente la base de vinos proporcionada.',
  'No inventes vinos, precios ni disponibilidad.',
  'Si recomendás opciones, mencioná hasta 3 vinos y explicá brevemente por qué podrían encajar.',
  'Si no hay coincidencia clara, brindá orientación general e invitá a reformular.',
].join('\n');

const readWineCatalog = async () => {
  const filePath = path.join(process.cwd(), 'vinos_lombardo_base.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data.filter((wine) => wine && wine.activo !== false) : [];
};

const sanitizeMessage = (value) => (typeof value === 'string' ? value.trim() : '');

const buildUserPrompt = (message, wines) => {
  const compactCatalog = wines.map((wine) => ({
    nombre: wine.nombre,
    precio: wine.precio,
    tipo_vino: wine.tipo_vino,
    varietal: wine.varietal,
    maridaje_principal: wine.maridaje_principal,
    ocasion: wine.ocasion,
    nivel_precio: wine.nivel_precio,
  }));

  return [
    `Pregunta del cliente: "${message}"`,
    '',
    `Base de vinos Lombardo (JSON): ${JSON.stringify(compactCatalog)}`,
    '',
    `Si hacés recomendaciones, máximo ${MAX_RECOMMENDATIONS} opciones.`,
  ].join('\n');
};

const createOpenAIResponse = async ({ message, wines }) => {
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
        { role: 'user', content: buildUserPrompt(message, wines) },
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

    if (!message) {
      return res.status(400).json({ error: 'El campo "message" es obligatorio.' });
    }

    const wines = await readWineCatalog();
    const answer = await createOpenAIResponse({ message, wines });

    if (!answer) {
      return res.status(502).json({ error: 'No se obtuvo respuesta del modelo.' });
    }

    return res.status(200).json({ answer });
  } catch (error) {
    console.error('Error en /api/sommelier-chat:', error);
    return res.status(500).json({ error: 'No pudimos generar la recomendación en este momento.' });
  }
};

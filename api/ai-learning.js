const fs = require('node:fs/promises');
const path = require('node:path');

const CONSULT_CATEGORIES = [
  'maridaje',
  'recomendacion_producto',
  'regalo',
  'caja',
  'mensualidad',
  'club',
  'varietales',
  'temperatura_servicio',
  'experiencias',
  'cafe',
  'evento',
  'contacto',
];

const CLOSING_TYPE_LABELS = {
  educational: 'educativo',
  labels: 'etiquetas',
  box: 'caja',
  subscription: 'mensualidad',
  whatsapp: 'whatsapp',
};

const CATEGORY_PATTERNS = {
  maridaje: [/(maridaje|maridar|va con|acompanar|acompañar|comida)/],
  recomendacion_producto: [/(recomenda|recomendar|suger|que vino|qué vino|opciones?|etiquetas?)/],
  regalo: [/(regalo|regalar|obsequio)/],
  caja: [/(caja|box|seleccion de 3|selección de 3|armar una caja)/],
  mensualidad: [/(mensualidad|suscrip|suscripción|cada mes|mensual)/],
  club: [/(club|membresia|membresía|socios)/],
  varietales: [/(varietal|malbec|cabernet|pinot|syrah|blend|torrontes|chardonnay)/],
  temperatura_servicio: [/(temperatura|servicio|servir|decantar|copa)/],
  experiencias: [/(experiencia|cata|degustacion|degustación|momento especial)/],
  cafe: [/(cafe|caf[eé]|desayuno|merienda)/],
  evento: [/(evento|corporativo|cumple|casamiento|reserva|privado)/],
  contacto: [/(contacto|telefono|tel[eé]fono|mail|email|whatsapp)/],
};

const PROFILE_PATTERNS = [
  { profile: 'Regalo / Ocasión Especial', patterns: [/(regalo|regalar|especial|aniversario|cumple)/] },
  { profile: 'Explorador de Varietales', patterns: [/(varietal|malbec|cabernet|blend|pinot|torrontes)/] },
  { profile: 'Foodie / Maridaje', patterns: [/(maridaje|asado|carne|pasta|queso|sushi|comida)/] },
  { profile: 'Interesado en Caja', patterns: [/(caja|box|armame|seleccion de 3)/] },
  { profile: 'Interesado en Club/Mensualidad', patterns: [/(club|mensualidad|suscrip|cada mes|membres)/] },
  { profile: 'Café y Experiencias', patterns: [/(cafe|caf[eé]|experiencia|cata|evento)/] },
];

const normalizeText = (value) =>
  (typeof value === 'string' ? value.trim() : '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const countBy = (items, pickKey) =>
  items.reduce((acc, item) => {
    const key = pickKey(item);
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

const topEntries = (counter, limit = 5) =>
  Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));

const detectConsultCategory = ({ message, intent, pageContext }) => {
  const normalized = normalizeText(message);

  if (intent === 'mensualidad') return 'mensualidad';
  if (intent === 'caja') return 'caja';

  const fromPatterns = Object.entries(CATEGORY_PATTERNS).find(([, patterns]) =>
    patterns.some((pattern) => pattern.test(normalized))
  );
  if (fromPatterns) return fromPatterns[0];

  if (pageContext === 'club') return 'club';
  if (pageContext === 'cafe') return 'cafe';
  if (pageContext === 'eventos') return 'evento';
  if (pageContext === 'contacto') return 'contacto';

  return 'recomendacion_producto';
};

const detectProfile = ({ message, category }) => {
  const normalized = normalizeText(message);

  const fromPatterns = PROFILE_PATTERNS.find(({ patterns }) => patterns.some((pattern) => pattern.test(normalized)));
  if (fromPatterns) return fromPatterns.profile;

  const fallbackByCategory = {
    maridaje: 'Foodie / Maridaje',
    regalo: 'Regalo / Ocasión Especial',
    caja: 'Interesado en Caja',
    mensualidad: 'Interesado en Club/Mensualidad',
    club: 'Interesado en Club/Mensualidad',
    cafe: 'Café y Experiencias',
    experiencias: 'Café y Experiencias',
    evento: 'Cliente Eventos',
  };

  return fallbackByCategory[category] || 'Consulta General';
};

const resolveInteractionsFile = () =>
  process.env.AI_INTERACTIONS_FILE || path.join(process.cwd(), 'data', 'ai-interactions.jsonl');

const buildInteractionRecord = ({
  message,
  pageContext,
  intent,
  profile,
  category,
  suggestedProducts,
  closingType,
  derivoWhatsapp,
}) => ({
  fecha: new Date().toISOString().slice(0, 10),
  mensaje_usuario: message,
  pagina_actual: pageContext,
  intencion_detectada: intent,
  perfil_detectado: profile,
  categoria_consulta: category,
  productos_sugeridos: suggestedProducts,
  tipo_cierre: CLOSING_TYPE_LABELS[closingType] || closingType,
  derivo_whatsapp: Boolean(derivoWhatsapp),
});

const logInteractionRecord = async (record) => {
  const target = resolveInteractionsFile();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(record)}\n`, 'utf8');
};

const parseJsonlRecords = async (filePath = resolveInteractionsFile()) => {
  const raw = await fs.readFile(filePath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });

  if (!raw.trim()) return [];

  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

const analyzeInteractionPatterns = (records) => {
  const whatsappByCategory = records
    .filter((record) => record.derivo_whatsapp)
    .reduce((acc, record) => {
      const key = record.categoria_consulta || 'sin_categoria';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

  return {
    total_interacciones: records.length,
    top_preguntas: topEntries(countBy(records, (record) => record.mensaje_usuario), 7),
    top_perfiles: topEntries(countBy(records, (record) => record.perfil_detectado)),
    top_categorias: topEntries(countBy(records, (record) => record.categoria_consulta)),
    vinos_mas_sugeridos: topEntries(
      records.flatMap((record) => (Array.isArray(record.productos_sugeridos) ? record.productos_sugeridos : []))
        .reduce((acc, name) => {
          if (!name) return acc;
          acc[name] = (acc[name] || 0) + 1;
          return acc;
        }, {})
    ),
    tipos_cierre: topEntries(countBy(records, (record) => record.tipo_cierre)),
    temas_derivados_whatsapp: topEntries(whatsappByCategory),
  };
};

const deriveOpportunities = (patterns) => {
  const opportunities = [];

  if (patterns.top_categorias[0]) {
    opportunities.push(`Reforzar respuestas de “${patterns.top_categorias[0].key}”, que concentra más consultas.`);
  }

  if (patterns.temas_derivados_whatsapp[0]) {
    opportunities.push(
      `Optimizar cierre en “${patterns.temas_derivados_whatsapp[0].key}” para derivar menos y resolver más en chat.`
    );
  }

  if (patterns.vinos_mas_sugeridos[0]) {
    opportunities.push(`Destacar stock y disponibilidad de “${patterns.vinos_mas_sugeridos[0].key}” en campañas.`);
  }

  return opportunities;
};

const deriveWeakTopics = (patterns) => {
  const weak = patterns.temas_derivados_whatsapp
    .filter((topic) => topic.count >= 2)
    .map((topic) => `Tema “${topic.key}” deriva seguido a WhatsApp (señal de respuesta mejorable).`);

  return weak.length ? weak : ['Sin señales fuertes todavía. Recolectar más interacciones.'];
};

const buildLombardoLearningSummary = (records) => {
  const patterns = analyzeInteractionPatterns(records);
  const opportunities = deriveOpportunities(patterns);
  const weakTopics = deriveWeakTopics(patterns);

  return {
    titulo: 'Resumen IA Lombardo',
    generado_en: new Date().toISOString(),
    top_preguntas_clientes: patterns.top_preguntas,
    top_perfiles_detectados: patterns.top_perfiles,
    top_categorias_consulta: patterns.top_categorias,
    vinos_mas_sugeridos: patterns.vinos_mas_sugeridos,
    oportunidades_detectadas: opportunities,
    temas_flojos_asistente: weakTopics,
    patrones: patterns,
    preparado_para: {
      ajustar_recomendaciones: true,
      mejorar_scoring_perfil: true,
      mejorar_cajas_ideales: true,
      mejorar_mensualidades: true,
      mejorar_prompt_asistente: true,
      ajustar_cierres_derivaciones: true,
    },
  };
};

module.exports = {
  CONSULT_CATEGORIES,
  detectConsultCategory,
  detectProfile,
  buildInteractionRecord,
  logInteractionRecord,
  parseJsonlRecords,
  analyzeInteractionPatterns,
  buildLombardoLearningSummary,
};

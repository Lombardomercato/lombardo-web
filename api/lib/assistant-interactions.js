const fs = require('node:fs/promises');
const path = require('node:path');

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'assistant-interactions.json');
const MAX_STORED_INTERACTIONS = 5000;

const normalizeText = (value) =>
  typeof value === 'string'
    ? value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
    : '';

const inferProfile = (message = '') => {
  const text = normalizeText(message);

  if (/(regalo|cumple|aniversario|obsequio)/.test(text)) return 'Regalo';
  if (/(premium|alta gama|icono|iconico|gran reserva)/.test(text)) return 'Premium';
  if (/(suave|ligero|facil|dulce|frutado)/.test(text)) return 'Amante de vinos suaves';
  if (/(maridaje|comida|cena|asado|menu|menu degustacion)/.test(text)) return 'Gastronomico';
  if (/(nuevo|probar|distinto|explorar|descubrir)/.test(text)) return 'Explorador';

  return 'Clasico Malbec';
};

const intentToCategory = (intent = '') => {
  const map = {
    consulta_producto: 'recomendación de vino',
    consulta_educativa_vino: 'maridaje',
    consulta_caja: 'caja',
    consulta_mensualidad: 'mensualidad',
    consulta_experiencias: 'experiencias',
    consulta_club: 'club',
    consulta_contacto: 'contacto',
  };

  return map[intent] || 'otros';
};

const inferEmergingTopics = (messages = []) => {
  const stopWords = new Set([
    'que', 'para', 'con', 'una', 'como', 'los', 'las', 'por', 'del', 'quiero', 'vino', 'vinos', 'lombardo',
    'sobre', 'esta', 'este', 'desde', 'hacia', 'donde', 'cuando', 'porque', 'hola', 'buenas', 'necesito',
  ]);

  const terms = new Map();

  messages.forEach((message) => {
    const words = normalizeText(message)
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word));

    words.forEach((word) => {
      terms.set(word, (terms.get(word) || 0) + 1);
    });
  });

  return [...terms.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([topic, mentions]) => ({ topic, mentions }));
};

const safeParse = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readInteractions = async () => {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    return safeParse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

const writeInteractions = async (interactions) => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(interactions.slice(-MAX_STORED_INTERACTIONS), null, 2), 'utf-8');
};

const recordInteraction = async (input) => {
  const entry = {
    fecha: new Date().toISOString(),
    mensaje_usuario: input.mensaje_usuario || '',
    pagina_actual: input.pagina_actual || 'general',
    intencion_detectada: input.intencion_detectada || 'educativa',
    perfil_detectado: input.perfil_detectado || inferProfile(input.mensaje_usuario || ''),
    categoria_consulta: input.categoria_consulta || intentToCategory(input.intencion_detectada),
    productos_sugeridos: Array.isArray(input.productos_sugeridos) ? input.productos_sugeridos.slice(0, 5) : [],
    tipo_cierre: input.tipo_cierre || 'chat',
    derivo_whatsapp: Boolean(input.derivo_whatsapp),
  };

  const interactions = await readInteractions();
  interactions.push(entry);
  await writeInteractions(interactions);

  return entry;
};

const buildInsights = (interactions = []) => {
  const total = interactions.length;
  const whatsappCount = interactions.filter((item) => item.derivo_whatsapp).length;

  const countBy = (field) =>
    interactions.reduce((acc, item) => {
      const key = item[field] || 'otros';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

  const toRanking = (obj) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));

  const categories = countBy('categoria_consulta');
  const profiles = countBy('perfil_detectado');

  const wineRank = interactions
    .flatMap((item) => (Array.isArray(item.productos_sugeridos) ? item.productos_sugeridos : []))
    .reduce((acc, wine) => {
      acc[wine] = (acc[wine] || 0) + 1;
      return acc;
    }, {});

  const whatsappByCategory = interactions.reduce((acc, item) => {
    const key = item.categoria_consulta || 'otros';
    if (!acc[key]) acc[key] = { total: 0, whatsapp: 0 };
    acc[key].total += 1;
    if (item.derivo_whatsapp) acc[key].whatsapp += 1;
    return acc;
  }, {});

  const whatsappDerivationRanking = Object.entries(whatsappByCategory)
    .map(([category, stats]) => ({
      category,
      rate: stats.total ? Math.round((stats.whatsapp / stats.total) * 100) : 0,
      total: stats.total,
      whatsapp: stats.whatsapp,
    }))
    .sort((a, b) => b.rate - a.rate || b.whatsapp - a.whatsapp);

  const emergingTopics = inferEmergingTopics(interactions.map((item) => item.mensaje_usuario));

  return {
    summary: {
      total_interacciones: total,
      porcentaje_derivacion_whatsapp: total ? Math.round((whatsappCount / total) * 100) : 0,
      categorias_principales: toRanking(categories).slice(0, 3),
    },
    consultas_frecuentes: toRanking(categories),
    perfiles: toRanking(profiles),
    whatsapp_por_categoria: whatsappDerivationRanking,
    vinos_mas_sugeridos: toRanking(wineRank).slice(0, 10),
    temas_emergentes: emergingTopics,
    interactions,
  };
};

module.exports = {
  readInteractions,
  recordInteraction,
  buildInsights,
  inferProfile,
  intentToCategory,
};

const fs = require('node:fs');
const path = require('node:path');
const { INTENTS, normalizeText } = require('./intent-router');

const RECOMMENDATION_ENGINE_DOC_PATH = 'docs/WINE_RECOMMENDATION_ENGINE_LOMBARDO.md';
const MAX_RECOMMENDATIONS = 3;

let recommendationRulesCache = null;
const getRecommendationRulesFromDocs = () => {
  if (recommendationRulesCache) return recommendationRulesCache;

  try {
    const raw = fs.readFileSync(path.join(process.cwd(), RECOMMENDATION_ENGINE_DOC_PATH), 'utf8');
    const normalized = normalizeText(raw);
    recommendationRulesCache = {
      maxRecommendations: /maximo\s+3/.test(normalized) ? 3 : MAX_RECOMMENDATIONS,
      useBudget: /presupuesto/.test(normalized),
      useOccasion: /ocasion|ocasiones/.test(normalized),
      useStyle: /estilo|perfil/.test(normalized),
      useCombinations: /combina_con|combinaciones/.test(normalized),
    };
  } catch {
    recommendationRulesCache = {
      maxRecommendations: MAX_RECOMMENDATIONS,
      useBudget: true,
      useOccasion: true,
      useStyle: true,
      useCombinations: true,
    };
  }

  return recommendationRulesCache;
};

const parseNumber = (value, fallback = NaN) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getItemPrice = (item) => {
  const fromPrecio = parseNumber(item?.precio);
  if (Number.isFinite(fromPrecio)) return fromPrecio;
  return parseNumber(item?.precio_venta);
};

const extractBudget = (message) => {
  const normalized = normalizeText(message).replace(/\./g, '');
  const match = normalized.match(/(?:\$|de|por|hasta|unos?)\s*(\d{2,6})/);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
};

const parseListField = (value) => {
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).filter(Boolean);
  if (typeof value !== 'string') return [];
  return value
    .split(/[,|;]/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
};

const inferOccasion = (message = '') => {
  const text = normalizeText(message);
  if (/regalo|regalar|obsequio|llevar algo lindo/.test(text)) return 'regalo';
  if (/picada|queso|fiambre|charcuteria/.test(text)) return 'picada';
  if (/cena|comida/.test(text)) return 'cena';
  if (/brunch|merienda/.test(text)) return 'brunch';
  if (/evento|cata|degustacion/.test(text)) return 'evento';
  return 'descubrir';
};

const inferStyle = (message = '') => {
  const text = normalizeText(message);
  if (/suave|ligero|frutado/.test(text)) return 'suave';
  if (/intenso|cuerpo|potente|estructurado/.test(text)) return 'intenso';
  if (/fresco|liviano/.test(text)) return 'fresco';
  if (/dulce|postre/.test(text)) return 'dulce';
  return 'clasico';
};

const inferNeeds = (message = '') => {
  const text = normalizeText(message);
  const needs = [];
  if (/regalo|regalar|obsequio|lindo para llevar/.test(text)) needs.push('regalo');
  if (/picada|quesos?|charcuteria|fiambre/.test(text)) needs.push('picada');
  if (/cena|comida|maridaje/.test(text)) needs.push('cena');
  if (/cafe|cafeteria/.test(text)) needs.push('cafe');
  if (/dulce|pasteleria|postre|chocolate|cookie|budin/.test(text)) needs.push('dulce');
  if (/evento|cata|experiencia/.test(text)) needs.push('experiencia');
  return needs;
};

const inferPreferredCategories = (message = '') => {
  const text = normalizeText(message);
  const categories = [];
  if (/(vino|malbec|cabernet|blanco|rosado)/.test(text)) categories.push('vino', 'blanco', 'rosado');
  if (/espum/.test(text)) categories.push('espumante');
  if (/cafe/.test(text)) categories.push('cafe');
  if (/(pasteleria|dulce|cookie|budin|chocolate)/.test(text)) categories.push('pasteleria');
  if (/(gourmet|delicatessen|picada|queso|charcuteria)/.test(text)) categories.push('gourmet');
  if (/(caja|box)/.test(text)) categories.push('cajas');
  if (/(club|mensualidad|suscrip|membres)/.test(text)) categories.push('club');
  if (/(experiencia|cata|evento)/.test(text)) categories.push('experiencias');
  return [...new Set(categories)];
};

const wantsCombination = (message = '') =>
  /(combinar|combo|mix|completo|picada|regalo|con cafe|con algo dulce|armame algo lindo)/.test(normalizeText(message));

const inferProfile = ({ wineProfile, message }) => {
  if (wineProfile?.perfil) return normalizeText(wineProfile.perfil);
  if (wineProfile?.profile) return normalizeText(wineProfile.profile);
  if (/descubrir|nuevo|explorar/.test(normalizeText(message))) return 'explorador';
  if (/regalo|especial|premium/.test(normalizeText(message))) return 'elegante';
  return 'clasico';
};

const buildSearchText = (item) =>
  normalizeText(
    [
      item?.nombre,
      item?.categoria,
      item?.subcategoria,
      item?.tipo_vino,
      item?.varietal,
      item?.descripcion_corta,
      ...(parseListField(item?.tags) || []),
      ...(parseListField(item?.recomendado_para) || []),
      ...(parseListField(item?.combina_con) || []),
    ].join(' ')
  );

const computeScore = (item, context) => {
  let score = 0;
  const text = buildSearchText(item);
  const category = normalizeText(item?.categoria || '');

  if (context.ocasion !== 'descubrir' && text.includes(context.ocasion)) score += 4;
  if (context.style === 'dulce' && /(pasteleria|dulce|chocolate)/.test(text)) score += 3;
  if (context.style === 'fresco' && /(blanco|rosado|espumante)/.test(text)) score += 3;
  if (context.style === 'intenso' && /(malbec|cabernet|syrah|gourmet)/.test(text)) score += 3;

  if (context.needs.some((need) => text.includes(need))) score += 4;
  if (context.categories.some((preferred) => category.includes(preferred) || text.includes(preferred))) score += 3;

  const recommendedFor = parseListField(item?.recomendado_para);
  if (context.needs.some((need) => recommendedFor.includes(need))) score += 4;

  const combineWith = parseListField(item?.combina_con);
  if (context.needs.some((need) => combineWith.some((value) => value.includes(need)))) score += 2;

  if (context.profile === 'elegante' && /(premium|reserva|destacado)/.test(text)) score += 2;

  const price = getItemPrice(item);
  if (Number.isFinite(context.budget) && Number.isFinite(price)) {
    const delta = Math.abs(price - context.budget);
    if (delta <= 2500) score += 5;
    else if (delta <= 8000) score += 3;
    else if (delta <= 15000) score += 1;
  }

  if (item?.destacado) score += 2;
  if (item?.prioridad_venta === 'alta') score += 1;

  return score;
};

const shouldRecommendFromCatalog = (intent) =>
  [
    INTENTS.CONSULTA_PRODUCTO,
    INTENTS.CONSULTA_CAJA,
    INTENTS.CONSULTA_MENSUALIDAD,
    INTENTS.CONSULTA_GENERAL,
    INTENTS.CONSULTA_CLUB,
    INTENTS.CONSULTA_EXPERIENCIAS,
  ].includes(intent);

const applyIntentFilters = (items, intent) => {
  if (intent === INTENTS.CONSULTA_CAJA) {
    return items.filter((item) => ['vino', 'espumante', 'gourmet', 'pasteleria', 'cajas'].includes(normalizeText(item.categoria)));
  }

  if (intent === INTENTS.CONSULTA_MENSUALIDAD || intent === INTENTS.CONSULTA_CLUB) {
    return items.filter((item) => ['vino', 'espumante', 'club', 'cajas'].includes(normalizeText(item.categoria)));
  }

  if (intent === INTENTS.CONSULTA_EXPERIENCIAS) {
    return items.filter((item) => ['experiencias', 'cafe', 'pasteleria'].includes(normalizeText(item.categoria)));
  }

  return items;
};

const buildContextualIntro = (context = {}) => {
  const parts = [];
  if (context.ocasion && context.ocasion !== 'descubrir') parts.push(`para ${context.ocasion}`);
  if (Number.isFinite(context.budget)) parts.push(`con un presupuesto cercano a $${Number(context.budget).toLocaleString('es-AR')}`);
  if (context.categories?.length) parts.push(`combinando ${context.categories.slice(0, 2).join(' y ')}`);
  if (!parts.length) return 'Te propongo opciones reales de Lombardo que encajan con lo que venís buscando.';
  return `Con lo que me contás (${parts.join(', ')}), estas opciones de Lombardo pueden encajar muy bien.`;
};

const buildCombinationProposal = (ranked = [], context = {}) => {
  if (!ranked.length || !context.wantsCombination) return null;

  const anchor = ranked[0];
  const anchorCombines = parseListField(anchor.combina_con);
  const complementary = ranked.find((item) => {
    if (item.id_producto === anchor.id_producto) return false;
    const category = normalizeText(item.categoria);
    const name = normalizeText(item.nombre);
    return anchorCombines.some((rule) => category.includes(rule) || name.includes(rule));
  }) || ranked[1];

  return {
    anchor: anchor?.nombre || '',
    complementary: complementary?.nombre || '',
    pitch:
      anchor && complementary
        ? `Podés armar un combo con ${anchor.nombre} + ${complementary.nombre}, queda equilibrado y con buena lógica para la ocasión.`
        : '',
  };
};

const recommendWines = ({ wines = [], message = '', intent, wineProfile }) => {
  if (!shouldRecommendFromCatalog(intent)) return { context: null, recommendations: [] };

  const rules = getRecommendationRulesFromDocs();
  const context = {
    profile: inferProfile({ wineProfile, message }),
    ocasion: rules.useOccasion ? inferOccasion(message) : 'descubrir',
    budget: rules.useBudget ? extractBudget(message) : null,
    style: rules.useStyle ? inferStyle(message) : 'clasico',
    needs: inferNeeds(message),
    categories: inferPreferredCategories(message),
    wantsCombination: rules.useCombinations ? wantsCombination(message) : false,
  };

  const baseItems = applyIntentFilters(wines, intent).filter((item) => item && item.disponible !== false);

  const withinBudget = Number.isFinite(context.budget)
    ? baseItems.filter((item) => {
        const price = getItemPrice(item);
        return Number.isFinite(price) ? price <= context.budget * 1.35 : true;
      })
    : baseItems;

  const ranked = [...withinBudget]
    .map((item) => ({ item, score: computeScore(item, context) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, rules.maxRecommendations)
    .map((entry) => entry.item)
    .filter(Boolean);

  return {
    context,
    recommendations: ranked,
    intro: buildContextualIntro(context),
    combinationProposal: buildCombinationProposal(ranked, context),
  };
};

module.exports = { recommendWines, MAX_RECOMMENDATIONS, RECOMMENDATION_ENGINE_DOC_PATH, buildContextualIntro };

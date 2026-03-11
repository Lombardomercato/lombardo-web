const { INTENTS, normalizeText } = require('./intent-router');

const MAX_RECOMMENDATIONS = 3;

const parseNumber = (value, fallback = NaN) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getWinePrice = (wine) => {
  const fromPrecio = parseNumber(wine?.precio);
  if (Number.isFinite(fromPrecio)) return fromPrecio;
  return parseNumber(wine?.precio_venta);
};

const extractBudget = (message) => {
  const normalized = normalizeText(message).replace(/\./g, '');
  const match = normalized.match(/(?:\$|de|por|hasta|unos?)\s*(\d{2,6})/);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
};

const inferOccasion = (message = '') => {
  const text = normalizeText(message);
  if (/regalo|regalar|obsequio/.test(text)) return 'regalo';
  if (/asado|parrilla|carne/.test(text)) return 'asado';
  if (/picada|queso|fiambre/.test(text)) return 'picada';
  if (/sushi|pescado|mariscos/.test(text)) return 'pescado';
  if (/cena|comida/.test(text)) return 'cena';
  return 'descubrir';
};

const inferStyle = (message = '') => {
  const text = normalizeText(message);
  if (/suave|ligero|frutado/.test(text)) return 'suave';
  if (/intenso|cuerpo|potente|estructurado/.test(text)) return 'intenso';
  if (/blanco|espumoso|rose|rosado|fresco/.test(text)) return 'fresco';
  return 'clasico';
};

const inferProfile = ({ wineProfile, message }) => {
  if (wineProfile?.perfil) return normalizeText(wineProfile.perfil);
  if (wineProfile?.profile) return normalizeText(wineProfile.profile);
  if (/descubrir|nuevo|explorar/.test(normalizeText(message))) return 'explorador';
  if (/regalo|especial|premium/.test(normalizeText(message))) return 'elegante';
  return 'clasico';
};

const computeScore = (wine, context) => {
  let score = 0;
  const wineText = normalizeText(
    [
      wine?.nombre,
      wine?.varietal,
      wine?.tipo_vino,
      wine?.estilo,
      wine?.perfil,
      wine?.descripcion_corta,
      wine?.maridaje_principal,
      wine?.ocasion,
    ].join(' ')
  );

  if (context.ocasion && wineText.includes(context.ocasion)) score += 4;
  if (context.style === 'suave' && /(pinot|blanco|rose|rosado)/.test(wineText)) score += 3;
  if (context.style === 'intenso' && /(malbec|cabernet|blend|syrah)/.test(wineText)) score += 3;
  if (context.style === 'fresco' && /(blanco|rose|rosado|espum)/.test(wineText)) score += 3;

  if (context.profile === 'explorador' && /(blend|espum|pinot|rose)/.test(wineText)) score += 2;
  if (context.profile === 'clasico' && /(malbec|cabernet)/.test(wineText)) score += 2;
  if (context.profile === 'elegante' && /(gran|reserva|icon|alta gama|premium)/.test(wineText)) score += 2;

  const price = getWinePrice(wine);
  if (Number.isFinite(context.budget) && Number.isFinite(price)) {
    const delta = Math.abs(price - context.budget);
    if (delta <= 2500) score += 5;
    else if (delta <= 6000) score += 3;
    else if (delta <= 10000) score += 1;
  }

  if (wine?.prioridad_venta === 'alta') score += 1;
  return score;
};

const shouldRecommendFromCatalog = (intent) =>
  [INTENTS.CONSULTA_PRODUCTO, INTENTS.CONSULTA_CAJA, INTENTS.CONSULTA_MENSUALIDAD, INTENTS.CONSULTA_GENERAL].includes(
    intent
  );

const recommendWines = ({ wines = [], message = '', intent, wineProfile }) => {
  if (!shouldRecommendFromCatalog(intent)) return { context: null, recommendations: [] };

  const context = {
    profile: inferProfile({ wineProfile, message }),
    ocasion: inferOccasion(message),
    budget: extractBudget(message),
    style: inferStyle(message),
  };

  const withinBudget = Number.isFinite(context.budget)
    ? wines.filter((wine) => {
        const price = getWinePrice(wine);
        return Number.isFinite(price) ? price <= context.budget * 1.25 : true;
      })
    : wines;

  const ranked = [...withinBudget]
    .map((wine) => ({ wine, score: computeScore(wine, context) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECOMMENDATIONS)
    .map((item) => item.wine)
    .filter(Boolean);

  return { context, recommendations: ranked };
};

module.exports = { recommendWines, MAX_RECOMMENDATIONS };

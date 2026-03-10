const { readInteractions, buildInsights } = require('./lib/assistant-interactions');

const isAuthorized = (req) => {
  const expectedKey = process.env.ADMIN_INSIGHTS_KEY;
  if (!expectedKey) return true;

  const authHeader = req.headers?.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  return token && token === expectedKey;
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const interactions = await readInteractions();
    const insights = buildInsights(interactions);
    return res.status(200).json(insights);
  } catch (error) {
    console.error('[admin-insights] error', error);
    return res.status(500).json({ error: 'No se pudieron obtener los insights.' });
  }
};

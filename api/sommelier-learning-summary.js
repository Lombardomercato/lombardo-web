const { parseJsonlRecords, buildLombardoLearningSummary } = require('./ai-learning');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const records = await parseJsonlRecords();
    const summary = buildLombardoLearningSummary(records);
    return res.status(200).json(summary);
  } catch (error) {
    console.error('[sommelier-learning-summary][error]', error);
    return res.status(500).json({
      error: 'No se pudo generar el resumen de aprendizaje comercial.',
      error_code: 'SUMMARY_BUILD_ERROR',
    });
  }
};

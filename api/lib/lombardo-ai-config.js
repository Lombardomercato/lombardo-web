const fs = require('node:fs/promises');
const path = require('node:path');

const DOC_FILES = {
  architecture: 'docs/LOMBARDO_ARCHITECTURE.md',
  systemPrompt: 'docs/AI_SYSTEM_PROMPT_LOMBARDO.md',
  conversationFlow: 'docs/CONVERSATION_FLOW_LOMBARDO.md',
  toneGuide: 'docs/AI_TONE_GUIDE_LOMBARDO.md',
  intentRules: 'docs/AI_INTENT_RULES_LOMBARDO.md',
  recommendationEngine: 'docs/WINE_RECOMMENDATION_ENGINE_LOMBARDO.md',
  learningLayer: 'docs/AI_LEARNING_LAYER_LOMBARDO.md',
};

const resolveDocPath = (file) => path.join(process.cwd(), file);

const readDoc = async (file) => {
  try {
    return await fs.readFile(resolveDocPath(file), 'utf8');
  } catch {
    return '';
  }
};

const compact = (value) =>
  String(value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');

const clip = (value, maxChars = 5000) => compact(value).slice(0, maxChars);

const buildSystemPromptFromDocs = async () => {
  const [systemPrompt, conversationFlow, toneGuide, intentRules, recommendationEngine, architecture, learningLayer] =
    await Promise.all([
      readDoc(DOC_FILES.systemPrompt),
      readDoc(DOC_FILES.conversationFlow),
      readDoc(DOC_FILES.toneGuide),
      readDoc(DOC_FILES.intentRules),
      readDoc(DOC_FILES.recommendationEngine),
      readDoc(DOC_FILES.architecture),
      readDoc(DOC_FILES.learningLayer),
    ]);

  const sections = [
    'Fuente canónica obligatoria Lombardo (docs): prompt, flujo conversacional, tono, intención, motor de recomendación, arquitectura y learning layer.',
    architecture ? `Arquitectura:\n${clip(architecture, 1600)}` : '',
    systemPrompt ? `Comportamiento general:\n${clip(systemPrompt, 5000)}` : '',
    conversationFlow ? `Flujo conversacional (orden obligatorio: responder → preguntar si hace falta → recomendar cuando corresponda → vender/derivar solo cuando suma):\n${clip(conversationFlow, 4200)}` : '',
    toneGuide ? `Guía de tono:\n${clip(toneGuide, 2800)}` : '',
    intentRules ? `Reglas de intención:\n${clip(intentRules, 3500)}` : '',
    recommendationEngine ? `Motor de recomendación:\n${clip(recommendationEngine, 3500)}` : '',
    learningLayer ? `Learning layer comercial:\n${clip(learningLayer, 1800)}` : '',
  ].filter(Boolean);

  return sections.join('\n\n');
};

module.exports = {
  DOC_FILES,
  buildSystemPromptFromDocs,
};

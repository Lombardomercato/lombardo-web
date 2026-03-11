const fs = require('node:fs/promises');
const path = require('node:path');

const DOC_FILES = {
  architecture: 'docs/LOMBARDO_ARCHITECTURE.md',
  systemPrompt: 'docs/AI_SYSTEM_PROMPT_LOMBARDO.md',
  toneGuide: 'docs/AI_TONE_GUIDE_LOMBARDO.md',
  intentRules: 'docs/AI_INTENT_RULES_LOMBARDO.md',
  recommendationEngine: 'docs/WINE_RECOMMENDATION_ENGINE_LOMBARDO.md',
  conversationFlow: 'docs/CONVERSATION_FLOW_LOMBARDO.md',
  learningLayer: 'docs/AI_LEARNING_LAYER_LOMBARDO.md',
  scoringEngine: 'docs/WINE_SCORING_ENGINE_LOMBARDO.md',
};

const DOC_ORDER = [
  'architecture',
  'systemPrompt',
  'toneGuide',
  'intentRules',
  'recommendationEngine',
  'conversationFlow',
  'learningLayer',
  'scoringEngine',
];

const DOC_TITLES = {
  architecture: 'Arquitectura',
  systemPrompt: 'Comportamiento general',
  toneGuide: 'Guía de tono',
  intentRules: 'Reglas de intención',
  recommendationEngine: 'Motor de recomendación',
  conversationFlow: 'Flujo conversacional',
  learningLayer: 'Learning layer comercial',
  scoringEngine: 'Motor de scoring de vinos',
};

const resolveDocPath = (file) => path.join(process.cwd(), file);

const normalizeDocContent = (value) => String(value || '').replace(/\r/g, '').trim();

const readDoc = async (file) => {
  const filePath = resolveDocPath(file);
  const content = await fs.readFile(filePath, 'utf8');
  const normalized = normalizeDocContent(content);

  if (!normalized) {
    const error = new Error(`Documento canónico vacío: ${file}`);
    error.code = 'CANONICAL_DOC_EMPTY';
    throw error;
  }

  const stat = await fs.stat(filePath);
  return {
    file,
    filePath,
    content: normalized,
    chars: normalized.length,
    mtimeMs: stat.mtimeMs,
  };
};

const getConfiguredPromptMaxChars = () => {
  const raw = Number(process.env.LOMBARDO_PROMPT_MAX_CHARS || '0');
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
};

const enforcePromptLimit = (sections, maxChars) => {
  if (!maxChars) {
    return {
      sections,
      truncated: false,
    };
  }

  let used = 0;
  let truncated = false;

  const limitedSections = sections
    .map((section) => {
      if (truncated) {
        return { ...section, included: false, clippedChars: 0, clipped: false };
      }

      const remaining = maxChars - used;
      if (remaining <= 0) {
        truncated = true;
        return { ...section, included: false, clippedChars: 0, clipped: false };
      }

      if (section.text.length <= remaining) {
        used += section.text.length;
        return { ...section, included: true, clippedChars: section.text.length, clipped: false };
      }

      truncated = true;
      const clippedText = section.text.slice(0, remaining);
      used += clippedText.length;
      return {
        ...section,
        text: clippedText,
        included: true,
        clippedChars: clippedText.length,
        clipped: true,
      };
    })
    .filter((section) => section.included);

  return {
    sections: limitedSections,
    truncated,
  };
};

const buildSystemPromptFromDocs = async () => {
  const docEntries = await Promise.all(DOC_ORDER.map((key) => readDoc(DOC_FILES[key]).then((doc) => ({ key, ...doc }))));

  const intro = [
    'Fuente canónica obligatoria Lombardo (única): arquitectura, system prompt, tono, intención, recomendación, conversación, learning layer y scoring.',
    'Si existe conflicto con otras instrucciones operativas, priorizá este bloque canónico.',
  ].join('\n');

  const sections = docEntries.map((entry) => ({
    key: entry.key,
    file: entry.file,
    rawChars: entry.chars,
    text: `### ${DOC_TITLES[entry.key]} (${entry.file})\n${entry.content}`,
  }));

  const allSections = [{ key: 'intro', file: null, rawChars: intro.length, text: intro }, ...sections];
  const maxChars = getConfiguredPromptMaxChars();
  const limited = enforcePromptLimit(allSections, maxChars);

  const metadata = {
    docs: sections.map((section) => {
      const limitedSection = limited.sections.find((item) => item.key === section.key);
      return {
        key: section.key,
        file: section.file,
        rawChars: section.rawChars,
        promptChars: limitedSection ? limitedSection.text.length : 0,
        clipped: Boolean(limitedSection?.clipped),
        included: Boolean(limitedSection),
      };
    }),
    maxChars: maxChars || null,
    truncated: limited.truncated,
    extraBlocks: [],
    docsSignature: docEntries.map((entry) => `${entry.file}:${entry.mtimeMs}:${entry.chars}`).join('|'),
  };

  return {
    prompt: limited.sections.map((section) => section.text).join('\n\n'),
    metadata,
  };
};

module.exports = {
  DOC_FILES,
  DOC_ORDER,
  buildSystemPromptFromDocs,
};

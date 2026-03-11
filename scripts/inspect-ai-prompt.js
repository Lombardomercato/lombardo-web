#!/usr/bin/env node
const { DOC_FILES, DOC_ORDER, buildSystemPromptFromDocs } = require('../api/lib/lombardo-ai-config');

(async () => {
  const result = await buildSystemPromptFromDocs();
  const metadata = result.metadata || {};

  console.log('Canon docs configured in api/lib/lombardo-ai-config.js:\n');
  DOC_ORDER.forEach((key, index) => {
    const file = DOC_FILES[key];
    const docMeta = (metadata.docs || []).find((doc) => doc.key === key) || {};

    console.log(`${index + 1}. ${key}`);
    console.log(`   file: ${file}`);
    console.log(`   included: ${Boolean(docMeta.included)}`);
    console.log(`   raw_chars: ${docMeta.rawChars ?? 'n/a'}`);
    console.log(`   prompt_chars: ${docMeta.promptChars ?? 'n/a'}`);
    console.log(`   clipped: ${Boolean(docMeta.clipped)}`);
    console.log('');
  });

  console.log('Extra blocks beyond canonical docs:');
  if (!Array.isArray(metadata.extraBlocks) || metadata.extraBlocks.length === 0) {
    console.log('  - none');
  } else {
    metadata.extraBlocks.forEach((block) => {
      console.log(`  - ${block.name}`);
      console.log(`    included: ${Boolean(block.included)}`);
      console.log(`    chars: ${block.chars ?? 0}`);
      if (block.reason) console.log(`    reason: ${block.reason}`);
    });
  }

  console.log('');
  console.log('Prompt truncation policy:');
  console.log(`  max_chars: ${metadata.maxChars ?? 'disabled (no truncation)'}`);
  console.log(`  truncated: ${Boolean(metadata.truncated)}`);
  console.log(`  total_prompt_chars: ${result.prompt.length}`);
})();

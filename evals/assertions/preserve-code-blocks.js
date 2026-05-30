function extractCodeBlocks(text) {
  const regex = /```[\s\S]*?```/g;
  return text.match(regex) || [];
}

function normalizeOutput(output) {
  return typeof output === 'string'
    ? output
    : output && typeof output.finalText === 'string'
      ? output.finalText
      : JSON.stringify(output);
}

module.exports = function preserveCodeBlocks(output, context) {
  const input = context.vars.source;
  const inputBlocks = extractCodeBlocks(String(input));
  const outputBlocks = extractCodeBlocks(normalizeOutput(output));

  const pass =
    inputBlocks.length === outputBlocks.length &&
    inputBlocks.every((block, index) => block === outputBlocks[index]);

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Code blocks were preserved.'
      : 'Code blocks changed or were not preserved.',
  };
};

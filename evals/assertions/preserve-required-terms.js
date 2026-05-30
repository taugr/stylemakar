function normalizeOutput(output) {
  return typeof output === 'string'
    ? output
    : output && typeof output.finalText === 'string'
      ? output.finalText
      : JSON.stringify(output);
}

module.exports = function preserveRequiredTerms(output, context) {
  const rawTerms = context.vars.requiredTerms || [];
  const requiredTerms = Array.isArray(rawTerms)
    ? rawTerms
    : String(rawTerms)
        .split(',')
        .map((term) => term.trim())
        .filter(Boolean);
  const text = normalizeOutput(output);
  const missing = requiredTerms.filter((term) => !text.includes(term));

  return {
    pass: missing.length === 0,
    score: missing.length === 0 ? 1 : 0,
    reason:
      missing.length === 0
        ? 'All required terms were preserved.'
        : `Missing required terms: ${missing.join(', ')}`,
  };
};

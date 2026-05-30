const bannedPhrases = [
  'it is important to note',
  'robust and comprehensive',
  'delve into',
  'leverage',
  'seamless user experience',
  'in conclusion',
  "in today's fast-paced world",
  'unlock the power of',
  'a testament to',
];

function normalizeOutput(output) {
  return typeof output === 'string'
    ? output
    : output && typeof output.finalText === 'string'
      ? output.finalText
      : JSON.stringify(output);
}

module.exports = function noGenericAi(output) {
  const lower = normalizeOutput(output).toLowerCase();
  const matches = bannedPhrases.filter((phrase) => lower.includes(phrase));

  return {
    pass: matches.length === 0,
    score: matches.length === 0 ? 1 : 0,
    reason:
      matches.length === 0
        ? 'No banned generic AI phrases found.'
        : `Found banned phrases: ${matches.join(', ')}`,
  };
};

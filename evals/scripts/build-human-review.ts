import crypto from 'node:crypto';
import fs from 'node:fs';

const inputs = process.argv.slice(2);
if (inputs.length < 2) {
  throw new Error(
    'Usage: tsx build-human-review.ts <no-op.json> <comparison.json> [...]',
  );
}
const byCase = new Map<string, Array<{ method: string; output: string }>>();
for (const input of inputs) {
  const run = JSON.parse(fs.readFileSync(input, 'utf8')) as {
    rows: Array<{ caseId: string; method: string; output: string }>;
  };
  for (const row of run.rows) {
    const candidates = byCase.get(row.caseId) ?? [];
    candidates.push({ method: row.method, output: row.output });
    byCase.set(row.caseId, candidates);
  }
}
const key = crypto.randomBytes(24).toString('hex');
const assignments: Record<string, string> = {};
function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const destination = crypto.randomInt(index + 1);
    [shuffled[index], shuffled[destination]] = [
      shuffled[destination] as T,
      shuffled[index] as T,
    ];
  }
  return shuffled;
}
const review = [...byCase].map(([caseId, candidates]) => ({
  caseId,
  candidates: shuffle(
    candidates.map((candidate) => {
      const blindId = crypto
        .createHash('sha256')
        .update(`${key}:${caseId}:${candidate.method}`)
        .digest('hex')
        .slice(0, 10);
      assignments[`${caseId}:${blindId}`] = candidate.method;
      return { blindId, output: candidate.output };
    }),
  ),
  response: {
    bestMeaning: null,
    bestStyle: null,
    leastEditing: null,
    unacceptable: [],
    meaningRisk: [],
    editingMinutes: null,
    reason: '',
    reviewerId: '',
  },
}));
const output = `evals/results/human-review-${Date.now()}.json`;
fs.mkdirSync('evals/results', { recursive: true });
fs.writeFileSync(
  output,
  JSON.stringify({ review, keyFile: `${output}.key` }, null, 2),
);
fs.writeFileSync(
  `${output}.key`,
  JSON.stringify({ assignments, inputs, key }, null, 2),
);
console.log(output);

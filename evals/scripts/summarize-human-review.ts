import fs from 'node:fs';

type Response = {
  bestMeaning: string | 'tie' | 'none' | 'uncertain' | null;
  bestStyle: string | 'tie' | 'none' | 'uncertain' | null;
  leastEditing: string | 'tie' | 'none' | 'uncertain' | null;
  unacceptable: string[];
  meaningRisk: string[];
  editingMinutes: number | null;
  reviewerId: string;
};

const inputs = process.argv.slice(2);
if (inputs.length < 2) {
  throw new Error(
    'Usage: tsx summarize-human-review.ts <completed-review-one.json> <completed-review-two.json> [...]',
  );
}

const responses = new Map<string, Response[]>();
const assignments = new Map<string, string>();
for (const input of inputs) {
  const review = JSON.parse(fs.readFileSync(input, 'utf8')) as {
    review: Array<{ caseId: string; response: Response }>;
  };
  const key = JSON.parse(fs.readFileSync(`${input}.key`, 'utf8')) as {
    assignments: Record<string, string>;
  };
  for (const [blind, method] of Object.entries(key.assignments)) {
    assignments.set(blind, method);
  }
  for (const item of review.review) {
    if (!item.response.reviewerId) continue;
    const current = responses.get(item.caseId) ?? [];
    current.push(item.response);
    responses.set(item.caseId, current);
  }
}

const fields = ['bestMeaning', 'bestStyle', 'leastEditing'] as const;
const preference: Record<string, Record<string, number>> = {};
const agreement = Object.fromEntries(
  fields.map((field) => {
    let agreed = 0;
    let pairs = 0;
    preference[field] = {};
    for (const [caseId, caseResponses] of responses) {
      for (const response of caseResponses) {
        const selection = response[field];
        if (!selection) continue;
        const method = assignments.get(`${caseId}:${selection}`) ?? selection;
        preference[field][method] = (preference[field][method] ?? 0) + 1;
      }
      for (let left = 0; left < caseResponses.length; left += 1) {
        for (let right = left + 1; right < caseResponses.length; right += 1) {
          pairs += 1;
          if (caseResponses[left]?.[field] === caseResponses[right]?.[field]) {
            agreed += 1;
          }
        }
      }
    }
    return [
      field,
      { agreed, pairs, rate: pairs === 0 ? null : agreed / pairs },
    ];
  }),
);

const completedReviews = [...responses.values()].flat();
const editingMinutes = completedReviews
  .map((response) => response.editingMinutes)
  .filter((value): value is number => typeof value === 'number');
const report = {
  agreement,
  cases: responses.size,
  editingMinutes: {
    count: editingMinutes.length,
    mean:
      editingMinutes.reduce((total, value) => total + value, 0) /
      Math.max(1, editingMinutes.length),
  },
  preference,
  reviewers: new Set(completedReviews.map((response) => response.reviewerId))
    .size,
};
const output = `evals/results/human-review-summary-${Date.now()}.json`;
fs.mkdirSync('evals/results', { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(output);

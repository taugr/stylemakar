import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROVIDER,
  DEFAULT_REFERENCE_EXAMPLES,
  DEFAULT_STYLE_PROFILE,
} from '../shared/defaults';
import type {
  FinalSmoothingOutput,
  MeaningCheck,
  MeaningRepresentation,
  RewriteOutput,
  StyleTargets,
  StyleGrade,
} from '../shared/types';
import { runRewritePipeline, selectReferenceExamples } from './pipeline';

function passingGrade(overall = 90): StyleGrade {
  return {
    directness: overall,
    explanationStyle: overall,
    issues: [],
    overall,
    paragraphShape: overall,
    pass: overall >= 85,
    revisionInstruction: overall >= 85 ? '' : 'Make it more direct.',
    sentenceRhythm: overall,
    toneMatch: overall,
    vocabularyMatch: overall,
  };
}

function meaning(pass = true): MeaningCheck {
  return {
    addedClaims: [],
    changedMeaning: [],
    missingDetails: pass ? [] : ['number'],
    pass,
    repairInstruction: pass ? undefined : 'Restore the missing number.',
    riskLevel: pass ? 'low' : 'medium',
  };
}

function extractedMeaning(): MeaningRepresentation {
  return {
    caveats: [],
    claims: ['Original claim'],
    conclusions: ['Original conclusion'],
    constraints: ['Preserve 42'],
    examples: [],
    mandatoryDetails: ['42'],
  };
}

function styleTargets(): StyleTargets {
  return {
    directness: 'high',
    explanationPattern: 'claim_then_reasoning',
    formality: 'medium',
    hedgingLevel: 'low',
    paragraphLength: 'short',
    tone: ['direct'],
    usesExamples: false,
    vocabulary: ['straightforward technical language'],
  };
}

describe('runRewritePipeline', () => {
  it('selects the most relevant reference examples for a paragraph', () => {
    expect(
      selectReferenceExamples('This API endpoint returns debug data.', [
        'A travel note about trains.',
        'The API should return structured debug data.',
        'Product marketing copy.',
      ]),
    ).toEqual([
      'The API should return structured debug data.',
      'A travel note about trains.',
    ]);
  });

  it('rewrites paragraph segments and preserves non-rewritable segments', async () => {
    const calls: string[] = [];
    const result = await runRewritePipeline(
      {
        document: '# Title\n\nOriginal paragraph.\n\n```ts\nconst x = 1;\n```',
        options: { includeDebug: true },
        provider: DEFAULT_PROVIDER,
        referenceExamples: DEFAULT_REFERENCE_EXAMPLES,
        styleProfile: DEFAULT_STYLE_PROFILE,
      },
      {
        completeJson: async <T>(messages: unknown[]): Promise<T> => {
          const system = JSON.stringify(messages[0]);
          calls.push(system);

          if (system.includes('Extract meaning from the paragraph')) {
            return extractedMeaning() as T;
          }

          if (system.includes('Identify behavior-level style targets')) {
            return styleTargets() as T;
          }

          if (system.includes('Rewrite the paragraph')) {
            return { rewrittenText: 'Rewritten paragraph.' } as T;
          }

          if (system.includes('Grade whether this resembles')) {
            return passingGrade() as T;
          }

          if (system.includes('Check semantic fidelity')) {
            return meaning(true) as T;
          }

          return {
            document:
              '# Title\n\nRewritten paragraph.\n\n```ts\nconst x = 1;\n```',
          } satisfies FinalSmoothingOutput as T;
        },
      },
    );

    expect(result.content).toContain('Rewritten paragraph.');
    expect(result.content).toContain('const x = 1;');
    expect(result.debug?.segmentResults).toHaveLength(1);
    expect(
      calls.filter((call) => call.includes('Rewrite the paragraph')),
    ).toHaveLength(1);
    expect(
      calls.filter((call) =>
        call.includes('Extract meaning from the paragraph'),
      ),
    ).toHaveLength(1);
    expect(result.debug?.segmentResults[0]?.meaningRepresentation).toEqual(
      extractedMeaning(),
    );
    expect(result.debug?.segmentResults[0]?.styleTargets).toEqual(
      styleTargets(),
    );
  });

  it('revises on low style grade and repairs failed meaning checks', async () => {
    let rewriteCount = 0;
    let meaningCount = 0;
    const result = await runRewritePipeline(
      {
        document: 'Original paragraph with 42.',
        options: { includeDebug: true },
        provider: DEFAULT_PROVIDER,
        referenceExamples: DEFAULT_REFERENCE_EXAMPLES,
        styleProfile: DEFAULT_STYLE_PROFILE,
      },
      {
        completeJson: async <T>(messages: unknown[]): Promise<T> => {
          const system = JSON.stringify(messages[0]);

          if (system.includes('Extract meaning from the paragraph')) {
            return extractedMeaning() as T;
          }

          if (system.includes('Identify behavior-level style targets')) {
            return styleTargets() as T;
          }

          if (system.includes('Rewrite the paragraph')) {
            const user = JSON.stringify(messages[1]);
            if (rewriteCount > 0) {
              expect(user).toContain('Improve the existing rewrite');
              expect(user).toContain('Make it more direct.');
            }
            rewriteCount += 1;
            return {
              rewrittenText:
                rewriteCount === 1 ? 'Draft without number.' : 'Draft with 42.',
            } satisfies RewriteOutput as T;
          }

          if (system.includes('Grade whether this resembles')) {
            return passingGrade(rewriteCount === 1 ? 70 : 91) as T;
          }

          if (system.includes('Check semantic fidelity')) {
            meaningCount += 1;
            return meaning(meaningCount > 1) as T;
          }

          if (system.includes('Repair the existing rewrite')) {
            return {
              rewrittenText: 'Repaired draft with 42.',
            } satisfies RewriteOutput as T;
          }

          return {
            document: 'Repaired draft with 42.',
          } satisfies FinalSmoothingOutput as T;
        },
      },
    );

    expect(result.debug?.segmentResults[0]?.attempts).toHaveLength(2);
    expect(
      result.debug?.segmentResults[0]?.attempts[0]?.revisionInstruction,
    ).toBe('Make it more direct.');
    expect(result.warnings).toEqual([]);
    expect(result.content).toBe('Repaired draft with 42.');
  });

  it('normalizes loose model grade responses into numeric style grades', async () => {
    const result = await runRewritePipeline(
      {
        document: 'Original paragraph.',
        options: { includeDebug: true },
        provider: DEFAULT_PROVIDER,
        referenceExamples: DEFAULT_REFERENCE_EXAMPLES,
        styleProfile: DEFAULT_STYLE_PROFILE,
      },
      {
        completeJson: async <T>(messages: unknown[]): Promise<T> => {
          const system = JSON.stringify(messages[0]);

          if (system.includes('Extract meaning from the paragraph')) {
            return extractedMeaning() as T;
          }

          if (system.includes('Identify behavior-level style targets')) {
            return styleTargets() as T;
          }

          if (system.includes('Rewrite the paragraph')) {
            return {
              rewrittenText: 'Direct rewrite.',
            } satisfies RewriteOutput as T;
          }

          if (system.includes('Grade whether this resembles')) {
            return {
              directness: 'High',
              explanationStyle: 'High',
              issues: 'None',
              overall: 'High',
              paragraphShape: 'High',
              pass: true,
              revisionInstruction: 'N/A',
              sentenceRhythm: 'High',
              toneMatch: 'High',
              vocabularyMatch: 'High',
            } as T;
          }

          if (system.includes('Check semantic fidelity')) {
            return meaning(true) as T;
          }

          return {
            document: 'Direct rewrite.',
          } satisfies FinalSmoothingOutput as T;
        },
      },
    );

    expect(result.debug?.segmentResults[0]?.attempts[0]?.grade.overall).toBe(
      90,
    );
    expect(result.debug?.segmentResults[0]?.attempts[0]?.grade.issues).toEqual(
      [],
    );
  });
});

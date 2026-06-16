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

const studentFeedbackProfile = {
  antiRules: [
    'Do not use vague praise or generic encouragement.',
    'Do not invent details.',
  ],
  description:
    'Specific, fair, constructive feedback that names what works and what needs to change without vague praise.',
  id: 'student-feedback',
  name: 'Student Feedback',
  rules: [
    'Give concrete observations.',
    'Explain the next improvement clearly.',
  ],
};

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

  it('retries when anti-generic checks fail despite a passing style grade', async () => {
    let rewriteCount = 0;
    const result = await runRewritePipeline(
      {
        document:
          'It is important to note that this robust and comprehensive solution leverages AI.',
        options: { includeDebug: true, runMeaningCheck: false },
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
              expect(user).toContain('Remove these generic phrases');
              expect(user).toContain('robust and comprehensive');
            }
            rewriteCount += 1;
            return {
              rewrittenText:
                rewriteCount === 1
                  ? 'This robust and comprehensive solution leverages AI.'
                  : 'The system uses AI for the task.',
            } satisfies RewriteOutput as T;
          }

          if (system.includes('Grade whether this resembles')) {
            return passingGrade(90) as T;
          }

          return {
            document: 'The system uses AI for the task.',
          } satisfies FinalSmoothingOutput as T;
        },
      },
    );

    expect(result.content).toBe('The system uses AI for the task.');
    expect(result.debug?.segmentResults[0]?.attempts).toHaveLength(2);
    expect(
      result.debug?.segmentResults[0]?.attempts[0]?.revisionInstruction,
    ).toContain('Remove these generic phrases');
    expect(result.warnings).toEqual([]);
  });

  it('constrains meaning repair so it does not reintroduce generic phrasing', async () => {
    let meaningCount = 0;
    let repairCount = 0;
    const result = await runRewritePipeline(
      {
        document:
          'It is important to note that this robust and comprehensive solution includes 42.',
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
              rewrittenText: 'The system handles the task.',
            } satisfies RewriteOutput as T;
          }

          if (system.includes('Grade whether this resembles')) {
            return passingGrade(90) as T;
          }

          if (system.includes('Check semantic fidelity')) {
            meaningCount += 1;
            return meaning(meaningCount > 1) as T;
          }

          if (system.includes('Repair the existing rewrite')) {
            const user = JSON.stringify(messages[1]);
            repairCount += 1;
            if (repairCount > 1) {
              expect(user).toContain('Anti-generic feedback');
              expect(user).toContain('robust and comprehensive');
            }
            return {
              rewrittenText:
                repairCount === 1
                  ? 'This robust and comprehensive solution includes 42.'
                  : 'The system includes 42.',
            } satisfies RewriteOutput as T;
          }

          return {
            document: 'The system includes 42.',
          } satisfies FinalSmoothingOutput as T;
        },
      },
    );

    expect(repairCount).toBe(2);
    expect(result.content).toBe('The system includes 42.');
    expect(result.warnings).toEqual([]);
  });

  it('does not treat removed generic adjectives as missing meaning', async () => {
    let repairCount = 0;
    const result = await runRewritePipeline(
      {
        document:
          'It is important to note that this robust and comprehensive solution delivers a seamless user experience.',
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
              rewrittenText: 'The solution improves the user experience.',
            } satisfies RewriteOutput as T;
          }

          if (system.includes('Grade whether this resembles')) {
            return passingGrade(90) as T;
          }

          if (system.includes('Check semantic fidelity')) {
            return {
              addedClaims: [],
              changedMeaning: [],
              missingDetails: ['robust', 'comprehensive', 'seamless'],
              pass: false,
              riskLevel: 'medium',
            } satisfies MeaningCheck as T;
          }

          if (system.includes('Repair the existing rewrite')) {
            repairCount += 1;
            return {
              rewrittenText:
                'This robust and comprehensive solution improves the seamless user experience.',
            } satisfies RewriteOutput as T;
          }

          return {
            document: 'The solution improves the user experience.',
          } satisfies FinalSmoothingOutput as T;
        },
      },
    );

    expect(repairCount).toBe(0);
    expect(result.content).toBe('The solution improves the user experience.');
    expect(result.debug?.segmentResults[0]?.meaningCheck).toMatchObject({
      missingDetails: [],
      pass: true,
    });
    expect(result.warnings).toEqual([]);
  });

  it('retries student feedback that invents unsupported details', async () => {
    let rewriteCount = 0;
    const result = await runRewritePipeline(
      {
        document: 'Great job on this section; it shows strong effort.',
        options: { includeDebug: true, runMeaningCheck: false },
        provider: DEFAULT_PROVIDER,
        referenceExamples: DEFAULT_REFERENCE_EXAMPLES,
        styleProfile: studentFeedbackProfile,
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
              expect(user).toContain('Remove unsupported feedback details');
              expect(user).toContain('subsection');
            }
            rewriteCount += 1;
            return {
              rewrittenText:
                rewriteCount === 1
                  ? 'The subsection is excellent. Maintain this level of detail in upcoming projects.'
                  : 'The feedback is too broad. Point to one specific choice in the section and explain why it works.',
            } satisfies RewriteOutput as T;
          }

          if (system.includes('Grade whether this resembles')) {
            return passingGrade(92) as T;
          }

          return {
            document:
              'The feedback is too broad. Point to one specific choice in the section and explain why it works.',
          } satisfies FinalSmoothingOutput as T;
        },
      },
    );

    expect(result.debug?.segmentResults[0]?.attempts).toHaveLength(2);
    expect(
      result.debug?.segmentResults[0]?.attempts[0]?.revisionInstruction,
    ).toContain('Remove unsupported feedback details');
    expect(result.content).toBe(
      'The feedback is too broad. Point to one specific choice in the section and explain why it works.',
    );
    expect(result.warnings).toEqual([]);
  });

  it('allows student feedback next-step framing without treating it as an invented claim', async () => {
    const result = await runRewritePipeline(
      {
        document: 'Great job on this section; it shows strong effort.',
        options: { includeDebug: true },
        provider: DEFAULT_PROVIDER,
        referenceExamples: DEFAULT_REFERENCE_EXAMPLES,
        styleProfile: studentFeedbackProfile,
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
              rewrittenText:
                'The feedback is too broad. Add one specific example and explain why it works.',
            } satisfies RewriteOutput as T;
          }

          if (system.includes('Grade whether this resembles')) {
            return passingGrade(92) as T;
          }

          if (system.includes('Check semantic fidelity')) {
            return {
              addedClaims: [
                'The rewrite asks the student to add one specific example.',
              ],
              changedMeaning: [],
              missingDetails: [],
              pass: false,
              riskLevel: 'medium',
            } satisfies MeaningCheck as T;
          }

          return {
            document:
              'The feedback is too broad. Add one specific example and explain why it works.',
          } satisfies FinalSmoothingOutput as T;
        },
      },
    );

    expect(result.content).toBe(
      'The feedback is too broad. Add one specific example and explain why it works.',
    );
    expect(result.debug?.segmentResults[0]?.meaningCheck).toMatchObject({
      addedClaims: [],
      pass: true,
    });
    expect(result.warnings).toEqual([]);
  });

  it('still repairs student feedback when concrete source details are removed', async () => {
    let repairCount = 0;
    const result = await runRewritePipeline(
      {
        document:
          'The June 2026 pilot included 42 students, with Aram reviewing the final submissions.',
        options: { includeDebug: true },
        provider: DEFAULT_PROVIDER,
        referenceExamples: DEFAULT_REFERENCE_EXAMPLES,
        styleProfile: studentFeedbackProfile,
      },
      {
        completeJson: async <T>(messages: unknown[]): Promise<T> => {
          const system = JSON.stringify(messages[0]);

          if (system.includes('Extract meaning from the paragraph')) {
            return {
              caveats: [],
              claims: ['The pilot included students and Aram reviewed work.'],
              conclusions: [],
              constraints: [],
              examples: [],
              mandatoryDetails: ['June 2026', '42', 'Aram'],
            } satisfies MeaningRepresentation as T;
          }

          if (system.includes('Identify behavior-level style targets')) {
            return styleTargets() as T;
          }

          if (system.includes('Rewrite the paragraph')) {
            return {
              rewrittenText:
                'Name which part of the final submissions needs revision and explain why that change matters.',
            } satisfies RewriteOutput as T;
          }

          if (system.includes('Grade whether this resembles')) {
            return passingGrade(92) as T;
          }

          if (system.includes('Check semantic fidelity')) {
            return repairCount === 0
              ? ({
                  addedClaims: [
                    'The rewrite asks the student to explain why the change matters.',
                  ],
                  changedMeaning: [],
                  missingDetails: ['June 2026', '42', 'Aram'],
                  pass: false,
                  repairInstruction:
                    'Restore June 2026, 42 students, and Aram.',
                  riskLevel: 'high',
                } satisfies MeaningCheck as T)
              : ({
                  addedClaims: [],
                  changedMeaning: [],
                  missingDetails: [],
                  pass: true,
                  riskLevel: 'low',
                } satisfies MeaningCheck as T);
          }

          if (system.includes('Repair the existing rewrite')) {
            repairCount += 1;
            return {
              rewrittenText:
                'In the June 2026 pilot with 42 students, Aram reviewed the final submissions. Name which part needs revision and explain why that change matters.',
            } satisfies RewriteOutput as T;
          }

          return {
            document:
              'In the June 2026 pilot with 42 students, Aram reviewed the final submissions. Name which part needs revision and explain why that change matters.',
          } satisfies FinalSmoothingOutput as T;
        },
      },
    );

    expect(repairCount).toBe(1);
    expect(result.content).toContain('June 2026');
    expect(result.content).toContain('42 students');
    expect(result.content).toContain('Aram');
    expect(result.debug?.segmentResults[0]?.meaningCheck).toMatchObject({
      missingDetails: [],
      pass: true,
    });
    expect(result.warnings).toEqual([]);
  });

  it('does not chase marginal student-feedback style scores when gates pass', async () => {
    let rewriteCount = 0;
    const result = await runRewritePipeline(
      {
        document:
          'The June 2026 pilot included 42 students across three workshops, with Aram reviewing the final submissions.',
        options: { includeDebug: true, maxRewriteIterations: 2 },
        provider: DEFAULT_PROVIDER,
        referenceExamples: DEFAULT_REFERENCE_EXAMPLES,
        styleProfile: studentFeedbackProfile,
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
            rewriteCount += 1;
            return {
              rewrittenText:
                'The June 2026 pilot included 42 students across three workshops, and Aram reviewed the final submissions. Make the feedback specific enough that each student understands which part of the work needs revision.',
            } satisfies RewriteOutput as T;
          }

          if (system.includes('Grade whether this resembles')) {
            return {
              ...passingGrade(78),
              revisionInstruction:
                'Replace the feedback with a specific example of one student task.',
            } satisfies StyleGrade as T;
          }

          if (system.includes('Check semantic fidelity')) {
            return meaning(true) as T;
          }

          return {
            document:
              'The June 2026 pilot included 42 students across three workshops, and Aram reviewed the final submissions. Make the feedback specific enough that each student understands which part of the work needs revision.',
          } satisfies FinalSmoothingOutput as T;
        },
      },
    );

    expect(rewriteCount).toBe(1);
    expect(result.debug?.segmentResults[0]?.attempts).toHaveLength(1);
    expect(
      result.debug?.segmentResults[0]?.attempts[0]?.revisionInstruction,
    ).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it('respects explicit student-feedback style thresholds above the retry floor', async () => {
    let rewriteCount = 0;
    const result = await runRewritePipeline(
      {
        document:
          'The June 2026 pilot included 42 students across three workshops, with Aram reviewing the final submissions.',
        options: {
          includeDebug: true,
          maxRewriteIterations: 2,
          styleThreshold: 90,
        },
        provider: DEFAULT_PROVIDER,
        referenceExamples: DEFAULT_REFERENCE_EXAMPLES,
        styleProfile: studentFeedbackProfile,
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
            rewriteCount += 1;
            return {
              rewrittenText:
                rewriteCount === 1
                  ? 'The June 2026 pilot included 42 students across three workshops, and Aram reviewed the final submissions. Make the feedback specific enough that each student understands which part of the work needs revision.'
                  : 'The June 2026 pilot included 42 students across three workshops, and Aram reviewed the final submissions. Name the exact part each student should revise, then explain why that change would improve the submission.',
            } satisfies RewriteOutput as T;
          }

          if (system.includes('Grade whether this resembles')) {
            return {
              ...passingGrade(rewriteCount === 1 ? 78 : 91),
              pass: rewriteCount > 1,
              revisionInstruction:
                rewriteCount === 1
                  ? 'Make the feedback more direct and concrete.'
                  : '',
            } satisfies StyleGrade as T;
          }

          if (system.includes('Check semantic fidelity')) {
            return meaning(true) as T;
          }

          return {
            document:
              'The June 2026 pilot included 42 students across three workshops, and Aram reviewed the final submissions. Name the exact part each student should revise, then explain why that change would improve the submission.',
          } satisfies FinalSmoothingOutput as T;
        },
      },
    );

    expect(rewriteCount).toBe(2);
    expect(result.debug?.segmentResults[0]?.attempts).toHaveLength(2);
    expect(result.debug?.segmentResults[0]?.attempts[0]).toMatchObject({
      revisionInstruction: 'Make the feedback more direct and concrete.',
    });
    expect(result.debug?.segmentResults[0]?.attempts[1]?.grade.overall).toBe(
      91,
    );
    expect(result.warnings).toEqual([]);
  });

  it('does not repair removed student-feedback praise back into the output', async () => {
    let repairCount = 0;
    const result = await runRewritePipeline(
      {
        document:
          'I am so proud of this incredible work, and you should feel amazing about how wonderful your answer is.',
        options: { includeDebug: true },
        provider: DEFAULT_PROVIDER,
        referenceExamples: DEFAULT_REFERENCE_EXAMPLES,
        styleProfile: studentFeedbackProfile,
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
              rewrittenText:
                'The feedback is too broad. Replace it with one specific part of the answer and explain why that part works.',
            } satisfies RewriteOutput as T;
          }

          if (system.includes('Grade whether this resembles')) {
            return passingGrade(95) as T;
          }

          if (system.includes('Check semantic fidelity')) {
            return {
              addedClaims: [],
              changedMeaning: [],
              missingDetails: [
                'so proud',
                'incredible',
                'amazing',
                'wonderful',
              ],
              pass: false,
              riskLevel: 'medium',
            } satisfies MeaningCheck as T;
          }

          if (system.includes('Repair the existing rewrite')) {
            repairCount += 1;
            return {
              rewrittenText:
                'Your answer is high-quality. Replace it with one specific part of the answer.',
            } satisfies RewriteOutput as T;
          }

          return {
            document:
              'The feedback is too broad. Replace it with one specific part of the answer and explain why that part works.',
          } satisfies FinalSmoothingOutput as T;
        },
      },
    );

    expect(repairCount).toBe(0);
    expect(result.content).toBe(
      'The feedback is too broad. Replace it with one specific part of the answer and explain why that part works.',
    );
    expect(result.debug?.segmentResults[0]?.meaningCheck).toMatchObject({
      missingDetails: [],
      pass: true,
    });
    expect(result.warnings).toEqual([]);
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

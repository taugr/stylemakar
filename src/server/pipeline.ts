import {
  DEFAULT_REFERENCE_EXAMPLES,
  DEFAULT_STYLE_THRESHOLD,
  MAX_REWRITE_ITERATIONS,
} from '../shared/defaults';
import {
  buildAntiGenericFeedback,
  buildAntiGenericPolicy,
  checkAntiGeneric,
  type AntiGenericPolicy,
} from '../shared/antiGeneric';
import { isRewritableSegment, segmentDocument } from '../shared/segment';
import {
  applyStudentFeedbackMeaningPolicy,
  buildStudentFeedbackFeedback,
  buildStudentFeedbackPolicy,
  checkStudentFeedback,
  type StudentFeedbackPolicy,
} from '../shared/studentFeedback';
import { countWords } from '../shared/text';
import type {
  FinalSmoothingOutput,
  MeaningCheck,
  MeaningRepresentation,
  PipelineRequest,
  PipelineResult,
  RewriteOutput,
  RewriteProgress,
  SegmentResult,
  StyleTargets,
  StyleGrade,
} from '../shared/types';
import { completeJson } from './lmStudio';

const PASSING_MEANING_CHECK: MeaningCheck = {
  addedClaims: [],
  changedMeaning: [],
  missingDetails: [],
  pass: true,
  riskLevel: 'low',
};

type PipelineModelClient = {
  completeJson: typeof completeJson;
  onProgress?: (progress: RewriteProgress) => void;
  runId?: string;
  signal?: AbortSignal;
};

const defaultClient: PipelineModelClient = {
  completeJson,
};

const DEFAULT_STYLE_TARGETS: StyleTargets = {
  directness: 'medium',
  explanationPattern: 'preserve_source_reasoning_structure',
  formality: 'medium',
  hedgingLevel: 'medium',
  paragraphLength: 'medium',
  tone: [],
  usesExamples: false,
  vocabulary: ['straightforward language'],
};

const STUDENT_FEEDBACK_STYLE_RETRY_FLOOR = 75;

function getMaxRewriteIterations(request: PipelineRequest): number {
  const configured = request.options?.maxRewriteIterations;

  if (typeof configured !== 'number' || !Number.isFinite(configured)) {
    return MAX_REWRITE_ITERATIONS;
  }

  return Math.max(0, Math.min(5, Math.floor(configured)));
}

function gradeFallback(threshold: number): StyleGrade {
  return {
    directness: threshold,
    explanationStyle: threshold,
    issues: [],
    overall: threshold,
    paragraphShape: threshold,
    pass: true,
    revisionInstruction: '',
    sentenceRhythm: threshold,
    toneMatch: threshold,
    vocabularyMatch: threshold,
  };
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeMeaningCheck(value: MeaningCheck): MeaningCheck {
  return {
    addedClaims: normalizeStringArray(value.addedClaims),
    changedMeaning: normalizeStringArray(value.changedMeaning),
    missingDetails: normalizeStringArray(value.missingDetails),
    pass: value.pass === true,
    repairInstruction:
      typeof value.repairInstruction === 'string'
        ? value.repairInstruction
        : undefined,
    riskLevel:
      value.riskLevel === 'medium' || value.riskLevel === 'high'
        ? value.riskLevel
        : 'low',
  };
}

function removeAntiGenericMissingDetails(
  meaningCheck: MeaningCheck,
  antiGenericPolicy: AntiGenericPolicy,
): MeaningCheck {
  if (!antiGenericPolicy.active || meaningCheck.missingDetails.length === 0) {
    return meaningCheck;
  }

  const missingDetails = meaningCheck.missingDetails.filter((detail) => {
    const lowerDetail = detail.toLowerCase();

    return !antiGenericPolicy.phrases.some((phrase) => {
      const lowerPhrase = phrase.toLowerCase();
      return (
        lowerPhrase.includes(lowerDetail) || lowerDetail.includes(lowerPhrase)
      );
    });
  });

  return {
    ...meaningCheck,
    missingDetails,
    pass:
      missingDetails.length === 0 &&
      meaningCheck.addedClaims.length === 0 &&
      meaningCheck.changedMeaning.length === 0,
  };
}

function normalizeMeaningRepresentation(
  value: Partial<MeaningRepresentation>,
): MeaningRepresentation {
  return {
    caveats: normalizeStringArray(value.caveats),
    claims: normalizeStringArray(value.claims),
    conclusions: normalizeStringArray(value.conclusions),
    constraints: normalizeStringArray(value.constraints),
    examples: normalizeStringArray(value.examples),
    mandatoryDetails: normalizeStringArray(value.mandatoryDetails),
  };
}

function normalizeLevel(value: unknown): 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'high' ? value : 'medium';
}

function normalizeParagraphLength(value: unknown): 'short' | 'medium' | 'long' {
  return value === 'short' || value === 'long' ? value : 'medium';
}

function normalizeStyleTargets(value: Partial<StyleTargets>): StyleTargets {
  return {
    directness: normalizeLevel(value.directness),
    explanationPattern:
      typeof value.explanationPattern === 'string' &&
      value.explanationPattern.trim().length > 0
        ? value.explanationPattern
        : DEFAULT_STYLE_TARGETS.explanationPattern,
    formality: normalizeLevel(value.formality),
    hedgingLevel: normalizeLevel(value.hedgingLevel),
    paragraphLength: normalizeParagraphLength(value.paragraphLength),
    tone: normalizeStringArray(value.tone),
    usesExamples: value.usesExamples === true,
    vocabulary: normalizeStringArray(value.vocabulary),
  };
}

function normalizeScore(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(100, Math.max(0, value));
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);

    if (Number.isFinite(parsed)) {
      return Math.min(100, Math.max(0, parsed));
    }

    const normalized = value.toLowerCase();

    if (normalized.includes('high')) {
      return 90;
    }

    if (normalized.includes('medium')) {
      return 70;
    }

    if (normalized.includes('low')) {
      return 40;
    }
  }

  return fallback;
}

function normalizeStyleGrade(
  value: Partial<StyleGrade>,
  threshold: number,
): StyleGrade {
  const fallback = gradeFallback(threshold);
  const overall = normalizeScore(value.overall, fallback.overall);

  return {
    directness: normalizeScore(value.directness, fallback.directness),
    explanationStyle: normalizeScore(
      value.explanationStyle,
      fallback.explanationStyle,
    ),
    issues: normalizeStringArray(value.issues),
    overall,
    paragraphShape: normalizeScore(
      value.paragraphShape,
      fallback.paragraphShape,
    ),
    pass: value.pass ?? overall >= threshold,
    revisionInstruction:
      typeof value.revisionInstruction === 'string'
        ? value.revisionInstruction
        : '',
    sentenceRhythm: normalizeScore(
      value.sentenceRhythm,
      fallback.sentenceRhythm,
    ),
    toneMatch: normalizeScore(value.toneMatch, fallback.toneMatch),
    vocabularyMatch: normalizeScore(
      value.vocabularyMatch,
      fallback.vocabularyMatch,
    ),
  };
}

function trimForPrompt(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit).trimEnd()}...` : value;
}

function buildCompactStylePrompt(
  request: PipelineRequest,
  styleTargets?: StyleTargets,
): string {
  return [
    `Target style: ${request.styleProfile.name}. ${trimForPrompt(
      request.styleProfile.description,
      180,
    )}`,
    `Rules: ${request.styleProfile.rules
      .slice(0, 4)
      .map((rule) => trimForPrompt(rule, 120))
      .join(' ')}`,
    `Avoid: ${request.styleProfile.antiRules
      .slice(0, 3)
      .map((rule) => trimForPrompt(rule, 120))
      .join(' ')}`,
    styleTargets
      ? `Style targets: directness=${styleTargets.directness}; formality=${styleTargets.formality}; paragraphLength=${styleTargets.paragraphLength}; explanationPattern=${styleTargets.explanationPattern}; hedging=${styleTargets.hedgingLevel}; tone=${styleTargets.tone.join(', ') || 'preserve profile tone'}; vocabulary=${styleTargets.vocabulary.join(', ') || 'broad profile vocabulary'}.`
      : '',
  ].join('\n');
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((token) => token.length > 2) ?? [],
  );
}

export function selectReferenceExamples(
  paragraph: string,
  referenceExamples: string[],
  limit = 2,
): string[] {
  const paragraphTokens = tokenize(paragraph);

  return referenceExamples
    .map((example, index) => {
      const score = [...tokenize(example)].filter((token) =>
        paragraphTokens.has(token),
      ).length;

      return { example, index, score };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((candidate) => candidate.example);
}

function buildRewritePrompt(
  request: PipelineRequest,
  styleTargets: StyleTargets,
  selectedReferenceExamples: string[],
  meaningRepresentation: MeaningRepresentation,
  antiGenericPolicy: AntiGenericPolicy,
  studentFeedbackPolicy: StudentFeedbackPolicy,
): string {
  return [
    buildCompactStylePrompt(request, styleTargets),
    antiGenericPolicy.instruction,
    studentFeedbackPolicy.instruction,
    `Meaning to preserve: ${JSON.stringify(meaningRepresentation)}`,
    'Reference examples:',
    ...(selectedReferenceExamples.length > 0
      ? selectedReferenceExamples
      : DEFAULT_REFERENCE_EXAMPLES.slice(0, 2)
    ).map((example) => `- ${trimForPrompt(example, 220)}`),
  ].join('\n');
}

async function extractMeaning(
  originalText: string,
  request: PipelineRequest,
  antiGenericPolicy: AntiGenericPolicy,
  client: PipelineModelClient,
): Promise<MeaningRepresentation> {
  const result = await client.completeJson<MeaningRepresentation>(
    [
      {
        content: [
          'Return only valid JSON. No markdown. Extract meaning from the paragraph. Do not rewrite. JSON keys: claims, caveats, constraints, examples, conclusions, mandatoryDetails. Include numbers, names, dates, confidence, uncertainty, and requirements in mandatoryDetails.',
          antiGenericPolicy.active
            ? 'Do not treat generic marketing filler or anti-generic phrases as mandatory meaning unless they encode a concrete factual requirement.'
            : '',
        ].join(' '),
        role: 'system',
      },
      {
        content: `Paragraph:\n${originalText}`,
        role: 'user',
      },
    ],
    request.provider,
  );

  return normalizeMeaningRepresentation(result);
}

async function identifyStyleTargets(
  originalText: string,
  request: PipelineRequest,
  selectedReferenceExamples: string[],
  client: PipelineModelClient,
): Promise<StyleTargets> {
  const result = await client.completeJson<StyleTargets>(
    [
      {
        content:
          'Return only valid JSON. No markdown. Identify behavior-level style targets for rewriting this paragraph. Do not mimic typos, one-off phrases, or accidental quirks. JSON keys: directness, formality, paragraphLength, explanationPattern, usesExamples, hedgingLevel, tone, vocabulary.',
        role: 'system',
      },
      {
        content: [
          buildCompactStylePrompt(request),
          `Paragraph:\n${originalText}`,
          `Relevant reference examples:\n${selectedReferenceExamples
            .map((example) => `- ${trimForPrompt(example, 220)}`)
            .join('\n')}`,
        ].join('\n\n'),
        role: 'user',
      },
    ],
    request.provider,
  );

  return normalizeStyleTargets(result);
}

async function rewriteSegment(
  originalText: string,
  request: PipelineRequest,
  meaningRepresentation: MeaningRepresentation,
  styleTargets: StyleTargets,
  selectedReferenceExamples: string[],
  previousFeedback: string | undefined,
  antiGenericPolicy: AntiGenericPolicy,
  studentFeedbackPolicy: StudentFeedbackPolicy,
  client: PipelineModelClient,
): Promise<RewriteOutput> {
  return client.completeJson<RewriteOutput>(
    [
      {
        content:
          'Return only valid JSON. No markdown. Rewrite the paragraph to match behavior-level style targets. Preserve the extracted meaning exactly. Meaning wins over style. Preserve reasoning structure, caveats, constraints, confidence, names, dates, and numbers. Avoid generic AI polish and parody. JSON shape: {"rewrittenText":"..."}.',
        role: 'system',
      },
      {
        content: [
          buildRewritePrompt(
            request,
            styleTargets,
            selectedReferenceExamples,
            meaningRepresentation,
            antiGenericPolicy,
            studentFeedbackPolicy,
          ),
          previousFeedback
            ? `Targeted revision feedback:\n${previousFeedback}\nImprove the existing rewrite. Do not restart from scratch.`
            : '',
          `Original text:\n${originalText}`,
        ].join('\n\n'),
        role: 'user',
      },
    ],
    request.provider,
  );
}

async function gradeStyle(
  originalText: string,
  rewrittenText: string,
  request: PipelineRequest,
  styleTargets: StyleTargets,
  selectedReferenceExamples: string[],
  antiGenericPolicy: AntiGenericPolicy,
  studentFeedbackPolicy: StudentFeedbackPolicy,
  client: PipelineModelClient,
): Promise<StyleGrade> {
  const threshold = request.options?.styleThreshold ?? DEFAULT_STYLE_THRESHOLD;
  const grade = await client.completeJson<StyleGrade>(
    [
      {
        content:
          'Return only valid JSON. No markdown. Grade whether this resembles the user writing style, not whether it is polished. Do not reward generic polish, added detail, stronger arguments, persuasiveness, or corporate language. Evaluate directness, tone, vocabulary patterns, sentence rhythm, paragraph structure, explanation style, caveats, examples, and overall resemblance. JSON keys: overall, directness, vocabularyMatch, sentenceRhythm, toneMatch, paragraphShape, explanationStyle, issues, revisionInstruction, pass.',
        role: 'system',
      },
      {
        content: [
          `Target style: ${request.styleProfile.name}. ${trimForPrompt(
            request.styleProfile.description,
            180,
          )}`,
          `Style targets: ${JSON.stringify(styleTargets)}`,
          antiGenericPolicy.instruction,
          antiGenericPolicy.active
            ? 'If the rewrite contains one of the anti-generic phrases, it must fail even if it reads fluently.'
            : '',
          studentFeedbackPolicy.instruction,
          studentFeedbackPolicy.active
            ? 'If student feedback invents unsupported details or uses vague praise, it must fail even if it sounds constructive.'
            : '',
          `Relevant reference examples:\n${selectedReferenceExamples
            .map((example) => `- ${trimForPrompt(example, 220)}`)
            .join('\n')}`,
          `Default pass threshold: ${threshold}`,
          `Original:\n${originalText}`,
          `Rewrite:\n${rewrittenText}`,
        ].join('\n\n'),
        role: 'user',
      },
    ],
    request.provider,
  );

  return normalizeStyleGrade(grade, threshold);
}

async function checkMeaning(
  originalText: string,
  rewrittenText: string,
  request: PipelineRequest,
  antiGenericPolicy: AntiGenericPolicy,
  studentFeedbackPolicy: StudentFeedbackPolicy,
  client: PipelineModelClient,
): Promise<MeaningCheck> {
  const result = await client.completeJson<MeaningCheck>(
    [
      {
        content: [
          'Return only valid JSON. No markdown. Check semantic fidelity. Meaning wins over style. Fail if facts, claims, numbers, names, dates, caveats, constraints, requirements, conclusions, confidence, or uncertainty changed. Fail if the rewrite invents claims, removes qualifications, strengthens weak claims, weakens strong claims, changes intent, or adds recommendations. JSON keys: pass, missingDetails, addedClaims, changedMeaning, riskLevel, optional repairInstruction.',
          antiGenericPolicy.active
            ? 'Do not fail solely because the rewrite removed generic marketing filler or anti-generic phrases that do not encode concrete factual requirements.'
            : '',
          studentFeedbackPolicy.active
            ? 'For student feedback, allow generic improvement framing such as asking the student to add, explain, revise, or point to a specific example. Fail only when the rewrite invents facts about the submitted work.'
            : '',
        ].join(' '),
        role: 'system',
      },
      {
        content: [
          `Original:\n${originalText}`,
          `Rewrite:\n${rewrittenText}`,
        ].join('\n\n'),
        role: 'user',
      },
    ],
    request.provider,
  );

  return applyStudentFeedbackMeaningPolicy(
    removeAntiGenericMissingDetails(
      normalizeMeaningCheck(result),
      antiGenericPolicy,
    ),
    studentFeedbackPolicy,
  );
}

async function repairMeaning(
  originalText: string,
  rewrittenText: string,
  meaningCheck: MeaningCheck,
  request: PipelineRequest,
  meaningRepresentation: MeaningRepresentation,
  styleTargets: StyleTargets,
  antiGenericPolicy: AntiGenericPolicy,
  studentFeedbackPolicy: StudentFeedbackPolicy,
  antiGenericFeedback: string | undefined,
  studentFeedbackFeedback: string | undefined,
  client: PipelineModelClient,
): Promise<string> {
  const repair = await client.completeJson<RewriteOutput>(
    [
      {
        content:
          'Return only valid JSON. No markdown. Repair the existing rewrite so it restores missing or changed meaning while preserving behavior-level style targets where possible. Meaning wins over style. JSON shape: {"rewrittenText":"..."}.',
        role: 'system',
      },
      {
        content: [
          buildCompactStylePrompt(request, styleTargets),
          antiGenericPolicy.instruction,
          studentFeedbackPolicy.instruction,
          `Extracted meaning to preserve: ${JSON.stringify(meaningRepresentation)}`,
          `Original:\n${originalText}`,
          `Current rewrite:\n${rewrittenText}`,
          `Meaning feedback:\n${JSON.stringify(meaningCheck)}`,
          antiGenericFeedback
            ? `Anti-generic feedback:\n${antiGenericFeedback}`
            : '',
          studentFeedbackFeedback
            ? `Student-feedback feedback:\n${studentFeedbackFeedback}`
            : '',
        ].join('\n\n'),
        role: 'user',
      },
    ],
    request.provider,
  );

  return repair.rewrittenText;
}

async function smoothDocument(
  document: string,
  request: PipelineRequest,
  client: PipelineModelClient,
): Promise<FinalSmoothingOutput> {
  if (request.options?.finalSmoothing !== true) {
    return { document };
  }

  return client.completeJson<FinalSmoothingOutput>(
    [
      {
        content:
          'Return only valid JSON. No markdown. Edit conservatively. Improve transitions, repetition, flow, formatting, and consistency only. Do not add examples, introduce arguments, remove content, restructure major sections, alter conclusions, or change meaning. JSON shape: {"document":"..."}.',
        role: 'system',
      },
      {
        content: [
          buildCompactStylePrompt(request),
          `Paragraph or adjacent paragraphs:\n${document}`,
        ].join('\n\n'),
        role: 'user',
      },
    ],
    request.provider,
  );
}

export async function runRewritePipeline(
  request: PipelineRequest,
  client: PipelineModelClient = defaultClient,
): Promise<PipelineResult> {
  const startedAt = performance.now();
  const originalCompleteJson = client.completeJson;
  let modelCalls = 0;
  client = {
    ...client,
    completeJson: async <T>(
      ...args: Parameters<typeof originalCompleteJson>
    ): Promise<T> => {
      modelCalls += 1;
      return originalCompleteJson<T>(...args);
    },
  };
  const runId = client.runId ?? crypto.randomUUID();
  const segments = segmentDocument(request.document);
  const segmentResults: SegmentResult[] = [];
  const outputSegments: string[] = [];
  const warnings: string[] = [];
  const threshold = request.options?.styleThreshold ?? DEFAULT_STYLE_THRESHOLD;
  const maxRewriteIterations = getMaxRewriteIterations(request);
  const runMeaningCheck = request.options?.runMeaningCheck !== false;
  const stageLatencyMs: Partial<Record<RewriteProgress['stage'], number>> = {};
  let previousStage: RewriteProgress['stage'] | undefined;
  let previousStageStartedAt = performance.now();

  const report = (
    stage: RewriteProgress['stage'],
    segmentIndex: number,
    attempt: number,
    message: string,
  ): void => {
    if (client.signal?.aborted) {
      throw new DOMException('Rewrite cancelled.', 'AbortError');
    }

    const now = performance.now();

    if (previousStage) {
      stageLatencyMs[previousStage] =
        (stageLatencyMs[previousStage] ?? 0) +
        Math.round(now - previousStageStartedAt);
    }

    previousStage = stage;
    previousStageStartedAt = now;
    client.onProgress?.({
      attempt,
      message,
      runId,
      segmentCount: segments.length,
      segmentIndex,
      stage,
    });
  };

  report('queued', 0, 0, 'Rewrite queued.');

  for (const [segmentIndex, segment] of segments.entries()) {
    if (!isRewritableSegment(segment)) {
      outputSegments.push(segment.originalText);
      continue;
    }

    let candidate = segment.originalText;
    let feedback: string | undefined;
    const attempts = [];
    const referencePool =
      request.referenceExamples.length > 0
        ? request.referenceExamples
        : DEFAULT_REFERENCE_EXAMPLES;
    const selectedReferenceExamples = selectReferenceExamples(
      segment.originalText,
      referencePool,
    );
    const antiGenericPolicy = buildAntiGenericPolicy(
      request.styleProfile,
      segment.originalText,
    );
    const studentFeedbackPolicy = buildStudentFeedbackPolicy(
      request.styleProfile,
    );
    report(
      'extracting-meaning',
      segmentIndex,
      0,
      `Extracting meaning from section ${segmentIndex + 1} of ${segments.length}.`,
    );
    const meaningRepresentation = await extractMeaning(
      segment.originalText,
      request,
      antiGenericPolicy,
      client,
    );
    report(
      'analysing-style',
      segmentIndex,
      0,
      `Analysing the selected voice for section ${segmentIndex + 1}.`,
    );
    const styleTargets = await identifyStyleTargets(
      segment.originalText,
      request,
      selectedReferenceExamples,
      client,
    );
    const segmentWarnings: string[] = [];

    for (let iteration = 0; iteration <= maxRewriteIterations; iteration += 1) {
      report(
        'rewriting',
        segmentIndex,
        iteration + 1,
        `Rewriting section ${segmentIndex + 1}, attempt ${iteration + 1}.`,
      );
      const rewrite = await rewriteSegment(
        iteration === 0 ? segment.originalText : candidate,
        request,
        meaningRepresentation,
        styleTargets,
        selectedReferenceExamples,
        feedback,
        antiGenericPolicy,
        studentFeedbackPolicy,
        client,
      );
      candidate = rewrite.rewrittenText;

      report(
        'grading-style',
        segmentIndex,
        iteration + 1,
        `Checking voice match for section ${segmentIndex + 1}.`,
      );
      const grade = await gradeStyle(
        segment.originalText,
        candidate,
        request,
        styleTargets,
        selectedReferenceExamples,
        antiGenericPolicy,
        studentFeedbackPolicy,
        client,
      );
      const antiGenericCheck = checkAntiGeneric(candidate, antiGenericPolicy);
      const antiGenericFeedback = buildAntiGenericFeedback(antiGenericCheck);
      const studentFeedbackCheck = checkStudentFeedback(
        candidate,
        segment.originalText,
        studentFeedbackPolicy,
      );
      const studentFeedbackFeedback =
        buildStudentFeedbackFeedback(studentFeedbackCheck);
      const gradePassed = grade.pass || grade.overall >= threshold;
      const gatesPassed = antiGenericCheck.pass && studentFeedbackCheck.pass;
      const studentFeedbackAcceptableStyleThreshold =
        request.options?.styleThreshold ?? STUDENT_FEEDBACK_STYLE_RETRY_FLOOR;
      const studentFeedbackDraftIsAcceptable =
        studentFeedbackPolicy.active &&
        gatesPassed &&
        grade.overall >= studentFeedbackAcceptableStyleThreshold;
      const revisionInstruction = studentFeedbackDraftIsAcceptable
        ? undefined
        : antiGenericFeedback ||
          studentFeedbackFeedback ||
          (gradePassed ? undefined : grade.revisionInstruction);
      attempts.push({
        grade,
        iteration,
        revisionInstruction,
        rewrittenText: candidate,
      });

      if ((gradePassed || studentFeedbackDraftIsAcceptable) && gatesPassed) {
        break;
      }

      feedback = [
        antiGenericFeedback,
        studentFeedbackFeedback,
        gradePassed ? '' : grade.revisionInstruction,
      ]
        .filter(Boolean)
        .join('\n');
    }

    report(
      'checking-meaning',
      segmentIndex,
      0,
      `Checking meaning for section ${segmentIndex + 1}.`,
    );
    let meaningCheck = runMeaningCheck
      ? await checkMeaning(
          segment.originalText,
          candidate,
          request,
          antiGenericPolicy,
          studentFeedbackPolicy,
          client,
        )
      : PASSING_MEANING_CHECK;

    if (runMeaningCheck && !meaningCheck.pass) {
      report(
        'repairing-meaning',
        segmentIndex,
        1,
        `Repairing meaning in section ${segmentIndex + 1}.`,
      );
      const antiGenericBeforeRepair = checkAntiGeneric(
        candidate,
        antiGenericPolicy,
      );
      const candidateBeforeMeaningRepair = candidate;
      const studentFeedbackBeforeRepair = checkStudentFeedback(
        candidate,
        segment.originalText,
        studentFeedbackPolicy,
      );
      candidate = await repairMeaning(
        segment.originalText,
        candidate,
        meaningCheck,
        request,
        meaningRepresentation,
        styleTargets,
        antiGenericPolicy,
        studentFeedbackPolicy,
        buildAntiGenericFeedback(antiGenericBeforeRepair),
        buildStudentFeedbackFeedback(
          checkStudentFeedback(
            candidate,
            segment.originalText,
            studentFeedbackPolicy,
          ),
        ),
        client,
      );
      meaningCheck = await checkMeaning(
        segment.originalText,
        candidate,
        request,
        antiGenericPolicy,
        studentFeedbackPolicy,
        client,
      );
      const antiGenericAfterRepair = checkAntiGeneric(
        candidate,
        antiGenericPolicy,
      );

      if (!antiGenericAfterRepair.pass) {
        candidate = await repairMeaning(
          segment.originalText,
          candidate,
          meaningCheck,
          request,
          meaningRepresentation,
          styleTargets,
          antiGenericPolicy,
          studentFeedbackPolicy,
          buildAntiGenericFeedback(antiGenericAfterRepair),
          buildStudentFeedbackFeedback(
            checkStudentFeedback(
              candidate,
              segment.originalText,
              studentFeedbackPolicy,
            ),
          ),
          client,
        );
        meaningCheck = await checkMeaning(
          segment.originalText,
          candidate,
          request,
          antiGenericPolicy,
          studentFeedbackPolicy,
          client,
        );
      }

      const studentFeedbackAfterRepair = checkStudentFeedback(
        candidate,
        segment.originalText,
        studentFeedbackPolicy,
      );

      if (!studentFeedbackAfterRepair.pass) {
        candidate = await repairMeaning(
          segment.originalText,
          candidate,
          meaningCheck,
          request,
          meaningRepresentation,
          styleTargets,
          antiGenericPolicy,
          studentFeedbackPolicy,
          '',
          buildStudentFeedbackFeedback(studentFeedbackAfterRepair),
          client,
        );
        meaningCheck = await checkMeaning(
          segment.originalText,
          candidate,
          request,
          antiGenericPolicy,
          studentFeedbackPolicy,
          client,
        );
      }

      const studentFeedbackAfterRepairs = checkStudentFeedback(
        candidate,
        segment.originalText,
        studentFeedbackPolicy,
      );

      if (
        !studentFeedbackAfterRepairs.pass &&
        studentFeedbackBeforeRepair.pass
      ) {
        candidate = candidateBeforeMeaningRepair;
        meaningCheck = await checkMeaning(
          segment.originalText,
          candidate,
          request,
          antiGenericPolicy,
          studentFeedbackPolicy,
          client,
        );
      }

      if (!meaningCheck.pass) {
        const warning = `Meaning check still failing for ${segment.id}.`;
        warnings.push(warning);
        segmentWarnings.push(warning);
      }
    }

    const finalAntiGenericCheck = checkAntiGeneric(
      candidate,
      antiGenericPolicy,
    );

    if (!finalAntiGenericCheck.pass) {
      const warning = `Anti-generic check still failing for ${segment.id}: ${finalAntiGenericCheck.matches
        .map((match) => match.phrase)
        .join(', ')}.`;
      warnings.push(warning);
      segmentWarnings.push(warning);
    }

    const finalStudentFeedbackCheck = checkStudentFeedback(
      candidate,
      segment.originalText,
      studentFeedbackPolicy,
    );

    if (!finalStudentFeedbackCheck.pass) {
      const warning = `Student-feedback check still failing for ${segment.id}: ${finalStudentFeedbackCheck.matches
        .map((match) => match.phrase)
        .join(', ')}.`;
      warnings.push(warning);
      segmentWarnings.push(warning);
    }

    outputSegments.push(candidate);
    segmentResults.push({
      attempts,
      finalText: candidate,
      meaningCheck: meaningCheck ?? PASSING_MEANING_CHECK,
      meaningRepresentation,
      originalText: segment.originalText,
      selectedReferenceExamples,
      styleTargets,
      warnings: segmentWarnings,
    });
  }

  report(
    'assembling',
    segments.length,
    0,
    'Assembling the rewritten document.',
  );
  const assembled = outputSegments.join('\n\n');
  const finalSmoothing = await smoothDocument(assembled, request, client);
  const content = finalSmoothing.document;
  report('complete', segments.length, 0, 'Rewrite complete.');

  return {
    content,
    debug: request.options?.includeDebug
      ? {
          diagnostics: {
            elapsedMs: Math.round(performance.now() - startedAt),
            modelCalls,
            runId,
            stageLatencyMs,
          },
          finalSmoothing,
          segmentResults,
        }
      : undefined,
    model: request.provider.model ?? 'gemma-4',
    segments: segments.map((segment) => {
      const result = segmentResults.find(
        (candidate) => candidate.originalText === segment.originalText,
      );

      return {
        finalText: result?.finalText ?? segment.originalText,
        id: segment.id,
        originalText: segment.originalText,
        rewritten: isRewritableSegment(segment),
        type: segment.type,
      };
    }),
    warnings,
    wordCount: {
      original: countWords(request.document),
      rewritten: countWords(content),
    },
  };
}

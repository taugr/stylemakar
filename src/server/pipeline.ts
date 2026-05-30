import {
  DEFAULT_REFERENCE_EXAMPLES,
  DEFAULT_STYLE_THRESHOLD,
  MAX_REWRITE_ITERATIONS,
} from '../shared/defaults';
import { isRewritableSegment, segmentDocument } from '../shared/segment';
import { countWords } from '../shared/text';
import type {
  FinalSmoothingOutput,
  MeaningCheck,
  MeaningRepresentation,
  PipelineRequest,
  PipelineResult,
  RewriteOutput,
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
): string {
  return [
    buildCompactStylePrompt(request, styleTargets),
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
  client: PipelineModelClient,
): Promise<MeaningRepresentation> {
  const result = await client.completeJson<MeaningRepresentation>(
    [
      {
        content:
          'Return only valid JSON. No markdown. Extract meaning from the paragraph. Do not rewrite. JSON keys: claims, caveats, constraints, examples, conclusions, mandatoryDetails. Include numbers, names, dates, confidence, uncertainty, and requirements in mandatoryDetails.',
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
  client: PipelineModelClient,
): Promise<MeaningCheck> {
  const result = await client.completeJson<MeaningCheck>(
    [
      {
        content:
          'Return only valid JSON. No markdown. Check semantic fidelity. Meaning wins over style. Fail if facts, claims, numbers, names, dates, caveats, constraints, requirements, conclusions, confidence, or uncertainty changed. Fail if the rewrite invents claims, removes qualifications, strengthens weak claims, weakens strong claims, changes intent, or adds recommendations. JSON keys: pass, missingDetails, addedClaims, changedMeaning, riskLevel, optional repairInstruction.',
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

  return normalizeMeaningCheck(result);
}

async function repairMeaning(
  originalText: string,
  rewrittenText: string,
  meaningCheck: MeaningCheck,
  request: PipelineRequest,
  meaningRepresentation: MeaningRepresentation,
  styleTargets: StyleTargets,
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
          `Extracted meaning to preserve: ${JSON.stringify(meaningRepresentation)}`,
          `Original:\n${originalText}`,
          `Current rewrite:\n${rewrittenText}`,
          `Meaning feedback:\n${JSON.stringify(meaningCheck)}`,
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
  const segments = segmentDocument(request.document);
  const segmentResults: SegmentResult[] = [];
  const outputSegments: string[] = [];
  const warnings: string[] = [];
  const threshold = request.options?.styleThreshold ?? DEFAULT_STYLE_THRESHOLD;
  const maxRewriteIterations = getMaxRewriteIterations(request);
  const runMeaningCheck = request.options?.runMeaningCheck !== false;

  for (const segment of segments) {
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
    const meaningRepresentation = await extractMeaning(
      segment.originalText,
      request,
      client,
    );
    const styleTargets = await identifyStyleTargets(
      segment.originalText,
      request,
      selectedReferenceExamples,
      client,
    );

    for (let iteration = 0; iteration <= maxRewriteIterations; iteration += 1) {
      const rewrite = await rewriteSegment(
        iteration === 0 ? segment.originalText : candidate,
        request,
        meaningRepresentation,
        styleTargets,
        selectedReferenceExamples,
        feedback,
        client,
      );
      candidate = rewrite.rewrittenText;

      const grade = await gradeStyle(
        segment.originalText,
        candidate,
        request,
        styleTargets,
        selectedReferenceExamples,
        client,
      );
      attempts.push({
        grade,
        iteration,
        revisionInstruction: grade.pass ? undefined : grade.revisionInstruction,
        rewrittenText: candidate,
      });

      if (grade.pass || grade.overall >= threshold) {
        break;
      }

      feedback = grade.revisionInstruction;
    }

    let meaningCheck = runMeaningCheck
      ? await checkMeaning(segment.originalText, candidate, request, client)
      : PASSING_MEANING_CHECK;
    const segmentWarnings: string[] = [];

    if (runMeaningCheck && !meaningCheck.pass) {
      candidate = await repairMeaning(
        segment.originalText,
        candidate,
        meaningCheck,
        request,
        meaningRepresentation,
        styleTargets,
        client,
      );
      meaningCheck = await checkMeaning(
        segment.originalText,
        candidate,
        request,
        client,
      );

      if (!meaningCheck.pass) {
        const warning = `Meaning check still failing for ${segment.id}.`;
        warnings.push(warning);
        segmentWarnings.push(warning);
      }
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

  const assembled = outputSegments.join('\n\n');
  const finalSmoothing = await smoothDocument(assembled, request, client);
  const content = finalSmoothing.document;

  return {
    content,
    debug: request.options?.includeDebug
      ? {
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

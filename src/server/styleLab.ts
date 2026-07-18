import type {
  AdaptiveVoiceComparisonRequest,
  AdaptiveVoiceComparisonResponse,
  ModelProviderSettings,
} from '../shared/types';
import { completeJson } from './lmStudio';

type ChatMessage = {
  role: 'system' | 'user';
  content: string;
};

type CompletionClient = <T>(
  messages: ChatMessage[],
  provider: ModelProviderSettings,
) => Promise<T>;

type GeneratedPair = {
  candidateA?: {
    text?: string;
    instruction?: string;
    avoidInstruction?: string;
  };
  candidateB?: {
    text?: string;
    instruction?: string;
    avoidInstruction?: string;
  };
};

type MeaningVerdict = {
  candidateA?: { pass?: boolean; risks?: string[] };
  candidateB?: { pass?: boolean; risks?: string[] };
};

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Adaptive comparison returned an empty ${field}.`);
  }
  return value.trim();
}

export function validateAdaptiveComparisonRequest(
  candidate: unknown,
): AdaptiveVoiceComparisonRequest {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Adaptive comparison request must contain an object.');
  }

  const request = candidate as AdaptiveVoiceComparisonRequest;
  requireText(request.sourceText, 'source text');

  if (!request.dimension || !request.voice || !request.provider) {
    throw new Error(
      'Adaptive comparison requires a dimension, voice, and provider.',
    );
  }

  if (
    !Array.isArray(request.preservedDetails) ||
    request.preservedDetails.length === 0 ||
    request.preservedDetails.some(
      (detail) => typeof detail !== 'string' || detail.trim().length === 0,
    )
  ) {
    throw new Error('Adaptive comparison requires preserved meaning details.');
  }

  return request;
}

async function generateAdaptiveVoiceComparisonOnce(
  input: AdaptiveVoiceComparisonRequest,
  client: CompletionClient = completeJson,
): Promise<AdaptiveVoiceComparisonResponse> {
  const request = validateAdaptiveComparisonRequest(input);
  const pair = await client<GeneratedPair>(
    [
      {
        role: 'system',
        content: [
          'Create two alternative rewrites of the same source.',
          `Vary only this style dimension: ${request.dimension}.`,
          'The alternatives must represent meaningfully different preferences without making one obviously better.',
          'Preserve every named detail, number, condition, uncertainty, and conclusion.',
          'Return JSON only with candidateA and candidateB. Each candidate has text, instruction, and optional avoidInstruction.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          currentVoice: request.voice,
          preservedDetails: request.preservedDetails,
          sourceText: request.sourceText,
        }),
      },
    ],
    request.provider,
  );
  const candidateA = {
    avoidInstruction:
      typeof pair.candidateA?.avoidInstruction === 'string'
        ? pair.candidateA.avoidInstruction.trim()
        : undefined,
    instruction: requireText(
      pair.candidateA?.instruction,
      'candidate A instruction',
    ),
    text: requireText(pair.candidateA?.text, 'candidate A'),
  };
  const candidateB = {
    avoidInstruction:
      typeof pair.candidateB?.avoidInstruction === 'string'
        ? pair.candidateB.avoidInstruction.trim()
        : undefined,
    instruction: requireText(
      pair.candidateB?.instruction,
      'candidate B instruction',
    ),
    text: requireText(pair.candidateB?.text, 'candidate B'),
  };

  if (candidateA.text === candidateB.text) {
    throw new Error('Adaptive comparison candidates must be different.');
  }

  const verdict = await client<MeaningVerdict>(
    [
      {
        role: 'system',
        content:
          'Check both candidate rewrites against the source. Return JSON with candidateA and candidateB; each has pass and risks. Pass only when every preserved detail and the complete meaning remain intact.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          candidateA: candidateA.text,
          candidateB: candidateB.text,
          preservedDetails: request.preservedDetails,
          sourceText: request.sourceText,
        }),
      },
    ],
    request.provider,
  );
  const risks = [
    ...(Array.isArray(verdict.candidateA?.risks)
      ? verdict.candidateA.risks
      : []),
    ...(Array.isArray(verdict.candidateB?.risks)
      ? verdict.candidateB.risks
      : []),
  ].filter((risk): risk is string => typeof risk === 'string');
  const candidateAPass = verdict.candidateA?.pass === true;
  const candidateBPass = verdict.candidateB?.pass === true;

  if (!candidateAPass || !candidateBPass) {
    throw new Error(
      `Adaptive comparison failed meaning preservation${risks.length > 0 ? `: ${risks.join(' ')}` : '.'}`,
    );
  }

  return {
    candidateA,
    candidateB,
    dimension: request.dimension,
    id: `generated-${crypto.randomUUID()}`,
    meaningCheck: {
      candidateA: candidateAPass,
      candidateB: candidateBPass,
      risks,
    },
    preservedDetails: request.preservedDetails,
    promptVersion: 1,
    source: 'generated',
    sourceText: request.sourceText,
  };
}

export async function generateAdaptiveVoiceComparison(
  input: AdaptiveVoiceComparisonRequest,
  client: CompletionClient = completeJson,
): Promise<AdaptiveVoiceComparisonResponse> {
  const request = validateAdaptiveComparisonRequest(input);
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await generateAdaptiveVoiceComparisonOnce(request, client);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Adaptive comparison failed after two attempts: ${
      lastError instanceof Error
        ? lastError.message
        : 'unknown generation error'
    }`,
  );
}

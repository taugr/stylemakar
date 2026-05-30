import type {
  ModelInfo,
  ModelProviderSettings,
  PipelineResult,
  StyleProfile,
} from '../shared/types';

export type HealthResponse = {
  gemma4Found: boolean;
  lmStudioReachable: boolean;
  model: string;
  ok: boolean;
  status: string;
};

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health');
  return (await response.json()) as HealthResponse;
}

export async function getModels(): Promise<ModelInfo[]> {
  const response = await fetch('/api/models');

  if (!response.ok) {
    return [];
  }

  const body = (await response.json()) as { models: ModelInfo[] };
  return body.models;
}

export async function rewriteDocument(input: {
  document: string;
  provider: ModelProviderSettings;
  styleProfile: StyleProfile;
}): Promise<PipelineResult> {
  const response = await fetch('/api/rewrite', {
    body: JSON.stringify({
      document: input.document,
      options: {
        includeDebug: true,
      },
      provider: input.provider,
      styleProfile: input.styleProfile,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    const errorBody = (await response.json()) as { error?: string };
    throw new Error(errorBody.error ?? 'Rewrite failed.');
  }

  return (await response.json()) as PipelineResult;
}

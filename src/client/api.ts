import type {
  ModelInfo,
  ModelProviderSettings,
  PipelineResult,
  StyleProfile,
} from '../shared/types';
import {
  DEFAULT_PROVIDER,
  DEFAULT_REFERENCE_EXAMPLES,
} from '../shared/defaults';
import { runRewritePipeline } from '../server/pipeline';
import {
  completeJsonWithTauri,
  getTauriHealth,
  getTauriModels,
  isTauriRuntime,
} from './tauri';

export type HealthResponse = {
  error?: string;
  gemma4Found: boolean;
  lmStudioReachable: boolean;
  model: string;
  ok: boolean;
  status: string;
};

export async function getHealth(): Promise<HealthResponse> {
  if (isTauriRuntime()) {
    try {
      return await getTauriHealth(DEFAULT_PROVIDER);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        gemma4Found: false,
        lmStudioReachable: false,
        model: DEFAULT_PROVIDER.model ?? 'gemma-4',
        ok: false,
        status: 'degraded',
      };
    }
  }

  const response = await fetch('/api/health');
  return (await response.json()) as HealthResponse;
}

export async function getModels(): Promise<ModelInfo[]> {
  if (isTauriRuntime()) {
    try {
      return await getTauriModels(DEFAULT_PROVIDER);
    } catch {
      return [];
    }
  }

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
  if (isTauriRuntime()) {
    return runRewritePipeline(
      {
        document: input.document,
        options: {
          includeDebug: true,
        },
        provider: input.provider,
        referenceExamples: DEFAULT_REFERENCE_EXAMPLES,
        styleProfile: input.styleProfile,
      },
      {
        completeJson: completeJsonWithTauri,
      },
    );
  }

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

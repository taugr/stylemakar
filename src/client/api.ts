import type {
  ModelInfo,
  ModelProviderSettings,
  PipelineResult,
  ProviderCapabilityStatus,
  RewriteProgress,
  StyleProfile,
} from '../shared/types';
import { DEFAULT_PROVIDER } from '../shared/defaults';
import { runRewritePipeline } from '../server/pipeline';
import {
  completeJsonWithTauri,
  getTauriProviderCapabilities,
  getTauriHealth,
  getTauriModels,
  isTauriRuntime,
} from './tauri';

export async function checkProviderCapabilities(
  provider: ModelProviderSettings,
): Promise<ProviderCapabilityStatus> {
  if (isTauriRuntime()) {
    return getTauriProviderCapabilities(provider);
  }

  const response = await fetch('/api/provider/capabilities', {
    body: JSON.stringify(provider),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? 'Provider check failed.');
  }

  return (await response.json()) as ProviderCapabilityStatus;
}

export type HealthResponse = {
  error?: string;
  gemma4Found: boolean;
  lmStudioReachable: boolean;
  model: string;
  ok: boolean;
  status: string;
};

export async function getHealth(
  provider: Partial<ModelProviderSettings> = DEFAULT_PROVIDER,
): Promise<HealthResponse> {
  if (isTauriRuntime()) {
    try {
      return await getTauriHealth(provider);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        gemma4Found: false,
        lmStudioReachable: false,
        model: DEFAULT_PROVIDER.model ?? '',
        ok: false,
        status: 'degraded',
      };
    }
  }

  const params = new URLSearchParams();

  if (provider.baseUrl) {
    params.set('baseUrl', provider.baseUrl);
  }

  const query = params.toString();
  const response = await fetch(`/api/health${query ? `?${query}` : ''}`);
  return (await response.json()) as HealthResponse;
}

export async function getModels(
  provider: Partial<ModelProviderSettings> = DEFAULT_PROVIDER,
): Promise<ModelInfo[]> {
  if (isTauriRuntime()) {
    try {
      return await getTauriModels(provider);
    } catch {
      return [];
    }
  }

  const params = new URLSearchParams();

  if (provider.baseUrl) {
    params.set('baseUrl', provider.baseUrl);
  }

  const query = params.toString();
  const response = await fetch(`/api/models${query ? `?${query}` : ''}`);

  if (!response.ok) {
    return [];
  }

  const body = (await response.json()) as { models: ModelInfo[] };
  return body.models;
}

export async function rewriteDocument(
  input: {
    document: string;
    provider: ModelProviderSettings;
    referenceExamples: string[];
    styleProfile: StyleProfile;
  },
  execution?: {
    onProgress?: (progress: RewriteProgress) => void;
    runId: string;
    signal?: AbortSignal;
  },
): Promise<PipelineResult> {
  execution?.onProgress?.({
    attempt: 0,
    message: 'Rewrite queued.',
    runId: execution.runId,
    segmentCount: 1,
    segmentIndex: 0,
    stage: 'queued',
  });

  if (isTauriRuntime()) {
    return runRewritePipeline(
      {
        document: input.document,
        options: {
          includeDebug: true,
        },
        provider: input.provider,
        referenceExamples: input.referenceExamples,
        styleProfile: input.styleProfile,
      },
      {
        completeJson: completeJsonWithTauri,
        onProgress: execution?.onProgress,
        runId: execution?.runId,
        signal: execution?.signal,
      },
    );
  }

  const response = await fetch('/api/rewrite/stream', {
    body: JSON.stringify({
      document: input.document,
      runId: execution?.runId,
      options: {
        includeDebug: true,
      },
      provider: input.provider,
      referenceExamples: input.referenceExamples,
      styleProfile: input.styleProfile,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: execution?.signal,
  });

  if (!response.ok) {
    const errorBody = (await response.json()) as { error?: string };
    throw new Error(errorBody.error ?? 'Rewrite failed.');
  }

  if (!response.body) {
    throw new Error('Rewrite response did not include a readable stream.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: PipelineResult | undefined;

  const consumeLine = (line: string): void => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as {
      error?: string;
      progress?: RewriteProgress;
      result?: PipelineResult;
      type: 'error' | 'progress' | 'result';
    };

    if (event.type === 'progress' && event.progress) {
      execution?.onProgress?.(event.progress);
    } else if (event.type === 'result' && event.result) {
      result = event.result;
    } else if (event.type === 'error') {
      throw new Error(event.error ?? 'Rewrite failed.');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(consumeLine);
    if (done) break;
  }

  consumeLine(buffer);

  if (!result) {
    throw new Error('Rewrite stream ended before returning a result.');
  }

  return result;
}

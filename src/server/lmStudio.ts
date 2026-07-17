import { DEFAULT_PROVIDER } from '../shared/defaults';
import {
  filterChatModelIds,
  selectAvailableModel,
} from '../shared/modelSelection';
import { providerFingerprint } from '../shared/provider';
import type {
  ModelInfo,
  ModelProviderSettings,
  ProviderCapabilityStatus,
  ProviderErrorKind,
} from '../shared/types';

type ChatMessage = {
  role: 'system' | 'user';
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
};

type ModelsResponse = {
  data?: Array<{
    id?: string;
  }>;
};

export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

// Kept as an alias for callers that used the original transport-specific name.
export { ProviderError as LmStudioError };

export function normalizeBaseUrl(baseUrl: string | undefined): string {
  const fallback = DEFAULT_PROVIDER.baseUrl;
  const candidate = (baseUrl ?? fallback).trim().replace(/\/+$/, '');

  if (!/^https?:\/\/[^/]+/.test(candidate)) {
    throw new ProviderError(
      'unreachable',
      'Provider endpoint must be an http(s) URL.',
    );
  }

  return candidate;
}

function errorFromStatus(
  status: number,
  operation: string,
  detail?: string,
): ProviderError {
  const suffix = detail?.trim() ? `: ${detail.trim()}` : '';

  if (status === 401 || status === 403) {
    return new ProviderError(
      'authentication',
      `Provider ${operation} requires authentication${suffix}`,
      status,
    );
  }

  if (status === 429) {
    return new ProviderError(
      'rate-limit',
      `Provider ${operation} was rate limited${suffix}`,
      status,
    );
  }

  return new ProviderError(
    'unknown',
    `Provider ${operation} failed with ${status}${suffix}`,
    status,
  );
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return new ProviderError(
      'timeout',
      'Provider completion timed out after 60 seconds.',
    );
  }

  return new ProviderError(
    'unreachable',
    error instanceof Error
      ? `Could not reach provider: ${error.message}`
      : 'Could not reach provider.',
  );
}

async function fetchModelIds(baseUrl: string): Promise<string[]> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/models`);
  } catch (error) {
    throw toProviderError(error);
  }

  if (!response.ok) {
    throw errorFromStatus(
      response.status,
      'model discovery',
      await response.text(),
    );
  }

  let body: ModelsResponse;
  try {
    body = (await response.json()) as ModelsResponse;
  } catch {
    throw new ProviderError(
      'invalid-json',
      'Provider model discovery returned malformed JSON.',
    );
  }
  return filterChatModelIds(
    (body.data ?? [])
      .map((model) => model.id)
      .filter((id): id is string => Boolean(id)),
  );
}

export async function listModels(
  provider: Partial<ModelProviderSettings> = {},
): Promise<ModelInfo[]> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl);
  const ids = await fetchModelIds(baseUrl);
  const selected = selectAvailableModel(ids, provider.model);

  return ids.map((id) => ({ id, selected: id === selected }));
}

export async function resolveModel(
  provider: Partial<ModelProviderSettings> = {},
): Promise<string> {
  const configuredModel = provider.model?.trim();

  if (configuredModel) {
    return configuredModel;
  }

  const models = await listModels(provider);
  const selected = models.find((model) => model.selected);

  if (!selected) {
    throw new ProviderError(
      'model-missing',
      'No chat model is available. Load a model in your provider or enter its model ID.',
    );
  }

  return selected.id;
}

export async function completeText(
  messages: ChatMessage[],
  provider: ModelProviderSettings,
  options: { temperature?: number; timeoutMs?: number } = {},
): Promise<string> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl);
  const model = provider.model?.trim() || (await resolveModel(provider));
  let lastEmpty = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 60_000,
    );
    let response: Response;

    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        body: JSON.stringify({
          max_tokens: 360,
          messages:
            attempt === 0
              ? messages
              : [
                  ...messages,
                  {
                    content:
                      'The previous response was empty. Return the requested JSON object only.',
                    role: 'user',
                  },
                ],
          model,
          reasoning_effort:
            provider.reasoningEffort ?? DEFAULT_PROVIDER.reasoningEffort,
          stream: false,
          temperature: options.temperature ?? 0.2,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
        signal: controller.signal,
      });
    } catch (error) {
      throw toProviderError(error);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      if (response.status >= 500 && attempt < 2) {
        continue;
      }
      throw errorFromStatus(
        response.status,
        'completion',
        await response.text(),
      );
    }

    const body = (await response.json()) as ChatCompletionResponse;
    const message = body.choices?.[0]?.message;
    const content =
      message?.content?.trim() ?? message?.reasoning_content?.trim();

    if (content) {
      return content;
    }

    lastEmpty = true;
  }

  if (lastEmpty) {
    throw new ProviderError(
      'empty-completion',
      'Provider returned an empty completion.',
    );
  }

  throw new ProviderError('unknown', 'Provider completion failed.');
}

export function extractJsonObject<T>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text);
  const candidate = fenced?.[1] ?? text;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new ProviderError(
      'invalid-json',
      'Provider response did not include a JSON object.',
    );
  }

  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as T;
  } catch {
    throw new ProviderError(
      'invalid-json',
      'Provider response included malformed JSON.',
    );
  }
}

export async function completeJson<T>(
  messages: ChatMessage[],
  provider: ModelProviderSettings,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const text = await completeText(messages, provider, {
    temperature: 0,
    timeoutMs: options.timeoutMs,
  });
  return extractJsonObject<T>(text);
}

function capabilityFailure(
  provider: ModelProviderSettings,
  error: unknown,
  partial: Partial<ProviderCapabilityStatus> = {},
): ProviderCapabilityStatus {
  const providerError = toProviderError(error);

  return {
    availableModels: partial.availableModels ?? [],
    checkedAt: new Date().toISOString(),
    endpointReachable: partial.endpointReachable ?? false,
    error: {
      kind: providerError.kind,
      message: providerError.message,
    },
    modelDiscovery: partial.modelDiscovery ?? 'failed',
    providerFingerprint: providerFingerprint(provider),
    rewriteReady: false,
    selectedModel: partial.selectedModel,
    selectedModelAvailable: partial.selectedModelAvailable ?? false,
    structuredOutput: partial.structuredOutput ?? 'unverified',
  };
}

export async function probeProviderCapabilities(
  provider: ModelProviderSettings,
  options: { timeoutMs?: number } = {},
): Promise<ProviderCapabilityStatus> {
  const normalizedProvider = {
    ...provider,
    baseUrl: normalizeBaseUrl(provider.baseUrl),
    model: provider.model?.trim() || undefined,
  };
  let availableModels: string[] = [];
  let modelDiscovery: ProviderCapabilityStatus['modelDiscovery'] = 'supported';

  try {
    availableModels = await fetchModelIds(normalizedProvider.baseUrl);
  } catch (error) {
    if (
      error instanceof ProviderError &&
      (error.status === 404 || error.status === 405)
    ) {
      modelDiscovery = 'unsupported';
    } else {
      return capabilityFailure(normalizedProvider, error);
    }
  }

  const selectedModel =
    modelDiscovery === 'supported'
      ? selectAvailableModel(availableModels, normalizedProvider.model)
      : normalizedProvider.model;

  if (!selectedModel) {
    const message = normalizedProvider.model
      ? `Configured model "${normalizedProvider.model}" is not available from this provider.`
      : 'No chat model is available. Load a model or enter its exact model ID.';

    return capabilityFailure(
      normalizedProvider,
      new ProviderError('model-missing', message),
      {
        availableModels,
        endpointReachable: true,
        modelDiscovery,
      },
    );
  }

  const selectedModelAvailable =
    modelDiscovery === 'supported'
      ? availableModels.includes(selectedModel)
      : true;

  try {
    const result = await completeJson<{ status?: string }>(
      [
        {
          content:
            'Return only a valid JSON object matching this schema: {"status":"ok"}.',
          role: 'system',
        },
        {
          content: 'Confirm structured JSON support.',
          role: 'user',
        },
      ],
      { ...normalizedProvider, model: selectedModel },
      options,
    );

    if (result.status !== 'ok') {
      throw new ProviderError(
        'invalid-json',
        'Provider returned JSON, but it did not match the required structure.',
      );
    }

    return {
      availableModels,
      checkedAt: new Date().toISOString(),
      endpointReachable: true,
      modelDiscovery,
      providerFingerprint: providerFingerprint(normalizedProvider),
      rewriteReady: true,
      selectedModel,
      selectedModelAvailable,
      structuredOutput: 'verified',
    };
  } catch (error) {
    return capabilityFailure(normalizedProvider, error, {
      availableModels,
      endpointReachable: true,
      modelDiscovery,
      selectedModel,
      selectedModelAvailable,
      structuredOutput: 'failed',
    });
  }
}

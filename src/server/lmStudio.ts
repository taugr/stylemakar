import { DEFAULT_PROVIDER } from '../shared/defaults';
import { selectGemmaModel } from '../shared/modelSelection';
import type { ModelInfo, ModelProviderSettings } from '../shared/types';

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

export class LmStudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LmStudioError';
  }
}

export function normalizeBaseUrl(baseUrl: string | undefined): string {
  const fallback = DEFAULT_PROVIDER.baseUrl;
  const candidate = (baseUrl ?? fallback).trim().replace(/\/+$/, '');

  if (!/^https?:\/\/[^/]+/.test(candidate)) {
    throw new LmStudioError('Provider baseUrl must be an http(s) URL.');
  }

  return candidate;
}

export async function listModels(
  provider: Partial<ModelProviderSettings> = {},
): Promise<ModelInfo[]> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl);
  const response = await fetch(`${baseUrl}/models`);

  if (!response.ok) {
    throw new LmStudioError(
      `LM Studio model discovery failed with ${response.status}.`,
    );
  }

  const body = (await response.json()) as ModelsResponse;
  const ids = (body.data ?? [])
    .map((model) => model.id)
    .filter((id): id is string => Boolean(id));
  const selected = selectGemmaModel(
    ids,
    provider.model ?? DEFAULT_PROVIDER.model,
  );

  return ids.map((id) => ({ id, selected: id === selected }));
}

export async function resolveModel(
  provider: Partial<ModelProviderSettings> = {},
): Promise<string> {
  const models = await listModels(provider);
  const selected = models.find((model) => model.selected);
  return selected?.id ?? provider.model ?? DEFAULT_PROVIDER.model ?? 'gemma-4';
}

export async function completeText(
  messages: ChatMessage[],
  provider: ModelProviderSettings,
  options: { temperature?: number } = {},
): Promise<string> {
  const baseUrl = normalizeBaseUrl(provider.baseUrl);
  const model = provider.model ?? (await resolveModel(provider));
  let lastEmpty = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
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
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LmStudioError('LM Studio completion timed out after 60s.');
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const detail = await response.text();
      throw new LmStudioError(
        `LM Studio completion failed with ${response.status}: ${detail}`,
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
    throw new LmStudioError('LM Studio returned an empty completion.');
  }

  throw new LmStudioError('LM Studio completion failed.');
}

export function extractJsonObject<T>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text);
  const candidate = fenced?.[1] ?? text;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new LmStudioError('Model response did not include a JSON object.');
  }

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as T;
}

export async function completeJson<T>(
  messages: ChatMessage[],
  provider: ModelProviderSettings,
): Promise<T> {
  const text = await completeText(messages, provider, { temperature: 0 });
  return extractJsonObject<T>(text);
}

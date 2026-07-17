import { invoke } from '@tauri-apps/api/core';
import { selectAvailableModel } from '../shared/modelSelection';
import type {
  ModelInfo,
  ModelProviderSettings,
  ProviderCapabilityStatus,
  ContentStoreSnapshot,
} from '../shared/types';

type ChatMessage = {
  role: 'system' | 'user';
  content: string;
};

type HealthResponse = {
  gemma4Found: boolean;
  lmStudioReachable: boolean;
  model: string;
  ok: boolean;
  status: string;
};

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

export async function getTauriHealth(
  provider: Partial<ModelProviderSettings>,
): Promise<HealthResponse> {
  const models = await getTauriModels(provider);
  const modelIds = models.map((model) => model.id);
  const selectedModel = selectAvailableModel(modelIds, provider.model) ?? '';

  return {
    gemma4Found: modelIds.some((model) =>
      /gemma.*(?:^|[^0-9])4(?:[^0-9]|$)/i.test(model),
    ),
    lmStudioReachable: true,
    model: selectedModel,
    ok: true,
    status: 'ready',
  };
}

export async function getTauriModels(
  provider: Partial<ModelProviderSettings>,
): Promise<ModelInfo[]> {
  const models = await invoke<string[]>('list_models', { provider });
  const selectedModel = selectAvailableModel(models, provider.model);

  return models.map((model) => ({
    id: model,
    selected: model === selectedModel,
  }));
}

export async function getTauriProviderCapabilities(
  provider: ModelProviderSettings,
): Promise<ProviderCapabilityStatus> {
  return invoke<ProviderCapabilityStatus>('probe_provider', { provider });
}

export async function loadTauriContentStore(): Promise<
  ContentStoreSnapshot | undefined
> {
  return invoke<ContentStoreSnapshot | null>('load_content_store').then(
    (snapshot) => snapshot ?? undefined,
  );
}

export async function saveTauriContentStore(
  snapshot: ContentStoreSnapshot,
): Promise<void> {
  await invoke('save_content_store', { snapshot });
}

export async function completeJsonWithTauri<T>(
  messages: ChatMessage[],
  provider: ModelProviderSettings,
): Promise<T> {
  return invoke<T>('complete_json', { messages, provider });
}

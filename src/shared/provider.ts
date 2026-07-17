import { DEFAULT_PROVIDER, getProviderPreset } from './defaults';
import type {
  ModelProviderSettings,
  ProviderCapabilityStatus,
  ProviderKind,
  ProviderProfile,
} from './types';

export function providerFingerprint(
  provider: Partial<ModelProviderSettings>,
): string {
  return JSON.stringify({
    baseUrl: (provider.baseUrl ?? DEFAULT_PROVIDER.baseUrl)
      .trim()
      .replace(/\/+$/, ''),
    model: provider.model?.trim() ?? '',
    reasoningEffort:
      provider.reasoningEffort ?? DEFAULT_PROVIDER.reasoningEffort ?? 'none',
  });
}

export function normalizeProviderProfile(
  provider: Partial<ProviderProfile> | undefined,
): ProviderProfile {
  const kind = provider?.kind ?? DEFAULT_PROVIDER.kind;
  const preset = getProviderPreset(kind);

  return {
    ...preset,
    ...provider,
    baseUrl: provider?.baseUrl?.trim() || preset.baseUrl,
    id: provider?.id?.trim() || preset.id,
    kind,
    name: provider?.name?.trim() || preset.name,
    reasoningEffort:
      provider?.reasoningEffort ?? preset.reasoningEffort ?? 'none',
  };
}

export function providerProfileForKind(
  kind: ProviderKind,
  current?: ProviderProfile,
): ProviderProfile {
  const preset = getProviderPreset(kind);

  if (kind === 'custom' && current?.kind === 'custom') {
    return normalizeProviderProfile(current);
  }

  return { ...preset };
}

export function isLocalProvider(provider: ModelProviderSettings): boolean {
  try {
    const hostname = new URL(provider.baseUrl).hostname.toLowerCase();
    return (
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    );
  } catch {
    return false;
  }
}

export function capabilityMatchesProvider(
  status: ProviderCapabilityStatus | undefined,
  provider: ModelProviderSettings,
): status is ProviderCapabilityStatus {
  return status?.providerFingerprint === providerFingerprint(provider);
}

export function isLikelyEmbeddingModel(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return (
    normalized.includes('embedding') ||
    normalized.includes('embed-') ||
    normalized.includes('nomic-embed') ||
    normalized.includes('text-embedding')
  );
}

export function filterChatModelIds(modelIds: string[]): string[] {
  return modelIds.filter((modelId) => !isLikelyEmbeddingModel(modelId));
}

export function selectAvailableModel(
  modelIds: string[],
  preferredModel?: string,
): string | undefined {
  const chatModelIds = filterChatModelIds(modelIds);
  const preferred = preferredModel?.trim();

  if (preferred) {
    return chatModelIds.find((modelId) => modelId === preferred);
  }

  const qatGemmaFour = chatModelIds.find((modelId) => {
    const normalized = modelId.toLowerCase();
    return (
      normalized.includes('gemma') &&
      /(?:^|[^0-9])4(?:[^0-9]|$)/.test(normalized) &&
      normalized.includes('qat')
    );
  });
  const gemmaFour = chatModelIds.find((modelId) => {
    const normalized = modelId.toLowerCase();
    return (
      normalized.includes('gemma') &&
      /(?:^|[^0-9])4(?:[^0-9]|$)/.test(normalized)
    );
  });

  return qatGemmaFour ?? gemmaFour ?? chatModelIds[0];
}

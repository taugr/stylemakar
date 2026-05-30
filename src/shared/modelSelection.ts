export function selectGemmaModel(
  modelIds: string[],
  preferredModel?: string,
): string {
  const gemmaFour = modelIds.find((modelId) => {
    const normalized = modelId.toLowerCase();
    return (
      normalized.includes('gemma') &&
      /(?:^|[^0-9])4(?:[^0-9]|$)/.test(normalized)
    );
  });

  return gemmaFour ?? preferredModel ?? modelIds[0] ?? 'gemma-4';
}

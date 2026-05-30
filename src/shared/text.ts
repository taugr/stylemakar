export function countWords(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches?.length ?? 0;
}

export function isUrlOnly(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

export function isRawDataLine(text: string): boolean {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return false;
  }

  return (
    /^[{[].*[\]}]$/.test(trimmed) ||
    /^[\w.-]+=[^\s]+$/.test(trimmed) ||
    /^[\w.-]+,\s*[\w.-]+(?:,\s*[\w.-]+)+$/.test(trimmed)
  );
}

import type { Segment, SegmentType } from './types';
import { isRawDataLine, isUrlOnly } from './text';

type PendingBlock = {
  type: SegmentType;
  lines: string[];
};

function makeSegment(
  segments: Segment[],
  type: SegmentType,
  lines: string[],
): void {
  if (lines.length === 0) {
    return;
  }

  const originalText = lines.join('\n').trimEnd();

  if (originalText.trim().length === 0) {
    return;
  }

  segments.push({
    id: `segment-${segments.length + 1}`,
    index: segments.length,
    type,
    originalText,
  });
}

function lineType(line: string): SegmentType {
  if (/^#{1,6}\s+/.test(line)) {
    return 'heading';
  }

  if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
    return 'list';
  }

  if (/^\s*>/.test(line)) {
    return 'blockquote';
  }

  if (isUrlOnly(line) || isRawDataLine(line)) {
    return 'raw';
  }

  return 'paragraph';
}

export function isRewritableSegment(segment: Segment): boolean {
  return segment.type === 'paragraph';
}

export function segmentDocument(document: string): Segment[] {
  const normalized = document.replaceAll('\r\n', '\n');
  const lines = normalized.split('\n');
  const segments: Segment[] = [];
  let pending: PendingBlock | undefined;
  let codeLines: string[] | undefined;

  const flush = (): void => {
    if (pending) {
      makeSegment(segments, pending.type, pending.lines);
      pending = undefined;
    }
  };

  for (const line of lines) {
    if (codeLines) {
      codeLines.push(line);

      if (/^```/.test(line.trim())) {
        makeSegment(segments, 'code', codeLines);
        codeLines = undefined;
      }

      continue;
    }

    if (/^```/.test(line.trim())) {
      flush();
      codeLines = [line];
      continue;
    }

    if (line.trim().length === 0) {
      flush();
      continue;
    }

    const type = lineType(line);

    if (!pending || pending.type !== type) {
      flush();
      pending = { type, lines: [line] };
      continue;
    }

    pending.lines.push(line);
  }

  flush();

  if (codeLines) {
    makeSegment(segments, 'code', codeLines);
  }

  return segments;
}

import { describe, expect, it } from 'vitest';
import { isRewritableSegment, segmentDocument } from './segment';

describe('segmentDocument', () => {
  it('preserves markdown-ish structure and identifies rewritable paragraphs', () => {
    const segments = segmentDocument(`# Heading

This is a paragraph with https://example.com inside it.

- one
- two

> quoted text

\`\`\`ts
const value = 1;
\`\`\`

https://example.com

{"raw":true}`);

    expect(segments.map((segment) => segment.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'blockquote',
      'code',
      'raw',
      'raw',
    ]);
    expect(segments.filter(isRewritableSegment)).toHaveLength(1);
    expect(segments[4]?.originalText).toContain('const value = 1;');
  });
});

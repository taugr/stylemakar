import type { Express } from 'express';
import http, { type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, validateRewriteRequest } from './api';

const servers: Server[] = [];
const completionRequestBodies: unknown[] = [];

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Missing server address.');
  }

  return `http://127.0.0.1:${address.port}`;
}

async function listenApp(app: Express): Promise<string> {
  const server = http.createServer(app);
  return listen(server);
}

function createFakeLmStudio(): Server {
  return http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');

    if (request.url === '/v1/models') {
      response.end(
        JSON.stringify({
          data: [{ id: 'qwen3-14b' }, { id: 'lmstudio/gemma-4-test' }],
        }),
      );
      return;
    }

    if (request.url === '/v1/chat/completions') {
      let body = '';
      request.on('data', (chunk) => {
        body += String(chunk);
      });
      request.on('end', () => {
        const parsed = JSON.parse(body) as {
          messages: Array<{ content: string }>;
        };
        completionRequestBodies.push(parsed);
        const system = parsed.messages[0]?.content ?? '';
        let content = '{}';

        if (system.includes('Extract meaning from the paragraph')) {
          content = JSON.stringify({
            caveats: [],
            claims: ['Original text.'],
            conclusions: [],
            constraints: [],
            examples: [],
            mandatoryDetails: [],
          });
        } else if (system.includes('Identify behavior-level style targets')) {
          content = JSON.stringify({
            directness: 'high',
            explanationPattern: 'claim_then_reasoning',
            formality: 'medium',
            hedgingLevel: 'low',
            paragraphLength: 'short',
            tone: ['direct'],
            usesExamples: false,
            vocabulary: ['straightforward'],
          });
        } else if (system.includes('Rewrite the paragraph')) {
          content = JSON.stringify({ rewrittenText: 'Clear rewritten text.' });
        } else if (system.includes('Grade whether this resembles')) {
          content = JSON.stringify({
            directness: 92,
            explanationStyle: 92,
            issues: [],
            overall: 92,
            paragraphShape: 92,
            pass: true,
            revisionInstruction: '',
            sentenceRhythm: 92,
            toneMatch: 92,
            vocabularyMatch: 92,
          });
        } else if (system.includes('Check semantic fidelity')) {
          content = JSON.stringify({
            addedClaims: [],
            changedMeaning: [],
            missingDetails: [],
            pass: true,
            riskLevel: 'low',
          });
        } else if (system.includes('Edit conservatively')) {
          content = JSON.stringify({ document: 'Clear rewritten text.' });
        }

        response.end(JSON.stringify({ choices: [{ message: { content } }] }));
      });
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'Not found' }));
  });
}

afterEach(async () => {
  completionRequestBodies.splice(0);
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

describe('validateRewriteRequest', () => {
  it('rejects empty documents and malformed provider urls', () => {
    expect(() => validateRewriteRequest({ document: '' })).toThrow('document');
    expect(() =>
      validateRewriteRequest({
        document: 'Text',
        provider: { baseUrl: 'localhost:1234/v1' },
      }),
    ).toThrow('baseUrl');
  });
});

describe('api', () => {
  it('runs /api/rewrite against an OpenAI-compatible LM Studio mock', async () => {
    const lmStudioBaseUrl = `${await listen(createFakeLmStudio())}/v1`;
    const appBaseUrl = await listenApp(createApp());
    const response = await fetch(`${appBaseUrl}/api/rewrite`, {
      body: JSON.stringify({
        document: 'Original text.',
        options: { includeDebug: true },
        provider: { baseUrl: lmStudioBaseUrl },
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    expect(response.ok).toBe(true);
    const body = (await response.json()) as {
      content: string;
      debug?: unknown;
      model: string;
    };
    expect(body.content).toBe('Clear rewritten text.');
    expect(body.model).toBe('lmstudio/gemma-4-test');
    expect(body.debug).toBeTruthy();
    expect(completionRequestBodies).toContainEqual(
      expect.objectContaining({
        reasoning_effort: 'none',
      }),
    );
  });

  it('runs /api/eval/rewrite with fixed eval profiles and debug output', async () => {
    const lmStudioBaseUrl = `${await listen(createFakeLmStudio())}/v1`;
    const appBaseUrl = await listenApp(createApp());
    const response = await fetch(`${appBaseUrl}/api/eval/rewrite`, {
      body: JSON.stringify({
        options: {
          maxRewriteIterations: 1,
          runFinalSmoothing: true,
          runMeaningCheck: true,
        },
        providerId: lmStudioBaseUrl,
        source: 'Original text.',
        styleProfileId: 'direct-technical',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    expect(response.ok).toBe(true);
    const body = (await response.json()) as {
      debug: {
        model: string;
        segments: Array<{
          attempts: Array<{ styleScore?: number }>;
          meaningCheck?: { pass: boolean };
          originalText: string;
        }>;
        timings: { totalMs: number };
      };
      finalText: string;
    };
    expect(body.finalText).toBe('Clear rewritten text.');
    expect(body.debug.model).toBe('lmstudio/gemma-4-test');
    expect(body.debug.timings.totalMs).toBeGreaterThanOrEqual(0);
    expect(body.debug.segments[0]?.originalText).toBe('Original text.');
    expect(body.debug.segments[0]?.attempts[0]?.styleScore).toBe(92);
    expect(body.debug.segments[0]?.meaningCheck?.pass).toBe(true);
  });

  it('rejects unknown eval profiles', async () => {
    const appBaseUrl = await listenApp(createApp());
    const response = await fetch(`${appBaseUrl}/api/eval/rewrite`, {
      body: JSON.stringify({
        source: 'Original text.',
        styleProfileId: '../missing',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    expect(response.status).toBe(400);
  });
});

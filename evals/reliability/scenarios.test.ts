import http, { type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { probeProviderCapabilities } from '../../src/server/lmStudio';

const servers: Server[] = [];
async function provider(
  scenario:
    | 'auth'
    | 'rate'
    | 'empty'
    | 'embedding'
    | 'unsupported-models'
    | 'malformed-models'
    | 'truncated'
    | 'timeout'
    | 'transient',
): Promise<string> {
  let completionAttempts = 0;
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (scenario === 'auth') {
      response.statusCode = 401;
      response.end('{}');
      return;
    }
    if (request.url === '/v1/models') {
      if (scenario === 'unsupported-models') {
        response.statusCode = 404;
        response.end('{}');
        return;
      }
      if (scenario === 'malformed-models') {
        response.end('{not-json');
        return;
      }
      response.end(
        JSON.stringify({
          data:
            scenario === 'embedding'
              ? [{ id: 'text-embedding-only' }]
              : [{ id: 'chat-model' }],
        }),
      );
      return;
    }
    if (scenario === 'rate') {
      response.statusCode = 429;
      response.end('{}');
      return;
    }
    if (scenario === 'truncated') {
      response.end(
        JSON.stringify({ choices: [{ message: { content: '{"status":' } }] }),
      );
      return;
    }
    if (scenario === 'timeout') {
      setTimeout(() => response.end('{}'), 100);
      return;
    }
    if (scenario === 'transient') {
      completionAttempts += 1;
      if (completionAttempts === 1) {
        response.statusCode = 503;
        response.end('{}');
        return;
      }
      response.end(
        JSON.stringify({
          choices: [{ message: { content: '{"status":"ok"}' } }],
        }),
      );
      return;
    }
    if (scenario === 'unsupported-models') {
      response.end(
        JSON.stringify({
          choices: [{ message: { content: '{"status":"ok"}' } }],
        }),
      );
      return;
    }
    response.end(JSON.stringify({ choices: [{ message: { content: '' } }] }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing address.');
  return `http://127.0.0.1:${address.port}/v1`;
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

describe('provider reliability matrix', () => {
  it.each([
    ['auth', 'authentication'],
    ['rate', 'rate-limit'],
    ['empty', 'empty-completion'],
    ['embedding', 'model-missing'],
  ] as const)('classifies %s failures', async (scenario, kind) => {
    const result = await probeProviderCapabilities({
      baseUrl: await provider(scenario),
      model: scenario === 'embedding' ? undefined : 'chat-model',
      reasoningEffort: 'none',
    });
    expect(result.rewriteReady).toBe(false);
    expect(result.error?.kind).toBe(kind);
  });

  it.each([
    ['malformed-models', 'invalid-json'],
    ['truncated', 'invalid-json'],
    ['timeout', 'timeout'],
  ] as const)('classifies %s protocol failures', async (scenario, kind) => {
    const result = await probeProviderCapabilities(
      {
        baseUrl: await provider(scenario),
        model: 'chat-model',
        reasoningEffort: 'none',
      },
      { timeoutMs: 20 },
    );
    expect(result.rewriteReady).toBe(false);
    expect(result.error?.kind).toBe(kind);
  });

  it('supports configured models when discovery is unavailable', async () => {
    const result = await probeProviderCapabilities({
      baseUrl: await provider('unsupported-models'),
      model: 'chat-model',
      reasoningEffort: 'none',
    });
    expect(result).toMatchObject({
      modelDiscovery: 'unsupported',
      rewriteReady: true,
    });
  });

  it('recovers from a transient completion failure', async () => {
    const result = await probeProviderCapabilities({
      baseUrl: await provider('transient'),
      model: 'chat-model',
      reasoningEffort: 'none',
    });
    expect(result.rewriteReady).toBe(true);
  });

  it('classifies an unreachable endpoint', async () => {
    const result = await probeProviderCapabilities({
      baseUrl: 'http://127.0.0.1:1/v1',
      model: 'chat-model',
      reasoningEffort: 'none',
    });
    expect(result.error?.kind).toBe('unreachable');
  });
});

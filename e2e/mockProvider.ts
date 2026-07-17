import http, { type Server } from 'node:http';

async function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => {
      body += String(chunk);
    });
    request.on('end', () => resolve(body));
  });
}

function completionFor(system: string): unknown {
  if (system.includes('matching this schema')) return { status: 'ok' };
  if (system.includes('Extract meaning from the paragraph')) {
    return {
      caveats: [],
      claims: ['The source claim remains.'],
      conclusions: [],
      constraints: [],
      examples: [],
      mandatoryDetails: ['June 2026', '42'],
    };
  }
  if (system.includes('Identify behavior-level style targets')) {
    return {
      directness: 'high',
      explanationPattern: 'claim_then_reason',
      formality: 'medium',
      hedgingLevel: 'low',
      paragraphLength: 'short',
      tone: ['direct'],
      usesExamples: false,
      vocabulary: ['specific'],
    };
  }
  if (system.includes('Rewrite the paragraph')) {
    return {
      rewrittenText:
        'The June 2026 pilot included 42 participants. The result is clear and specific.',
    };
  }
  if (system.includes('Grade whether this resembles')) {
    return {
      directness: 94,
      explanationStyle: 92,
      issues: [],
      overall: 93,
      paragraphShape: 92,
      pass: true,
      revisionInstruction: '',
      sentenceRhythm: 92,
      toneMatch: 93,
      vocabularyMatch: 92,
    };
  }
  if (system.includes('Check semantic fidelity')) {
    return {
      addedClaims: [],
      changedMeaning: [],
      missingDetails: [],
      pass: true,
      riskLevel: 'low',
    };
  }
  if (system.includes('Repair the existing rewrite')) {
    return {
      rewrittenText:
        'The June 2026 pilot included 42 participants. The result is clear and specific.',
    };
  }
  return { document: 'The June 2026 pilot included 42 participants.' };
}

export async function startMockProvider(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server: Server = http.createServer((request, response) => {
    void handleRequest(request, response).catch((error: unknown) => {
      response.statusCode = 500;
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Mock failure',
        }),
      );
    });
  });

  async function handleRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    response.setHeader('Content-Type', 'application/json');
    const url = request.url ?? '';

    if (url.includes('/auth/v1/models')) {
      response.statusCode = 401;
      response.end(JSON.stringify({ error: 'Authentication required' }));
      return;
    }

    if (url.endsWith('/v1/models')) {
      response.end(
        JSON.stringify({
          data: [{ id: 'text-embedding-only' }, { id: 'chat-model' }],
        }),
      );
      return;
    }

    if (url.endsWith('/v1/chat/completions')) {
      const body = JSON.parse(await readBody(request)) as {
        messages?: Array<{ content?: string }>;
      };
      const system = body.messages?.[0]?.content ?? '';
      const content = JSON.stringify(completionFor(system));
      const send = (): void => {
        response.end(JSON.stringify({ choices: [{ message: { content } }] }));
      };

      if (url.includes('/slow/') && !system.includes('matching this schema')) {
        setTimeout(send, 2_000);
      } else if (!system.includes('matching this schema')) {
        setTimeout(send, 150);
      } else {
        send();
      }
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'Not found' }));
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Mock provider did not bind to a TCP port.');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

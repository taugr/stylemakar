import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkProviderCapabilities,
  getHealth,
  getModels,
  rewriteDocument,
} from './api';
import { DEFAULT_PROVIDER } from '../shared/defaults';
import { DEFAULT_STYLE_PROFILE } from '../shared/defaults';
import { isTauriRuntime } from './tauri';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('client runtime adapter', () => {
  it('does not detect Tauri in the normal browser/server test runtime', () => {
    expect(isTauriRuntime()).toBe(false);
  });

  it('uses the existing web API for health outside Tauri', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          gemma4Found: true,
          lmStudioReachable: true,
          model: 'google/gemma-4-12b-qat',
          ok: true,
          status: 'ready',
        }),
      ),
    );

    await expect(getHealth()).resolves.toMatchObject({
      model: 'google/gemma-4-12b-qat',
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health?baseUrl=http%3A%2F%2Flocalhost%3A1234%2Fv1',
    );
  });

  it('uses the existing web API for model discovery outside Tauri', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [{ id: 'google/gemma-4-12b-qat', selected: true }],
        }),
      ),
    );

    await expect(getModels()).resolves.toEqual([
      { id: 'google/gemma-4-12b-qat', selected: true },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/models?baseUrl=http%3A%2F%2Flocalhost%3A1234%2Fv1',
    );
  });

  it('passes a configured endpoint to health and model discovery', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            gemma4Found: false,
            lmStudioReachable: true,
            model: 'custom-model',
            models: [{ id: 'custom-model', selected: true }],
            ok: true,
            status: 'ready',
          }),
        ),
      ),
    );

    await getHealth({ baseUrl: 'http://localhost:11434/v1' });
    await getModels({ baseUrl: 'http://localhost:11434/v1' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/health?baseUrl=http%3A%2F%2Flocalhost%3A11434%2Fv1',
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/models?baseUrl=http%3A%2F%2Flocalhost%3A11434%2Fv1',
    );
  });

  it('uses the provider capability API outside Tauri', async () => {
    const result = {
      availableModels: ['google/gemma-4-12b-qat'],
      checkedAt: '2026-07-18T00:00:00.000Z',
      endpointReachable: true,
      modelDiscovery: 'supported' as const,
      providerFingerprint: 'fingerprint',
      rewriteReady: true,
      selectedModel: 'google/gemma-4-12b-qat',
      selectedModelAvailable: true,
      structuredOutput: 'verified' as const,
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(result)));

    await expect(checkProviderCapabilities(DEFAULT_PROVIDER)).resolves.toEqual(
      result,
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/provider/capabilities', {
      body: JSON.stringify(DEFAULT_PROVIDER),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  });

  it('forwards streamed server progress and returns the final rewrite', async () => {
    const progress = {
      attempt: 1,
      message: 'Extracting meaning.',
      runId: 'run-1',
      segmentCount: 1,
      segmentIndex: 0,
      stage: 'extracting-meaning' as const,
    };
    const result = {
      content: 'Clear text.',
      model: 'chat-model',
      segments: [],
      warnings: [],
      wordCount: { original: 2, rewritten: 2 },
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        `${JSON.stringify({ progress, type: 'progress' })}\n${JSON.stringify({ result, type: 'result' })}\n`,
        { headers: { 'Content-Type': 'application/x-ndjson' } },
      ),
    );
    const onProgress = vi.fn();

    await expect(
      rewriteDocument(
        {
          document: 'Source text.',
          provider: DEFAULT_PROVIDER,
          referenceExamples: [],
          styleProfile: DEFAULT_STYLE_PROFILE,
        },
        { onProgress, runId: 'run-1' },
      ),
    ).resolves.toEqual(result);
    expect(onProgress).toHaveBeenCalledWith(progress);
  });
});

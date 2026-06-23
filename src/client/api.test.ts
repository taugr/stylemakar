import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHealth, getModels } from './api';
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
    expect(fetchMock).toHaveBeenCalledWith('/api/health');
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
    expect(fetchMock).toHaveBeenCalledWith('/api/models');
  });
});

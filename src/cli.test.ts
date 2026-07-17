import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from './cli';
import type { PipelineRequest, PipelineResult } from './shared/types';

function createResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    content: 'Rewritten text.',
    model: 'fake-model',
    segments: [
      {
        finalText: 'Rewritten text.',
        id: 'segment-1',
        originalText: 'Original text.',
        rewritten: true,
        type: 'paragraph',
      },
    ],
    warnings: [],
    wordCount: {
      original: 2,
      rewritten: 2,
    },
    ...overrides,
  };
}

function createHarness() {
  let stdout = '';
  let stderr = '';
  const requests: PipelineRequest[] = [];
  const deps = {
    listModels: vi.fn(async () => [
      { id: 'alpha', selected: false },
      { id: 'gemma-4-local', selected: true },
    ]),
    resolveModel: vi.fn(async () => 'gemma-4-local'),
    runRewritePipeline: vi.fn(async (request: PipelineRequest) => {
      requests.push(request);
      return createResult();
    }),
  };

  return {
    deps,
    get stderr() {
      return stderr;
    },
    get stdout() {
      return stdout;
    },
    requests,
    run: (argv: string[], stdin?: string) =>
      runCli(
        {
          argv,
          stdin,
          stdinIsTTY: stdin === undefined,
          stderr: (value) => {
            stderr += value;
          },
          stdout: (value) => {
            stdout += value;
          },
        },
        deps,
      ),
  };
}

describe('stylemakar cli', () => {
  it('rewrites direct text with the default provider settings', async () => {
    const harness = createHarness();

    await expect(harness.run(['rewrite', 'Original text.'])).resolves.toBe(0);

    expect(harness.stdout).toBe('Rewritten text.\n');
    expect(harness.stderr).toBe('');
    expect(harness.deps.resolveModel).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:1234/v1',
      model: undefined,
    });
    expect(harness.requests[0]).toMatchObject({
      document: 'Original text.',
      provider: {
        baseUrl: 'http://localhost:1234/v1',
        model: 'gemma-4-local',
        reasoningEffort: 'none',
      },
    });
  });

  it('reads input from a file and writes plain output to a file', async () => {
    const harness = createHarness();
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stylemakar-cli-'));
    const inputPath = path.join(dir, 'draft.md');
    const outputPath = path.join(dir, 'rewritten.md');
    await writeFile(inputPath, 'File text.', 'utf8');

    await expect(
      harness.run(['rewrite', inputPath, '--out', outputPath]),
    ).resolves.toBe(0);

    await expect(readFile(outputPath, 'utf8')).resolves.toBe('Rewritten text.');
    expect(harness.stdout).toBe('');
    expect(harness.requests[0]?.document).toBe('File text.');
  });

  it('reads piped stdin when no input argument is provided', async () => {
    const harness = createHarness();

    await expect(harness.run(['rewrite'], 'Piped text.')).resolves.toBe(0);

    expect(harness.stdout).toBe('Rewritten text.\n');
    expect(harness.requests[0]?.document).toBe('Piped text.');
  });

  it('emits full JSON output and passes debug options to the pipeline', async () => {
    const harness = createHarness();

    await expect(
      harness.run([
        'rewrite',
        'Original text.',
        '--json',
        '--debug',
        '--base-url',
        'http://localhost:11434/v1',
        '--model',
        'explicit-model',
        '--reasoning-effort',
        'low',
        '--final-smoothing',
        '--max-iterations',
        '1',
        '--no-meaning-check',
      ]),
    ).resolves.toBe(0);

    const body = JSON.parse(harness.stdout) as PipelineResult;
    expect(body.content).toBe('Rewritten text.');
    expect(body.model).toBe('explicit-model');
    expect(harness.deps.resolveModel).not.toHaveBeenCalled();
    expect(harness.requests[0]).toMatchObject({
      options: {
        finalSmoothing: true,
        includeDebug: true,
        maxRewriteIterations: 1,
        runMeaningCheck: false,
      },
      provider: {
        baseUrl: 'http://localhost:11434/v1',
        model: 'explicit-model',
        reasoningEffort: 'low',
      },
    });
  });

  it('loads a style profile and reference examples from JSON files', async () => {
    const harness = createHarness();
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stylemakar-cli-'));
    const profilePath = path.join(dir, 'profile.json');
    const examplesPath = path.join(dir, 'examples.json');
    await writeFile(
      profilePath,
      JSON.stringify({
        antiRules: ['Avoid hype.'],
        description: 'Plain prose.',
        id: 'plain',
        name: 'Plain',
        rules: ['Use short sentences.'],
      }),
      'utf8',
    );
    await writeFile(examplesPath, JSON.stringify(['Example one.']), 'utf8');

    await expect(
      harness.run([
        'rewrite',
        'Original text.',
        '--profile',
        profilePath,
        '--examples',
        examplesPath,
      ]),
    ).resolves.toBe(0);

    expect(harness.requests[0]?.styleProfile.id).toBe('plain');
    expect(harness.requests[0]?.referenceExamples).toEqual(['Example one.']);
  });

  it('lists provider models in text and JSON forms', async () => {
    const textHarness = createHarness();
    const jsonHarness = createHarness();

    await expect(textHarness.run(['models'])).resolves.toBe(0);
    await expect(jsonHarness.run(['models', '--json'])).resolves.toBe(0);

    expect(textHarness.stdout).toBe('- alpha\n* gemma-4-local\n');
    expect(JSON.parse(jsonHarness.stdout)).toEqual({
      baseUrl: 'http://localhost:1234/v1',
      models: [
        { id: 'alpha', selected: false },
        { id: 'gemma-4-local', selected: true },
      ],
    });
  });

  it('reports provider health without starting the web server', async () => {
    const harness = createHarness();

    await expect(harness.run(['health'])).resolves.toBe(0);

    expect(harness.stdout).toBe(
      'ok\nbaseUrl: http://localhost:1234/v1\nmodel: gemma-4-local\nmodels: 2\n',
    );
    expect(harness.deps.listModels).toHaveBeenCalledOnce();
    expect(harness.deps.runRewritePipeline).not.toHaveBeenCalled();
  });

  it('fails clearly for invalid profile JSON', async () => {
    const harness = createHarness();
    const dir = await mkdtemp(path.join(os.tmpdir(), 'stylemakar-cli-'));
    const profilePath = path.join(dir, 'profile.json');
    await writeFile(profilePath, JSON.stringify({ id: 'broken' }), 'utf8');

    await expect(
      harness.run(['rewrite', 'Original text.', '--profile', profilePath]),
    ).resolves.toBe(1);

    expect(harness.stdout).toBe('');
    expect(harness.stderr).toContain('Invalid input');
    expect(harness.deps.runRewritePipeline).not.toHaveBeenCalled();
  });

  it('fails when no input is provided', async () => {
    const harness = createHarness();

    await expect(harness.run(['rewrite'])).resolves.toBe(1);

    expect(harness.stderr).toContain(
      'Provide input as a file path, direct text, or stdin.',
    );
  });
});

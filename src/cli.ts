#!/usr/bin/env node
import { Command, CommanderError } from 'commander';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  DEFAULT_PROVIDER,
  DEFAULT_REFERENCE_EXAMPLES,
  DEFAULT_STYLE_PROFILE,
} from './shared/defaults';
import type {
  ModelInfo,
  ModelProviderSettings,
  PipelineRequest,
  PipelineResult,
  StyleProfile,
} from './shared/types';
import {
  listModels as defaultListModels,
  normalizeBaseUrl,
  resolveModel as defaultResolveModel,
} from './server/lmStudio';
import { runRewritePipeline as defaultRunRewritePipeline } from './server/pipeline';

type ReasoningEffort = NonNullable<ModelProviderSettings['reasoningEffort']>;

type CliIo = {
  argv: string[];
  stdin?: string;
  stdinIsTTY?: boolean;
  stdout?: (value: string) => void;
  stderr?: (value: string) => void;
};

type CliDeps = {
  listModels?: typeof defaultListModels;
  resolveModel?: typeof defaultResolveModel;
  runRewritePipeline?: typeof defaultRunRewritePipeline;
};

type RewriteCommandOptions = {
  baseUrl?: string;
  debug?: boolean;
  examples?: string;
  finalSmoothing?: boolean;
  json?: boolean;
  maxIterations?: number;
  meaningCheck?: boolean;
  model?: string;
  out?: string;
  profile?: string;
  reasoningEffort?: ReasoningEffort;
};

type ProviderCommandOptions = {
  baseUrl?: string;
  json?: boolean;
  model?: string;
};

const reasoningEffortSchema = z.enum([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
]);

const styleProfileSchema = z.object({
  antiRules: z.array(z.string()),
  description: z.string(),
  id: z.string(),
  name: z.string(),
  rules: z.array(z.string()),
}) satisfies z.ZodType<StyleProfile>;

const referenceExamplesSchema = z.array(z.string());

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected a number, received "${value}".`);
  }

  return parsed;
}

function parseReasoningEffort(value: string): ReasoningEffort {
  const parsed = reasoningEffortSchema.safeParse(value);

  if (!parsed.success) {
    throw new Error(
      'reasoning-effort must be one of: none, minimal, low, medium, high, xhigh.',
    );
  }

  return parsed.data;
}

async function readJsonFile(pathname: string): Promise<unknown> {
  const raw = await readFile(pathname, 'utf8');
  return JSON.parse(raw) as unknown;
}

async function readStyleProfile(pathname?: string): Promise<StyleProfile> {
  if (!pathname) {
    return DEFAULT_STYLE_PROFILE;
  }

  return styleProfileSchema.parse(await readJsonFile(pathname));
}

async function readReferenceExamples(pathname?: string): Promise<string[]> {
  if (!pathname) {
    return DEFAULT_REFERENCE_EXAMPLES;
  }

  return referenceExamplesSchema.parse(await readJsonFile(pathname));
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function resolveInput(
  input: string | undefined,
  io: CliIo,
): Promise<string> {
  if (input && existsSync(input)) {
    return readFile(input, 'utf8');
  }

  if (io.stdin !== undefined) {
    return io.stdin;
  }

  if (io.stdinIsTTY === false) {
    return readStdin();
  }

  if (input && input.trim().length > 0) {
    return input;
  }

  throw new Error('Provide input as a file path, direct text, or stdin.');
}

function compactModelRows(models: ModelInfo[]): string {
  return models
    .map((model) => `${model.selected ? '*' : '-'} ${model.id}`)
    .join('\n');
}

async function writeCommandOutput(
  value: string,
  options: { out?: string },
  io: CliIo,
): Promise<void> {
  if (options.out) {
    await mkdir(path.dirname(path.resolve(options.out)), { recursive: true });
    await writeFile(options.out, value, 'utf8');
    return;
  }

  io.stdout?.(value.endsWith('\n') ? value : `${value}\n`);
}

function writeWarnings(warnings: string[], io: CliIo): void {
  for (const warning of warnings) {
    io.stderr?.(`Warning: ${warning}\n`);
  }
}

async function runRewriteCommand(
  input: string | undefined,
  options: RewriteCommandOptions,
  io: CliIo,
  deps: Required<CliDeps>,
): Promise<void> {
  const document = await resolveInput(input, io);

  if (document.trim().length === 0) {
    throw new Error('Input document is empty.');
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const requestedModel =
    typeof options.model === 'string' && options.model.trim().length > 0
      ? options.model.trim()
      : undefined;
  const model =
    requestedModel ??
    (await deps.resolveModel({ baseUrl, model: DEFAULT_PROVIDER.model }));
  const request: PipelineRequest = {
    document,
    options: {
      finalSmoothing: options.finalSmoothing === true,
      includeDebug: options.debug === true,
      maxRewriteIterations: options.maxIterations,
      runMeaningCheck: options.meaningCheck,
    },
    provider: {
      baseUrl,
      model,
      reasoningEffort:
        options.reasoningEffort ?? DEFAULT_PROVIDER.reasoningEffort,
    },
    referenceExamples: await readReferenceExamples(options.examples),
    styleProfile: await readStyleProfile(options.profile),
  };
  const result = await deps.runRewritePipeline(request);
  const response: PipelineResult = { ...result, model };

  if (options.json) {
    await writeCommandOutput(
      `${JSON.stringify(response, null, 2)}\n`,
      options,
      io,
    );
    return;
  }

  writeWarnings(response.warnings, io);
  await writeCommandOutput(response.content, options, io);
}

async function runModelsCommand(
  options: ProviderCommandOptions,
  io: CliIo,
  deps: Required<CliDeps>,
): Promise<void> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const models = await deps.listModels({ baseUrl, model: options.model });

  if (options.json) {
    io.stdout?.(`${JSON.stringify({ baseUrl, models }, null, 2)}\n`);
    return;
  }

  io.stdout?.(`${compactModelRows(models)}\n`);
}

async function runHealthCommand(
  options: ProviderCommandOptions,
  io: CliIo,
  deps: Required<CliDeps>,
): Promise<void> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const models = await deps.listModels({ baseUrl, model: options.model });
  const selectedModel =
    models.find((model) => model.selected)?.id ??
    (await deps.resolveModel({ baseUrl, model: options.model }));
  const response = {
    baseUrl,
    model: selectedModel,
    models: models.length,
    ok: true,
  };

  if (options.json) {
    io.stdout?.(`${JSON.stringify(response, null, 2)}\n`);
    return;
  }

  io.stdout?.(
    `ok\nbaseUrl: ${response.baseUrl}\nmodel: ${response.model}\nmodels: ${response.models}\n`,
  );
}

function createProgram(io: CliIo, deps: Required<CliDeps>): Command {
  const program = new Command();

  program
    .name('stylemakar')
    .description(
      'Rewrite text into a target style with an OpenAI-compatible provider.',
    )
    .exitOverride()
    .configureOutput({
      writeErr: (value) => io.stderr?.(value),
      writeOut: (value) => io.stdout?.(value),
    });

  program
    .command('rewrite [input]')
    .description('Rewrite direct text, a file, or stdin.')
    .option('--out <path>', 'Write output to a file.')
    .option('--json', 'Emit the full pipeline result as JSON.')
    .option('--debug', 'Include pipeline debug fields in JSON output.')
    .option('--base-url <url>', 'OpenAI-compatible provider base URL.')
    .option('--model <id>', 'Provider model id.')
    .option(
      '--reasoning-effort <level>',
      'none, minimal, low, medium, high, or xhigh.',
      parseReasoningEffort,
    )
    .option('--profile <path>', 'Path to a StyleProfile JSON file.')
    .option('--examples <path>', 'Path to a JSON array of reference examples.')
    .option(
      '--final-smoothing',
      'Enable conservative final document smoothing.',
    )
    .option(
      '--max-iterations <number>',
      'Maximum style-rewrite retry iterations.',
      parseInteger,
    )
    .option('--no-meaning-check', 'Disable the meaning preservation check.')
    .action(
      async (input: string | undefined, options: RewriteCommandOptions) => {
        await runRewriteCommand(input, options, io, deps);
      },
    );

  program
    .command('models')
    .description('List models exposed by the provider.')
    .option('--base-url <url>', 'OpenAI-compatible provider base URL.')
    .option('--model <id>', 'Preferred model id.')
    .option('--json', 'Emit JSON output.')
    .action(async (options: ProviderCommandOptions) => {
      await runModelsCommand(options, io, deps);
    });

  program
    .command('health')
    .description('Check provider reachability and selected model.')
    .option('--base-url <url>', 'OpenAI-compatible provider base URL.')
    .option('--model <id>', 'Preferred model id.')
    .option('--json', 'Emit JSON output.')
    .action(async (options: ProviderCommandOptions) => {
      await runHealthCommand(options, io, deps);
    });

  return program;
}

export async function runCli(io: CliIo, deps: CliDeps = {}): Promise<number> {
  const stdout = io.stdout ?? ((value: string) => process.stdout.write(value));
  const stderr = io.stderr ?? ((value: string) => process.stderr.write(value));
  const resolvedDeps: Required<CliDeps> = {
    listModels: deps.listModels ?? defaultListModels,
    resolveModel: deps.resolveModel ?? defaultResolveModel,
    runRewritePipeline: deps.runRewritePipeline ?? defaultRunRewritePipeline,
  };
  const program = createProgram({ ...io, stderr, stdout }, resolvedDeps);

  try {
    await program.parseAsync(io.argv, { from: 'user' });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }

    if (error instanceof z.ZodError) {
      stderr(`${z.prettifyError(error)}\n`);
      return 1;
    }

    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const exitCode = await runCli({
    argv: process.argv.slice(2),
    stdinIsTTY: process.stdin.isTTY,
  });
  process.exit(exitCode);
}

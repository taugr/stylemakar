import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PROVIDER,
  DEFAULT_REFERENCE_EXAMPLES,
  DEFAULT_STYLE_PROFILE,
} from '../shared/defaults';
import type {
  AdaptiveVoiceComparisonRequest,
  ModelProviderSettings,
  RewriteApiRequest,
} from '../shared/types';
import type {
  EvalRewriteRequest,
  EvalRewriteResponse,
  StyleProfile,
} from '../shared/types';
import {
  completeJson,
  listModels,
  normalizeBaseUrl,
  probeProviderCapabilities,
  resolveModel,
} from './lmStudio';
import { runRewritePipeline } from './pipeline';
import { generateAdaptiveVoiceComparison } from './styleLab';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname, '../..');

type AsyncRoute = (
  request: Request,
  response: Response,
  next: NextFunction,
) => Promise<void>;

const EVAL_PROVIDER_IDS: Record<string, string> = {
  lmstudio: DEFAULT_PROVIDER.baseUrl,
};

function asyncRoute(handler: AsyncRoute): RequestHandler {
  return (request, response, next) => {
    void handler(request, response, next).catch(next);
  };
}

function hasGemmaFour(modelId: string): boolean {
  const normalized = modelId.toLowerCase();
  return (
    normalized.includes('gemma') && /(?:^|[^0-9])4(?:[^0-9]|$)/.test(normalized)
  );
}

function validateProviderSettings(body: unknown): ModelProviderSettings {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object.');
  }

  const candidate = body as Partial<ModelProviderSettings>;
  const baseUrl = normalizeBaseUrl(candidate.baseUrl);

  return {
    baseUrl,
    model: candidate.model?.trim() || undefined,
    reasoningEffort: candidate.reasoningEffort,
  };
}

export function validateRewriteRequest(body: unknown): RewriteApiRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object.');
  }

  const candidate = body as RewriteApiRequest;

  if (
    typeof candidate.document !== 'string' ||
    candidate.document.trim() === ''
  ) {
    throw new Error('document is required.');
  }

  if (
    candidate.provider?.baseUrl &&
    !/^https?:\/\/[^/]+/.test(candidate.provider.baseUrl)
  ) {
    throw new Error('provider.baseUrl must be an http(s) URL.');
  }

  return candidate;
}

function validateEvalRewriteRequest(body: unknown): EvalRewriteRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object.');
  }

  const candidate = body as EvalRewriteRequest;

  if (typeof candidate.source !== 'string' || candidate.source.trim() === '') {
    throw new Error('source is required.');
  }

  if (
    typeof candidate.styleProfileId !== 'string' ||
    candidate.styleProfileId.trim() === ''
  ) {
    throw new Error('styleProfileId is required.');
  }

  return candidate;
}

function readEvalProfile(styleProfileId: string): StyleProfile {
  const safeId = path.basename(styleProfileId);

  if (safeId !== styleProfileId) {
    throw new Error('Unknown eval style profile.');
  }

  const profilePath = path.resolve(
    projectRoot,
    'evals/fixtures/profiles',
    `${safeId}.json`,
  );

  if (!fs.existsSync(profilePath)) {
    throw new Error(`Unknown eval style profile: ${styleProfileId}`);
  }

  return JSON.parse(fs.readFileSync(profilePath, 'utf8')) as StyleProfile;
}

function readEvalReferenceExamples(styleProfileId: string): string[] {
  const examplesPath = path.resolve(
    projectRoot,
    'evals/fixtures/samples',
    `${styleProfileId}-samples.json`,
  );

  if (!fs.existsSync(examplesPath)) {
    return DEFAULT_REFERENCE_EXAMPLES;
  }

  const parsed = JSON.parse(fs.readFileSync(examplesPath, 'utf8')) as unknown;
  return Array.isArray(parsed) &&
    parsed.every((item) => typeof item === 'string')
    ? parsed
    : DEFAULT_REFERENCE_EXAMPLES;
}

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get(
    '/api/health',
    asyncRoute(async (request, response) => {
      try {
        const baseUrl =
          typeof request.query.baseUrl === 'string'
            ? normalizeBaseUrl(request.query.baseUrl)
            : DEFAULT_PROVIDER.baseUrl;
        const models = await listModels({ baseUrl });
        const selectedModel = models.find((model) => model.selected)?.id;
        response.json({
          gemma4Found: models.some((model) => hasGemmaFour(model.id)),
          lmStudioReachable: true,
          model: selectedModel ?? DEFAULT_PROVIDER.model,
          ok: true,
          status: 'connected',
        });
      } catch (error) {
        response.status(503).json({
          error: error instanceof Error ? error.message : 'Unknown error',
          gemma4Found: false,
          lmStudioReachable: false,
          model: DEFAULT_PROVIDER.model,
          ok: false,
          status: 'degraded',
        });
      }
    }),
  );

  app.post(
    '/api/provider/capabilities',
    asyncRoute(async (request, response) => {
      try {
        const provider = validateProviderSettings(request.body);
        response.json(await probeProviderCapabilities(provider));
      } catch (error) {
        response.status(400).json({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }),
  );

  app.get(
    '/api/models',
    asyncRoute(async (request, response) => {
      try {
        const baseUrl =
          typeof request.query.baseUrl === 'string'
            ? normalizeBaseUrl(request.query.baseUrl)
            : DEFAULT_PROVIDER.baseUrl;
        const models = await listModels({ baseUrl });
        response.json({ models });
      } catch (error) {
        response.status(502).json({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }),
  );

  app.post(
    '/api/rewrite',
    asyncRoute(async (request, response) => {
      try {
        const body = validateRewriteRequest(request.body);
        const baseUrl = normalizeBaseUrl(body.provider?.baseUrl);
        const requestedModel =
          typeof body.provider?.model === 'string' &&
          body.provider.model.trim().length > 0
            ? body.provider.model.trim()
            : undefined;
        const model = requestedModel ?? (await resolveModel({ baseUrl }));
        const controller = new AbortController();
        request.once('aborted', () => controller.abort());
        const result = await runRewritePipeline(
          {
            document: body.document,
            options: body.options,
            provider: {
              baseUrl,
              model,
              reasoningEffort: body.provider?.reasoningEffort,
            },
            referenceExamples:
              body.referenceExamples ?? DEFAULT_REFERENCE_EXAMPLES,
            styleProfile: body.styleProfile ?? DEFAULT_STYLE_PROFILE,
          },
          {
            completeJson,
            runId: body.runId,
            signal: controller.signal,
          },
        );

        response.json({ ...result, model });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        const status =
          message.includes('required') || message.includes('baseUrl')
            ? 400
            : 502;
        response.status(status).json({ error: message });
      }
    }),
  );

  app.post(
    '/api/rewrite/stream',
    asyncRoute(async (request, response) => {
      const controller = new AbortController();
      request.once('aborted', () => controller.abort());

      try {
        const body = validateRewriteRequest(request.body);
        const baseUrl = normalizeBaseUrl(body.provider?.baseUrl);
        const requestedModel =
          typeof body.provider?.model === 'string' &&
          body.provider.model.trim().length > 0
            ? body.provider.model.trim()
            : undefined;
        const model = requestedModel ?? (await resolveModel({ baseUrl }));

        response.status(200);
        response.setHeader('Cache-Control', 'no-cache, no-transform');
        response.setHeader('Content-Type', 'application/x-ndjson');
        response.flushHeaders();

        const result = await runRewritePipeline(
          {
            document: body.document,
            options: body.options,
            provider: {
              baseUrl,
              model,
              reasoningEffort: body.provider?.reasoningEffort,
            },
            referenceExamples:
              body.referenceExamples ?? DEFAULT_REFERENCE_EXAMPLES,
            styleProfile: body.styleProfile ?? DEFAULT_STYLE_PROFILE,
          },
          {
            completeJson,
            onProgress: (progress) => {
              response.write(
                `${JSON.stringify({ progress, type: 'progress' })}\n`,
              );
            },
            runId: body.runId,
            signal: controller.signal,
          },
        );

        response.end(
          `${JSON.stringify({ result: { ...result, model }, type: 'result' })}\n`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';

        if (response.headersSent) {
          response.end(
            `${JSON.stringify({ error: message, type: 'error' })}\n`,
          );
          return;
        }

        const status =
          message.includes('required') || message.includes('baseUrl')
            ? 400
            : 502;
        response.status(status).json({ error: message });
      }
    }),
  );

  app.post(
    '/api/style-lab/comparison',
    asyncRoute(async (request, response) => {
      try {
        const body = request.body as AdaptiveVoiceComparisonRequest;
        const provider = validateProviderSettings(body.provider);
        response.json(
          await generateAdaptiveVoiceComparison({ ...body, provider }),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        response.status(message.includes('requires') ? 400 : 502).json({
          error: message,
        });
      }
    }),
  );

  app.post(
    '/api/eval/rewrite',
    asyncRoute(async (request, response) => {
      try {
        const startedAt = performance.now();
        const body = validateEvalRewriteRequest(request.body);
        const styleProfile = readEvalProfile(body.styleProfileId);
        const baseUrl = normalizeBaseUrl(
          body.providerId
            ? (EVAL_PROVIDER_IDS[body.providerId] ?? body.providerId)
            : DEFAULT_PROVIDER.baseUrl,
        );
        const requestedModel =
          typeof body.model === 'string' && body.model.trim().length > 0
            ? body.model.trim()
            : undefined;
        const model = requestedModel ?? (await resolveModel({ baseUrl }));
        const result = await runRewritePipeline({
          document: body.source,
          options: {
            finalSmoothing: body.options?.runFinalSmoothing,
            includeDebug: true,
            maxRewriteIterations: body.options?.maxRewriteIterations,
            runMeaningCheck: body.options?.runMeaningCheck,
          },
          provider: {
            baseUrl,
            model,
            reasoningEffort: body.options?.reasoningEffort,
          },
          referenceExamples: readEvalReferenceExamples(body.styleProfileId),
          styleProfile,
        });
        const totalMs = Math.round(performance.now() - startedAt);
        const evalResponse: EvalRewriteResponse = {
          debug: {
            model,
            provider: baseUrl,
            segments: result.segments.map((segment, index) => {
              const segmentResult = result.debug?.segmentResults.find(
                (candidate) => candidate.originalText === segment.originalText,
              );

              return {
                attempts:
                  segmentResult?.attempts.map((attempt) => ({
                    feedback: attempt.revisionInstruction,
                    rewrittenText: attempt.rewrittenText,
                    styleScore: attempt.grade.overall,
                  })) ?? [],
                finalText: segment.finalText,
                index,
                meaningCheck: segmentResult
                  ? {
                      addedClaims: segmentResult.meaningCheck.addedClaims,
                      changedMeaning: segmentResult.meaningCheck.changedMeaning,
                      missingDetails: segmentResult.meaningCheck.missingDetails,
                      pass: segmentResult.meaningCheck.pass,
                    }
                  : undefined,
                originalText: segment.originalText,
                type: segment.type,
              };
            }),
            timings: {
              totalMs,
            },
          },
          finalText: result.content,
        };

        response.json(evalResponse);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        const status =
          message.includes('required') ||
          message.includes('Unknown eval style profile') ||
          message.includes('baseUrl')
            ? 400
            : 502;
        response.status(status).json({ error: message });
      }
    }),
  );

  const clientDist = path.resolve(projectRoot, 'dist/client');
  app.use(express.static(clientDist));
  app.get('/{*splat}', (_request, response) => {
    response.sendFile(path.join(clientDist, 'index.html'));
  });

  return app;
}

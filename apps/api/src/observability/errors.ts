import type { FastifyRequest } from 'fastify';
import type { App } from '../build-app.js';

/** Where unexpected server errors are reported (Sentry in deployed environments, nothing locally). */
export interface ErrorReporter {
  capture(error: unknown, context: ErrorContext): void;
  /** Sends what is still queued; call before the process exits. */
  flush(timeoutMs: number): Promise<void>;
}

/** No request body, headers or user data: medical records must not leak into error reports. */
export interface ErrorContext {
  method: string;
  /** Route pattern (`/pets/:petId`), never the real URL with ids. */
  route: string;
  statusCode: number;
  requestId: string;
}

export interface ErrorReporterConfig {
  SENTRY_DSN?: string | undefined;
  APP_ENV: string;
  APP_VERSION: string;
}

/**
 * Sentry reporter, or `undefined` when no DSN is set.
 * The SDK is imported on demand so a deployment without a DSN never loads it.
 */
export async function createErrorReporter(
  config: ErrorReporterConfig,
): Promise<ErrorReporter | undefined> {
  if (!config.SENTRY_DSN) return undefined;
  const Sentry = await import('@sentry/node');
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.APP_ENV,
    release: config.APP_VERSION,
    // Errors only: tracing would need the SDK loaded before every other import.
    tracesSampleRate: 0,
    // Medical data lives in request bodies, URLs and query strings: collect none of it.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
  });
  return {
    capture(error, context) {
      Sentry.captureException(error, {
        tags: { method: context.method, route: context.route },
        extra: { statusCode: context.statusCode, requestId: context.requestId },
      });
    },
    async flush(timeoutMs) {
      await Sentry.flush(timeoutMs);
    },
  };
}

/**
 * Reports requests that ended with a 5xx. Expected failures (validation, auth, domain errors → 4xx)
 * are not reported: module error handlers have already turned them into a proper response.
 */
export function registerErrorReporting(app: App, reporter: ErrorReporter): void {
  const failed = new WeakMap<FastifyRequest, unknown>();

  app.addHook('onError', (req, _reply, error, done) => {
    failed.set(req, error);
    done();
  });

  app.addHook('onResponse', (req, reply, done) => {
    const error = failed.get(req);
    if (error !== undefined && reply.statusCode >= 500) {
      reporter.capture(error, {
        method: req.method,
        route: req.routeOptions.url ?? 'unknown',
        statusCode: reply.statusCode,
        requestId: req.id,
      });
    }
    done();
  });
}

/** The API answered with an error status. `code` is the `error` field of the response body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** Seconds from the `retry-after` header, when the API sent one. */
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

/** The request never got an answer: no network, DNS failure, timeout. */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('network_error', { cause });
  }
}

interface Result<T> {
  data?: T;
  error?: { error: string };
  response: Response;
}

/** Turns an openapi-fetch result into data or a typed error. */
export async function unwrap<T>(request: Promise<Result<T>>): Promise<T> {
  let result: Result<T>;
  try {
    result = await request;
  } catch (cause) {
    if (cause instanceof ApiError || cause instanceof NetworkError) throw cause;
    // fetch rejects only when no response arrived at all.
    throw new NetworkError(cause);
  }
  const { data, error, response } = result;
  if (response.ok && data !== undefined) return data;
  const retryAfter = Number(response.headers.get('retry-after'));
  throw new ApiError(
    response.status,
    error?.error ?? 'unknown',
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  );
}

/** For endpoints that answer 204 with no body. */
export async function unwrapEmpty(request: Promise<{ response: Response }>): Promise<void> {
  let response: Response;
  try {
    ({ response } = await request);
  } catch (cause) {
    if (cause instanceof ApiError || cause instanceof NetworkError) throw cause;
    throw new NetworkError(cause);
  }
  if (!response.ok) throw new ApiError(response.status, 'unknown');
}

import { neonConfig } from '@neondatabase/serverless';
import pg from 'pg';

/**
 * Transport for the Neon HTTP driver that talks to a plain Postgres (ADR-0012).
 *
 * Production code runs `drizzle-orm/neon-http` on top of `neon()`, which POSTs every query to Neon's
 * SQL-over-HTTP proxy. Here that one HTTP call is answered in-process through `pg`, so tests execute
 * the real repositories, the real driver and real SQL — only the network hop is replaced.
 *
 * What the proxy does and this function repeats:
 * - a single query runs on its own (autocommit);
 * - `{ queries: [...] }` (drizzle `db.batch`, `sql.transaction`) runs as one transaction on one
 *   connection and is rolled back as a whole when a statement fails;
 * - values come back as raw text in array rows with the column type OIDs — the driver parses them;
 * - a Postgres error is answered with HTTP 400 and the error fields (`code`, `constraint`, …).
 */

/** Error fields the Neon driver copies from a 400 answer onto `NeonDbError`. */
const ERROR_FIELDS = [
  'severity',
  'code',
  'detail',
  'hint',
  'position',
  'internalPosition',
  'internalQuery',
  'where',
  'schema',
  'table',
  'column',
  'dataType',
  'constraint',
  'file',
  'line',
  'routine',
] as const;

const ISOLATION_LEVELS: Record<string, string> = {
  ReadUncommitted: 'read uncommitted',
  ReadCommitted: 'read committed',
  RepeatableRead: 'repeatable read',
  Serializable: 'serializable',
};

interface WireQuery {
  query: string;
  params: (string | null)[];
}

interface WireResult {
  fields: { name: string; dataTypeID: number }[];
  rows: (string | null)[][];
  command: string;
  rowCount: number | null;
  rowAsArray: true;
}

/** Keep every value as the text Postgres sent, like `Neon-Raw-Text-Output: true`. */
const rawText = { getTypeParser: () => (value: string) => value };

const isWireQuery = (value: unknown): value is WireQuery =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as WireQuery).query === 'string' &&
  Array.isArray((value as WireQuery).params);

async function run(client: pg.PoolClient, q: WireQuery): Promise<WireResult> {
  const res = await client.query<(string | null)[]>({
    text: q.query,
    values: q.params,
    rowMode: 'array',
    types: rawText,
  });
  return {
    fields: res.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    rows: res.rows,
    command: res.command,
    rowCount: res.rowCount,
    rowAsArray: true,
  };
}

function beginStatement(headers: Headers): string {
  const level = ISOLATION_LEVELS[headers.get('Neon-Batch-Isolation-Level') ?? ''];
  const parts = ['begin'];
  if (level) parts.push(`isolation level ${level}`);
  if (headers.get('Neon-Batch-Read-Only') === 'true') parts.push('read only');
  if (headers.get('Neon-Batch-Deferrable') === 'true') parts.push('deferrable');
  return parts.join(' ');
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function errorResponse(err: unknown): Response {
  if (!(err instanceof Error)) return new Response(String(err), { status: 500 });
  const body: Record<string, unknown> = { message: err.message };
  for (const field of ERROR_FIELDS) {
    const value = (err as unknown as Record<string, unknown>)[field];
    if (value !== undefined) body[field] = value;
  }
  // A Postgres error has a SQLSTATE code; anything else (connection lost, bad request) is not a 400.
  return typeof body.code === 'string' && body.code.length === 5
    ? json(400, body)
    : new Response(err.message, { status: 500 });
}

export interface NeonOverPg {
  /** Drop-in for `neonConfig.fetchFunction`. */
  fetch: (input: unknown, init?: RequestInit) => Promise<Response>;
  /** Closes every pool opened so far. */
  close: () => Promise<void>;
}

export function neonOverPg(options: { maxConnections?: number } = {}): NeonOverPg {
  // One pool per connection string, taken from the header the driver sends with every request.
  const pools = new Map<string, pg.Pool>();
  const poolFor = (connectionString: string) => {
    let pool = pools.get(connectionString);
    if (!pool) {
      pool = new pg.Pool({ connectionString, max: options.maxConnections ?? 8 });
      pools.set(connectionString, pool);
    }
    return pool;
  };

  return {
    async fetch(_input, init) {
      const headers = new Headers(init?.headers);
      const connectionString = headers.get('Neon-Connection-String');
      if (!connectionString || typeof init?.body !== 'string') {
        return new Response('neon-over-pg: not a Neon SQL request', { status: 500 });
      }
      const body: unknown = JSON.parse(init.body);
      let client: pg.PoolClient;
      try {
        client = await poolFor(connectionString).connect();
      } catch (err) {
        return errorResponse(err);
      }
      let broken = false;
      try {
        if (isWireQuery(body)) return json(200, await run(client, body));
        const queries = (body as { queries?: unknown }).queries;
        if (!Array.isArray(queries) || !queries.every(isWireQuery)) {
          return new Response('neon-over-pg: unexpected request body', { status: 500 });
        }
        await client.query(beginStatement(headers));
        try {
          const results: WireResult[] = [];
          for (const q of queries) results.push(await run(client, q));
          await client.query('commit');
          return json(200, { results });
        } catch (err) {
          await client.query('rollback').catch(() => {
            broken = true;
          });
          return errorResponse(err);
        }
      } catch (err) {
        return errorResponse(err);
      } finally {
        client.release(broken);
      }
    },
    async close() {
      const open = [...pools.values()];
      pools.clear();
      await Promise.all(open.map((pool) => pool.end()));
    },
  };
}

/**
 * Routes every `neon()` client of this process through `pg`. Returns the function that undoes it.
 * Call it before the first query; the connection string given to `neon()` picks the database.
 */
export function installNeonOverPg(options?: { maxConnections?: number }): () => Promise<void> {
  const transport = neonOverPg(options);
  const previous: unknown = neonConfig.fetchFunction;
  neonConfig.fetchFunction = transport.fetch;
  return async () => {
    neonConfig.fetchFunction = previous;
    await transport.close();
  };
}

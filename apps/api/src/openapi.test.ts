import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateOpenApi } from './openapi.js';

describe('OpenAPI spec', () => {
  it('is committed and up to date (run `pnpm gen:api` if this fails)', async () => {
    const committed = readFileSync(
      new URL('../../../packages/shared/openapi.json', import.meta.url),
      'utf8',
    );
    expect(await generateOpenApi()).toBe(committed);
  });

  it('documents /health', async () => {
    const spec = JSON.parse(await generateOpenApi()) as { paths: Record<string, unknown> };
    expect(spec.paths).toHaveProperty('/health');
  });
});

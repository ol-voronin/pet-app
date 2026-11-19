import { buildApp } from './app.js';

/** Builds the OpenAPI document. Version is fixed so the committed spec is stable. */
export async function generateOpenApi(): Promise<string> {
  const app = await buildApp({ version: '0.0.0' });
  await app.ready();
  const spec = app.swagger();
  await app.close();
  return `${JSON.stringify(spec, null, 2)}\n`;
}

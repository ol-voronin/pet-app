/**
 * Imports pet places from OpenStreetMap into `places`. Safe to run again: it updates in place.
 *
 *   DATABASE_URL=… pnpm -F api osm:import                         # all of Ukraine
 *   DATABASE_URL=… pnpm -F api osm:import --bbox=49.85,36.05,50.12,36.48
 *   DATABASE_URL=… pnpm -F api osm:import --from-file=overpass.json
 *   pnpm -F api osm:import --dry-run                               # fetch and count, write nothing
 *   pnpm -F api osm:import --save=overpass.json --dry-run          # keep the raw answer
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createDb } from '@pet-app/db';
import { DrizzlePlacesImportRepo } from '../modules/places/osm/drizzle-repo.js';
import { importOsm, type PlacesImportRepo } from '../modules/places/osm/import.js';
import type { OsmElement } from '../modules/places/osm/mapping.js';
import { MemoryPlacesImportRepo } from '../modules/places/osm/memory-repo.js';
import {
  buildQuery,
  fetchOverpass,
  OVERPASS_ENDPOINTS,
  type Bbox,
} from '../modules/places/osm/overpass.js';

const { values } = parseArgs({
  options: {
    bbox: { type: 'string' },
    'from-file': { type: 'string' },
    save: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

function parseBbox(raw: string): Bbox {
  const parts = raw.split(',').map(Number);
  const [south, west, north, east] = parts;
  if (
    parts.length !== 4 ||
    south === undefined ||
    west === undefined ||
    north === undefined ||
    east === undefined ||
    parts.some((n) => !Number.isFinite(n)) ||
    south >= north ||
    west >= east
  ) {
    throw new Error('--bbox expects south,west,north,east');
  }
  return [south, west, north, east];
}

const bbox = values.bbox ? parseBbox(values.bbox) : undefined;

let elements: OsmElement[];
if (values['from-file']) {
  const json = JSON.parse(readFileSync(values['from-file'], 'utf8')) as { elements: OsmElement[] };
  elements = json.elements;
  console.log(`Read ${String(elements.length)} elements from ${values['from-file']}`);
} else {
  const endpoints = process.env.OVERPASS_URL?.split(',').map((s) => s.trim()) ?? OVERPASS_ENDPOINTS;
  const result = await fetchOverpass(buildQuery(bbox), endpoints);
  elements = result.elements;
  console.log(
    `Fetched ${String(elements.length)} elements from ${result.endpoint} (OSM data as of ${result.osmBase ?? 'unknown'})`,
  );
  if (values.save) writeFileSync(values.save, JSON.stringify({ elements }));
}

let repo: PlacesImportRepo;
if (values['dry-run']) {
  repo = new MemoryPlacesImportRepo();
} else {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (or use --dry-run)');
  repo = new DrizzlePlacesImportRepo(createDb(url));
}

// "Gone from OSM" is decided only by a full run from the live API: a box or a saved file sees less.
const full = !bbox && !values['from-file'];
const stats = await importOsm(elements, repo, { markMissing: full });
console.log(values['dry-run'] ? 'Dry run, nothing written:' : 'Imported:');
console.log(JSON.stringify(stats, null, 2));

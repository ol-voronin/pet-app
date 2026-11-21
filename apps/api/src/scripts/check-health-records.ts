/**
 * Live check of the medical card API on a running staging server (#85): rights of owner, editor, viewer and a
 * stranger, versions, a no-op edit, parallel edits and soft delete — through HTTP, the Neon driver and the real
 * database, the parts the tests replace with stand-ins.
 *
 *   API_URL=https://pet.195-201-110-152.sslip.io pnpm -F api check:health-records
 *
 * Needs a staging API with `OTP_FIXED_CODE=000000`. Signs in fresh test phones, creates its own pets and records and
 * deletes the pets at the end. Never point it at production.
 */
import { z } from 'zod';

const apiUrl = process.env.API_URL;
if (!apiUrl) throw new Error('API_URL is required');
const api: string = apiUrl;
const code = process.env.OTP_CODE ?? '000000';

const recordShape = z.looseObject({
  id: z.uuid(),
  version: z.number(),
  source: z.string(),
  date: z.string(),
  title: z.string().nullable(),
});
const idShape = z.looseObject({ id: z.uuid() });
const errorShape = z.looseObject({ error: z.string() });
const listShape = z.union([z.array(z.unknown()), z.looseObject({ records: z.array(z.unknown()) })]);
const versionsShape = z.union([
  z.array(z.looseObject({ version: z.number() })),
  z.looseObject({ versions: z.array(z.looseObject({ version: z.number() })) }),
]);

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(method: string, path: string, token: string | null, body?: unknown) {
  const res = await fetch(api + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const errorOf = (json: unknown) => errorShape.safeParse(json).data?.error ?? '';
const countOf = (json: unknown) => {
  const list = listShape.parse(json);
  return Array.isArray(list) ? list.length : list.records.length;
};
const versionsOf = (json: unknown) => {
  const v = versionsShape.parse(json);
  return (Array.isArray(v) ? v : v.versions).map((item) => item.version).sort((a, b) => a - b);
};

async function signIn(): Promise<string> {
  // A random number per run: the OTP rate limit is per phone.
  const phone = `+38099${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const otp = z
    .looseObject({ challengeId: z.string() })
    .parse((await call('POST', '/auth/otp/request', null, { phone })).json);
  const tokens = z
    .looseObject({ accessToken: z.string() })
    .parse(
      (await call('POST', '/auth/otp/verify', null, { challengeId: otp.challengeId, code })).json,
    );
  return tokens.accessToken;
}

async function newPet(token: string, name: string) {
  return idShape.parse((await call('POST', '/pets', token, { name, species: 'dog' })).json).id;
}

async function join(owner: string, member: string, petId: string, role: 'editor' | 'viewer') {
  const invite = await call('POST', '/invites', owner, { petIds: [petId], role });
  const token = z.looseObject({ token: z.string() }).parse(invite.json).token;
  const accepted = await call('POST', '/invites/accept', member, { token });
  check(`${role} joins by invite`, accepted.status === 200, String(accepted.status));
}

const note = { type: 'note', date: '2026-11-02T09:00:00Z', details: { text: 'x' } };
const [owner, editor, viewer, stranger] = await Promise.all([
  signIn(),
  signIn(),
  signIn(),
  signIn(),
]);

// Owner + editor. Free plan: two members per pet, so the viewer gets a pet of their own below.
const petId = await newPet(owner, 'Перевірка медкарти');
await join(owner, editor, petId, 'editor');
const base = `/pets/${petId}/health-records`;

const created = await call('POST', base, owner, {
  type: 'vaccination',
  date: '2026-11-01T09:00:00Z',
  title: 'Сказ',
  details: { vaccineName: 'Nobivac Rabies', against: ['rabies'] },
  nextDueDate: '2027-11-01T09:00:00Z',
  source: 'ocr',
});
const record = recordShape.parse(created.json);
const one = `${base}/${record.id}`;
check('owner creates', created.status === 201, String(created.status));
check('source is set by the server', record.source === 'manual', record.source);
check('dates come back in UTC', record.date.endsWith('Z'), record.date);

const edit1 = await call('PATCH', one, editor, { clinicName: 'Vet for pet' });
check('editor edits → v2', recordShape.parse(edit1.json).version === 2);
const edit2 = await call('PATCH', one, editor, {
  details: { vaccineName: 'Nobivac Rabies', batch: 'A123', against: ['rabies'] },
});
check('editor replaces details → v3', recordShape.parse(edit2.json).version === 3);
const same = await call('PATCH', one, owner, {
  details: { against: ['rabies'], batch: 'A123', vaccineName: 'Nobivac Rabies' },
});
check('same content in another key order → still v3', recordShape.parse(same.json).version === 3);
check(
  'two replaced versions',
  versionsOf((await call('GET', `${one}/versions`, owner)).json).join() === '1,2',
);

const early = await call('POST', base, owner, {
  type: 'vaccination',
  date: '2026-11-01T09:00:00Z',
  details: { vaccineName: 'X' },
  nextDueDate: '2026-10-01T09:00:00Z',
});
check('next due date before the date → 400', early.status === 400, String(early.status));

const parallel = await Promise.all(
  [1, 2, 3, 4, 5].map((i) =>
    call('PATCH', one, i % 2 ? owner : editor, { title: `правка ${String(i)}` }),
  ),
);
const passed = parallel.filter((r) => r.status === 200).length;
const conflicts = parallel.filter(
  (r) => r.status === 409 && errorOf(r.json) === 'version_conflict',
).length;
check('5 parallel edits: 200 or 409 version_conflict only', passed + conflicts === 5 && passed > 0);
const final = recordShape.parse((await call('GET', one, owner)).json);
const snapshots = versionsOf((await call('GET', `${one}/versions`, owner)).json);
check(
  'versions without gaps or duplicates',
  final.version === 3 + passed && snapshots.join() === snapshots.map((_, i) => i + 1).join(),
  `v${String(final.version)}, snapshots ${snapshots.join(',')}`,
);
check('filter by type', countOf((await call('GET', `${base}?type=vaccination`, owner)).json) === 1);

for (const [method, path, body] of [
  ['GET', base],
  ['GET', one],
  ['POST', base, note],
  ['PATCH', one, { title: 'x' }],
  ['DELETE', one],
  ['GET', `${one}/versions`],
] as const) {
  const res = await call(method, path, stranger, body);
  check(
    `stranger ${method} → 404 pet_not_found`,
    res.status === 404 && errorOf(res.json) === 'pet_not_found',
  );
}
const strangerPet = await newPet(stranger, 'Чужий');
const cross = await call('GET', `/pets/${strangerPet}/health-records/${record.id}`, stranger);
check(
  "another pet's record → 404 health_record_not_found",
  cross.status === 404 && errorOf(cross.json) === 'health_record_not_found',
);

check('editor deletes', (await call('DELETE', one, editor)).status === 204);
check('deleted record is gone', (await call('GET', one, owner)).status === 404);
check(
  'deleted record cannot be edited',
  (await call('PATCH', one, owner, { title: 'y' })).status === 404,
);

// Viewer: reads everything, writes nothing.
const viewedPet = await newPet(owner, 'Перевірка viewer');
await join(owner, viewer, viewedPet, 'viewer');
const viewedBase = `/pets/${viewedPet}/health-records`;
const viewed = recordShape.parse(
  (
    await call('POST', viewedBase, owner, {
      type: 'treatment',
      date: '2026-11-03T08:00:00Z',
      details: { kind: 'deworming', product: 'Milbemax' },
    })
  ).json,
);
const viewedOne = `${viewedBase}/${viewed.id}`;
check('viewer reads the list', countOf((await call('GET', viewedBase, viewer)).json) === 1);
check('viewer reads a record', (await call('GET', viewedOne, viewer)).status === 200);
check('viewer reads versions', (await call('GET', `${viewedOne}/versions`, viewer)).status === 200);
for (const [method, path, body] of [
  ['POST', viewedBase, note],
  ['PATCH', viewedOne, { title: 'x' }],
  ['DELETE', viewedOne],
] as const) {
  check(`viewer ${method} → 403`, (await call(method, path, viewer, body)).status === 403);
}

for (const [token, id] of [
  [owner, petId],
  [owner, viewedPet],
  [stranger, strangerPet],
] as const) {
  await call('DELETE', `/pets/${id}`, token);
}
const deletedPet = await call('GET', base, owner);
check(
  'deleted pet → 404 pet_not_found',
  deletedPet.status === 404 && errorOf(deletedPet.json) === 'pet_not_found',
);

console.log(failed === 0 ? '\nAll checks passed' : `\n${String(failed)} check(s) failed`);
process.exitCode = failed === 0 ? 0 : 1;

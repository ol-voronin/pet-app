// Configures the admin panel (Directus) for map places. Safe to run again: it updates what exists.
//
//   DIRECTUS_URL=https://<domain>/cms DIRECTUS_ADMIN_EMAIL=… DIRECTUS_ADMIN_PASSWORD=… node bootstrap.mjs
//
// What it sets up: the `places` form (dropdowns, read-only OSM fields), three saved views
// (unverified points in Kharkiv, the moderation queue, points gone from OSM) and a "Moderator"
// role that can read, add and edit places and nothing else. No dependencies: Node 22 `fetch`.

// ADMIN_EMAIL / ADMIN_PASSWORD are the names in `directus.env`, so that file can be passed as is.
const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_EMAIL = process.env.DIRECTUS_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL;
const DIRECTUS_ADMIN_PASSWORD = process.env.DIRECTUS_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
if (!DIRECTUS_URL || !DIRECTUS_ADMIN_EMAIL || !DIRECTUS_ADMIN_PASSWORD) {
  throw new Error('Set DIRECTUS_URL, ADMIN_EMAIL and ADMIN_PASSWORD');
}
const base = DIRECTUS_URL.replace(/\/$/, '');
let token = '';

async function api(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text).data : undefined;
}

/** Updates the first item matching `filter`, or creates one. */
async function upsert(path, filter, item) {
  const query = encodeURIComponent(JSON.stringify(filter));
  const [existing] = await api('GET', `${path}?filter=${query}&limit=1`);
  if (existing) return api('PATCH', `${path}/${existing.id}`, item);
  return api('POST', path, item);
}

const choices = (map) => ({
  choices: Object.entries(map).map(([value, text]) => ({ value, text })),
});

const CATEGORY = {
  clinic: 'Ветклініка',
  pharmacy: 'Ветаптека',
  dog_park: 'Майданчик для вигулу',
  shop: 'Зоомагазин',
  groomer: 'Грумер',
  trainer: 'Кінолог, школа дресирування',
  cafe: 'Кафе',
  other: 'Інше',
};
const SOURCE = { osm: 'OpenStreetMap', manual: 'Додано вручну', user: 'Мітка користувача' };
const VISIBILITY = { public: 'Усім', private: 'Автору та родині' };
const MODERATION = { approved: 'Схвалено', pending: 'Чекає перевірки', rejected: 'Відхилено' };

const readonly = { readonly: true };
// Order here is the order on the form.
const FIELDS = [
  ['name', { interface: 'input', width: 'half', note: 'Як на вивісці. Може бути порожнім.' }],
  [
    'category',
    {
      interface: 'select-dropdown',
      options: choices(CATEGORY),
      display: 'labels',
      display_options: choices(CATEGORY),
      width: 'half',
    },
  ],
  ['address', { interface: 'input', width: 'half' }],
  ['city', { interface: 'input', width: 'half' }],
  ['phones', { interface: 'tags', width: 'half', note: 'У форматі +380XXXXXXXXX' }],
  ['website', { interface: 'input', width: 'half' }],
  [
    'opening_hours',
    { interface: 'input', width: 'half', note: 'Формат OSM: Mo-Fr 09:00-18:00; 24/7' },
  ],
  [
    'attributes',
    {
      interface: 'input-code',
      options: { language: 'json' },
      width: 'half',
      note: 'open247, emergency, fenced',
    },
  ],
  [
    'names',
    {
      interface: 'input-code',
      options: { language: 'json' },
      width: 'half',
      note: 'Інші написання для пошуку: uk, ru, en',
    },
  ],
  [
    'verified_at',
    {
      interface: 'datetime',
      width: 'half',
      note: 'Постав дату, коли перевірив точку. Після цього імпорт OSM її не змінює.',
    },
  ],
  ['verified_by', { interface: 'input', width: 'half' }],
  ['lat', { interface: 'input', width: 'half' }],
  ['lon', { interface: 'input', width: 'half' }],
  ['geom', { interface: 'map', ...readonly, width: 'full', note: 'Рахується з lat і lon.' }],
  [
    'source',
    {
      interface: 'select-dropdown',
      options: choices(SOURCE),
      width: 'half',
      note: 'Для нової точки — «Додано вручну».',
    },
  ],
  ['visibility', { interface: 'select-dropdown', options: choices(VISIBILITY), width: 'half' }],
  [
    'moderation_status',
    { interface: 'select-dropdown', options: choices(MODERATION), width: 'half' },
  ],
  [
    'deleted_at',
    {
      interface: 'datetime',
      width: 'half',
      note: 'Постав дату, щоб прибрати точку з карти. Рядок не видаляється.',
    },
  ],
  [
    'osm_missing_since',
    {
      interface: 'datetime',
      ...readonly,
      width: 'half',
      note: 'Імпорт більше не бачить точку в OSM.',
    },
  ],
  ['osm_seen_at', { interface: 'datetime', ...readonly, width: 'half' }],
  ['osm_type', { interface: 'input', ...readonly, width: 'half' }],
  ['osm_id', { interface: 'input', ...readonly, width: 'half' }],
  [
    'osm_tags',
    {
      interface: 'input-code',
      options: { language: 'json' },
      ...readonly,
      width: 'full',
      note: 'Теги OSM на момент останнього імпорту.',
    },
  ],
  ['created_at', { interface: 'datetime', ...readonly, width: 'half' }],
  ['updated_at', { interface: 'datetime', ...readonly, width: 'half' }],
  ['created_by', { interface: 'input', ...readonly, hidden: true }],
  ['id', { interface: 'input', ...readonly, hidden: true }],
];

const LIST_FIELDS = ['name', 'category', 'address', 'phones', 'verified_at', 'source'];
// Kharkiv with suburbs; the same box as the pilot in ADR-0005.
const KHARKIV = [{ lat: { _between: [49.8, 50.2] } }, { lon: { _between: [35.95, 36.6] } }];
const SHOWN = [{ deleted_at: { _null: true } }, { osm_missing_since: { _null: true } }];
const PRESETS = [
  {
    bookmark: 'Харків — не перевірені',
    icon: 'fact_check',
    filter: { _and: [...KHARKIV, ...SHOWN, { verified_at: { _null: true } }] },
  },
  {
    bookmark: 'Харків — перевірені',
    icon: 'verified',
    filter: { _and: [...KHARKIV, ...SHOWN, { verified_at: { _nnull: true } }] },
  },
  {
    bookmark: 'Черга модерації',
    icon: 'rule',
    filter: {
      _and: [
        { source: { _eq: 'user' } },
        { visibility: { _eq: 'public' } },
        { moderation_status: { _eq: 'pending' } },
      ],
    },
  },
  {
    bookmark: 'Зникли з OSM',
    icon: 'report',
    filter: { _and: [{ osm_missing_since: { _nnull: true } }, { deleted_at: { _null: true } }] },
  },
];

token = (
  await api('POST', '/auth/login', {
    email: DIRECTUS_ADMIN_EMAIL,
    password: DIRECTUS_ADMIN_PASSWORD,
  })
).access_token;

await api('PATCH', '/settings', {
  project_name: 'Pet App — точки карти',
  default_language: 'uk-UA',
});

// The database role sees only `places`, but Directus still lists the other table names: hide them.
const collections = await api('GET', '/collections');
for (const { collection } of collections) {
  if (collection.startsWith('directus_')) continue;
  const meta =
    collection === 'places'
      ? {
          icon: 'place',
          note: 'Точки карти: імпорт OSM, додані вручну, мітки користувачів',
          display_template: '{{name}}',
          hidden: false,
        }
      : { hidden: true };
  await api('PATCH', `/collections/${collection}`, { meta });
}

for (const [index, [field, meta]] of FIELDS.entries()) {
  await api('PATCH', `/fields/places/${field}`, { meta: { ...meta, sort: index + 1 } });
}

for (const preset of PRESETS) {
  await upsert(
    '/presets',
    { _and: [{ collection: { _eq: 'places' } }, { bookmark: { _eq: preset.bookmark } }] },
    {
      collection: 'places',
      bookmark: preset.bookmark,
      icon: preset.icon,
      user: null,
      role: null,
      layout: 'tabular',
      layout_query: { tabular: { fields: LIST_FIELDS, sort: ['name'], limit: 50 } },
      filter: preset.filter,
    },
  );
}

// A person who checks places: reads, adds and edits them. No delete, no settings, no other tables.
const policy = await upsert(
  '/policies',
  { name: { _eq: 'Places moderator' } },
  { name: 'Places moderator', icon: 'place', app_access: true, admin_access: false },
);
for (const action of ['read', 'create', 'update']) {
  await upsert(
    '/permissions',
    {
      _and: [
        { policy: { _eq: policy.id } },
        { collection: { _eq: 'places' } },
        { action: { _eq: action } },
      ],
    },
    {
      policy: policy.id,
      collection: 'places',
      action,
      fields: ['*'],
      permissions: {},
      validation: {},
    },
  );
}
const role = await upsert(
  '/roles',
  { name: { _eq: 'Модератор' } },
  { name: 'Модератор', icon: 'supervised_user_circle' },
);
const [linked] = await api(
  'GET',
  `/access?filter=${encodeURIComponent(JSON.stringify({ _and: [{ role: { _eq: role.id } }, { policy: { _eq: policy.id } }] }))}&limit=1`,
);
if (!linked) await api('POST', '/access', { role: role.id, policy: policy.id });

console.log(`Done: places form, ${PRESETS.length} saved views, role "Модератор".`);

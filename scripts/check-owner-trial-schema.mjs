import { readFile, readdir } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const TRIAL_PROJECT = 'enftprwcsrdbnlplfrwk';
const REQUIRED_COLUMNS = {
  production_records: {
    recipe_amount: 'numeric',
    preparation_recipe: 'jsonb',
    dough_only: 'boolean'
  },
  bazaar_kitchen_sources: { scheduled_id: 'uuid', product_id: 'text', source_drop: 'integer' },
  bazaar_kitchen_moves: {
    id: 'uuid',
    scheduled_id: 'uuid',
    product_id: 'text',
    day_id: 'uuid',
    kind: 'text',
    qty_delta: 'integer',
    at: 'timestamp with time zone',
    request: 'jsonb',
    acknowledgement: 'jsonb',
    source_records: 'jsonb',
    created_by: 'uuid'
  }
};

/** Catalog and migration metadata only; never select business or managed Auth rows. */
export function schemaQuery(inventorySql) {
  const inventory = inventorySql
    .replace(/^--.*$/gm, '')
    .trim()
    .replace(/;$/, '');
  return `select jsonb_build_object(
    'migrations', (select coalesce(jsonb_agg(version order by version), '[]'::jsonb)
      from supabase_migrations.schema_migrations),
    'inventory', (${inventory}) || ${CATALOG_TABLE_FACTS}) as hco_release_schema`;
}

/**
 * The hosted read-only query role sees only its own rows in information_schema.table_privileges
 * (and, depending on its grants, information_schema.columns), so those came back empty and the
 * deploy stopped at "Trial table inventory is unavailable" (14 November 2026). The same facts are
 * read from pg_catalog, which every role can read in full, and replace the information_schema ones.
 */
const CATALOG_TABLE_FACTS = `jsonb_build_object(
    'columns', (select coalesce(jsonb_agg(jsonb_build_object('table_name', c.relname,
        'column_name', a.attname, 'data_type', format_type(a.atttypid, null))
        order by c.relname, a.attnum), '[]'::jsonb)
      from pg_attribute a join pg_class c on c.oid = a.attrelid
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v')
        and a.attnum > 0 and not a.attisdropped),
    'table_grants', (select coalesce(jsonb_agg(jsonb_build_object('table_name', c.relname,
        'grantee', case when g.grantee = 0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end,
        'privilege_type', g.privilege_type)
        order by c.relname, g.grantee, g.privilege_type), '[]'::jsonb)
      from pg_class c, aclexplode(c.relacl) g
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v')))`;

/**
 * Hosted Postgres 17 quotes `json_value` (a keyword since 17) in pg_get_function_result; the
 * Postgres 15 the checkout is verified on does not. Quoting a plain lower-case identifier does
 * not change the signature, so both sides are compared unquoted.
 */
const unquoted = (text) =>
  typeof text === 'string' ? text.replace(/"([a-z_][a-z0-9_]*)"/g, '$1') : text;
/**
 * Supabase adds this event-trigger function to hosted projects. An event-trigger function
 * cannot be called through the API, so it is excluded only in exactly this shape.
 */
const isPlatformRlsTrigger = (row) =>
  row?.name === 'rls_auto_enable' &&
  row.identity === '' &&
  row.returns === 'event_trigger' &&
  row.owner === 'postgres';
const comparable = (rows) =>
  rows
    .filter((row) => !isPlatformRlsTrigger(row))
    .map((row) => ({ ...row, returns: unquoted(row.returns) }));

export function validateSchema(answer, expected) {
  if (!Array.isArray(answer) || answer.length !== 1 || !answer[0]?.hco_release_schema)
    throw Error('Trial schema check returned an invalid catalog response');
  const { migrations, inventory } = answer[0].hco_release_schema;
  if (!isDeepStrictEqual(migrations, expected.versions))
    throw Error('Trial migration inventory differs from the verified checkout; deployment blocked');
  if (!Array.isArray(inventory?.functions)) throw Error('Trial function inventory is unavailable');
  const key = (row) => `${row.name}|${row.identity}`;
  const ordered = (rows) => [...rows].sort((a, b) => key(a).localeCompare(key(b)));
  if (
    !isDeepStrictEqual(
      ordered(comparable(inventory.functions)),
      ordered(comparable(expected.functions))
    )
  )
    throw Error('Trial function bodies, signatures or authority differ; deployment blocked');
  if (
    !Array.isArray(inventory.columns) ||
    !Array.isArray(inventory.table_security) ||
    !Array.isArray(inventory.table_grants)
  )
    throw Error('Trial table inventory is unavailable');
  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const security = inventory.table_security.find((row) => row.table === table);
    if (!security?.rls || security.owner !== 'postgres')
      throw Error(`Trial ${table} security differs`);
    for (const [column, type] of Object.entries(columns)) {
      const found = inventory.columns.find(
        (row) => row.table_name === table && row.column_name === column
      );
      if (!found || found.data_type !== type)
        throw Error(`Trial ${table}.${column} contract differs`);
    }
    if (
      table.startsWith('bazaar_kitchen_') &&
      inventory.table_grants.some(
        (row) =>
          row.table_name === table &&
          ['PUBLIC', 'anon', 'authenticated', 'service_role'].includes(row.grantee)
      )
    )
      throw Error(`Trial ${table} must remain private`);
  }
  return { migrations: migrations.length, functions: inventory.functions.length };
}

export async function checkTrialSchema({ token, query, expected, request = fetch }) {
  if (!token?.trim())
    throw Error('Read-only trial schema check requires OPS_SUPABASE_ACCESS_TOKEN');
  let response;
  try {
    response = await request(
      `https://api.supabase.com/v1/projects/${TRIAL_PROJECT}/database/query`,
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, read_only: true })
      }
    );
  } catch {
    throw Error('Trial read-only schema check could not connect; deployment blocked');
  }
  if (!response.ok)
    throw Error(
      `Trial read-only schema check failed (HTTP ${response.status}); deployment blocked`
    );
  let answer;
  try {
    answer = await response.json();
  } catch {
    throw Error('Trial read-only schema check returned invalid JSON');
  }
  return validateSchema(answer, expected);
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const versions = (await readdir(path.join(root, 'supabase/migrations')))
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .map((name) => name.slice(0, 14))
    .sort();
  const { functions } = JSON.parse(
    await readFile(path.join(root, 'tests/fixtures/function-authority.json'), 'utf8')
  );
  const query = schemaQuery(
    await readFile(path.join(root, 'tests/integration/db/schema-inventory.sql'), 'utf8')
  );
  const result = await checkTrialSchema({
    token: process.env.SUPABASE_ACCESS_TOKEN,
    query,
    expected: { versions, functions }
  });
  console.log(
    `PASS read-only private-trial schema: ${result.migrations} migrations, ${result.functions} exact public functions; required production/transfer columns and private tables verified`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

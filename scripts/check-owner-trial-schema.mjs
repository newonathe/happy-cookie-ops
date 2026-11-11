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
    'inventory', (${inventory})) as hco_release_schema`;
}

export function validateSchema(answer, expected) {
  if (!Array.isArray(answer) || answer.length !== 1 || !answer[0]?.hco_release_schema)
    throw Error('Trial schema check returned an invalid catalog response');
  const { migrations, inventory } = answer[0].hco_release_schema;
  if (!isDeepStrictEqual(migrations, expected.versions))
    throw Error('Trial migration inventory differs from the verified checkout; deployment blocked');
  if (!Array.isArray(inventory?.functions)) throw Error('Trial function inventory is unavailable');
  const key = (row) => `${row.name}|${row.identity}`;
  const ordered = (rows) => [...rows].sort((a, b) => key(a).localeCompare(key(b)));
  if (!isDeepStrictEqual(ordered(inventory.functions), ordered(expected.functions)))
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

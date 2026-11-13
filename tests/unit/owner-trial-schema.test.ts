import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  checkTrialSchema,
  schemaQuery,
  validateSchema
} from '../../scripts/check-owner-trial-schema.mjs';

type FunctionRow = { name: string; identity: string } & Record<string, unknown>;
const expected: { versions: string[]; functions: FunctionRow[] } = {
  versions: ['20260101007100', '20260101008200'],
  functions: [
    { name: 'record_bake', identity: 'p_rec jsonb', body_md5: 'reviewed', execute_anon: false }
  ]
};
function answer() {
  const fields = {
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
  return [
    {
      hco_release_schema: {
        migrations: [...expected.versions],
        inventory: {
          functions: structuredClone(expected.functions),
          columns: Object.entries(fields).flatMap(([table_name, columns]) =>
            Object.entries(columns).map(([column_name, data_type]) => ({
              table_name,
              column_name,
              data_type
            }))
          ),
          table_security: Object.keys(fields).map((table) => ({
            table,
            owner: 'postgres',
            rls: true
          })),
          table_grants: [] as Array<{ table_name: string; grantee: string }>
        }
      }
    }
  ];
}

describe('private trial deployment schema boundary', () => {
  it('checks the fixed hosted schema before any deployment and maps the existing read token', () => {
    const workflow = readFileSync('.github/workflows/owner-trial.yml', 'utf8');
    const check = workflow.indexOf('node scripts/check-owner-trial-schema.mjs');
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(workflow.indexOf('node scripts/check-owner-trial-release.mjs'));
    expect(workflow).toContain('SUPABASE_ACCESS_TOKEN: ${{ secrets.OPS_SUPABASE_ACCESS_TOKEN }}');
  });

  it('accepts only the reviewed migration, function and required table contracts', () => {
    expect(validateSchema(answer(), expected)).toEqual({ migrations: 2, functions: 1 });
  });

  it.each([
    'missing migration',
    'unexpected migration',
    'missing function',
    'body drift',
    'public execute',
    'missing column',
    'wrong type',
    'missing table',
    'disabled RLS',
    'foreign owner',
    'raw API grant'
  ])('blocks deployment for %s', (mutation) => {
    const fixture = answer(),
      data = fixture[0]!.hco_release_schema,
      inventory = data.inventory;
    if (mutation === 'missing migration') data.migrations.pop();
    if (mutation === 'unexpected migration') data.migrations.push('20990101000100');
    if (mutation === 'missing function') inventory.functions = [];
    if (mutation === 'body drift') inventory.functions[0]!.body_md5 = 'changed';
    if (mutation === 'public execute') inventory.functions[0]!.execute_anon = true;
    if (mutation === 'missing column') inventory.columns.pop();
    if (mutation === 'wrong type') inventory.columns[0]!.data_type = 'text';
    if (mutation === 'missing table') inventory.table_security.pop();
    if (mutation === 'disabled RLS') inventory.table_security[0]!.rls = false;
    if (mutation === 'foreign owner') inventory.table_security[0]!.owner = 'authenticated';
    if (mutation === 'raw API grant')
      inventory.table_grants.push({ table_name: 'bazaar_kitchen_moves', grantee: 'authenticated' });
    expect(() => validateSchema(fixture, expected)).toThrow();
  });

  it('treats Postgres 17 identifier quoting in a return type as the same signature', () => {
    const exp = structuredClone(expected);
    const reviewed = { ...exp.functions[0]!, returns: 'TABLE(key text, json_value jsonb)' };
    exp.functions = [reviewed];
    const fixture = answer();
    fixture[0]!.hco_release_schema.inventory.functions = [
      { ...reviewed, returns: 'TABLE(key text, "json_value" jsonb)' }
    ];
    expect(validateSchema(fixture, exp)).toEqual({ migrations: 2, functions: 1 });
  });

  it('still blocks a real return-type change', () => {
    const exp = structuredClone(expected);
    const reviewed = { ...exp.functions[0]!, returns: 'TABLE(key text, json_value jsonb)' };
    exp.functions = [reviewed];
    const fixture = answer();
    fixture[0]!.hco_release_schema.inventory.functions = [
      { ...reviewed, returns: 'TABLE(key text, "json_value" text)' }
    ];
    expect(() => validateSchema(fixture, exp)).toThrow();
  });

  it('keeps a quoted mixed-case identifier distinct from its lower-case form', () => {
    const exp = structuredClone(expected);
    const reviewed = { ...exp.functions[0]!, returns: 'TABLE(key text)' };
    exp.functions = [reviewed];
    const fixture = answer();
    fixture[0]!.hco_release_schema.inventory.functions = [
      { ...reviewed, returns: 'TABLE("Key" text)' }
    ];
    expect(() => validateSchema(fixture, exp)).toThrow();
  });

  it('still blocks a changed security definer on an ordinary function', () => {
    const fixture = answer();
    fixture[0]!.hco_release_schema.inventory.functions = [
      { ...expected.functions[0]!, security_definer: true } as (typeof expected.functions)[number]
    ];
    expect(() => validateSchema(fixture, expected)).toThrow();
  });

  const platformTrigger = {
    name: 'rls_auto_enable',
    identity: '',
    returns: 'event_trigger',
    owner: 'postgres',
    body_md5: 'platform',
    execute_anon: true
  };

  it('ignores only the Supabase rls_auto_enable event trigger in its exact shape', () => {
    const fixture = answer();
    fixture[0]!.hco_release_schema.inventory.functions.push({ ...platformTrigger });
    expect(validateSchema(fixture, expected)).toEqual({ migrations: 2, functions: 2 });
  });

  it.each([
    ['a callable return type', { returns: 'void' }],
    ['arguments', { identity: 'p jsonb' }],
    ['a foreign owner', { owner: 'authenticated' }],
    ['another name', { name: 'rls_auto_enable_2' }]
  ])('blocks a lookalike of the platform trigger with %s', (_label, change) => {
    const fixture = answer();
    fixture[0]!.hco_release_schema.inventory.functions.push({ ...platformTrigger, ...change });
    expect(() => validateSchema(fixture, expected)).toThrow();
  });

  it.each([
    null,
    {},
    [],
    [null],
    [{ hco_release_schema: { migrations: expected.versions, inventory: null } }]
  ])('refuses malformed catalog answers', (fixture) =>
    expect(() => validateSchema(fixture, expected)).toThrow()
  );

  it('builds a catalog-only SELECT from the existing local SQL inventory', () => {
    const query = schemaQuery(readFileSync('tests/integration/db/schema-inventory.sql', 'utf8'));
    expect(query).toMatch(/^select jsonb_build_object/);
    expect(query).toContain('supabase_migrations.schema_migrations');
    expect(query).toContain('md5(p.prosrc)');
    expect(query).not.toMatch(/\b(?:from|join)\s+(?:public|auth)\./i);
    expect(query).not.toMatch(/\b(?:insert|update|delete|alter|create|drop)\s/i);
  });

  it('uses only the fixed trial endpoint, a read-only body, no redirects and a deadline', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify(answer())));
    await expect(
      checkTrialSchema({ token: 'synthetic-token', query: 'select catalog', expected, request })
    ).resolves.toEqual({ migrations: 2, functions: 1 });
    expect(request).toHaveBeenCalledWith(
      'https://api.supabase.com/v1/projects/enftprwcsrdbnlplfrwk/database/query',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: JSON.stringify({ query: 'select catalog', read_only: true }),
        signal: expect.anything()
      })
    );
  });

  it('does not call the API without a token', async () => {
    const request = vi.fn();
    await expect(checkTrialSchema({ token: '', query: '', expected, request })).rejects.toThrow(
      'requires OPS_SUPABASE_ACCESS_TOKEN'
    );
    expect(request).not.toHaveBeenCalled();
  });

  it.each(['http', 'network', 'invalid JSON'])(
    'fails closed without disclosing raw %s errors',
    async (failure) => {
      const request = vi.fn(async () => {
        if (failure === 'network') throw Error('synthetic-private-token');
        return new Response('synthetic-private-token', { status: failure === 'http' ? 403 : 200 });
      });
      await expect(
        checkTrialSchema({ token: 'synthetic-token', query: '', expected, request })
      ).rejects.toThrow(/schema check/);
    }
  );
});

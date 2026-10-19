import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareHistoricalLedgerAppend } from '../../scripts/prepare-historical-ledger.mjs';
import { parseArgs, prepareNewerSales, runNewerSales } from '../../scripts/prepare-newer-sales.mjs';

const owner = '00000000-0000-4000-8000-000000000001';
const sourceHash = 'a'.repeat(64);
const ledgerHash = 'c'.repeat(64);
const plan = () => ({
  source_sha256: sourceHash,
  dummy_workbook_excluded_entirely: true,
  ledger_plan: [
    {
      id: '00000000-0000-4000-8000-000000000012',
      kind: 'sale',
      category: 'Historical sales',
      memo: 'Workbook Sales row 7',
      amount_cents: 20000,
      occurred_at: '2026-09-28T00:00:00+08:00',
      source: 'Sales!A7:I7'
    },
    {
      id: '00000000-0000-4000-8000-000000000013',
      kind: 'sale',
      category: 'Historical sales',
      memo: 'Workbook Sales row 8',
      amount_cents: 8050,
      occurred_at: '2026-09-28T00:00:00+08:00',
      source: 'Sales!A8:I8'
    }
  ]
});
const args = (over: Record<string, unknown> = {}) => ({
  plan: plan(),
  owner,
  ledgerHash,
  sourceSha256: sourceHash,
  approveAssumptions: true,
  ...over
});

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'newer-sales-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe('newer sales preparer (CLI wrapper)', () => {
  it('parses the flags and never defaults the approval to true', () => {
    const base = [
      '--plan',
      'p.json',
      '--owner',
      owner,
      '--ledger-hash',
      ledgerHash,
      '--source-sha256',
      sourceHash,
      '--out',
      'o'
    ];
    expect(parseArgs(base)).toMatchObject({
      plan: 'p.json',
      owner,
      ledgerHash,
      sourceSha256: sourceHash,
      out: 'o',
      approveAssumptions: false
    });
    expect(parseArgs([...base, '--approve-assumptions']).approveAssumptions).toBe(true);
    expect(() => parseArgs(base.slice(2))).toThrow(/--plan/);
    expect(() => parseArgs([...base, '--approve-assumptions=yes'])).toThrow(/Unknown/);
    expect(() => parseArgs([...base, '--approve'])).toThrow(/Unknown/);
  });

  it('refuses without --approve-assumptions, even when the plan file claims the approval', () => {
    expect(() => prepareNewerSales(args({ approveAssumptions: false }))).toThrow(
      /--approve-assumptions/
    );
    const claimed = { ...plan(), owner_approved_date_and_repeat_assumptions: true };
    expect(() => prepareNewerSales(args({ plan: claimed, approveAssumptions: false }))).toThrow(
      /--approve-assumptions/
    );
  });

  it('builds the rollback-only append against the exact ledger hash, with a manifest', () => {
    const r = prepareNewerSales(args());
    expect(r.sql).toMatch(/rollback;\s*$/);
    expect(r.sql).toContain(`is distinct from '${ledgerHash}'`);
    expect(r.sql).not.toContain('or exists(select 1 from public.ledger_entries)');
    expect(r.sql).toContain('Workbook Sales row 7');
    expect(r.manifest).toMatchObject({
      source_sha256: sourceHash,
      existing_ledger_hash: ledgerHash,
      owner,
      rows: 2,
      sales_cents: '28050'
    });
    expect(r.manifest.plan_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(r.manifest)).not.toMatch(/memo|ledger_plan|Workbook/);
    // The guard that the SQL carries, and the order it forces: before the cutover, the opening counts and the first order.
    expect(r.sql).toContain(
      "cost_basis from public.books_settings where id) is distinct from 'bought'"
    );
    expect(r.sql).toContain('exists(select 1 from public.stock_movements)');
    expect(r.sql).toContain('exists(select 1 from public.orders)');
    expect(r.manifest.run_before).toMatch(/cutover/);
  });

  it('agrees with prepareHistoricalLedgerAppend on the plan hash and the money', () => {
    const direct = prepareHistoricalLedgerAppend(
      {
        source_sha256: sourceHash,
        dummy_workbook_excluded_entirely: true,
        receipt_import_mode: 'link_existing_ledger_only',
        owner_approved_date_and_repeat_assumptions: true,
        ledger_plan: plan().ledger_plan
      },
      owner,
      ledgerHash
    );
    const r = prepareNewerSales(args());
    expect(r.manifest.plan_hash).toBe(direct.planHash);
    expect(r.sql).toBe(direct.sql);
    expect(r.manifest.sales_cents).toBe(direct.salesCents);
  });

  it('refuses a plan that does not belong to the stated source, or that did not exclude the dummy', () => {
    expect(() => prepareNewerSales(args({ sourceSha256: 'd'.repeat(64) }))).toThrow(/source/i);
    const noDummy = { ...plan(), dummy_workbook_excluded_entirely: undefined };
    expect(() => prepareNewerSales(args({ plan: noDummy }))).toThrow(/Dummy/);
    expect(() => prepareNewerSales(args({ ledgerHash: 'bad' }))).toThrow();
    expect(() => prepareNewerSales(args({ plan: { ...plan(), ledger_plan: [] } }))).toThrow();
  });

  it('writes the SQL and the manifest to --out, and nothing when it refuses', () => {
    const d = tmp();
    const planFile = join(d, 'ledger_plan.json');
    writeFileSync(planFile, JSON.stringify(plan()));
    const base = [
      '--plan',
      planFile,
      '--owner',
      owner,
      '--ledger-hash',
      ledgerHash,
      '--source-sha256',
      sourceHash,
      '--out',
      join(d, 'out')
    ];
    expect(() => runNewerSales(base)).toThrow(/--approve-assumptions/);
    expect(existsSync(join(d, 'out'))).toBe(false);
    const done = runNewerSales([...base, '--approve-assumptions']);
    expect(readdirSync(join(d, 'out')).sort()).toEqual(['append.sql', 'manifest.json']);
    expect(readFileSync(join(d, 'out', 'append.sql'), 'utf8')).toMatch(/rollback;\s*$/);
    expect(JSON.parse(readFileSync(join(d, 'out', 'manifest.json'), 'utf8')).plan_hash).toBe(
      done.manifest.plan_hash
    );
  });

  it('states the sequencing fact in the script header', () => {
    const src = readFileSync('scripts/prepare-newer-sales.mjs', 'utf8');
    expect(src).toMatch(/BEFORE the cutover, the opening counts and the first order/);
  });
});

describe('b4b-trial-reads.sql', () => {
  const sql = readFileSync('scripts/b4b-trial-reads.sql', 'utf8');
  const code = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

  it('uses the exact ledger hash expression the append guard compares', () => {
    const generated = prepareHistoricalLedgerAppend(
      {
        source_sha256: sourceHash,
        dummy_workbook_excluded_entirely: true,
        receipt_import_mode: 'link_existing_ledger_only',
        owner_approved_date_and_repeat_assumptions: true,
        ledger_plan: plan().ledger_plan
      },
      owner,
      ledgerHash
    ).sql;
    const m = generated.match(
      /or (\(select encode\(.*? from public\.ledger_entries l\)) is distinct from /
    );
    expect(m).not.toBeNull();
    expect(code).toContain((m as RegExpMatchArray)[1]);
  });

  it('holds three read-only queries and no memo, customer or phone column', () => {
    const statements = code
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(3);
    for (const s of statements) expect(s).toMatch(/^select\b/i);
    expect(code).not.toMatch(/\b(insert|update|delete|drop|alter|create|truncate|grant)\b/i);
    expect(code).not.toMatch(/\b(memo|customer|phone|email|payload_hash|created_by)\b/i);
    expect(code).toMatch(/from public\.inventory_items/);
    expect(code).toMatch(/from public\.products/);
    expect(code).toMatch(/from public\.ledger_entries/);
  });
});

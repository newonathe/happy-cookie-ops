import { describe, expect, it } from 'vitest';
import {
  prepareHistoricalLedger,
  prepareHistoricalLedgerAppend,
  prepareHistoricalReceiptLink
} from '../../scripts/prepare-historical-ledger.mjs';

const owner = '00000000-0000-4000-8000-000000000001';
const input = () => ({
  source_sha256: 'a'.repeat(64),
  dummy_workbook_excluded_entirely: true,
  receipt_import_mode: 'link_existing_ledger_only',
  ledger_plan: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      kind: 'sale',
      category: 'Historical sales',
      memo: "Workbook Sales row 2; owner's line",
      amount_cents: 13000,
      occurred_at: '2026-03-05T00:00:00+08:00',
      source: 'Sales!A2:I2'
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      kind: 'cost',
      category: 'Historical stock purchases',
      memo: 'Workbook receipt',
      amount_cents: -4250,
      occurred_at: '2026-03-04T00:00:00+08:00',
      source: 'Inventory-In!A2:H2'
    }
  ]
});

describe('historical ledger preparation', () => {
  it('requires explicit date/repeat approval and an exact existing-ledger hash for appends', () => {
    expect(() => prepareHistoricalLedgerAppend(input(), owner, 'b'.repeat(64))).toThrow('approval');
    const approved = { ...input(), owner_approved_date_and_repeat_assumptions: true };
    const plan = prepareHistoricalLedgerAppend(approved, owner, 'b'.repeat(64));
    expect(plan.sql).toContain('jsonb_agg(to_jsonb(l) order by l.id)');
    expect(plan.sql).toContain(`is distinct from '${'b'.repeat(64)}'`);
    expect(plan.sql).not.toContain('or exists(select 1 from public.ledger_entries)');
    expect(plan.sql).toMatch(/rollback;\s*$/);
    expect(() => prepareHistoricalLedgerAppend(approved, owner, 'bad')).toThrow();
  });
  it('preserves money and original dates in a rollback-only plan without stock or order writes', () => {
    const plan = prepareHistoricalLedger(input(), owner);
    expect(plan.salesCents).toBe('13000');
    expect(plan.costCents).toBe('-4250');
    expect(plan.sql).toContain('2026-03-05T00:00:00+08:00');
    expect(plan.sql).toContain("owner''s line");
    expect(plan.sql).toMatch(/rollback;\s*$/);
    expect(plan.sql).not.toMatch(/insert into public\.(orders|stock_movements)/);
    expect(plan.sql).toContain('cost_basis from public.books_settings');
  });
  it('rejects repeated source rows and duplicate ids rather than relying on an overwrite', () => {
    const repeated = input();
    repeated.ledger_plan.push({ ...repeated.ledger_plan[0] });
    expect(() => prepareHistoricalLedger(repeated, owner)).toThrow('Duplicate');
  });
  it('rejects wrong money directions, fractional cents and missing dates', () => {
    const wrong = input();
    wrong.ledger_plan[0].amount_cents = -13000;
    expect(() => prepareHistoricalLedger(wrong, owner)).toThrow('mismatch');
    const fraction = input();
    fraction.ledger_plan[0].amount_cents = 13000.1;
    expect(() => prepareHistoricalLedger(fraction, owner)).toThrow();
    const missing = input();
    missing.ledger_plan[0].occurred_at = '';
    expect(() => prepareHistoricalLedger(missing, owner)).toThrow();
  });
  it('requires explicit dummy exclusion and escapes source-derived memo text', () => {
    const dummy = input();
    dummy.dummy_workbook_excluded_entirely = false;
    expect(() => prepareHistoricalLedger(dummy, owner)).toThrow('Dummy');
    const hostile = input();
    hostile.ledger_plan[0].memo = "'); delete from public.orders; --";
    expect(prepareHistoricalLedger(hostile, owner).sql).toContain(
      "''); delete from public.orders; --"
    );
  });
  it('requires durable expense provenance, a historical opening balance, and links receipts without booking a second cost', () => {
    const plan = prepareHistoricalLedger(input(), owner);
    const manifest = { source_sha256: plan.sourceHash, receipt_links: plan.receiptLinks };
    const receipt = {
      id: '00000000-0000-4000-8000-000000000004',
      source: 'Inventory-In!A2:H2',
      item_id: 'butter',
      unit: 'g',
      qty: 1000,
      supplier: 'Source supplier'
    };
    const sql = prepareHistoricalReceiptLink(manifest, receipt, owner);
    expect(sql).toContain("kind='opening'");
    expect(sql).toContain('Existing receipt expense/provenance mismatch');
    expect(sql).toContain('Historical receipt is already linked');
    expect(sql).not.toContain('insert into public.ledger_entries');
    expect(sql).not.toContain('record_stock_movement');
    expect(sql).toMatch(/rollback;\s*$/);
    expect(() =>
      prepareHistoricalReceiptLink({ ...manifest, receipt_links: [] }, receipt, owner)
    ).toThrow('durable');
  });
});

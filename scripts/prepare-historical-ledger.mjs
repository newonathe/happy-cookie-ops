import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

const line = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['sale', 'cost']),
    category: z.enum(['Historical sales', 'Historical stock purchases']),
    memo: z.string().min(1).max(120),
    amount_cents: z.number().int().safe(),
    occurred_at: z.string().datetime({ offset: true }),
    source: z.string().regex(/^(Sales!A\d+:I\d+|Inventory-In!A\d+:H\d+)$/)
  })
  .strict();

const quote = (s) => `'${s.replaceAll("'", "''")}'`;

/** Append only new source rows to an independently reviewed exact database snapshot. */
export function prepareHistoricalLedgerAppend(input, ownerId, existingLedgerHash) {
  const hash = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(existingLedgerHash);
  if (input.owner_approved_date_and_repeat_assumptions !== true)
    throw new Error('Explicit owner source-date/repeat approval required');
  const plan = prepareHistoricalLedger(input, ownerId);
  const emptyGuard = 'or exists(select 1 from public.ledger_entries)';
  const exactGuard = `or (select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]'::jsonb)::text,'sha256'),'hex') from public.ledger_entries l) is distinct from ${quote(hash)}`;
  if (!plan.sql.includes(emptyGuard)) throw new Error('Append guard location changed');
  return {
    ...plan,
    existingLedgerHash: hash,
    sql: plan.sql.replace(emptyGuard, exactGuard),
    boundary: 'Dry-run only; exact existing ledger snapshot required. Original rows are retained.'
  };
}

// This prepares an offline plan. It never connects to a database or accepts credentials.
export function prepareHistoricalLedger(input, ownerId) {
  const owner = z.string().uuid().parse(ownerId);
  const sourceHash = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(input.source_sha256);
  if (input.dummy_workbook_excluded_entirely !== true) throw new Error('Dummy exclusion required');
  if (input.receipt_import_mode !== 'link_existing_ledger_only')
    throw new Error('Historical receipt linkage contract required');
  const rows = z.array(line).min(1).max(5000).parse(input.ledger_plan);
  if (
    new Set(rows.map((r) => r.id)).size !== rows.length ||
    new Set(rows.map((r) => r.source)).size !== rows.length
  )
    throw new Error('Duplicate source or id');
  for (const row of rows) {
    const sale = row.kind === 'sale';
    if (
      (sale &&
        (row.amount_cents <= 0 ||
          row.category !== 'Historical sales' ||
          !row.source.startsWith('Sales!'))) ||
      (!sale &&
        (row.amount_cents >= 0 ||
          row.category !== 'Historical stock purchases' ||
          !row.source.startsWith('Inventory-In!')))
    )
      throw new Error('Historical line sign/category/source mismatch');
    if (new Date(row.occurred_at).getTime() > Date.now()) throw new Error('Future historical date');
  }
  const json = JSON.stringify(rows);
  const planHash = createHash('sha256').update(json).digest('hex');
  const totals = rows.reduce(
    (a, r) => {
      a[r.kind] += BigInt(r.amount_cents);
      return a;
    },
    { sale: 0n, cost: 0n }
  );
  const recordset = `${quote(json)}::jsonb`;
  const receiptLinks = rows
    .filter((r) => r.kind === 'cost')
    .map((r) => ({
      source: r.source,
      ledger_id: r.id,
      amount_cents: r.amount_cents,
      occurred_at: r.occurred_at,
      mode: 'link_existing_ledger_only'
    }));
  const manifest = { source_sha256: sourceHash, plan_hash: planHash, receipt_links: receiptLinks };
  const sql = `begin;
select pg_advisory_xact_lock(hashtextextended('f2_historical_ledger', 0));
do $guard$ begin
 if (select override from public.shop_state where id) is distinct from 'closed'
    or not exists(select 1 from public.profiles where id=${quote(owner)}::uuid and role='owner' and active)
    or (select cost_basis from public.books_settings where id) is distinct from 'bought'
    or exists(select 1 from public.ledger_entries)
    or exists(select 1 from public.stock_movements)
    or exists(select 1 from public.orders) then
  raise exception 'Historical target changed; refusing append until re-reviewed';
 end if;
end $guard$;
insert into public.ledger_entries(id,kind,category,memo,amount_cents,occurred_at,created_by,client_id,payload_hash)
select r.id::uuid,r.kind::public.ledger_kind,r.category,r.memo,r.amount_cents,r.occurred_at,${quote(owner)}::uuid,r.id::uuid,
 encode(extensions.digest(r.source || ${quote(sourceHash)}, 'sha256'),'hex')
from jsonb_to_recordset(${recordset}) as r(id text,kind text,category text,memo text,amount_cents bigint,occurred_at timestamptz,source text);
insert into public.audit_log(actor,action,entity,entity_id,detail)
values(${quote(owner)}::uuid,'historical_ledger_import','historical_source',${quote(sourceHash)},${quote(JSON.stringify(manifest))}::jsonb);
select jsonb_build_object('rows',count(*),'sales_cents',coalesce(sum(amount_cents) filter(where kind='sale'),0),
 'cost_cents',coalesce(sum(amount_cents) filter(where kind='cost'),0)) as reconciliation from public.ledger_entries;
rollback;
`;
  return {
    sourceHash,
    planHash,
    rows: rows.length,
    salesCents: totals.sale.toString(),
    costCents: totals.cost.toString(),
    receiptLinks,
    sql,
    boundary:
      'Dry-run only. Historical cash-basis entries; no order states, current stock, payment verification or guessed dates.'
  };
}

// Future receipt imports must attach the existing expense, never call a cost-booking RPC again.
export function prepareHistoricalReceiptLink(manifest, receipt, ownerId) {
  const owner = z.string().uuid().parse(ownerId);
  const sourceHash = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(manifest.source_sha256);
  const value = z
    .object({
      id: z.string().uuid(),
      source: z.string().regex(/^Inventory-In!A\d+:H\d+$/),
      item_id: z.string().min(1).max(80),
      unit: z.enum(['g', 'ml', 'pcs']),
      qty: z.number().positive().max(999999999),
      supplier: z.string().max(80)
    })
    .strict()
    .parse(receipt);
  if (!Number.isInteger(value.qty * 1000))
    throw new Error('Receipt quantity needs exact three-decimal precision');
  const links = manifest.receipt_links?.filter((r) => r.source === value.source);
  if (!links || links.length !== 1 || links[0].mode !== 'link_existing_ledger_only')
    throw new Error('Exactly one durable source-to-ledger link required');
  const link = line.parse({
    id: links[0].ledger_id,
    kind: 'cost',
    category: 'Historical stock purchases',
    memo: 'Linked original receipt',
    source: value.source,
    amount_cents: links[0].amount_cents,
    occurred_at: links[0].occurred_at
  });
  return `begin;
do $receipt$ declare v_item public.inventory_items%rowtype; begin
 if not exists(select 1 from public.profiles where id=${quote(owner)}::uuid and role='owner' and active)
    or (select override from public.shop_state where id) is distinct from 'closed' then raise exception 'Receipt actor or target mismatch'; end if;
 select * into v_item from public.inventory_items where id=${quote(value.item_id)} for update;
 if not found or not v_item.active or v_item.unit <> ${quote(value.unit)} then raise exception 'Receipt item/unit mismatch'; end if;
 if not exists(select 1 from public.stock_movements where item_id=v_item.id and kind='opening' and at<=${quote(link.occurred_at)}::timestamptz)
    then raise exception 'Verified historical opening balance required'; end if;
 if not exists(select 1 from public.audit_log a,jsonb_array_elements(a.detail->'receipt_links') r
    where a.action='historical_ledger_import' and a.entity_id=${quote(sourceHash)}
      and r->>'source'=${quote(value.source)} and r->>'ledger_id'=${quote(link.id)})
    or not exists(select 1 from public.ledger_entries where id=${quote(link.id)}::uuid and kind='cost'
       and amount_cents=${link.amount_cents} and occurred_at=${quote(link.occurred_at)}::timestamptz)
    then raise exception 'Existing receipt expense/provenance mismatch'; end if;
 if exists(select 1 from public.stock_movements where ledger_id=${quote(link.id)}::uuid)
    then raise exception 'Historical receipt is already linked'; end if;
 insert into public.stock_movements(id,item_id,kind,qty_delta,cost_cents,supplier,reason,at,ledger_id,payload_hash,created_by)
 values(${quote(value.id)}::uuid,v_item.id,'receipt',${value.qty},${-link.amount_cents},${quote(value.supplier)},'Historical receipt linked once',
 ${quote(link.occurred_at)}::timestamptz,${quote(link.id)}::uuid,encode(extensions.digest(${quote(JSON.stringify(value) + sourceHash)},'sha256'),'hex'),${quote(owner)}::uuid);
 update public.inventory_items set on_hand=on_hand+${value.qty} where id=v_item.id;
end $receipt$;
rollback;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [inputPath, ownerId, outputPath] = process.argv.slice(2);
  if (!inputPath || !ownerId || !outputPath)
    throw new Error('Usage: input-json owner-uuid private-output-json');
  const plan = prepareHistoricalLedger(JSON.parse(await readFile(inputPath, 'utf8')), ownerId);
  await writeFile(outputPath, JSON.stringify(plan, null, 2));
  console.log(`Prepared ${plan.rows} historical ledger lines; no database writes.`);
}

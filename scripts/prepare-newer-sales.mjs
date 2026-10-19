// B4b: her newer Sales rows, as a rollback-only append of the ledger. Offline: it reads a plan file and writes two files. It never
// connects to a database and accepts no credentials.
//
//   node scripts/prepare-newer-sales.mjs --plan <ledger_plan.json> --owner <uuid> --ledger-hash <64 hex> \
//        --source-sha256 <64 hex> --approve-assumptions --out <dir>
//
// <ledger_plan.json> is written by scripts/prepare-newer-sales.py. --ledger-hash is the exact hash of the trial's ledger, read with
// scripts/b4b-trial-reads.sql (query 3). --approve-assumptions is Ethan's explicit approval of the source-date and repeat assumptions
// (a blank date inherits the date above; repeated identical lines are separate sales; midnight Asia/Manila): nothing sets it for him,
// and a plan file that claims it is ignored. Without it the script refuses and writes nothing.
//
// SEQUENCING: the generated SQL's guard refuses to run unless the shop is closed, the cost basis is 'bought', and there are no stock
// movements and no orders. So the append must be run BEFORE the cutover, the opening counts and the first order. After any of those,
// the guard raises 'Historical target changed' and the sales cannot be appended by this tool.
//
// Output (--out): append.sql (ends in rollback; Ethan's connector runs it as a dry run first) and manifest.json (plan hash, rows, sales
// cents, the hashes it was built against). Neither holds a customer name; the memo is "Workbook Sales row N".
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareHistoricalLedgerAppend } from './prepare-historical-ledger.mjs';

const FLAGS = {
  '--plan': 'plan',
  '--owner': 'owner',
  '--ledger-hash': 'ledgerHash',
  '--source-sha256': 'sourceSha256',
  '--out': 'out'
};

export function parseArgs(argv) {
  const out = { approveAssumptions: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--approve-assumptions') out.approveAssumptions = true;
    else if (FLAGS[a]) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`Missing value for ${a}`);
      out[FLAGS[a]] = v;
    } else throw new Error(`Unknown option ${a}`);
  }
  for (const [flag, key] of Object.entries(FLAGS))
    if (!out[key]) throw new Error(`Missing ${flag}`);
  return out;
}

/** The only caller of prepareHistoricalLedgerAppend here; the approval comes from the flag and from nowhere else. */
export function prepareNewerSales({ plan, owner, ledgerHash, sourceSha256, approveAssumptions }) {
  if (approveAssumptions !== true)
    throw new Error(
      'Refusing: --approve-assumptions is required (Ethan approves the source-date and repeat assumptions)'
    );
  if (plan.source_sha256 !== undefined && plan.source_sha256 !== sourceSha256)
    throw new Error('Plan source hash does not match --source-sha256');
  const result = prepareHistoricalLedgerAppend(
    {
      source_sha256: sourceSha256,
      dummy_workbook_excluded_entirely: plan.dummy_workbook_excluded_entirely === true,
      receipt_import_mode: 'link_existing_ledger_only',
      owner_approved_date_and_repeat_assumptions: approveAssumptions === true,
      ledger_plan: plan.ledger_plan
    },
    owner,
    ledgerHash
  );
  const manifest = {
    source_sha256: result.sourceHash,
    plan_hash: result.planHash,
    existing_ledger_hash: result.existingLedgerHash,
    owner,
    rows: result.rows,
    sales_cents: result.salesCents,
    run_before:
      'the cutover, the opening counts and the first order (the SQL guard refuses afterwards)',
    boundary: result.boundary
  };
  return { sql: result.sql, manifest };
}

export function runNewerSales(argv) {
  const a = parseArgs(argv);
  const plan = JSON.parse(readFileSync(a.plan, 'utf8'));
  const result = prepareNewerSales({ ...a, plan });
  mkdirSync(a.out, { recursive: true });
  writeFileSync(join(a.out, 'append.sql'), result.sql);
  writeFileSync(join(a.out, 'manifest.json'), JSON.stringify(result.manifest, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { manifest } = runNewerSales(process.argv.slice(2));
    console.log(
      `Prepared ${manifest.rows} sales (${manifest.sales_cents} centavos), plan ${manifest.plan_hash}; rollback-only, no database writes.`
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}

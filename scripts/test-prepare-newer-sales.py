#!/usr/bin/env python3
"""B4b: scripts/prepare-newer-sales.py on a made-up Sales sheet (no real data). Run: python3 -I scripts/test-prepare-newer-sales.py"""
import datetime
import hashlib
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('ns', ROOT / 'scripts/prepare-newer-sales.py')
ns = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ns)

D = datetime.datetime
TODAY = datetime.date(2026, 10, 12)
SRC = 'a' * 64


def check(cond, what):
    if not cond:
        sys.exit('FAIL: ' + what)
    print('ok  ', what)


def sales_workbook(path, rows, sheet='Sales'):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet
    ws.append(['Date', 'Name', 'Notes', 'Quantity', 'Order', 'MOP', 'Amount', 'Profit', 'COGS'])
    for date, amount in rows:
        ws.append([date, 'Zed Surname', None, 1.0, 'Cookie', 'Cash', amount, 1.0, 1.0])
    wb.save(path)


ROWS = [
    (D(2026, 9, 20), 100),        # 2
    (None, 50),                   # 3  inherits 20 Sep
    (D(2026, 9, 23), 120),        # 4  on the --after day
    (None, 120),                  # 5  repeated identical line: a separate sale (on the --after day)
    (None, None),                 # 6  no amount, on the --after day
    (D(2026, 9, 28), 200),        # 7  newer
    (None, 80.5),                 # 8  newer, inherits 28 Sep
    (None, None),                 # 9  newer, no amount: listed
    (D(2026, 10, 1), 'abc'),      # 10 newer, amount not a number: listed
    (D(2026, 10, 4), 99),         # 11 newer
    (D(2026, 9, 10), 10),         # 12 dated before --after but sitting below newer rows: to confirm, never planned
    ('see note', 5),              # 13 a date cell that is not a date: listed
    (None, 7),                    # 14 follows an unreadable date: listed, not guessed
    (D(2026, 10, 5), 0),          # 15 amount of zero: listed
    (D(2026, 10, 6), 10.005),     # 16 a fraction of a centavo: listed
    (D(2999, 1, 1), 30),          # 17 in the future: listed
    (D(2026, 10, 7), 100),        # 18 newer, same amount as row 2 but another day: its own sale
    (None, 100),                  # 19 repeated identical line, newer: its own sale
]

with tempfile.TemporaryDirectory() as t:
    t = Path(t)
    p = t / 'sales.xlsx'
    sales_workbook(p, ROWS)
    plan, rep = ns.build(p, '2026-09-23', SRC, today=TODAY)
    check([r['source'] for r in plan] == ['Sales!A7:I7', 'Sales!A8:I8', 'Sales!A11:I11', 'Sales!A18:I18', 'Sales!A19:I19'],
          'only rows dated AFTER --after are planned (the --after day itself is not)')
    check([r['amount_cents'] for r in plan] == [20000, 8050, 9900, 10000, 10000], 'amounts are exact centavos; repeated identical lines stay separate sales')
    check([r['occurred_at'] for r in plan] == ['2026-09-28T00:00:00+08:00'] * 2 + ['2026-10-04T00:00:00+08:00'] + ['2026-10-07T00:00:00+08:00'] * 2,
          'a blank date inherits the date above; every date is midnight Asia/Manila (+08:00)')
    check(all(list(r) == ['id', 'kind', 'category', 'memo', 'amount_cents', 'occurred_at', 'source'] for r in plan), 'keys are in the order the ledger preparer hashes them')
    check(all(r['kind'] == 'sale' and r['category'] == 'Historical sales' and re.fullmatch(r'Workbook Sales row \d+', r['memo']) for r in plan),
          'kind, category and a memo with no customer text')
    why = {u['row']: u['why'] for u in rep['unresolved']}
    check(sorted(why) == [9, 10, 13, 14, 15, 16, 17], 'rows with no usable amount or date are listed, never written')
    check('amount' in why[9] and 'amount' in why[10] and 'amount' in why[15], 'no amount, text amount and zero amount are listed as amounts')
    check('fraction of a centavo' in why[16] and 'future' in why[17], 'a fraction of a centavo and a future date are listed')
    check('not a date' in why[13] and 'unreadable date' in why[14], 'a date cell that is not a date, and the blank rows below it, are listed')
    check(rep['to_confirm'] == [dict(row=12, source='Sales!A12:I12', date='2026-09-10', why='dated on or before --after but sits below newer rows: confirm it is already in the ledger')],
          'an older date below newer rows is listed for confirmation, not planned')
    c = rep['counts']
    check(c['planned'] == 5 and c['unresolved'] == 7 and c['on_after_date'] == 3 and c['to_confirm'] == 1 and c['sales_rows'] == len(ROWS),
          'counts: planned, unresolved, rows on the --after day, to confirm')
    check(rep['sales_cents'] == 20000 + 8050 + 9900 + 10000 + 10000 and rep['first_date'] == '2026-09-28' and rep['last_date'] == '2026-10-07',
          'the report has the sum and the first and last date')
    canon = json.dumps(plan, separators=(',', ':'), ensure_ascii=False)
    check(rep['plan_sha256'] == hashlib.sha256(canon.encode()).hexdigest(), 'plan hash is the SHA-256 of the compact JSON the ledger preparer hashes')
    ns_uuid = lambda r: str(uuid.uuid5(ns.NAMESPACE, r['source'] + SRC))
    check(all(r['id'] == ns_uuid(r) for r in plan), 'ids are uuid5 of the source ref and the source hash')
    plan2, rep2 = ns.build(p, '2026-09-23', SRC, today=TODAY)
    plan3, _ = ns.build(p, '2026-09-23', 'b' * 64, today=TODAY)
    check(plan == plan2 and rep == rep2 and plan[0]['id'] != plan3[0]['id'], 'deterministic for the same workbook, other ids for another source hash')
    blob = json.dumps([plan, rep])
    check('Zed' not in blob and 'Surname' not in blob and 'Cash' not in blob, 'no customer, note or payment text reaches the plan or the report')

    # No date above the first row: unresolved, not guessed.
    q = t / 'first.xlsx'
    sales_workbook(q, [(None, 10), (D(2026, 10, 2), 20)])
    pl, rp = ns.build(q, '2026-09-23', SRC, today=TODAY)
    check([u['row'] for u in rp['unresolved']] == [2] and 'no date' in rp['unresolved'][0]['why'] and [r['source'] for r in pl] == ['Sales!A3:I3'],
          'a first row with no date is listed as unresolved')

    # The dummy workbook is refused outright.
    d = t / 'dummy.xlsx'
    sales_workbook(d, ROWS, sheet='Sales')
    dd = t / '[DUMMY VER] book.xlsx'
    shutil.copy(d, dd)
    try:
        ns.build(dd, '2026-09-23', SRC, today=TODAY)
        check(False, 'a workbook marked DUMMY is refused')
    except SystemExit as e:
        check('DUMMY' in str(e), 'a workbook marked DUMMY is refused')

    # The command line writes only its two files, and the hash of the file matches the report.
    out = t / 'out'
    ns.main(['--workbook', str(p), '--after', '2026-09-23', '--out', str(out), '--today', '2026-10-12'])
    check({f.name for f in out.iterdir()} == {'ledger_plan.json', 'report.json'}, 'writes only ledger_plan.json and report.json')
    lp = json.loads((out / 'ledger_plan.json').read_text())
    check(lp['source_sha256'] == hashlib.sha256(p.read_bytes()).hexdigest() and lp['dummy_workbook_excluded_entirely'] is True and len(lp['ledger_plan']) == 5,
          'the plan file carries the source hash and the dummy-exclusion fact it checked')
    for bad in (['--after', 'yesterday'], ['--after', '2026-13-40']):
        try:
            ns.main(['--workbook', str(p), '--out', str(t / 'x')] + bad)
            check(False, 'a bad --after date is refused: ' + bad[1])
        except SystemExit:
            check(True, 'a bad --after date is refused: ' + bad[1])

    # Cross-check with the .mjs wrapper (offline; skipped if node is not installed).
    node = shutil.which('node')
    if node:
        owner = '00000000-0000-4000-8000-000000000001'
        args = [node, str(ROOT / 'scripts/prepare-newer-sales.mjs'), '--plan', str(out / 'ledger_plan.json'), '--owner', owner,
                '--ledger-hash', 'c' * 64, '--source-sha256', lp['source_sha256'], '--out', str(t / 'sql')]
        no = subprocess.run(args, capture_output=True, text=True, cwd=ROOT)
        check(no.returncode != 0 and 'approve-assumptions' in no.stderr and not (t / 'sql').exists(), 'the wrapper refuses without --approve-assumptions and writes nothing')
        yes = subprocess.run(args + ['--approve-assumptions'], capture_output=True, text=True, cwd=ROOT)
        check(yes.returncode == 0, 'the wrapper runs with --approve-assumptions: ' + yes.stderr[-200:])
        man = json.loads((t / 'sql' / 'manifest.json').read_text())
        rp = json.loads((out / 'report.json').read_text())
        check(man['plan_hash'] == rp['plan_sha256'] and man['rows'] == 5 and man['sales_cents'] == str(rp['sales_cents']),
              'the wrapper manifest agrees with the report: same plan hash, rows and sales cents')
    else:
        print('skip node not found: wrapper cross-check')
print('prepare-newer-sales: all passed')

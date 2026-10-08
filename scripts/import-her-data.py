#!/usr/bin/env python3 -I
"""B4: read her workbook and build the import PREVIEW payloads. It reads one file, writes only to --out, and never connects to a database.

  python3 -I scripts/import-her-data.py --workbook <xlsx> --out <dir> [--flavour-map <json>] [--packaging-items <json>]

Writes to --out: prices.json, recipes.json, report.json (counts, SHA-256 of each payload and of the source, and everything that
was NOT matched, with why). Nothing is guessed: a row that cannot be matched exactly is listed, not written. Keep --out outside
Git; the payloads hold her prices and recipes. Only counts and hashes are meant to be pasted anywhere.

  --flavour-map      {"<workbook flavour>": "<exact app flavour name>"}; a flavour absent here keeps its workbook name.
  --packaging-items  ["<master item name>", ...]; the items whose recipe lines are packaging (per cookie). Without it every line is an
                     ingredient and `proposed_packaging_items` in the report lists what looks like packaging, for Ethan to confirm.
"""
import argparse
import hashlib
import json
import sys
from collections import OrderedDict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import openpyxl

UNITS = {'grams': 'g', 'g': 'g', 'ml': 'ml', 'piece': 'pcs', 'pieces': 'pcs', 'pcs': 'pcs'}
LOOKS_LIKE_PACKAGING = ('box', 'sticker', 'pouch', 'card', 'bag', 'tub', 'label', 'wrap', 'sleeve')


def norm(s):
    return str(s).strip().lower() if s is not None else ''


def unit_of(u):
    return UNITS.get(norm(u))


def sha(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def cents(pesos):
    return int((Decimal(str(pesos)) * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def read(path):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=False)
    master = OrderedDict()
    for n, r in enumerate(wb['Ingredient Master'].iter_rows(min_row=2, values_only=True), start=2):
        if r[0] is not None:
            master[norm(r[0])] = dict(name=str(r[0]).strip(), unit=r[1], bulk_qty=r[2], bulk_price=r[3], unit_cost=r[4], row=n)
    recipes = OrderedDict()
    for n, r in enumerate(wb['Recipes'].iter_rows(min_row=2, values_only=True), start=2):
        if r[0] is not None:
            recipes.setdefault(str(r[0]).strip(), []).append(dict(item=str(r[1]).strip(), qty=r[2], unit=r[3], cost=r[5], row=n))
    dash = {}
    for r in wb['Costing Dashboard'].iter_rows(min_row=2, values_only=True):
        if r[0]:
            dash[norm(r[0])] = dict(cookies=r[1], batch=r[3])
    return master, recipes, dash


def build(path, flavour_map=None, packaging_items=None, as_of='1970-01-01'):
    master, recipes, dash = read(path)
    flavour_map = flavour_map or {}
    pack_set = {norm(x) for x in packaging_items} if packaging_items is not None else set()
    unmatched = {'prices': [], 'recipes': [], 'costing': []}

    prices = []
    for key, m in master.items():
        u = unit_of(m['unit'])
        ok = u and isinstance(m['bulk_qty'], (int, float)) and isinstance(m['bulk_price'], (int, float)) and m['bulk_qty'] > 0 and m['bulk_price'] > 0
        if not ok:
            unmatched['prices'].append(dict(item=m['name'], row=m['row'], why='no usable unit, pack or price' if not u or not m['bulk_price'] else 'unit not g, ml or pcs'))
            continue
        prices.append(dict(item=m['name'], unit=u, price_cents=cents(m['bulk_price']), pack_size=float(m['bulk_qty']), as_of=as_of, source='Ingredient Master!A%d' % m['row']))

    out_recipes, reproduction = [], []
    for flavour, lines in recipes.items():
        cookies = (dash.get(norm(flavour)) or {}).get('cookies')
        bad = []
        payload_lines = []
        for ln in lines:
            m = master.get(norm(ln['item']))
            if m is None:
                bad.append(dict(item=ln['item'], row=ln['row'], why='not in the Ingredient Master'))
                continue
            u = unit_of(m['unit'])
            lu = unit_of(ln['unit'])
            is_pack = norm(ln['item']) in pack_set
            if not isinstance(ln['qty'], (int, float)) or ln['qty'] <= 0:
                bad.append(dict(item=ln['item'], row=ln['row'], why='no quantity'))
                continue
            if u is None:
                bad.append(dict(item=ln['item'], row=ln['row'], why='the master unit is not g, ml or pcs'))
                continue
            if is_pack:
                if not cookies:
                    bad.append(dict(item=ln['item'], row=ln['row'], why='packaging line but no cookies per batch to divide by'))
                    continue
                per = Decimal(str(ln['qty'])) / Decimal(str(cookies))
                if per != per.quantize(Decimal('0.001')):
                    bad.append(dict(item=ln['item'], row=ln['row'], why='per cookie is not a clean quantity (%s / %s)' % (ln['qty'], cookies)))
                    continue
                payload_lines.append(dict(item=m['name'], qty=float(per), unit=u, kind='packaging', source='Recipes!A%d' % ln['row'],
                                          unit_in_recipe=ln['unit']))
            else:
                if lu != u:
                    bad.append(dict(item=ln['item'], row=ln['row'], why='unit differs (recipe %s, master %s)' % (ln['unit'], m['unit'])))
                    continue
                payload_lines.append(dict(item=m['name'], qty=float(ln['qty']), unit=u, kind='ingredient', source='Recipes!A%d' % ln['row']))
        entry = dict(flavour=flavour_map.get(flavour, flavour), workbook_flavour=flavour, yield_=cookies, lines=payload_lines)
        if bad or not cookies:
            unmatched['recipes'].append(dict(flavour=flavour, why=bad or [dict(why='no costing row, so no cookies per batch')]))
        else:
            out_recipes.append(entry)
        # Her own arithmetic, reproduced: ingredients against ingredients, from the master's unit cost.
        dsh = dash.get(norm(flavour))
        total = sum(Decimal(str(l['qty'])) * Decimal(str(master[norm(l['item'])]['unit_cost']))
                    for l in lines if norm(l['item']) in master and isinstance(master[norm(l['item'])]['unit_cost'], (int, float)) and isinstance(l['qty'], (int, float)))
        sheet = sum(Decimal(str(l['cost'])) for l in lines if isinstance(l['cost'], (int, float)))
        reproduction.append(dict(flavour=flavour, lines=len(lines), from_master=float(round(total, 4)), sheet_lines=float(round(sheet, 4)),
                                 dashboard=(float(dsh['batch']) if dsh and isinstance(dsh['batch'], (int, float)) else None),
                                 matches_dashboard=bool(dsh and isinstance(dsh['batch'], (int, float)) and abs(float(total) - float(dsh['batch'])) < 0.005)))
    for r in reproduction:
        if r['dashboard'] is None:
            unmatched['costing'].append(dict(flavour=r['flavour'], why='no costing dashboard row'))
        elif not r['matches_dashboard']:
            unmatched['costing'].append(dict(flavour=r['flavour'], why='master total %.2f differs from dashboard %.2f' % (r['from_master'], r['dashboard'])))
    proposed = sorted({l['item'] for ls in recipes.values() for l in ls if any(k in norm(l['item']) for k in LOOKS_LIKE_PACKAGING)})
    return prices, out_recipes, dict(
        counts=dict(master_rows=len(master), prices=len(prices), prices_unmatched=len(unmatched['prices']), recipes=len(out_recipes),
                    recipes_unmatched=len(unmatched['recipes']), recipes_in_workbook=len(recipes),
                    costing_reproduced=sum(1 for r in reproduction if r['matches_dashboard']), costing_total=len(reproduction)),
        reproduction=reproduction, unmatched=unmatched, proposed_packaging_items=proposed)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--workbook', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--flavour-map')
    ap.add_argument('--packaging-items')
    ap.add_argument('--as-of', default=None, help='the date her price list is current from (YYYY-MM-DD); required to write payloads')
    a = ap.parse_args(argv)
    fm = json.loads(Path(a.flavour_map).read_text()) if a.flavour_map else None
    pk = json.loads(Path(a.packaging_items).read_text()) if a.packaging_items else None
    if a.as_of is None:
        sys.exit('--as-of YYYY-MM-DD is required: the price list needs a date')
    prices, recipes, report = build(a.workbook, fm, pk, a.as_of)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'prices.json').write_text(json.dumps(prices, indent=1, ensure_ascii=False))
    (out / 'recipes.json').write_text(json.dumps(recipes, indent=1, ensure_ascii=False))
    report['hashes'] = dict(source=hashlib.sha256(Path(a.workbook).read_bytes()).hexdigest(), prices=sha(prices), recipes=sha(recipes))
    (out / 'report.json').write_text(json.dumps(report, indent=1, ensure_ascii=False))
    print(json.dumps(dict(counts=report['counts'], hashes=report['hashes']), indent=1))


if __name__ == '__main__':
    main()

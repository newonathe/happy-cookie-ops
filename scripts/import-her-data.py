#!/usr/bin/env python3 -I
"""B4: read her workbook and build the import PREVIEW payloads. It reads one file, writes only to --out, and never connects to a database.

  python3 -I scripts/import-her-data.py --workbook <xlsx> --out <dir> [--flavour-map <json>] [--packaging-items <json>]

Writes to --out: prices.json, recipes.json, report.json (counts, SHA-256 of each payload and of the source, and everything that
was NOT matched, with why). Nothing is guessed: a row that cannot be matched exactly is listed, not written. Keep --out outside
Git; the payloads hold her prices and recipes. Only counts and hashes are meant to be pasted anywhere.

  --flavour-map      {"<workbook flavour>": "<exact app flavour name>"}; a flavour absent here keeps its workbook name.
  --catalogue        {"<lower-cased item name>": [["<app item name>", "<unit>"]]}: the app's stock items. With it, a name must match exactly one
                     app item (and its unit); a recipe or master name that matches none is listed under `items_to_create` for approval.
  --item-prices      {"<item name>": {"price": 88.25, "pack": 110, "unit": "g"}}: prices Ethan stated, for items the master does not price.
  --spare-tolerance  a packaging line within this many of the cookies per batch is read as 1 per cookie (the spare is waste, not recipe);
                     further out it is listed for Cine to confirm in the one-time set-up. Default 2.
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

UNITS = {'grams': 'g', 'g': 'g', 'ml': 'ml', 'piece': 'pcs', 'pieces': 'pcs', 'pcs': 'pcs', 'bags': 'pcs'}  # a bag of pouches is one piece (Ethan, 8 October)
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


MONTHS = {m: i for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], start=1)}


def bookings(path, year=2026):
    """The Bazaars sheet: a row with a date becomes a scheduled event. The year is a stated rule, not read from the sheet. Rent is only what a
    note states ("rate 25k"); an event she has not accepted is kept but inactive with no rent. A date that is not 'Mon D - D' is listed."""
    import re
    wb = openpyxl.load_workbook(path, data_only=True)
    out, listed = [], []
    for n, r in enumerate(wb['Bazaars'].iter_rows(min_row=2, max_col=7, values_only=True), start=2):
        org, when, event, place, replied, _email, note = r
        if when is None:
            continue
        m = re.fullmatch(r'\s*([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})\s*-\s*(\d{1,2})\s*', str(when))
        if not m or m.group(1).lower() not in MONTHS or int(m.group(3)) < int(m.group(2)):
            listed.append(dict(row=n, why='date not in the form "Mon D - D": ' + str(when)))
            continue
        mo = MONTHS[m.group(1).lower()]
        rate = re.search(r'rate\s+(\d+(?:\.\d+)?)\s*k', str(note or ''), re.I)
        accepted = bool(replied) and str(note or '').lower().startswith('accepted')
        out.append(dict(name=(str(event).strip() if event else str(org).strip())[:80], starts_on='%d-%02d-%02d' % (year, mo, int(m.group(2))),
                        ends_on='%d-%02d-%02d' % (year, mo, int(m.group(3))), place=(str(place).strip() if place else '')[:80],
                        rent_cents=int(Decimal(rate.group(1)) * 1000 * 100) if rate and accepted else 0, active=accepted, source='Bazaars!A%d' % n))
    return out, listed


def build(path, flavour_map=None, packaging_items=None, as_of='1970-01-01', catalogue=None, item_prices=None, spare_tolerance=2):
    master, recipes, dash = read(path)
    item_prices = {norm(k): v for k, v in (item_prices or {}).items()}
    to_create = OrderedDict()

    def app_item(name, unit):
        # (app name, why-not): with a catalogue the name must be exactly one app item in this unit; without one the master's name stands.
        if catalogue is None:
            return str(name).strip(), None
        hit = catalogue.get(norm(name))
        if not hit:
            return None, 'no stock item of that name'
        if len(hit) > 1:
            return None, 'more than one stock item of that name'
        if unit and hit[0][1] != unit:
            return None, 'unit differs (app %s, here %s)' % (hit[0][1], unit)
        return hit[0][0], None

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
        name, why = app_item(m['name'], u)
        if why == 'no stock item of that name':
            to_create.setdefault(norm(m['name']), dict(name=m['name'], unit=u, source='Ingredient Master!A%d' % m['row']))
            unmatched['prices'].append(dict(item=m['name'], row=m['row'], why=why + ': proposed for creation, then priced'))
            continue
        if why:
            unmatched['prices'].append(dict(item=m['name'], row=m['row'], why=why))
            continue
        prices.append(dict(item=name, unit=u, price_cents=cents(m['bulk_price']), pack_size=float(m['bulk_qty']), as_of=as_of, source='Ingredient Master!A%d' % m['row']))

    out_recipes, reproduction, for_cine = [], [], []
    for flavour, lines in recipes.items():
        cookies = (dash.get(norm(flavour)) or {}).get('cookies')
        bad = []
        payload_lines = []
        for ln in lines:
            m = master.get(norm(ln['item']))
            if m is None and catalogue is None:
                bad.append(dict(item=ln['item'], row=ln['row'], why='not in the Ingredient Master'))
                continue
            lu = unit_of(ln['unit'])
            u = unit_of(m['unit']) if m is not None else lu
            is_pack = norm(ln['item']) in pack_set
            if not isinstance(ln['qty'], (int, float)) or ln['qty'] <= 0:
                bad.append(dict(item=ln['item'], row=ln['row'], why='no quantity'))
                continue
            if u is None:
                bad.append(dict(item=ln['item'], row=ln['row'], why='the unit is not g, ml or pcs'))
                continue
            name, why = app_item(ln['item'], u)
            new_item = False
            if why == 'no stock item of that name':
                # In a recipe but not in the app: proposed for creation, with the unit the recipe states (set-up confirms it).
                to_create.setdefault(norm(ln['item']), dict(name=str(ln['item']).strip(), unit=u, source='Recipes!A%d' % ln['row']))
                name, why, new_item = str(ln['item']).strip(), None, True
            if why:
                bad.append(dict(item=ln['item'], row=ln['row'], why=why))
                continue
            if is_pack:
                if not cookies:
                    bad.append(dict(item=ln['item'], row=ln['row'], why='packaging line but no cookies per batch to compare with'))
                    continue
                if abs(Decimal(str(ln['qty'])) - Decimal(str(cookies))) > spare_tolerance:
                    for_cine.append(dict(flavour=flavour, item=ln['item'], row=ln['row'], qty=ln['qty'], cookies=cookies,
                                         why='%s %s for a batch of %s cookies is not 1 per cookie: Cine confirms it in set-up' % (ln['qty'], ln['unit'], cookies)))
                    continue
                payload_lines.append(dict(item=name, qty=1.0, unit=u, kind='packaging', source='Recipes!A%d' % ln['row'], new_item=new_item))
            else:
                if m is not None and lu != u:
                    bad.append(dict(item=ln['item'], row=ln['row'], why='unit differs (recipe %s, master %s)' % (ln['unit'], m['unit'])))
                    continue
                payload_lines.append(dict(item=name, qty=float(ln['qty']), unit=u, kind='ingredient', source='Recipes!A%d' % ln['row'], new_item=new_item))
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
    for k, v in item_prices.items():
        # A price Ethan stated for an item the app does not have yet is created with it, even if no imported recipe needs it today.
        if catalogue is not None and k not in catalogue and k not in to_create:
            to_create[k] = dict(name=k.capitalize(), unit=v['unit'], source='stated by Ethan')
    creates = []
    for k, c in to_create.items():
        pr = item_prices.get(k)
        mrow = master.get(k)
        price = None
        if pr:
            price = dict(price_cents=cents(pr['price']), pack_size=float(pr['pack']), unit=pr['unit'], as_of=as_of, source='stated by Ethan')
        elif mrow and unit_of(mrow['unit']) and isinstance(mrow['bulk_price'], (int, float)) and isinstance(mrow['bulk_qty'], (int, float)) and mrow['bulk_price'] > 0:
            price = dict(price_cents=cents(mrow['bulk_price']), pack_size=float(mrow['bulk_qty']), unit=unit_of(mrow['unit']), as_of=as_of, source='Ingredient Master!A%d' % mrow['row'])
        creates.append(dict(c, price=price))
    proposed = sorted({l['item'] for ls in recipes.values() for l in ls if any(k in norm(l['item']) for k in LOOKS_LIKE_PACKAGING)})
    return prices, out_recipes, dict(
        counts=dict(master_rows=len(master), prices=len(prices), prices_unmatched=len(unmatched['prices']), recipes=len(out_recipes),
                    recipes_unmatched=len(unmatched['recipes']), recipes_in_workbook=len(recipes), items_to_create=len(to_create), for_cine=len(for_cine),
                    costing_reproduced=sum(1 for r in reproduction if r['matches_dashboard']), costing_total=len(reproduction)),
        reproduction=reproduction, unmatched=unmatched, items_to_create=creates, for_cine=for_cine, proposed_packaging_items=proposed)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--workbook', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--flavour-map')
    ap.add_argument('--packaging-items')
    ap.add_argument('--catalogue')
    ap.add_argument('--item-prices')
    ap.add_argument('--spare-tolerance', type=int, default=2)
    ap.add_argument('--as-of', default=None, help='the date her price list is current from (YYYY-MM-DD); required to write payloads')
    a = ap.parse_args(argv)
    fm = json.loads(Path(a.flavour_map).read_text()) if a.flavour_map else None
    pk = json.loads(Path(a.packaging_items).read_text()) if a.packaging_items else None
    if a.as_of is None:
        sys.exit('--as-of YYYY-MM-DD is required: the price list needs a date')
    cat = json.loads(Path(a.catalogue).read_text()) if a.catalogue else None
    ip = json.loads(Path(a.item_prices).read_text()) if a.item_prices else None
    prices, recipes, report = build(a.workbook, fm, pk, a.as_of, cat, ip, a.spare_tolerance)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / 'prices.json').write_text(json.dumps(prices, indent=1, ensure_ascii=False))
    (out / 'recipes.json').write_text(json.dumps(recipes, indent=1, ensure_ascii=False))
    bk, bk_listed = bookings(a.workbook)
    (out / 'bookings.json').write_text(json.dumps(bk, indent=1, ensure_ascii=False))
    report['bookings'] = dict(count=len(bk), listed=bk_listed, hash=sha(bk))
    report['hashes'] = dict(source=hashlib.sha256(Path(a.workbook).read_bytes()).hexdigest(), prices=sha(prices), recipes=sha(recipes))
    (out / 'report.json').write_text(json.dumps(report, indent=1, ensure_ascii=False))
    print(json.dumps(dict(counts=report['counts'], hashes=report['hashes']), indent=1))


if __name__ == '__main__':
    main()

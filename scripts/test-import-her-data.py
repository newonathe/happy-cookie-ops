#!/usr/bin/env python3
"""B4: scripts/import-her-data.py on a made-up workbook (no real data). Run: python3 scripts/test-import-her-data.py"""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('imp', ROOT / 'scripts/import-her-data.py')
imp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imp)


def workbook(path):
    wb = openpyxl.Workbook()
    m = wb.active
    m.title = 'Ingredient Master'
    m.append(['Ingredient Name', 'Unit', 'Bulk Quantity', 'Bulk Price', 'Unit Cost'])
    m.append(['Flour', 'grams', 1000, 60, 0.06])
    m.append(['Milk', 'mL', 500, 50, 0.1])
    m.append(['Pouch', 'piece', 100, 30, 0.3])
    m.append(['Odd bag', 'bags', 10, 5, 0.5])
    m.append(['Label', None, None, None, '#DIV/0!'])
    r = wb.create_sheet('Recipes')
    r.append(['Flavor', 'Ingredient Name', 'Qty per Batch', 'Unit', 'Unit Cost', 'Ingredient Cost'])
    r.append(['Plain', 'Flour', 500, 'grams', 0.06, 30])
    r.append(['Plain', 'Milk', 100, 'mL', 0.1, 10])
    r.append(['Plain', 'Pouch', 10, 'piece', 0.3, 3])
    r.append(['Broken', 'Flour', 100, 'grams', 0.06, 6])
    r.append(['Broken', 'Mystery', 5, 'grams', None, None])
    r.append(['Odd', 'Flour', 100, 'grams', 0.06, 6])
    r.append(['Odd', 'Pouch', 7, 'piece', 0.3, 2.1])
    d = wb.create_sheet('Costing Dashboard')
    d.append(['Flavor', 'Cookies per Batch', 'Price', 'Cost per Batch'])
    d.append(['Plain', 10, 100, 43])
    d.append(['Broken', 10, 100, 7])
    d.append(['Odd', 3, 100, 8.1])
    wb.save(path)


def check(cond, what):
    if not cond:
        sys.exit('FAIL: ' + what)
    print('ok  ', what)


with tempfile.TemporaryDirectory() as t:
    p = Path(t) / 'w.xlsx'
    workbook(p)
    prices, recipes, rep = imp.build(p, {'Plain': 'Plain Cookie'}, ['Pouch'], '2026-10-01')
    names = [x['item'] for x in prices]
    check(names == ['Flour', 'Milk', 'Pouch', 'Odd bag'], 'prices: rows with a usable unit, pack and price (bags count as pieces)')
    check(prices[0]['price_cents'] == 6000 and prices[0]['pack_size'] == 1000.0 and prices[0]['unit'] == 'g', 'prices: centavos, pack and unit mapped')
    check({x['item'] for x in rep['unmatched']['prices']} == {'Label'}, 'prices: the blank row is listed, not imported')
    check([x['flavour'] for x in recipes] == ['Plain Cookie', 'Odd'], 'recipes: a flavour with every line matched is kept, renamed by the map')
    pl = [l for l in recipes[0]['lines'] if l['kind'] == 'packaging']
    check(len(pl) == 1 and pl[0]['qty'] == 1.0 and pl[0]['unit'] == 'pcs', 'recipes: packaging near the cookies per batch is 1 per cookie')
    flavs = {x['flavour'] for x in rep['unmatched']['recipes']}
    check(flavs == {'Broken'}, 'recipes: a line with no item at all holds the recipe back, listed whole')
    check([f['flavour'] for f in rep['for_cine']] == ['Odd'] and 'Odd' in [r['flavour'] for r in recipes],
          'packaging far from 1 per cookie (7 for 3) goes to Cine, not into the recipe')
    cat = {'flour': [['Flour', 'g']], 'milk': [['Milk', 'ml']], 'pouch': [['Pouch', 'pcs']]}
    _, r2, rep2 = imp.build(p, None, ['Pouch'], '2026-10-01', cat, {'Sea salt': {'price': 88.25, 'pack': 110, 'unit': 'g'}})
    check({c['name'] for c in rep2['items_to_create']} >= {'Sea salt'},
          'a stated price for an item the app lacks proposes creating it')
    sea = [c for c in rep2['items_to_create'] if c['name'].lower() == 'sea salt'][0]
    check(sea['price']['price_cents'] == 8825 and sea['price']['pack_size'] == 110.0, 'the stated price is carried, not invented')
    check(rep['counts']['costing_reproduced'] == 2 and rep['counts']['costing_total'] == 3, 'costing: ingredients against ingredients, 2 of 3 reproduced')
    check(any(x['flavour'] == 'Broken' for x in rep['unmatched']['costing']), 'costing: the one that does not reproduce is named')
    check(rep['proposed_packaging_items'] == ['Pouch'], 'packaging is proposed, not assumed')
    a = imp.sha(prices)
    check(a == imp.sha(json.loads(json.dumps(prices))), 'the payload hash is stable')
    imp.main(['--workbook', str(p), '--out', str(Path(t) / 'o'), '--as-of', '2026-10-01'])
    check({f.name for f in (Path(t) / 'o').iterdir()} == {'prices.json', 'recipes.json', 'report.json'}, 'writes only its three files')
print('import-her-data: all passed')

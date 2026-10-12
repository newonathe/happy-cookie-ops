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
    b = wb.create_sheet('Bazaars')
    b.append(['Organizer', 'Event Date', 'Event Name', 'Location', 'Replied?', 'Email', 'Notes'])
    b.append(['Org One', 'Dec 12-13', 'Holiday Fair', 'Hall A', True, None, 'Accepted - rate 25k'])
    b.append(['Org Two', 'Nov 25-30', None, 'Hall B', False, None, None])
    b.append(['Org Three', 'soon', None, None, False, None, None])
    b.append(['Org Four', None, None, None, False, None, None])
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
    check({f.name for f in (Path(t) / 'o').iterdir()} == {'prices.json', 'recipes.json', 'bookings.json', 'report.json'}, 'writes only its four files')
    bk, listed = imp.bookings(p)
    check([(b['name'], b['starts_on'], b['ends_on'], b['rent_cents'], b['active']) for b in bk] ==
          [('Holiday Fair', '2026-12-12', '2026-12-13', 2500000, True), ('Org Two', '2026-11-25', '2026-11-30', 0, False)],
          'bookings: dates with the stated year, rent only when accepted and stated, unaccepted kept inactive')
    check(len(listed) == 1 and listed[0]['row'] == 4, 'bookings: a date that is not Mon D - D is listed, not guessed')


def workbook_b4b(path):
    """Shaped like hers: eight packaging items, unlisted recipe items, two unit clashes, one flavour whose dashboard is off."""
    wb = openpyxl.Workbook()
    m = wb.active
    m.title = 'Ingredient Master'
    m.append(['Ingredient Name', 'Unit', 'Bulk Quantity', 'Bulk Price', 'Unit Cost'])
    m.append(['Flour', 'grams', 1000, 60, 0.06])
    m.append(['Biscoff cookies', 'grams', 1000, 400, 0.4])
    m.append(['Pink box', 'piece', 50, 100, 2])
    m.append(['Kraft pouch', 'piece', 100, 30, 0.3])
    m.append(['Apple Pie Box', 'piece', 20, 100, 5])
    m.append(['Banoffee Pie Box', 'piece', 20, 100, 5])
    m.append(['Heart-shaped box with lid', 'piece', 20, 100, 5])
    m.append(['Plastic pouch', 'piece', 100, 30, 0.3])
    m.append(['Sticker', 'piece', 100, 20, 0.2])
    r = wb.create_sheet('Recipes')
    r.append(['Flavor', 'Ingredient Name', 'Qty per Batch', 'Unit', 'Unit Cost', 'Ingredient Cost'])
    r.append(['Oaty', 'Flour', 100, 'grams', 0.06, 6])
    r.append(['Oaty', 'Oats', 50, 'grams', None, None])
    r.append(['Oaty', 'Kraft pouch', 10, 'piece', 0.3, 3])
    r.append(['Salty', 'Flour', 100, 'grams', 0.06, 6])
    r.append(['Salty', 'Sea salt', 2, 'grams', None, None])
    r.append(['Saucy', 'Flour', 100, 'grams', 0.06, 6])
    r.append(['Saucy', 'Sauce Tub', 10, 'piece', None, None])
    r.append(['Biscoffy', 'Biscoff cookies', 4, 'piece', 0.4, 1.6])
    r.append(['Biscoffy', 'Flour', 100, 'grams', 0.06, 6])
    r.append(['Biscoffy', 'Cocoa nibs', 5, 'grams', None, None])
    r.append(['Quiet', 'Flour', 100, 'grams', 0.06, 6])
    r.append(['Quiet', 'Nutmeg', None, 'grams', None, None])
    r.append(['Boxed', 'Flour', 100, 'grams', 0.06, 6])
    r.append(['Boxed', 'Pink box', 10, 'grams', 2, 20])
    r.append(['Weird', 'Flour', 100, 'grams', 0.06, 6])
    r.append(['Weird', 'Zest', 3, 'tbsp', None, None])
    r.append(['Packed', 'Flour', 100, 'grams', 0.06, 6])
    for name, q in [('Apple Pie Box', 10), ('Banoffee Pie Box', 11), ('Heart-shaped box with lid', 12), ('Kraft pouch', 10),
                    ('Plastic pouch', 9), ('Sticker', 8)]:
        r.append(['Packed', name, q, 'piece', 1, 1])
    r.append(['Packed', 'Pink box', 14, 'piece', 2, 28])
    d = wb.create_sheet('Costing Dashboard')
    d.append(['Flavor', 'Cookies per Batch', 'Price', 'Cost per Batch'])
    d.append(['Oaty', 10, 100, 9])
    d.append(['Salty', 10, 100, 6.12])
    d.append(['Saucy', 10, 100, 6])
    d.append(['Biscoffy', 4, 100, 7.6])
    d.append(['Quiet', 10, 100, 6])
    d.append(['Boxed', 10, 100, 26])
    d.append(['Weird', 10, 100, 6])
    d.append(['Packed', 10, 100, 206.3])
    wb.create_sheet('Bazaars').append(['Organizer', 'Event Date', 'Event Name', 'Location', 'Replied?', 'Email', 'Notes'])
    wb.save(path)


with tempfile.TemporaryDirectory() as t:
    pk_file = ROOT / 'scripts/b4b-packaging-items.json'
    eight = ['Apple Pie Box', 'Banoffee Pie Box', 'Heart-shaped box with lid', 'Kraft pouch', 'Pink box', 'Plastic pouch', 'Sauce Tub', 'Sticker']
    pk = json.loads(pk_file.read_text())
    check(isinstance(pk, list) and sorted(pk) == sorted(eight), 'b4b-packaging-items.json holds exactly the eight packaging names')
    p = Path(t) / 'b.xlsx'
    workbook_b4b(p)
    _, rc, rp = imp.build(p, None, pk, '2026-10-12')
    packed = [r for r in rc if r['flavour'] == 'Packed']
    # Packed: boxes 10, 11, 12 and pouches 10, 9, 8 against a batch of 10 are within the spare tolerance of 2; the Pink box at 14 is not.
    check([f['item'] for f in rp['for_cine']] == ['Pink box'] and [f['flavour'] for f in rp['for_cine']] == ['Packed'],
          'packaging: the spare-tolerance rule is unchanged (13 or more for 10 cookies goes to Cine)')
    check(len(packed) == 1 and {l['item'] for l in packed[0]['lines'] if l['kind'] == 'packaging'} == set(eight) - {'Pink box', 'Sauce Tub'}
          and all(l['qty'] == 1.0 and l['unit'] == 'pcs' for l in packed[0]['lines'] if l['kind'] == 'packaging'),
          'packaging: each of the six present items in the file is read as a per-cookie line')
    check('Oaty' not in [r['flavour'] for r in rc] and 'not in the Ingredient Master' in json.dumps(rp['unmatched']['recipes']),
          'without the flag an item missing from the master still holds the recipe')

    _, rc2, rp2 = imp.build(p, None, pk, '2026-10-12', create_unlisted=True)
    check({c['name'] for c in rp2['items_to_create']} == {'Oats', 'Sea salt', 'Sauce Tub', 'Cocoa nibs', 'Nutmeg'},
          'create-unlisted: Oats, Sea salt and Sauce Tub are proposed, and so are the unlisted items of a held recipe')
    check(all(c['price'] is None for c in rp2['items_to_create']), 'create-unlisted: they are unpriced, nothing guessed')
    check({c['name']: c['unit'] for c in rp2['items_to_create']} == {'Oats': 'g', 'Sea salt': 'g', 'Sauce Tub': 'pcs', 'Cocoa nibs': 'g', 'Nutmeg': 'g'},
          'create-unlisted: the unit comes from the recipe line')
    got = {r['flavour']: r for r in rc2}
    check({'Oaty', 'Salty', 'Saucy'} <= set(got), 'create-unlisted: those recipes are importable, not held')
    sauce = [l for l in got['Saucy']['lines'] if l['item'] == 'Sauce Tub'][0]
    check(sauce['kind'] == 'packaging' and sauce['qty'] == 1.0 and sauce['unit'] == 'pcs' and sauce['new_item'], 'create-unlisted: Sauce Tub is a per-cookie packaging line')
    cost = {c['flavour']: c for c in rp2['recipe_costing']}
    check(all(cost[f]['status'] == 'cost pending' and cost[f]['batch_cost'] is None for f in ('Oaty', 'Salty', 'Saucy')),
          'costing: a recipe with an unpriced item is incomplete, not a number')
    check(cost['Oaty']['pending_items'] == ['Oats'] and cost['Saucy']['pending_items'] == ['Sauce Tub'], 'costing: the unpriced items are named')
    held2 = {h['flavour']: h['why'] for h in rp2['unmatched']['recipes']}
    check(set(held2) == {'Biscoffy', 'Boxed', 'Weird', 'Quiet'}, 'unit clashes, a missing quantity and an unusable unit stay held, whatever the flag')
    check('unit differs (recipe piece, master grams)' in json.dumps(held2['Biscoffy']), 'Biscoff cookies: held with the reason, no conversion')
    check('unit differs (recipe grams, master piece)' in json.dumps(held2['Boxed']), 'Pink box: a packaging unit clash is held with the reason')
    check('tbsp' in json.dumps(held2['Weird']) or 'unit' in json.dumps(held2['Weird']), 'an unlisted item with an unusable unit is held with a reason')
    check('Zest' not in {c['name'] for c in rp2['items_to_create']}, 'an unlisted item with an unusable unit is not proposed')
    # Her own arithmetic: 7 flavours, Salty is the deliberately off one (dashboard 6.12, master total 6.00).
    cn = rp2['counts']
    check(cn['costing_total'] == 8 and cn['costing_reproduced'] == 7, 'costing reproduction is counted N of M (7 of 8)')
    off = [x for x in rp2['unmatched']['costing'] if x['flavour'] == 'Salty']
    check(len(off) == 1 and 'master total 6.00 differs from dashboard 6.12' in off[0]['why'], 'the off flavour is listed with its difference')
    check(imp.costing_line(cn) == 'costing reproduced 7 of 8', 'the costing summary line reads N of M')
    out = Path(t) / 'o'
    pkp = Path(t) / 'pk.json'
    pkp.write_text(json.dumps(pk))
    imp.main(['--workbook', str(p), '--out', str(out), '--as-of', '2026-10-12', '--packaging-items', str(pkp), '--create-unlisted'])
    rep = json.loads((out / 'report.json').read_text())
    check(rep['counts']['items_to_create'] == 5 and rep['counts']['recipes_unmatched'] == 4, 'the flag works through the command line')
print('import-her-data: all passed')

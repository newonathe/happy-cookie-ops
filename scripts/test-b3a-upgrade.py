#!/usr/bin/env python3
"""B3a populated-upgrade proof (migrations 20260101005500 identity links and 20260101005600 item costs).

LOCAL STACK ONLY, AND IT RESETS THE LOCAL DATABASE (twice: to migration 20260101005400 at the start, to the current migrations at the end).
It refuses unless the Docker engine is local and the project is this repository's own local Supabase stack, takes no arguments, and makes
no hosted call. It does not read any .env file.

What it proves, with a small made-up shop written the OLD way (before B3a):
  1. the shop is written directly: stock items, suppliers and prices by name, recipes with lines by name (matching, unmatched, ambiguous),
     a production record on a recipe version, stock movements with their ledger links, a use before any costed receipt, a waste, and one
     cost correction. get_books on BOTH bases and get_last_paid are recorded, and what unit_price_at gives every use and waste is captured;
  2. migration 56 alone is applied; the version snapshots exist; applying migration 57 now FAILS on its guard and changes nothing;
  3. preview_identity_links lists what it should, apply_identity_links links exactly the single matches and validates the production key;
  4. migration 57 is applied in one transaction: every old use and waste carries the stamp the old rule gave, seq is dense and in
     (received_at, at, id) order, each item's average equals the hand-worked value below, get_books totals on both bases are EQUAL to the
     recorded ones (the uses before any costed receipt now sit in `uncosted`), the cost basis is unchanged, get_last_paid is unchanged.

Hand-worked values (made-up shop). Flour: opening 10 g and 10 g used (no cost yet), 1000 g for 10000 centavos (corrected to 9000), 200 g
used and 50 g wasted (the old rule priced both at the corrected 9 c/g), 500 g for 7500 (15 c/g), 100 g used at 15. Butter: 500 g for 5000,
100 g used at 10. Sugar: opening 100 g, 50 g used, never a costed receipt. Used total = 200 x 9 + 50 x 9 + 100 x 15 + 100 x 10 = 4750.
Bought expenses = 10000 + 7500 + 5000 - 1000 (the correction) = 21500. Averages, replayed in (received_at, at, id) order: flour 9 after
the first delivery (nothing on hand, 9000 / 1000), 750 g on hand after the uses and the waste, then (750 x 9 + 7500) / 1250 = 11.4; butter
5000 / 500 = 10; sugar none.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tomllib
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUPABASE = ROOT / "node_modules/.pnpm/@supabase+cli-windows-x64@2.116.0/node_modules/@supabase/cli-windows-x64/bin/supabase.exe"
M56 = ROOT / "supabase/migrations/20260101005500_identity_links.sql"
M57 = ROOT / "supabase/migrations/20260101005600_item_costs.sql"
LOG = ROOT / "build/b3a/57-upgrade.txt"
OWNER = "b3a00000-0000-4000-8000-0000000000a0"
lines_out: list[str] = []


def say(message: str) -> None:
    print(message, flush=True)
    lines_out.append(message)


def fail(message: str) -> None:
    raise RuntimeError(message)


def run(args: list[str], *, input_text: str | None = None, timeout: int = 300) -> subprocess.CompletedProcess:
    return subprocess.run(args, input=input_text, capture_output=True, text=True, encoding="utf-8", timeout=timeout, cwd=ROOT)


def require_local_stack() -> str:
    if len(sys.argv) != 1:
        fail("this script accepts no arguments, URLs or project refs")
    config = tomllib.loads((ROOT / "supabase/config.toml").read_text(encoding="utf-8"))
    container = "supabase_db_" + config["project_id"]
    host = run(["docker", "context", "inspect", "default", "--format", "{{.Endpoints.docker.Host}}"]).stdout.strip().lower()
    if not (host.startswith("npipe:") or host.startswith("unix:")):
        fail("the Docker engine is not local: " + host)
    if run(["docker", "inspect", "--format", "{{.State.Running}}", container]).stdout.strip() != "true":
        fail("the local Supabase database container " + container + " is not running (pnpm db:start)")
    if not SUPABASE.is_file():
        fail("the pinned Supabase CLI is missing")
    return container


CONTAINER = ""


def psql(sql: str, *, single_transaction: bool = False, check: bool = True) -> subprocess.CompletedProcess:
    args = ["docker", "exec", "-i", CONTAINER, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-A", "-t"]
    if single_transaction:
        args.append("-1")
    result = run(args, input_text=sql)
    if check and result.returncode != 0:
        fail("psql failed: " + result.stderr.strip()[-600:])
    return result


def scalar(sql: str) -> str:
    out = [line for line in psql(sql).stdout.splitlines() if line.strip()]
    return out[-1] if out else ""


def as_owner(sql: str) -> str:
    prelude = (f"do $$ begin perform set_config('request.jwt.claim.sub', '{OWNER}', false); "
               f"perform set_config('request.jwt.claims', '{{\"sub\": \"{OWNER}\", \"role\": \"authenticated\"}}', false); end $$;\n")
    out = [line for line in psql(prelude + sql).stdout.splitlines() if line.strip()]
    return out[-1] if out else ""


def books(basis: str) -> dict:
    j = json.loads(as_owner(f"select public.set_cost_basis('{basis}');\nselect public.get_books(now() - interval '60 days', now() + interval '1 day')::text;"))
    totals: dict[str, int] = {}
    for line in j["lines"]:
        totals[line["kind"]] = totals.get(line["kind"], 0) + int(line["amount_cents"])
    return {"totals": totals, "uncosted": j["uncosted"] if "uncosted" in j else None, "basis": j["basis"]}


FIXTURE = f"""
insert into auth.users(id) values ('{OWNER}');
insert into public.profiles(id, role, display_name, active) values ('{OWNER}', 'owner', 'Upgrade owner', true);
insert into public.suppliers(id, name) values ('us1', 'U Supplier');
insert into public.inventory_items(id, name, unit, category, on_hand) values
  ('u-flour', 'U Flour', 'g', 'Ingredients', 1150), ('u-butter', 'U Butter', 'g', 'Ingredients', 400), ('u-sugar', 'U Sugar', 'g', 'Ingredients', 50),
  ('u-twin-a', 'U Twin', 'g', 'Ingredients', 0), ('u-twin-b', '  u twin ', 'g', 'Ingredients', 0);
-- prices by name: one matching, one unmatched, one ambiguous
insert into public.supplier_prices(supplier_id, item_name, pack_label, price_cents) values
  ('us1', 'U Flour', '1 kg', 12000), ('us1', 'U Nothing', '1 pack', 100), ('us1', 'U Twin', '2 kg', 500);
insert into public.products(id, name, short_name, price_cents, kind) values
  ('u1', 'U cookie one', 'U-1', 100, 'cookie'), ('u2', 'U cookie two', 'U-2', 100, 'cookie'), ('u3', 'U cookie three', 'U-3', 100, 'cookie');
insert into public.recipes(product_id, yield_count) values ('u1', 10), ('u2', 6), ('u3', 4);
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position) values
  ('u1', 'U Flour', 100, 'g', 0), ('u1', 'U Butter', 50, 'g', 1),
  ('u2', 'U Flour', 80, 'g', 0), ('u2', 'U Ghost', 5, 'g', 1),
  ('u3', 'U Twin', 20, 'g', 0);
insert into public.production_records(id, kind, product_id, qty, target, rejects, dough_used, recipe_version, drop_no, at, payload_hash)
values ('a1d00000-0000-4000-8000-000000000001', 'batch', 'u1', 10, 10, 0, 0, 1, 1, now() - interval '15 days', repeat('d', 64));
insert into public.ledger_entries(id, kind, category, memo, amount_cents, occurred_at) values
  ('a1a00000-0000-4000-8000-000000000001', 'cost', 'Ingredients', 'U Flour', -10000, now() - interval '19 days'),
  ('a1a00000-0000-4000-8000-000000000002', 'cost', 'Ingredients', 'U Flour', -7500, now() - interval '12 days'),
  ('a1a00000-0000-4000-8000-000000000003', 'cost', 'Ingredients', 'U Butter', -5000, now() - interval '18 days'),
  ('a1a00000-0000-4000-8000-000000000004', 'adjustment', 'Ingredients', 'Correction: U Flour cost 10000 -> 9000 centavos', 1000, now() - interval '8 days');
-- movements as the old code wrote them: no stamp, no sequence beyond their order; received_at = at
insert into public.stock_movements(id, item_id, kind, qty_delta, cost_cents, supplier, reason, at, received_at, ledger_id, production_id, payload_hash) values
  ('a1b00000-0000-4000-8000-000000000001', 'u-flour', 'opening', 10, null, '', '', now() - interval '21 days', now() - interval '21 days', null, null, repeat('1', 64)),
  ('a1b00000-0000-4000-8000-000000000002', 'u-flour', 'use', -10, null, '', 'Baked', now() - interval '20 days', now() - interval '20 days', null, null, repeat('2', 64)),
  ('a1b00000-0000-4000-8000-000000000003', 'u-flour', 'receipt', 1000, 10000, 'Landers', '', now() - interval '19 days', now() - interval '19 days', 'a1a00000-0000-4000-8000-000000000001', null, repeat('3', 64)),
  ('a1b00000-0000-4000-8000-000000000004', 'u-flour', 'use', -200, null, '', 'Baked', now() - interval '15 days', now() - interval '15 days', null, 'a1d00000-0000-4000-8000-000000000001', repeat('4', 64)),
  ('a1b00000-0000-4000-8000-000000000005', 'u-flour', 'waste', -50, null, '', 'Dropped', now() - interval '14 days', now() - interval '14 days', null, null, repeat('5', 64)),
  ('a1b00000-0000-4000-8000-000000000006', 'u-flour', 'receipt', 500, 7500, 'Landers', '', now() - interval '12 days', now() - interval '12 days', 'a1a00000-0000-4000-8000-000000000002', null, repeat('6', 64)),
  ('a1b00000-0000-4000-8000-000000000007', 'u-flour', 'use', -100, null, '', 'Baked', now() - interval '10 days', now() - interval '10 days', null, null, repeat('7', 64)),
  ('a1b00000-0000-4000-8000-000000000011', 'u-butter', 'receipt', 500, 5000, 'Landers', '', now() - interval '18 days', now() - interval '18 days', 'a1a00000-0000-4000-8000-000000000003', null, repeat('8', 64)),
  ('a1b00000-0000-4000-8000-000000000012', 'u-butter', 'use', -100, null, '', 'Baked', now() - interval '16 days', now() - interval '16 days', null, null, repeat('9', 64)),
  ('a1b00000-0000-4000-8000-000000000021', 'u-sugar', 'opening', 100, null, '', '', now() - interval '18 days', now() - interval '18 days', null, null, repeat('a', 64)),
  ('a1b00000-0000-4000-8000-000000000022', 'u-sugar', 'use', -50, null, '', 'Baked', now() - interval '17 days', now() - interval '17 days', null, null, repeat('b', 64));
insert into public.stock_cost_corrections(id, movement_id, cost_cents, ledger_id, at, payload_hash)
values ('a1c00000-0000-4000-8000-000000000001', 'a1b00000-0000-4000-8000-000000000003', 9000, 'a1a00000-0000-4000-8000-000000000004', now() - interval '8 days', repeat('c', 64));
"""


def main() -> int:
    global CONTAINER
    checks = 0

    def check(name: str, ok: bool, detail: object = "") -> None:
        nonlocal checks
        if not ok:
            fail(f"check failed: {name} {detail}")
        checks += 1

    try:
        CONTAINER = require_local_stack()
        say("RESETTING THE LOCAL DATABASE to migration 20260101005400 (no B3a migration, no seed)")
        reset = run([str(SUPABASE), "db", "reset", "--local", "--yes", "--no-seed", "--version", "20260101005400", "--workdir", str(ROOT)])
        if reset.returncode != 0:
            fail("supabase db reset --version failed: " + (reset.stderr or reset.stdout).strip()[-500:])
        check("reset stopped before B3a", scalar("select to_regclass('public.recipe_versions') is not null and to_regprocedure('public.preview_identity_links()') is null") == "t")
        check("no item_prices yet", scalar("select to_regclass('public.item_prices') is null") == "t")

        psql(FIXTURE, single_transaction=True)
        legacy = {}
        for line in psql("select id, public.unit_price_at(item_id, at)::text from public.stock_movements where kind in ('use', 'waste') order by id;").stdout.splitlines():
            if line.strip():
                key, value = line.split("|")
                legacy[key] = value
        check("the old rule priced the uses", {k: Decimal(v) for k, v in legacy.items()} == {
            'a1b00000-0000-4000-8000-000000000002': Decimal(0), 'a1b00000-0000-4000-8000-000000000004': Decimal(9),
            'a1b00000-0000-4000-8000-000000000005': Decimal(9), 'a1b00000-0000-4000-8000-000000000007': Decimal(15),
            'a1b00000-0000-4000-8000-000000000012': Decimal(10), 'a1b00000-0000-4000-8000-000000000022': Decimal(0)}, legacy)
        original_basis = scalar("select cost_basis from public.books_settings where id")
        before = {basis: books(basis) for basis in ("bought", "used")}
        as_owner(f"select public.set_cost_basis('{original_basis}');")
        paid_before = as_owner("select public.get_last_paid()::text;")
        check("old used total, worked by hand", before["used"]["totals"].get("expense") == 4750, before["used"]["totals"])
        check("old bought total, worked by hand", before["bought"]["totals"].get("expense") == 21500, before["bought"]["totals"])

        say("applying migration 20260101005500 (identity links) alone, in one transaction")
        psql(M56.read_text(encoding="utf-8"), single_transaction=True)
        check("version snapshots exist for every recipe", scalar("select count(*) from public.recipe_versions") == "3"
              and scalar("select count(*) from public.recipes r where not exists (select 1 from public.recipe_versions v where v.product_id = r.product_id and v.version = r.version)") == "0")

        say("applying migration 20260101005600 (item costs) before the links: it must stop on its guard")
        guarded = psql(M57.read_text(encoding="utf-8"), single_transaction=True, check=False)
        check("the guard refuses", guarded.returncode != 0 and "run preview_identity_links() and apply_identity_links() first" in guarded.stderr, guarded.stderr[-300:])
        check("the guard changed nothing", scalar("select to_regclass('public.item_prices') is null and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stock_movements' and column_name = 'seq')") == "t")

        preview = json.loads(scalar("select public.preview_identity_links()::text;"))
        check("preview counts", preview["counts"] == {"recipe_lines": 3, "supplier_prices": 1, "recipe_versions": 0}, preview["counts"])
        check("preview unmatched and ambiguous lines", preview["recipe_lines"]["unmatched"] == [{"product_id": "u2", "name": "U Ghost"}]
              and preview["recipe_lines"]["ambiguous"] == [{"product_id": "u3", "name": "U Twin"}], preview["recipe_lines"])
        check("preview prices", [x["name"] for x in preview["supplier_prices"]["unmatched"]] == ["U Nothing"]
              and [x["name"] for x in preview["supplier_prices"]["ambiguous"]] == ["U Twin"], preview["supplier_prices"])
        check("preview production", preview["production"]["records"] == 1 and preview["production"]["missing_version"] == [] and preview["production"]["fk_valid"] is False, preview["production"])
        applied = json.loads(scalar("select public.apply_identity_links(public.preview_identity_links() -> 'counts')::text;"))
        check("apply linked exactly the single matches", applied["counts"] == {"recipe_lines": 0, "supplier_prices": 0, "recipe_versions": 0}
              and scalar("select count(*) from public.recipe_ingredients where item_id is not null") == "3"
              and scalar("select count(*) from public.recipe_ingredients where item_id is null") == "2"
              and scalar("select count(*) from public.supplier_prices where item_id is not null") == "1", applied["counts"])
        check("the production key is validated", applied["production"]["fk_valid"] is True)

        say("applying migration 20260101005600 (item costs) in one transaction")
        psql(M57.read_text(encoding="utf-8"), single_transaction=True)

        stamps = {}
        for line in psql("select id, coalesce(unit_cost::text, ''), coalesce(cost_source, '') from public.stock_movements where kind in ('use', 'waste') order by id;").stdout.splitlines():
            if line.strip():
                key, cost, source = line.split("|")
                stamps[key] = (cost, source)
        for key, value in legacy.items():
            if Decimal(value) > 0:
                check("stamp equals the old rule: " + key, stamps[key] == (value, "legacy"), (stamps[key], value))
            else:
                check("no stamp where the old rule gave nothing: " + key, stamps[key] == ("", ""), stamps[key])
        seq = scalar("select count(*) || '|' || min(seq) || '|' || max(seq) || '|' || (select array_agg(id order by seq) = array_agg(id order by received_at, at, id) from public.stock_movements) from public.stock_movements;")
        check("seq is dense and in received_at, at, id order", seq == "11|1|11|true", seq)
        averages = {}
        for line in psql("select id, coalesce(avg_cost::text, '') from public.inventory_items where id in ('u-flour', 'u-butter', 'u-sugar') order by id;").stdout.splitlines():
            if line.strip():
                key, value = line.split("|")
                averages[key] = Decimal(value) if value else None
        check("averages equal the hand-worked values", averages == {"u-flour": Decimal("11.4"), "u-butter": Decimal(10), "u-sugar": None}, averages)
        for basis in ("bought", "used"):
            after = books(basis)
            check("get_books totals equal on the " + basis + " basis", after["totals"] == before[basis]["totals"], (after["totals"], before[basis]["totals"]))
        after_used = books("used")
        names = sorted(u["item"] for u in after_used["uncosted"])
        check("the uses before any costed receipt are uncosted, never a line", names == ["U Flour", "U Sugar"]
              and sorted(Decimal(str(u["qty"])) for u in after_used["uncosted"]) == [Decimal(10), Decimal(50)], after_used["uncosted"])
        as_owner(f"select public.set_cost_basis('{original_basis}');")
        check("the cost basis is unchanged", scalar("select cost_basis from public.books_settings where id") == original_basis == "bought")
        check("get_last_paid is unchanged", as_owner("select public.get_last_paid()::text;") == paid_before)
        check("the shop's existing correction booked nothing as used", scalar("select used_cents from public.stock_cost_corrections") == "0")

        say("RESETTING THE LOCAL DATABASE to the current migrations and seed")
        final = run([str(SUPABASE), "db", "reset", "--local", "--yes", "--workdir", str(ROOT)])
        if final.returncode != 0:
            fail("the final supabase db reset failed: " + (final.stderr or final.stdout).strip()[-500:])
        summary = {"status": "passed", "checks": checks, "scope": "local stack only: populated upgrade through migrations 56 and 57"}
    except (RuntimeError, OSError, subprocess.TimeoutExpired, KeyError, ValueError) as error:
        summary = {"status": "failed", "checks": checks, "error": str(error)}
    say(json.dumps(summary))
    LOG.parent.mkdir(parents=True, exist_ok=True)
    LOG.write_text("\n".join(lines_out) + "\n", encoding="utf-8")
    return 0 if summary["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())

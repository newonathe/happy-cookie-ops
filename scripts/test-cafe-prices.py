"""Café prices (migration 20260101009100): the default rule, owner-only read and set, ranges, clear-to-default, the closed table and
that the order form's view is unchanged; then each rule removed in turn (a mutant) must be caught, and the function inventory must
match tests/fixtures/function-authority.json before and after."""
import importlib.util
import json
from pathlib import Path
import runpy
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bootstrap", ROOT / "scripts/test-db-bootstrap.py")
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
verify = runpy.run_path(str(ROOT / "scripts/verify-function-authority.py"))["verify_functions"]


def check(db_id, workdir, _password, _report):
    inventory = (ROOT / "tests/integration/db/schema-inventory.sql").read_text()
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    sql = (ROOT / "tests/integration/security/cafe-prices.sql").read_text()
    migration = (ROOT / "supabase/migrations/20260101009100_cafe_prices.sql").read_text()
    # Only the functions are restated (create or replace keeps their grants): the table already exists on the reset.
    definition = migration[migration.index("create function public.default_cafe_price_cents"):].replace(
        "create function", "create or replace function")

    def cut(old, new):
        if definition.count(old) < 1:
            raise RuntimeError("mutant text is missing: " + old)
        return definition.replace(old, new)

    mutants = [
        ("round up", cut("(p_retail_cents * 7 / 10 / 500) * 500", "((p_retail_cents * 7 / 10 + 499) / 500) * 500")),
        ("eighty percent", cut("p_retail_cents * 7 / 10", "p_retail_cents * 8 / 10")),
        ("zero default", cut("    else p_retail_cents\n", "    else 0\n")),
        ("any reader", cut("if not public.is_owner() then -- rule:cafe-read-owner", "if false then")),
        ("any setter", cut("if not public.is_owner() then -- rule:cafe-set-owner", "if false then")),
        ("no id check", cut("if p_product_id is null or p_product_id !~ '^[a-z0-9][a-z0-9-]{0,31}$' then -- rule:cafe-id",
                            "if p_product_id is null then")),
        ("no range", cut("if p_price_cents is not null and p_price_cents not between 1 and 100000000 then -- rule:cafe-range",
                         "if false then")),
        ("any product", cut("if not found then -- rule:cafe-product", "if false then")),
        ("zero listed", cut("where p.archived_at is null and p.price_cents > 0 -- rule:cafe-priced", "where p.archived_at is null")),
        ("zero priced", cut("and p.archived_at is null and p.price_cents > 0 for share", "and p.archived_at is null for share")),
        ("clear keeps", cut("    delete from public.product_cafe_prices c where c.product_id = p_product_id;", "    null;")),
        ("anon sets", definition + "\ngrant execute on function public.set_cafe_price(text, bigint) to anon;"),
        ("anon reads", definition + "\ngrant execute on function public.get_cafe_prices() to anon;"),
        ("table open", definition + "\ngrant select on public.product_cafe_prices to authenticated;"),
    ]
    for name, mutation in mutants:
        try:
            h.psql(db_id, workdir, sql.replace("begin;", "begin;\n" + mutation, 1))
        except RuntimeError as error:
            if "cafe prices" not in str(error):
                raise RuntimeError(f"mutant {name!r} failed differently: {error}") from error
        else:
            h.fail("cafe prices mutation was not detected: " + name)
        verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    if "CAFE_PRICES|passed" not in h.psql(db_id, workdir, sql):
        h.fail("cafe prices contract did not complete")
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    print(f"Café prices: default rule, owner-only read and set, ranges, clear, closed table, order form unchanged; {len(mutants)} mutants.",
          flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-cafe-prices-fixture.json"
    raise SystemExit(h.main(after_reset=check))

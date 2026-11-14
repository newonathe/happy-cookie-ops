"""Her own product types (migration 20260101008400): rules, the behaviour trigger and RPC authority on two resets."""
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
    sql = (ROOT / "tests/integration/security/product-types.sql").read_text()
    definition = (ROOT / "supabase/migrations/20260101008400_product_types.sql").read_text()
    # Each mutant removes one rule; the scenario must name what broke.
    END = chr(10) + "$$;" + chr(10)

    def fn(name):
        # Only a function is re-run inside the scenario: the table and seed rows of the migration cannot be created twice.
        s = definition.index("create or replace function public." + name + "(")
        return definition[s:definition.index(END, s) + len(END)]
    save_type, write = fn("save_product_type"), fn("write_flavour")
    mutants = [
        ("grant execute on function public.get_product_types() to anon;", "TYPES_GRANTS"),
        (save_type.replace("raise exception 'only the owner may change the product types' using errcode = '42501';", "null;", 1), "not owner"),
        (save_type.replace("and t.id <> v_id) then -- rule:ptype-label-taken", "and false) then -- rule:ptype-label-taken", 1), "name taken"),
        (save_type.replace("if v_row.behaves_as <> v_beh and (v_row.built_in or exists", "if false and (v_row.built_in or exists", 1), "behaviour locked"),
        (save_type.replace("if v_row.built_in and not v_active then", "if false then", 1), "builtin off"),
        (write.replace("if v_behaves <> (p_flavour ->> 'item_type') then", "if false then", 1), "behaviour disagrees"),
        (write.replace("and (t.active or exists", "and (true or exists", 1), "off for new"),
        ("drop trigger products_type_behaviour on public.products;", "TYPES_DIRECT"),
        (fn("product_type_behaviour").replace("new.type_id := 'set';", "null;", 1), "TYPES_DIRECT"),
        (write.replace("where x.id = p_id and t.behaves_as = p_flavour ->> 'item_type'; -- rule:type-keep", "where false; -- rule:type-keep", 1), "TYPES_KEEP"),
    ]
    for mutation, wanted in mutants:
        try:
            h.psql(db_id, workdir, sql.replace("begin;", "begin;\n" + mutation, 1))
        except RuntimeError as error:
            if wanted not in str(error):
                raise RuntimeError(f"mutant for {wanted!r} failed differently: {error}") from error
        else:
            h.fail("product-types mutation was not detected: " + wanted)
    if "PRODUCT_TYPES|passed" not in h.psql(db_id, workdir, sql):
        h.fail("product-types contract did not complete")
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    print("Product types: rules, behaviour trigger, read and grants, ten mutants passed.", flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-product-types-fixture.json"
    raise SystemExit(h.main(after_reset=check))

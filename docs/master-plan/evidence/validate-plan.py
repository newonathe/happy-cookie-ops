"""Validate planning artifacts only; never launches an app, runner, database or deployment.
Requires jsonschema 4.26.0, installed in the isolated audit copy's audit-python-libs.
Run from the project root with Python; scratch-location.txt identifies that dependency directory.
"""
from pathlib import Path
import csv, hashlib, importlib.metadata, json, re, subprocess, sys, unicodedata
from datetime import datetime, timezone
from graphlib import TopologicalSorter

ROOT = Path(__file__).resolve().parents[3]
PLAN = ROOT / "docs/master-plan"
EVIDENCE = PLAN / "evidence"
scratch = Path((EVIDENCE / "scratch-location.txt").read_text(encoding="utf-8-sig").strip())
sys.path.insert(0, str(scratch / "audit-python-libs"))
from jsonschema import Draft202012Validator, FormatChecker

def read_json(p):
    return json.loads(p.read_text(encoding="utf-8-sig"))
def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(p, value):
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
checks, failures = [], []
def check(name, condition, detail=None):
    row = {"check": name, "passed": bool(condition)}
    if detail is not None:
        row["detail"] = detail
    checks.append(row)
    if not condition:
        failures.append(name)

catalog = read_json(PLAN / "tasks.json")
schema = read_json(PLAN / "templates/task-catalog.schema.json")
event_schema = read_json(PLAN / "templates/event.schema.json")
for title, value in [("task", schema), ("event", event_schema)]:
    Draft202012Validator.check_schema(value)
    check(title + "_schema_meta_validation", True)
errors = [e.message for e in Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(catalog)]
check("task_catalog_json_schema", not errors, errors)
tasks = catalog["tasks"]
by_id = {t["id"]: t for t in tasks}
ids = set(by_id)
check("unique_36_work_packages", len(tasks) == len(ids) == 36)
check("all_work_remains_planned", all(t["status"] == "planned" for t in tasks))
check("valid_dependency_ids", all(set(t["depends_on"]) <= ids - {t["id"]} for t in tasks))
topological = list(TopologicalSorter({t["id"]: set(t["depends_on"]) for t in tasks}).static_order())
check("acyclic_dependency_graph", len(topological) == 36, topological)
decisions_text = (PLAN / "10-decisions-and-sources.md").read_text(encoding="utf-8")
decisions = set(re.findall(r"^\| (DP-\d{2}) \|", decisions_text, re.M))
check("all_11_decisions_and_valid_references", len(decisions) == 11 and all(set(t["decision_gates"]) <= decisions for t in tasks))
check("bounded_task_contract_fields", all(t["owned_paths"] and t["acceptance"] and t["read_first"] and t["verification"] and t["rollback"] for t in tasks))
check("read_first_paths_exist", all((ROOT / p).exists() for t in tasks for p in t["read_first"]))
check("one_prompt_per_task", all((PLAN / "prompts" / (t + ".md")).is_file() for t in ids))

generated = [PLAN / "tasks.json", PLAN / "07-build-backlog.md", *sorted((PLAN / "prompts").glob("*.md"))]
before = {str(p): digest(p) for p in generated}
generation = subprocess.run([sys.executable, str(EVIDENCE / "build-task-catalog.py")], cwd=ROOT, capture_output=True, text=True)
check("catalog_and_prompts_reproduce_exactly", generation.returncode == 0 and before == {str(p): digest(p) for p in generated}, generation.stdout.strip())

findings = set()
for filename in ["01-feature-and-state-audit.md", "02-data-engine-and-offline-audit.md", "03-security-and-operations-audit.md"]:
    body = (PLAN / filename).read_text(encoding="utf-8")
    findings.update(re.findall(r"^\|\s*(F\d{2}|DATA-\d{2}|SEC-\d{2})(?=\s|\|)", body, re.M))
trace = (PLAN / "11-traceability.md").read_text(encoding="utf-8")
traced = re.findall(r"^\|\s*(F\d{2}|DATA-\d{2}|SEC-\d{2})(?=\s|\|)", trace, re.M)
check("all_55_findings_traced_once", len(findings) == len(traced) == len(set(traced)) == 55 and findings == set(traced))
check("trace_task_references_valid", set(re.findall(r"prompts/((?:MP|AR)-\d{2})\.md", trace)) <= ids)

allowed_docs = {
    "AGENTS.md", "CLAUDE.md", "START-HERE.md", "NEXT.md", "HANDOFF.md", "README.md",
    "docs/GAPS.md", "docs/TASKS.md", "docs/DEPLOY.md", "docs/FREE-TIER.md",
    "docs/PROMPTS.md", "docs/prompts/README.md", "docs/CONTRACTS.md",
}
manifest = read_json(EVIDENCE / "repository-manifest.json")
modified, missing, unchanged = [], [], []
for entry in manifest:
    p = ROOT / entry["path"]
    if not p.is_file():
        missing.append(entry["path"])
    elif digest(p) != entry["sha256"]:
        modified.append(entry["path"])
    else:
        unchanged.append(entry["path"])
check("original_inventory_complete", len(manifest) == 347 and not missing, {"missing": missing})
check("only_13_document_navigation_notices_changed", set(modified) == allowed_docs, modified)
check("all_original_application_assets_sql_tests_unchanged", not missing and set(modified) <= allowed_docs)
scratch_changed = [e["path"] for e in manifest if not (scratch / e["path"]).is_file() or digest(scratch / e["path"]) != e["sha256"]]
check("installed_copy_matches_original_baseline", not scratch_changed, scratch_changed)
notice = re.compile(r"^> \*\*Current planning authority.*$", re.M)
agent_notice = notice.findall((ROOT / "AGENTS.md").read_text(encoding="utf-8"))
claude_notice = notice.findall((ROOT / "CLAUDE.md").read_text(encoding="utf-8"))
check("agent_authority_notices_match", len(agent_notice) == 1 and agent_notice == claude_notice)

# Per-original-file coverage is a responsibility index, not a claim of isolated execution per file.
def coverage(path):
    if path.startswith("docs/reference/screens/"):
        return "reference images", "00, 01", "reference visual inventory and contact sheets"
    if path.startswith("public/") and Path(path).suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico"}:
        return "public assets", "00, 01", "asset inventory and rendered/broken-image browser checks"
    if path.startswith("src/components/") or path.startswith("src/view-models/") or path == "src/lib/screens.ts":
        return "view and state binding", "01, 06", "source and screen/state mapping; browser evidence where reachable"
    if path.startswith("src/store/") or path.startswith("src/lib/offline/") or path.startswith("public/sw"):
        return "engine and offline", "02, 06", "source flow and selected diagnostic counterexamples"
    if path.startswith("supabase/"):
        return "database and generated seed", "02, 03, 06", "static SQL/schema/grant and generated-seed review; no DB execution"
    if path.startswith("src/"):
        return "application infrastructure", "01, 02, 03, 04", "source boundary/configuration/API/security review"
    if path.startswith("tests/") or path.startswith("scripts/") or path.startswith(".github/"):
        return "tests, gates and CI", "00, 01, 03, 08", "source assertions and executed checks as itemized in 00"
    if path.startswith("docs/"):
        return "reference and project documentation", "00, 01, 05, 07, 10", "source-claim reconciliation, prototype relationships and task supersession"
    return "root configuration and agent integration", "00, 03, 09", "configuration, provenance, workflow and toolchain review"
with (EVIDENCE / "repository-coverage.csv").open("w", newline="", encoding="utf-8") as out:
    writer = csv.writer(out)
    writer.writerow(["original_path", "baseline_sha256", "family", "audit_chapters", "review_method", "current_hash_matches"])
    for entry in manifest:
        writer.writerow([entry["path"], entry["sha256"], *coverage(entry["path"]), entry["path"] in unchanged])

# A synthetic example, never an event from a running supervisor.
example = {
    "schemaVersion": 1, "eventId": "b4576b0a-48f2-4cc0-9e93-47311e054f53",
    "sequence": 1, "projectId": "example-project", "runId": "2b4a6a50-ac7a-4f40-8819-8f9c554d7953",
    "taskId": "EXAMPLE-01", "kind": "checkpoint", "recordedAt": "2026-09-08T00:00:00Z",
    "occurredAt": None, "summary": "Synthetic schema example only; no runner has executed.",
    "operationId": None, "codeSha": None, "exitCode": None, "resetsAt": None,
    "evidence": [], "previousHash": None,
}
def normalize(value):
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, list):
        return [normalize(v) for v in value]
    if isinstance(value, dict):
        return {k: normalize(v) for k, v in value.items()}
    return value
encoded = json.dumps(normalize(example), sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
example["eventHash"] = hashlib.sha256(encoded).hexdigest()
dump(PLAN / "templates/event.example.json", example)
event_errors = [e.message for e in Draft202012Validator(event_schema, format_checker=FormatChecker()).iter_errors(example)]
check("synthetic_event_schema_and_hash", not event_errors, {"errors": event_errors, "eventHash": example["eventHash"]})
policy = read_json(PLAN / "templates/runner-policy.json")
check("runner_disabled_and_no_spend_bypass", policy["enabled"] is False and all(policy[k] is False for k in [
    "api_key_billing_allowed", "extra_usage_or_reset_purchase_allowed", "model_auto_fallback_allowed",
    "allow_permission_bypass", "automatic_merge", "automatic_push", "automatic_deploy", "production_credentials_available"]))
profile = read_json(PLAN / "templates/project-profile.json")
profile.update({
    "project_id": "happy-cookie-ops", "project_root": str(ROOT),
    "data_classification": "Current source fixtures are fabricated demo records; future live contacts and payments require controlled access.",
    "prototype_path": "docs/reference/prototype.dc.html",
    "protected_paths": ["src/components/screens/**", "src/components/sheets/**", "src/components/shell/**", "src/store/engine/ops-engine.js", "supabase/migrations/*.sql (applied)", "scripts/port-baseline.json", "supabase/seed.sql", "tests/e2e/visual.spec.ts baselines"],
    "offline_writer_count": 1, "live_data_migration_required": False,
    "required_platforms": ["MacBook web/Safari", "iPhone/iPad web and installed PWA"],
    "unresolved_decisions": sorted(decisions),
})
dump(EVIDENCE / "happy-cookie-profile.json", profile)
check("project_profile_preserves_user_scope", profile["ui_ux_locked"] and not profile["runner_enabled"] and profile["offline_writer_count"] == 1 and profile["live_data_migration_required"] is False)
for p in (PLAN / "templates").glob("*.json"):
    read_json(p)
check("all_template_json_parses", True)

# Local Markdown destinations only: external URLs are source references, not availability assertions.
md_files = [ROOT / "MASTER-PLAN.md", *sorted(PLAN.glob("*.md")), *sorted((PLAN / "templates").glob("*.md")), *sorted((PLAN / "prompts").glob("*.md"))]
broken_links, link_count = [], 0
for p in md_files:
    body = re.sub(r"```.*?```", "", p.read_text(encoding="utf-8"), flags=re.S)
    for match in re.finditer(r"!?\[[^\]\n]*\]\((<[^>]+>|[^)\n]+)\)", body):
        target = match.group(1).strip().strip("<>")
        if target.startswith(("https://", "http://", "mailto:", "#", "codex://")):
            continue
        target = target.split("#", 1)[0]
        link_count += 1
        destination = (p.parent / target).resolve()
        # This report is produced below; all other linked artifacts must already exist.
        if not destination.exists() and destination != (EVIDENCE / "plan-validation.json").resolve():
            broken_links.append({"source": str(p.relative_to(ROOT)), "target": target})
check("local_markdown_destinations_exist", not broken_links, {"checked": link_count, "broken": broken_links})

verify_path = EVIDENCE / "pnpm-verify-final.txt"
# PowerShell versions may produce UTF-16 redirects.
raw = verify_path.read_bytes()
verify = raw.decode("utf-16") if raw[:2] in {b"\xff\xfe", b"\xfe\xff"} else raw.decode("utf-8-sig")
diagnostics = len(re.findall(r"error TS\d+", verify))
check("final_app_verify_failure_evidence_preserved", diagnostics == 108 and "Port integrity OK" in verify and "Engine contract OK" in verify, {"typescript_diagnostics": diagnostics, "application_verify_passed": False})
summary = read_json(EVIDENCE / "ui-summary.json")
check("browser_evidence_counts_consistent", summary["ui-results.json"]["captures"] == 104 and summary["ui-driven-results.json"]["captures"] == 104 and summary["ui-results.json"]["route_mismatches"] == 96)
probe = subprocess.run(["node", str(EVIDENCE / "engine-probes.cjs")], cwd=ROOT, capture_output=True, text=True)
check("engine_counterexamples_reproduce", probe.returncode == 0 and json.loads(probe.stdout) == read_json(EVIDENCE / "engine-probes.json"))

report = {
    "validated_at_utc": datetime.now(timezone.utc).isoformat(),
    "scope": "Planning structure and source preservation only; not application release validation.",
    "validator": {"python": sys.version.split()[0], "jsonschema": importlib.metadata.version("jsonschema")},
    "passed": not failures, "checks": checks,
    "original_file_count": len(manifest), "unchanged_original_files": len(unchanged),
    "changed_original_docs": modified, "work_packages": len(tasks), "findings": len(findings),
    "application_verify_passed": False, "application_typescript_diagnostics": diagnostics,
    "runner_implemented": False, "failures": failures,
}
dump(EVIDENCE / "plan-validation.json", report)
assert (EVIDENCE / "plan-validation.json").is_file()
print(json.dumps({"planning_checks_passed": not failures, "checks": len(checks), "findings": len(findings), "work_packages": len(tasks), "unchanged_original_files": len(unchanged), "modified_original_docs": len(modified), "local_links": link_count, "failures": failures}, indent=2))
sys.exit(0 if not failures else 1)

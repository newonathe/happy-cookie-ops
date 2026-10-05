# Happy Cookie Ops — master build plan

**Audit baseline: 7 September 2026 · Plan consolidated: 8 September 2026 · Status: audited prototype port; production build blocked.**

This is the central entry point for turning the current project into a working product. It supersedes readiness claims and implementation ordering in the older `START-HERE.md`, `NEXT.md`, `HANDOFF.md`, `docs/GAPS.md`, `docs/TASKS.md`, `docs/CONTRACTS.md`, and deployment prompts where they conflict with this audit. Those files remain historical evidence. Repository protection rules remain in force. Nothing here authorizes a deployment, paid service, protected design change, or automatic runner activation.

Current implementation progress: [G0 current state](docs/state/current.md). The 2026-09-08 request authorizes only MP-00 through MP-03 locally; the audit below remains historical evidence.

## What is settled

- The approved UI and UX are locked: preserve the prototype's screens, copy, spacing, component order and interactions. Implement behind the view-model/runtime boundary. Missing production states are explicit decisions, not permission to redesign.
- Current records are **fabricated demonstration records**, as the user clarified. Preserve the fixture/reference archive. Start production with reviewed configuration and opening balances; do not migrate demo orders into live books.
- Launch permits **one designated offline bazaar sales device**. Online staff may use other devices. Stock allocated to the offline device cannot simultaneously be sold by another channel.
- Target ordinary web use on MacBook and iPhone/iPad plus installation as a PWA. Native App Store distribution is outside the zero-cost baseline.
- Zero additional software/service spend. Existing Claude Pro and Codex Plus are the only subscription exceptions. Existing hardware, electricity, internet, operator time and sufficient backup storage are prerequisites, not cost-free resources created by software.
- This phase delivers **audit, plan and reusable templates**. Product implementation and the automatic runner are later work.

## Read in this order

| Need                                                                                                | Authoritative document                                                                                                                                         |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What was inspected, what actually passed, limits of evidence                                        | [00 Audit evidence](docs/master-plan/00-audit-evidence.md)                                                                                                     |
| Every page, sheet, setting and state; design conflicts                                              | [01 Feature and state audit](docs/master-plan/01-feature-and-state-audit.md)                                                                                   |
| Existing engine, database and queue defects                                                         | [02 Data and offline audit](docs/master-plan/02-data-engine-and-offline-audit.md)                                                                              |
| Threats, authorization, privacy and operational exposure                                            | [03 Security audit](docs/master-plan/03-security-and-operations-audit.md)                                                                                      |
| Chosen stack, free limits, boundaries, speed, Apple support                                         | [04 Architecture](docs/master-plan/04-architecture.md)                                                                                                         |
| How the entire ERP manual applies and what is excluded                                              | [05 Manual crosswalk](docs/master-plan/05-manual-crosswalk.md)                                                                                                 |
| Exact business invariants, schema, APIs and transaction rules                                       | [06 Domain contracts](docs/master-plan/06-domain-contracts.md)                                                                                                 |
| Ordered work packages, file ownership, checks and rollback                                          | [07 Build backlog](docs/master-plan/07-build-backlog.md) and [machine-readable catalog](docs/master-plan/tasks.json)                                           |
| Tests, setup, release gates, recovery and daily operations                                          | [08 Validation and operations](docs/master-plan/08-validation-and-operations.md)                                                                               |
| Codex/Claude prompts, memory, Git, model selection, quota resumption                                | [09 Agent operating system](docs/master-plan/09-agent-operating-system.md)                                                                                     |
| Research sources, competing options, owner decisions                                                | [10 Decisions and sources](docs/master-plan/10-decisions-and-sources.md)                                                                                       |
| Every prioritized finding mapped to work and tests                                                  | [11 Traceability](docs/master-plan/11-traceability.md)                                                                                                         |
| Planning checks, source preservation and final failing application baseline                         | [12 Plan validation](docs/master-plan/12-plan-validation.md)                                                                                                   |
| Reusable starting files                                                                             | [Template index](docs/master-plan/templates/README.md)                                                                                                         |
| Owner decisions, open owner questions and owner-supplied materials (amends DP-00…DP-10; 2026-09-24) | [Decision register](docs/state/decision-register.md), [owner decision packet](docs/state/owner-decision-packet.md), [owner inputs](docs/state/owner-inputs.md) |

## Current assessment

The port is substantial and visually specified. It is not a nearly complete production system. Most business actions still mutate a browser-local demonstration engine. There is no authoritative end-to-end customer checkout, staff operations persistence, production inventory ledger, real backup system, or verified release pipeline.

The existing integrity checks pass, but the full `pnpm verify` fails. In an isolated copy with dependencies installed, TypeScript emitted 108 diagnostics; lint independently failed at configuration loading; unit tests produced 70 passes and one failing privacy-scrubber test. The production build failed. Static inspection found a migration syntax blocker, unsafe anonymous write policies and an exposed privileged retention function. SQL exploits are **static findings pending isolated database verification**, not claims of a live incident.

CLI browser capture covered 26 routes at four profiles. All returned HTTP 200, but 96 of 104 hydrated direct visits had the wrong pathname after initialization. Engine-driven captures prove that the intended screen layouts exist, while also exposing blank prerequisite-dependent screens and remaining prototype controls. HTTP 200 and a visible body are not route acceptance tests. See the evidence report for capture conditions and limitations.

## Delivery gates

| Gate                       | Work        | Exit evidence                                                                                                                 |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| G0 — reproducible baseline | MP-00–MP-03 | Versioned source, lockfile, compatible tools, green verification/build, complete design baseline                              |
| G1 — safe platform         | MP-04–MP-08 | Free-host spike; deterministic fresh database; denied unauthorized SQL/API actions; authenticated role bootstrap              |
| G2 — online business       | MP-09–MP-17 | Real catalog → checkout → payment review → bake → collection → reconciled reports; uploads and inventory transactions         |
| G3 — durable bazaar        | MP-18–MP-21 | One-device allocation; local transaction before success; crash/replay/void/closeout reconciliation; real iPhone offline tests |
| G4 — operationally ready   | MP-22–MP-26 | Privacy and backup restore; recovery, performance, security, accessibility and owner UAT evidence                             |
| G5 — controlled launch     | MP-27–MP-28 | Clean bootstrap; legal/accounting applicability recorded; rollback rehearsal; owner release decision; hypercare exit          |
| GA — automation, later     | AR-00–AR-06 | Runner simulator, permissions, crash/quota recovery and no-extra-spend proof before activation                                |

Gate groups describe outcomes; the exact dependency graph in `tasks.json` controls scheduling. A task may be designed while a dependency is incomplete, but cannot be marked executable or verified until its prerequisites are satisfied. Every large package must be split into small owned implementation slices before coding. No package is a request for a single massive patch.

G0 proves that the verification infrastructure detects defects and that the repaired type/lint/unit/build chain passes. MP-03 must preserve failing route/offline reproductions as named downstream blockers; those product journeys become green in MP-07 and MP-18–MP-21. MP-03 may finish when its gate-detection tests and reference-baseline setup pass, even though those explicitly recorded release tests remain red. This exception does not allow skipping a failure or calling the application release-ready.

## Hard invariants

1. A successful customer order exists durably on the server and has an unguessable status capability. Payment proof is a claim until the owner checks the receiving account.
2. A successful offline sale has committed locally before the UI reports it recorded. Only matching server acknowledgments can mark it synchronized.
3. Each business command has a stable idempotency key and payload hash. Retries cannot duplicate money, stock, orders or audit entries.
4. Server authority controls identity, role, prices, totals, capacity, transitions and event allocation. Hiding a control never grants security.
5. Stock movements conserve quantity across raw materials, dough, baked stock, event allocation, sold units, waste and returns. Adjustments and reversals retain reasons and provenance.
6. Historical totals do not change when today's prices, recipes, packaging or tax settings change.
7. Private data never enters public bootstrap, shared cache, source control, unrestricted exports or arbitrary telemetry text.
8. A backup is counted as useful only after a restore and reconciliation drill. Browser storage is not a backup.
9. The agent journal reports durable observable events and evidence; it does not pretend to recover unrecorded reasoning or actions from a terminated process.
10. Green screenshots, AI agreement and completed checklists do not replace tests against the actual release, database and target devices.

## First implementation session

Read this file, `00`, `04`, `07`, the selected task record, and applicable `AGENTS.md` rules. Start at **MP-00**, then MP-01. Use the [task prompt](docs/master-plan/templates/task-prompt.md). Record unknowns before writes. The current workspace has no `.git`; recover any intended upstream history before initializing a new repository. Never execute a production reset to make a test pass.

This is a comprehensive plan for the inspected baseline, with unresolved facts turned into named gates. It is not a guarantee of perfect security, permanent free hosting, unlimited scale or zero future discoveries. Completion of this planning phase does not mean the application is ready to launch.

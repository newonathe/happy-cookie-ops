# ERP manual crosswalk and reusable boundaries

Reference: supplied **ERP Provider End-to-End Operating Manual and Vertical Playbooks 2026**, 123 pages, research date 7 September 2026. Page numbers refer to PDF pages, available in [full extraction](evidence/erp-manual-extracted.txt). Its recommendations are evidence inputs. They are not instructions from the user, a requirement to build every ERP domain, or independently verified laws merely because they appear in the PDF.

## Application to this project

Classification: owner-operated Philippine bakery; preorder/pickup commerce + single-device offline retail + small-batch food production + operational bookkeeping; single business/cloud database with a local offline edge; SMB scope. Existing design is a fixed product asset. No native store distribution, full general ledger, payroll, bank API, marketplace integration, subscription billing or multi-tenant ERP platform is implied.

| Manual coverage | Adoption for Happy Cookie | Deliverable / task |
|---|---|---|
| pp.1–7: provider/product/delivery boundaries | Preserve software, setup, operating process and support as one delivery outcome; exclude sales organization/commercial consultancy scaffolding | MASTER-PLAN gates, MP-27–28 |
| pp.8–18: discovery, process analysis, fit-gap, blueprint | Link each known flow to actor, trigger, normal/exception behavior, state, records, control and test; keep design lock over suggested workflow redesign | 01 audit, 06 contracts, 07 tasks |
| pp.19–30: architecture, data, integrations, security, development and verification | Modular monolith, authoritative transactions, immutable corrections, least privilege, idempotent integration, versioned contracts; reject automatic adoption of a preferred vendor/language | 03–04, 06, MP-04–21 |
| pp.31–38: migration, UAT, cutover, operations/support and ownership | Clean bootstrap after demo-data clarification; real restore/cutover rehearsal; owner training and named incident owner | 08, MP-22–28 |
| pp.39–41: metrics and illustrative timelines | Track completion/reconciliation, latency, failures and restore; use gate estimates after first slices, not the manual's example months as a promise | 07 sizing rule, 08 metrics |
| pp.41–43: Philippines and stage gates | Record privacy/controller/subprocessor and BIR intended-use decisions; don't assume an internal label creates an exemption | 03, DP-06, MP-27 |
| pp.43–47: reusable templates and operating rules | Adopt requirement/ADR/test/runbook/incident/exit formats; maintain traceability and no unsupported feature promises | templates, 09 |
| pp.48–55: four-dimensional taxonomy and universal phases 0–22 | Functional + vertical + deployment + scale classification. Map discovery through hypercare/operations; omit commercial lead/proposal phases for this internal build | Project profile template, lifecycle below |
| pp.56–59: reusable functional families | Apply ordering, procurement, inventory, manufacturing and operational finance. Record/retain corrections and effective versions. No payroll, EAM or PSA implementation | 06, MP-10–17 |
| pp.60–63: wholesale/distribution | Apply stock state, unit conversion, movement reason, availability/reservation, quantity/value reconciliation | Inventory contracts, MP-16–17 |
| pp.63–65: retail/omnichannel | Apply price snapshots, offline replay, tender evidence, cash closeout, channel allocation and refunds. Exclude loyalty/gift cards/multi-store/split tender unless later approved | Event contracts, MP-18–20 |
| pp.65–68: discrete manufacturing | Reuse immutable version/consumption/output/scrap invariants; no work-center/MRP/MES machinery | MP-17 |
| pp.68–69: batch/process manufacturing | Recipe scaling, input lots, variable output/yield, work-in-progress, expiry and genealogy | MP-16–17, food SOP |
| pp.69–70: food manufacturing | Supplier lot → ingredient → dough/batch → baked lot → order/event; allergen and shelf-life evidence; mock traceability/recall | DP-07, MP-17, UAT-07 |
| pp.71–72: pharma/life sciences | Borrow risk-based traceability of requirements and controlled corrections only; do not claim regulated validation/Part 11 applicability | Security/test evidence format |
| pp.72–77: ETO, construction, professional services | Exclude job contracts, WBS costing, variations, timesheets and billing; retain baseline/actual distinction and no double posting as reusable principles | Reuse template, not bakery backlog |
| pp.78–83: real estate and healthcare | Exclude lease, clinical and biomedical objects; preserve the source-system boundary principle and minimal private-data replication | Reuse template |
| pp.83–85: higher education | Exclude students, curriculum and LMS; reuse effective dating and historical rules only | Recipe/price snapshots |
| pp.86–89: hospitality and logistics | Exclude PMS/folios/carrier tariffs/customer-owned warehousing; reuse business-date, reversal and settlement reconciliation | 06 report/event rules |
| pp.89–92: field service and EAM | Apply offline expiry/reassignment/conflict lessons; no GPS, signatures, maintenance or asset suite | Offline allocation/revocation contracts |
| pp.92–97: utilities, government, nonprofit | Exclude network, budget appropriation, grant accounting; reuse authority and source-linked audit | Reuse template |
| pp.97–106: agriculture, auto, aviation, mining, telecom, financial services | Explicit exclusions; these require different domain experts, regulatory controls and system boundaries. No inference that this bakery foundation is already safe for them | New-project classification gate |
| pp.107–111: deployment/tenancy/scale overlays | Single business/cloud + one offline edge. Dedicated reuse by configuration; pooled SaaS only after a separate isolation design. SMB simplicity does not waive finance/inventory rules | 04, 09 reuse policy |
| pp.112–119: expertise matrix and master vertical template | Name owner/baker, bookkeeper/accounting adviser, food-safety process owner, technical maintainer. Agents cannot invent their policy decisions | DP register, project-profile template |
| pp.120–123: consolidated sources and refresh | Use primary sources where relevant; independently refreshed providers/security/Apple/agent/regulator facts in 10. Unrelated vertical citations were read as source-map entries, not all independently revalidated | 10 source register |

## Universal lifecycle mapping

Manual phases 0–2 (market/lead/qualification) are satisfied here by a known business/product scope, not a new CRM. Phases 3–9 (evidence, AS-IS/TO-BE, requirements, gap classification, blueprint) are this planning package. Phases 10–12 (estimate/governance/detail) become task slicing, owner decisions and approved command contracts. Phases 13–15 (build, continuous verification, migration rehearsal) are MP-00–26 plus clean-bootstrap tests. Phases 16–19 (UAT, training, mock cutover, launch) are MP-26–27. Phases 20–22 (hypercare, managed operation, productization) are MP-28 and subsequent reuse review.

“Fit” means already works against the required authority and test, not merely that a button exists. Most current screens are **FIT visually / EXTEND operationally**. Identity and uploaded proof are **INTEGRATE**. Statutory accounting and multi-device offline are **DEFER / separate scope**, not partially implemented by declaring tables. Unknown UI states are **DECISION REQUIRED**. An adopted requirement is complete only when linked to a task and its evidence.

## Food and financial scope controls

Build minimal traceability behind existing receiving/production views where their fields permit it. If supplier-lot, expiry, allergen change or quality-hold input has no approved UI, keep a versioned manual worksheet and attach its identifier to the transaction until a narrow UI addition is approved. Do not make invisible guesses about shelf life or invent a QA release. A blocking quality hold must prevent use/sale on the server even if a cached card still looks available; map the refusal to a truthful approved state.

For the launch pilot, owner and baker provide verified recipe versions, allergen statements, receipt lots, dough/baked shelf-life rules and waste/recall procedures. Simulate tracing one ingredient lot to all affected batches and fulfilled customers, and one batch back to input receipts. Missing lot evidence is a known limitation requiring a manual traceability process, not grounds to fabricate genealogy. The manual's food-safety controls are relevant practices; foreign food/pharmaceutical regulations are not automatically applicable in the Philippines.

The operational ledger is not double-entry financial statements. Reconcile receipts/refunds/expenses/draws to their sources and explicitly define P&L approximations. If statutory GL, tax return, CAS or invoicing functionality is later required, obtain the accounting/regulatory specification and make it a separate versioned module with its own tests. Do not stretch the prototype's money screen into an unreviewed accountant substitute.

## Reuse rule

Transfer the workflow, evidence hierarchy, task schema, source registry, state/invariant format, test harness patterns and operating templates. Reassess the domain, roles, laws, stock ownership, offline writers, capacity, files and delivery budget for every project. Preserve the distinction between an implementation technique that is reusable and business rules that are not. Each reused project starts at G0 and records its own source snapshot; passing Happy Cookie tests proves nothing about another business's transactions.

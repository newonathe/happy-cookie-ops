# Security, privacy and operations audit

This report identifies source-level exposure and missing controls. No production backend was accessed, no exploit was sent to an external system, and no live breach is alleged. All exploit reproduction belongs in an isolated local Supabase project with synthetic data.

## Prioritized findings

| ID | Priority | Evidence / attack path | Required fix and proof |
|---|---|---|---|
| SEC-01 | P0 | Initial SQL allows anonymous order insertion and unrestricted order-item insertion. A guessed order ID can target another order's line data; client monetary/foreign-key fields are not authoritative | Revoke direct public mutations; narrow checkout command; tampered amounts/IDs and direct PostgREST attempts denied |
| SEC-02 | P0 | `prune_personal_data(integer)` is SECURITY DEFINER without a caller check; granting service role does not revoke default PUBLIC EXECUTE | Revoke PUBLIC/anon/authenticated as appropriate; private maintenance entry point; bounded retention policy; anon calls with 0/negative days denied |
| SEC-03 | P0 | Broad `is_staff()` policies grant support/helper data and writes inconsistent with described role limits | Per-operation capabilities and safe projections; RLS/column/RPC/API negative tests for every role |
| SEC-04 | P0 | Sync trusts sale financial fields and uses client clerk/event data; authorizing any staff member is insufficient | Verify active actor/device/event allocation; derive actor and amounts; ledger/stock transaction with unique key/hash |
| SEC-05 | P0 | Customer lookup UI searches one identifier; intended two-field SQL contract is not wired | Capability-based status and a defined recovery process; no name/mobile/email/IG enumeration endpoint |
| SEC-06 | P1 | Missing Supabase configuration explicitly enables unauthenticated demo mode in middleware | Explicit demo build isolated from production; live build/config validation fails closed |
| SEC-07 | P1 | Sign-in return path passed to `router.replace(next)` without local route allowlist | Allow only known internal staff paths; reject schemes, protocol-relative and encoded bypasses |
| SEC-08 | P1 | Browser configuration uses dynamic `process.env[name]`, which is not equivalent to Next's statically inlined public variables | Explicit validated config and boundary tests; no server secret imported client-side |
| SEC-09 | P1 | Sync lacks route rate limiter and bounded raw-body read; SQL errors returned to client | Limits at edge and authoritative DB, safe public error codes, redacted internal correlation |
| SEC-10 | P1 | Privacy scrubber test fails: fixture person's name survives in free text despite email/phone replacement | Deny arbitrary messages/contexts; structured safe error codes; canary secret/PII negative suite |
| SEC-11 | P1 | Health/monitoring paths are not in middleware's public allowlist; checks may observe sign-in redirects rather than service health | Separate minimal public liveness from authenticated readiness; test HTTP semantics, not body visibility |
| SEC-12 | P1 | Backup, retention, report-problem, users and attachment success states are largely simulated | Real jobs/actions and evidence-backed status, or explicit approved unavailable/manual state |
| SEC-13 | P1 | Service worker caches navigations; local snapshot carries the full books; logout/revocation/cache cleanup is undefined | Cache only static assets; role/device-scoped minimized offline store; revoke/erase policy that preserves unsent sales safely |
| SEC-14 | P1 | No original lockfile/Git; CI and Docker tooling versions drift; no proven restore or deploy rollback | Reproducible lock, version pinning, staged tests and restore drills |
| SEC-15 | P1 | Audit inserts accept caller-controlled detail and are not demonstrably complete/tamper-resistant | Server-generated audit events, no client direct insert; admin limits documented; offsite evidence hashes |
| SEC-16 | P1 | Retention uses inconsistent phone normalization and erases a subset of fields; unsalted phone hashes are guessable | Canonical identity normalization; separate contact retention/legal holds; keyed correlation where needed, attachments/backups included |

PostgreSQL documents that new functions grant EXECUTE to PUBLIC by default and recommends revocation inside the creation transaction for privileged functions. The exploit risk is not resolved by adding a narrower grant. [PostgreSQL CREATE FUNCTION](https://www.postgresql.org/docs/current/sql-createfunction.html)

## Trust boundaries and abuse cases

Threat actors include an anonymous shopper, compromised helper session, overprivileged support account, stolen offline phone, malicious uploaded file, leaked deployment secret and a coding agent misled by repository/external text. A UI role selector, hard-to-find URL or client validation does not constrain any of these actors.

| Boundary | Attack | Control / test |
|---|---|---|
| Internet → public API | Bot spam, lookup enumeration, oversized uploads, capacity abuse | Per-route/IP coarse limits plus DB command limits; opaque capability; bounded body and file policy; no reservation from unverified payment claim |
| Staff session → business command | Role escalation, cross-event write, arbitrary totals | Active profile/capability check each mutation; narrow RPC; security-definer ownership/search-path/grants audit |
| Client cache → UI | Stored payload injection, stale role, prior user's books | Versioned validated envelope; render text safely; no HTML injection; clear private projection on identity change |
| Device → sync | Duplicate/modified/reordered commands, expired event lease | Stable UUID, payload hash, source dependencies, fencing epoch, manual reconciliation quarantine |
| Storage → proof viewer | HTML/SVG execution, oversized image, URL guessing | Private buckets, owner-scoped read, random object paths, short-lived signed URL, allowlisted raster formats, no executable render |
| CI/agent → production | Secret leak, prompt injection, mistaken destructive command | No production credentials in coding workers; explicit environment checks; independent permission boundary; staging only by default |
| Restore → production | Reintroduced deleted PII or lost newer transactions | Restore manifest, deletion tombstones, write freeze and replay/reconciliation before activation |

Use OWASP ASVS as a testable requirement catalog, targeting applicable Level 2 controls for sensitive business data, with item-level applicability and evidence. This is a verification target, not an ASVS certification claim. [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)

## Privacy and jurisdiction decisions

The owner is responsible for determining business-specific Philippine privacy and accounting obligations. Record purpose, access, retention, hosting region, subprocessors, contact for access/correction/deletion, and incident responsibilities before collecting real personal data. Review provider processing terms. Minimize optional Instagram/email fields where operationally unnecessary through an approved decision; do not fabricate consent or silently repurpose order contacts for marketing.

A blanket statement that deleting contacts always satisfies erasure, or that paid records must always retain every contact field, is unsafe. Separate financial retention, customer-service contact retention, safety/recall needs, legal hold, backups and logs. Review the retained data inventory with the owner and bookkeeper before MP-22 activation. The applicable framework includes RA 10173 and its implementing rules. [Data Privacy Act](https://privacy.gov.ph/data-privacy-act/), [NPC IRR](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/)

The incident runbook must assess mandatory notification criteria promptly. NPC describes a 72-hour reporting window for qualifying breaches and its reporting system; do not assume every application error is reportable or wait for a perfect investigation before assessing obligations. [NPC breach reporting](https://privacy.gov.ph/pips-and-pics/breach-reporting/)

This application is planned as an operational ordering, production and bookkeeping tool. It must not advertise BIR-compliant invoices, registered CAS, certified tax reports, automated settlement or food-safety certification without the applicable review and evidence. BIR's CAS/CBA and e-invoicing rules may still apply based on actual use even if the UI says “internal.” MP-27 requires a recorded applicability decision and a compliant manual/external process if the software is not the statutory system. [BIR registration](https://www.bir.gov.ph/registration-requirements-details), [RR 11-2025](https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2011-2025.pdf), [RR 26-2025 amendment](https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2026-2025.pdf)

## Operational security baseline

Use dedicated provider accounts owned by the business, MFA and offline recovery codes. No shared owner password. Separate production/staging secrets and data. Staff signup is closed. Support has diagnostics only by default; elevation is time-bounded, recorded and reviewed. Production service credentials remain in server/maintenance secret stores and are never browser `NEXT_PUBLIC_*` values.

CSP must accommodate the locked inline styles deliberately: allow necessary style behavior while keeping script policy strict; do not add `unsafe-eval` or broad script wildcards to silence errors. Compile approved static script hashes where needed. Set frame restrictions, nosniff, referrer policy, permissions policy and cache rules at the actual host, including API responses. Turn off public source-map uploads and session replay containing PII; start with structured redacted logs and business invariant metrics. Error reporting is optional until its free allowance and scrubber are proved.

No zero-cost plan supplies permanent uptime, unlimited traffic, guaranteed offline storage, 24/7 human response or a managed database recovery SLA. Choose measured operational targets and a paper/manual fallback, and block expansion when capacity or recovery evidence fails.

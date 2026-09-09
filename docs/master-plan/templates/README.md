# Reusable templates

[event.example.json](event.example.json) is a synthetic, schema-validated event/hash example; it records no real agent execution. [Project-specific planning profile](../evidence/happy-cookie-profile.json) fills only currently established facts and leaves unresolved setup values empty. Neither file activates a runner.

These are documents/data contracts, not executable agent configuration. They do not install a runner, change global memory, grant permissions or start tasks.

| File | Use |
|---|---|
| [task-prompt.md](task-prompt.md) | Start one bounded implementation slice after the planning phase |
| [research-prompt.md](research-prompt.md) | Resolve a narrow uncertain fact with primary evidence |
| [review-prompt.md](review-prompt.md) | Independent critical review of exact diff and evidence |
| [verification-prompt.md](verification-prompt.md) | Run actual checks and distinguish blocked from passed |
| [checkpoint.md](checkpoint.md) | Human-readable handoff after a bounded slice/interruption |
| [resume-prompt.md](resume-prompt.md) | Reconcile and continue exact task after crash/quota reset |
| [incident.md](incident.md) | Preserve facts, contain impact, recover and prevent recurrence |
| [decision.md](decision.md) | Resolve a DP/ADR with alternatives and scope of approval |
| [uat-record.md](uat-record.md) | Candidate-specific business/test signoff |
| [project-profile.json](project-profile.json) | Instantiate the system for another project; all unknowns stay explicit |
| [event.schema.json](event.schema.json) | Durable sanitized journal event shape for the later runner |
| [task-catalog.schema.json](task-catalog.schema.json) | Validate current planning work-package catalog |
| [runner-policy.json](runner-policy.json) | Disabled example policy; not valid for activation until resolved |
| [readiness-checklist.md](readiness-checklist.md) | Concrete go/no-go record for product or runner |

[Generated work-package prompts](../prompts/README.md) provide one ready-to-paste starting prompt per MP/AR ID. They come from `tasks.json` and must be regenerated after catalog changes. Start with MP-00. Each prompt requires decomposition before a large implementation; pasting it does not override current user scope or project protection rules.

Portable path values are project-relative or parameters. At runtime, resolve/validate absolute paths within the selected workspace. Never substitute arbitrary user/document strings into shell commands. Example JSON uses null for missing facts rather than plausible fake secrets, hashes or reset timestamps.

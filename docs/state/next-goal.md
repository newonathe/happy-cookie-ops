# Next goal — Cloud continuation

Continue the active [full application goal](full-goal.md) from Git without repeating completed audits. Current branch:`codex/cloud-shop-menu-recovery-20261109`, based on accepted production`67a827b`; all original histories and user`f56900f7` are retained. See [current state](current.md).

1. Local production core is accepted and pushed as`67a827b66b0869e531ef9f9614001d55f6bbcada`: full214files/3391tests+2TODO, real390/1440 ownership and connected SQL transactions, clear review. Hosted/device/owner gates remain pending.
2. Stock F09 and F04/HCB-019 are accepted through`629fcab`. Money/Home read recovery is accepted as`dc59b0d`. Cancelled-read recovery is accepted as`de0c29e`. Home business-clock display is accepted as`b29ef94`. Finish public-menu read/recovery on`codex/cloud-shop-menu-recovery-20261109`, then continue the shop availability/status read and payment/customer journey requirements. Preserve meaningful recorded balances, distinguish never-counted zero from Out, and prevent chart double counting. Reuse preserved work narrowly; do not overwrite the newer runtime or integrate Orders PR51/53.

3. Accept bounded implementation slices with focused tests, independent review where required, full pnpm verify, formatting, Live build and connected local browser checks. Keep original tests and protected prototype bytes.
4. Delta-check PR51/53 compatibility against the final production checkpoint. Preserve both unmerged; reconcile their Orders read-state overlap only with authority.
5. After production passes, continue the next highest-priority unblocked full-goal slice on a separate branch, preferably outside Orders. Keep all owner, hosted and device gates pending until separately evidenced.

Root is the sole coding agent while Claude is unavailable until10November. Read-only independent review uses one bounded different-model worker. Use pinned Node24.20.0/pnpm9.12.3, two Vitest workers within the observed2CPU/8GB Cloud quota; use one if timing failures recur and CLI headless Chromium. No concurrent database/browser workload during a full gate.

Physical dough-count correction is unanswered. No hosted SQL/data/resource changes, merge, deploy, release, invented business rules or protected-file edits are authorized. Full objective remains incomplete.

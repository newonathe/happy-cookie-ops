# Next goal — Bazaar v2, slice U6 (migration 70: costs, closing rules, test reversal)

D0 is approved (Ethan, 15 October): the spec is [docs/design/bazaar-v2.md](../design/bazaar-v2.md) and the mockups are the
private artifact linked at its top. The plan is [bazaar-v2.md](bazaar-v2.md), slices D0 to U9, each its own `/goal` in a new
conversation. Everything lands before the bazaar in **one** release (U9), then the phone rehearsal **by 22 October**, then
`RELEASE_HOLD=true`. Migration 70 (U6) ships before the bazaar; the Ateneo reversal runs only on Ethan's "yes, reverse
Ateneo". Cut line: U7 and U8 move after 26 October if not green by the evening of 19 October.

The trial today: migration 69 of 69, version `fbfd8860` (S3.1). The repository is public: secret scan before every push.

U1 and U2 are built and pushed (`claude/bazaar-v2-u1`, `claude/bazaar-v2-u2`, U2 cut from U1's head): the design system in
`src/components/ui/`, and the till's freedom (Home and "Back to the till", sold-out tiles hidden, Add cookies and the day's fee
form from the till). Cut U6's branch from `claude/bazaar-v2-u2`.

```
/goal Bazaar v2 slice U6 (migration 70: costs, closing rules, test reversal) in C:\Users\ethan\dev\happy-cookie-ops-g0. Read AGENTS.md,
docs/state/current.md, docs/state/bazaar-v2.md (U6), supabase/migrations/20260101006800_bazaar_hardening.sql by
range (bazaar_line_facts, bazaar_summary), 20260101005900_packaging_rules.sql:880-940.
1 New 20260101006900 migration: finalise takes a final split for carried cookies (Ateneo A1); drawer over/short in
  its own category, not a sale (A4); reverse_bazaar_test(p_booking, p_confirm_name): owner only, appends reversing
  ledger lines and stock corrections, marks the booking reversed, refuses a real-looking mismatch (A6);
  bazaar packaging (A7); flavour_costs, save_flavour_cost (owner only, SECURITY DEFINER,
  search_path='', grants, rule lines), get_flavour_costs, cost order booking typed > flavour typed > complete recipe.
2 Pins (mp08g-source-pins.json, function-authority.json), role-suite cases (bazaar-days.sql), types, data layer.
3 pnpm verify, the role suite twice, the live smoke suite; one different-model review with hand-worked numbers.
4 Commit and push the branch. Hosted apply waits for U9's release (scratch folder, dry run, fingerprint).
```

| Setting      | Value                                                                 |
| ------------ | --------------------------------------------------------------------- |
| Model        | Sonnet builds (effort high); Opus signs off                           |
| Plan mode    | off                                                                   |
| Conversation | new                                                                   |
| Read         | AGENTS.md, current.md, bazaar-v2.md (U6), the two migrations by range |

The review of U2 used an Opus subagent, because `codex` refuses its models on this ChatGPT account. After U6: U3 with U5 (two conversations, different files), then U4, U7, U8 and U9.

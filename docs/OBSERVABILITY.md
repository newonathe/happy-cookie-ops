# Observability

How you find out something is broken, and what you are allowed to know about it.

The constraint that shapes everything here: this app holds a small business's customer
list and her books. Under the Data Privacy Act of 2012 (RA 10173) she is the personal
information controller. Shipping a customer's mobile number to a third-party service
because a component threw is a disclosure she never agreed to.

So error reporting here is built the opposite way round from the default: nothing personal
leaves unless it has been explicitly allowed to.

## What is set up

| Layer | What | Where |
| --- | --- | --- |
| Client errors | Sentry, via the boundaries that already exist | `instrumentation-client.ts` |
| Server errors | Sentry `onRequestError` — server components and route handlers | `instrumentation.ts` |
| Edge errors | Sentry, for `src/middleware.ts` | `sentry.edge.config.ts` |
| Scrubbing | Deny-by-default redaction | `src/lib/observability/scrub.ts` |
| Liveness | `GET /api/health`, checked every 15 minutes | `.github/workflows/uptime.yml` |
| Sync visibility | Accepted/rejected counts, never contents | `src/app/api/sync/route.ts` |

Sentry is **off** unless `NEXT_PUBLIC_SENTRY_DSN` is set. Local development reports
nothing, which is correct — a shared project full of your own typos is noise.

## Three defaults we deliberately inverted

Sentry's own setup guide recommends all three of these. All three are wrong for this app,
and each is marked in the config so nobody "fixes" it back.

**`sendDefaultPii: false`.** The guide says true. It attaches request headers and the
client IP. Headers carry the session cookie.

**No session replay, at any sample rate.** Replay records the DOM. The DOM *is* the
customer list, the order notes and the day's takings. There is no sample rate at which
recording her screen is acceptable.

**`tunnelRoute: '/monitoring'`.** Reports go through the app's own origin. Not for
privacy — because an ad blocker on the owner's phone will otherwise swallow them silently,
and you will conclude there are no errors because none arrive.

## The scrubber

`src/lib/observability/scrub.ts`, tested in `tests/unit/scrub.test.ts`.

Deny-by-default in three passes:

1. **Key allowlist.** A small set of keys passes (`screen`, `role`, `count`, `ms`,
   `stack`…). Everything else is `[redacted]` — including keys nobody has seen before,
   which is the point. A new field added next year is redacted until someone decides
   otherwise.
2. **Key denylist**, checked first, matching on substring: `phone`, `customer`, `ref`,
   `notes`, `items`, `token`. Belt and braces against a careless allowlist addition.
3. **Free-text sweep** over everything that survives — messages, stack frames, breadcrumbs
   — for Philippine mobile numbers in every form they get typed (`09171234567`,
   `+639171234567`, `0917 123 4567`), email addresses, and long digit runs that look like
   a GCash reference.

That third pass is the one that earns its keep. Error *messages* carry payloads far more
often than people expect: a failed insert will quote the row back at you, complete with the
phone number in the unique-constraint violation.

Request URLs are truncated at the `?`. The lookup route takes the order number and phone
in the query string, so the URL alone is the disclosure.

## What a good report looks like

```
Error: Cannot read properties of undefined (reading 'qty')
  screen: bake
  role: owner
  release: 2026-03-04.1
  environment: production
  request.url: /api/orders            (query string removed)
  extra: { count: 12, items: '[redacted]' }
```

Enough to find the bug. Nothing about who the order was for.

## Uptime

A cron every fifteen minutes against `/api/health`, which opens a GitHub issue when the
app stops answering and closes it when it recovers. One issue per outage, not one per
check — a fifteen-minute cron would otherwise file 96 issues a day for a single incident.

Fifteen minutes is deliberate. A drop window is hours long, so that detection gap is
tolerable, and a tighter schedule on a free runner is noise. If the business grows, replace
it with a real monitor; until then this is the version that costs nothing and exists, which
beats the better one nobody set up.

The issue body leads with the thing that is actually true and actually reassuring: bazaar
sales queue in IndexedDB and retry, so an outage does not lose money.

## What is not here

- **No metrics or dashboards.** One baker, forty orders a week. A dashboard would be
  something to look at, not something to learn from.
- **No log aggregation.** Vercel's own logs cover it at this size.
- **No read auditing.** `audit_log` records writes. If a helper account is compromised
  there is no record of what was *looked* at — noted in `docs/GAPS.md` §2.5, not worth
  building yet.
- **No alerting beyond the GitHub issue.** Add a notification on the `outage` label if
  you want it on a phone.

## When you get a report

1. Read the tags: which screen, which role, which release.
2. Reproduce with the same role. Most of these are role-conditional, because that is what
   changes what renders.
3. Write a test that fails, then fix it. `docs/prompts/08-recovery.md` X-01 is the prompt.
4. If the report is missing something you needed, the fix is usually to allowlist one more
   key in `scrub.ts` — with a test. Never to loosen the scrubber wholesale.

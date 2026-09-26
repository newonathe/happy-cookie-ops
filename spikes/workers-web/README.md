# Local Workers static-assets comparator

This local-only comparator serves the same generated `build/pages-spike/public` artifact as the Pages spike. Static requests use Cloudflare's asset service; `/api/*` invokes the Worker and reuses the Pages spike's existing API/session handler. No second authentication or cleanup rule is implemented here.

`workers_dev=false` and `preview_urls=false` prevent a public route in this configuration. There is no Cron trigger, hosted binding, account ID or deployment. The local test must use Wrangler's local runtime with no environment file or secret. A later hosted comparison needs a separate approved synthetic Worker configuration, explicit preview URL enablement, correct-account authentication and the same route/security/CPU oracle as Pages.

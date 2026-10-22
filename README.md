# Prime Pulls Queue V2

A visual upgrade to the existing Shopify → Supabase → Next.js → OBS queue.
The existing backend, operator controls, routes, and ordering remain in place.

## Architecture and routes

- Shopify sends `orders/paid` to `/api/shopify/orders-paid`. The route checks the
  SHA-256 HMAC against the **raw request body**, then upserts `queue_orders` by
  `shopify_order_id`. Duplicate deliveries keep the existing order unchanged.
- `lib/supabaseAdmin.ts` uses a server-only Supabase service-role client. Supabase
  remains the source of truth; no client database credentials are exposed.
- `/api/queue` returns only `queued` and `now_ripping` orders, sorted with current
  orders first, then numeric `position`, then `created_at`.
- `/admin` keeps the session PIN, manual entry, Now Ripping, Queue, move up/down,
  Complete, Hide, Refresh, and Print Label controls. Mutations still require
  `x-admin-pin` on the existing manual/update API routes.
- `/overlay/queue` and admin still refresh every **2.5 seconds**. The overlay keeps
  its last successful data during a failed poll. Its frame renders immediately,
  with QUEUE CONNECTING before the first response and QUEUE RECONNECTING after a
  failure. Stalled requests time out after 8 seconds so later polls can recover.
  Admin reports queue API failures instead of presenting them as an empty queue.
- Vercel remains the deployment target. `/print/label` prints the approved
  80×50 mm order label, with the customer reference passed by authenticated admin.

## V2 behavior

The overlay follows the metallic reference: a raised five-point crown, larger
PRIME PULLS / QUEUE header, beveled gold/silver frame, navy rows, column dividers,
blue edge light, and a gold current row. The center crown point is tallest.
There are no product images or persistent lion artwork.

For placement on the left side of a stream, the panel uses a **12° inward turn**:
its left edge stays anchored while the right edge recedes, so its face points
toward the center. This is a CSS perspective transform on the whole panel; all
names, quantities, and updates remain live HTML. No OBS distortion filter is
required. Tune the angle in the existing overlay URL:

- `/overlay/queue`: default inward perspective (12°).
- `/overlay/queue?angle=0`: flat view.
- `/overlay/queue?angle=8`: gentler perspective.
- `/overlay/queue?angle=18`: strongest supported perspective.

Values are limited to 0–18°; invalid values use the default. At mobile widths
up to 360px the angle is reduced to 40% of the chosen value for readability.
The perspective origin follows the panel's vertical center as its height changes.
The overlay is capped at 390px wide, 25% narrower than its original 520px layout,
with tighter name/item spacing and the same desktop text sizes. The panel uses
a roughly 58% opaque dark fill, with translucent row tints layered above it.
The stream shows through those fills; crown, text and metallic borders stay solid.
Use a **390×600** OBS browser canvas to leave room for the crown, five rows, the
optional overflow footer and blue edge light. The unused canvas is transparent.

It displays order number, first name with optional last initial, and item quantity.
It shows up to five orders and adds `+N MORE IN QUEUE` only when necessary.
Height follows content; no minimum panel height or fixed promotional footer is
reserved. At zero orders it shows a compact **QUEUE OPEN** state, preserving V1's
queue-open behavior. The entire document behind the graphic is transparent.
Long names truncate with an ellipsis; item counts stay visible at mobile widths.
The original full first-name value remains available in the name's tooltip.

The first order still receives V1's gold emphasis even when no order is explicitly
`now_ripping`. This is presentation only; it does not update database status.
The move buttons still increment/decrement `position` by one; they do not swap
neighbors. Existing position ties and timestamp tie-breaking are preserved.

### Last initials

Shopify's existing first-name source priority is preserved: **customer → billing
address → shipping address → Guest**. The last initial comes from the same selected
person, so a customer's first name is never combined with a different shipping
recipient's last name. If that source has no surname, the initial stays null.
Only the normalized first letter of the surname is stored; the full surname is
never added to the queue table. Manual entry accepts an optional last initial and
normalizes it server-side too. Null/missing initials display just the first name.
Existing orders are not backfilled or otherwise changed.

## Database migration — run before deploying V2

For an existing installation, run only
[`supabase/migrations/202610210001_queue_last_initial.sql`](supabase/migrations/202610210001_queue_last_initial.sql)
in the Supabase SQL Editor for the project used by the app:

```sql
ALTER TABLE public.queue_orders
ADD COLUMN IF NOT EXISTS last_initial text;
```

This is additive and safe to repeat. It neither drops the table nor rewrites orders.
Existing rows receive SQL NULL. V1 can continue using the table after migration.
For a fresh database, `supabase-schema.sql` creates the schema including this column.
Do not use the bootstrap script as a substitute for the small V2 migration on an
existing deployment. Deploying V2 before the migration will cause queue reads and
new inserts to fail because they reference the column.

## Order labels and Shopify customer reference

The approved black-and-white label puts the **order number first**, with a larger
customer name, item count, new simplified Prime Pulls logo, a smaller customer
reference, empty **Checked** and **Review** boxes, and handwritten **BAG ___ / ___**
blanks. Review is a staff workflow mark; its meaning is not printed on the label.
The existing Print Label button and automatic print dialog are preserved.
See the [implemented label](docs/previews/label-v2-implemented.png) or print the
[80×50 mm sample PDF](docs/previews/label-v2-print-sample.pdf); both use fictional data. Long
names/order numbers shrink to fit and can wrap instead of silently truncating.

Shopify already supplies the store customer record's `customer.id` in the existing
paid-order webhook. No extra Shopify API token, new webhook, or app environment
variable is needed. This is the Shopify customer record ID, not a Shop username.
When present, the string `customer.admin_graphql_api_id` is preferred to preserve
all digits. Numeric IDs are accepted only when they are safe JavaScript integers.
The last eight digits become a readable reference such as **4827 1635**. The same
customer record gets the same reference across orders. Shortened references are
sorting aids and can collide; the order number remains the definitive check.

Apply this additional, repeatable migration to the existing Supabase project:

```sql
ALTER TABLE public.queue_orders
ADD COLUMN IF NOT EXISTS shopify_customer_id text;
```

The file is
[`supabase/migrations/202610220001_queue_customer_id.sql`](supabase/migrations/202610220001_queue_customer_id.sql).
The full ID is stored as text. Public `/api/queue` and OBS responses do not include
it or the customer reference. A valid `x-admin-pin` allows admin to receive only
the shortened reference. Responses are private/no-store and vary on the PIN
header. The print URL carries that suffix, never the full customer ID or PIN.

While the optional column is missing, paid orders still enter the queue and
admin/labels still work, but the reference reads **Not available**. Only the
specific missing-column error activates this fallback; other database failures
remain errors. Apply the migration before relying on references for packing.

Existing orders are not automatically backfilled: their original customer ID was
not stored. A verified replay of an existing order's Shopify paid webhook can
fill its missing identity after migration without changing queue status, position,
or other order data. An already captured identity is not replaced. Orders whose
payload has no usable customer ID, including some guest/manual orders, retain
**Not available**. Never guess an ID from the name or order number.

For the label printer select **80×50 mm**, **100% / actual size**, zero margins,
and disable browser headers/footers. The CSS declares one 80×50 mm page. A physical
print is still needed to confirm your printer's darkness and fine-detail handling.

## Local development

Use Node.js **24** (validated with 24.19.0) and npm with the committed lockfile.
From the existing checkout; each cloud task is already isolated, so no worktree
is needed:

```sh
cd /workspace/prime-pulls-queue
npm ci --cache /workspace/.cache/npm --no-audit --no-fund
```

Supply the four **existing** server variables in `.env.local` or the cloud runtime
settings. `.env.example` documents their names. Keep real values out of Git/logs:

- `SUPABASE_URL`: the existing project's HTTPS URL.
- `SUPABASE_SERVICE_ROLE_KEY`: that project's service-role key, server-side only.
- `SHOPIFY_WEBHOOK_SECRET`: the existing webhook signing secret.
- `ADMIN_PIN`: the existing operator PIN.

There are **no new application environment variables**. For live cloud access,
allow the exact Supabase project hostname (`<project-ref>.supabase.co`) in the
cloud environment's restricted network settings. Package installation uses
`registry.npmjs.org`, already covered by the package-manager preset.

```sh
npm run dev -- --hostname 0.0.0.0
```

Validate internally with `curl --fail http://127.0.0.1:3000/api/queue`; it must return
an `orders` array. Use `/admin` and `/overlay/queue` for the operator and OBS routes.
A running server alone does not establish database readiness.

## Automated validation without production credentials

The browser/API suite starts the real **production Next.js build** on port 3200
and an in-memory PostgREST substitute bound to loopback port 54329. It never calls
Shopify or a real Supabase project, and uses only fixed test credentials. Do not
point OBS in production at this test server. The substitute tests application
requests and responses; it does not prove live Supabase credentials, permissions,
SQL migration execution, or Shopify delivery.

From the checkout, build with explicitly isolated test configuration:

```sh
SUPABASE_URL=http://127.0.0.1:54329 \
SUPABASE_SERVICE_ROLE_KEY=local-test-key \
SHOPIFY_WEBHOOK_SECRET=local-test-signing-secret \
ADMIN_PIN=local-test-pin \
NEXT_TELEMETRY_DISABLED=1 npm run build
```

Install Playwright's browser once (`npx playwright install chromium`), then run
`npm run test:e2e`. On the onboarding machine a system Chromium is already present:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
npx tsc --noEmit
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` is an optional test-only override, not an
application requirement. Tests need both ports free and do not reuse a running
app. Build again after source changes before testing. Never deploy the `.next`
output built with test settings; Vercel must build with its real environment.

The 22 tests cover 0/1/2/5/6/17 orders; current/first-row emphasis; nullable and
missing initials; customer/billing/shipping fallbacks; long names; 999,999 items;
mobile layout; document transparency; bounded height; valid/invalid HMACs;
duplicate delivery; unauthorized mutations; admin manual entry, Now Ripping,
Queue, move up/down, Complete, Hide and label opening; both pages' refresh after
admin/webhook changes; retention during a failed poll; visible initial-load
failures and recovery; timeout recovery; admin API error reporting; inward
perspective direction; bounded URL angle controls; and screenshot pixel alpha
checks for translucent fills, opaque text/frame and a transparent canvas. Label
tests cover private customer references, missing-migration rollout, verified-replay
backfill, large string IDs, missing IDs, admin-to-print handoff, automatic printing,
logo fallback, long names, and single-page 80×50 mm PDF output. PNGs are
regenerated under ignored `test-results/` on every run.

Preview screenshots use fixture orders, not live customer data. Open them directly
on GitHub: [1 order](docs/previews/one-order.png),
[5 orders](docs/previews/five-orders.png),
[17 orders](docs/previews/seventeen-orders.png),
[flat comparison](docs/previews/flat-five-orders.png),
and [left-side stream placement](docs/previews/left-hud-scene.png).
The placement image uses a labeled stream-content placeholder, not a live stream.

Preview descriptions at 390px canvas width:

- **1 order:** metallic crown/header and a single gold-emphasized row; no footer.
- **5 orders:** inward-angled metallic frame and five rows; only current/first is gold.
- **17 orders:** same five rows plus a small `+12 MORE IN QUEUE` footer.

## Exact deployment sequence

1. Apply the additive migrations above to the **existing** Supabase project. Confirm
   `last_initial` and `shopify_customer_id` appear on `public.queue_orders`. Existing
   rows remain valid; customer references need a captured/replayed customer ID.
2. Review this change and commit/push it to the branch connected to the existing
   Vercel project. Preserve that project's domain and deployment settings.
3. Confirm the four existing variables are set for the relevant Vercel environment.
   No additional variables or services are required. Let Vercel install from the
   lockfile and run `npm run build` with those real settings.
4. After deployment, check `/api/queue` returns existing active orders; confirm
   `/admin` still accepts the existing PIN and updates the queue. Prefer a preview
   deployment and test database for mutations; do not reorder real customers just
   to validate the UI. With authorized test orders, exercise each operator action
   and verify the overlay updates within the next polling cycle (plus latency).
5. Confirm a genuine Shopify paid-order delivery succeeds and appears with the
   expected item count and optional initial. Replay a test delivery to check it
   does not create a duplicate. Existing orders without initials must still render.
6. Keep Shopify's webhook topic, signing secret and destination unchanged:
   `/api/shopify/orders-paid`. **No Shopify webhook settings change is needed.**
7. Keep the OBS Browser Source URL unchanged: **`/overlay/queue`**. The existing
   520×360 or 520×460 canvas can clip the taller metallic HUD; set the source to
   **390×600** to fit the crown, all five rows, and the overflow footer. The unused canvas remains transparent; the graphic
   itself shrinks with the queue. No custom background CSS is needed.

If rolling the app back to V1, leave the additive column in place. Do not remove
it while any V2 deployment is serving traffic. Preexisting queue concurrency and
position-tie behavior are unchanged by this visual upgrade.

## Implementation files

- `app/overlay/layout.tsx`, `app/overlay/queue/page.tsx`, `app/styles.css`: V2 graphic, dynamic height,
  transparent document, initials, overflow count, resilient polling.
- `lib/queueNames.ts`: normalized initial and shared display name.
- `app/api/shopify/orders-paid/route.ts`: derive/store initial after existing HMAC.
- `app/api/queue/route.ts`, `app/api/queue/manual/route.ts`: expose/store initial.
- `app/admin/page.tsx`: optional manual initial, name/label display; controls retained.
- `supabase-schema.sql`, `supabase/migrations/202610210001_queue_last_initial.sql`:
  fresh-install support and additive upgrade.
- `tests/server.mjs`, `tests/queue.spec.ts`, `playwright.config.ts`: isolated API and
  browser validation; Playwright is the only added dependency, for development.
- `package.json`, `package-lock.json`, `.gitignore`: test command/dependency and
  generated-output exclusions. `README.md`: setup, behavior, and deployment guide.

### Label implementation files

- `lib/customerReference.ts`: Shopify identity parsing, display suffix, migration detection.
- `app/api/shopify/orders-paid/route.ts`: capture/backfill identity after HMAC verification.
- `app/api/queue/route.ts`, `app/admin/page.tsx`: PIN-protected reference display and print handoff.
- `app/print/label/page.tsx`, `label.module.css`: approved layout and fitting at 80×50 mm.
- `public/branding/prime-pulls-label-mono.png`: approved-style monochrome logo.
- `supabase/migrations/202610220001_queue_customer_id.sql`: additive identity column.
- `tests/labels.spec.ts`, `tests/server.mjs`: isolated integration and PDF/layout checks.

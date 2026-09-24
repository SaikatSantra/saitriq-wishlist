@AGENTS.md
# Saitriq Wishlist

## Project purpose

Saitriq Wishlist is an embedded Shopify app with a theme app extension. It lets
guest and logged-in shoppers save products, view a wishlist page, and gives merchants
monthly usage visibility and plan information.

## Technology and conventions

- React Router 7 with the Shopify React Router app package.
- Shopify Admin API through the authenticated `admin.graphql` client.
- Shopify app proxy at `/apps/saitriq-wishlist` for storefront reads and writes.
- App-owned metaobjects declared in `shopify.app.toml`; use `$app:<type>` in API operations.
- Prisma remains the local store for Shopify sessions and merchant-owned display settings.
- Theme code lives in `extensions/wishlist-product`.
- Run `npm run lint`, `npm run typecheck`, and `npm run build` before shipping.

## Data model

### Wishlist items

`$app:wishlist` stores one entry per `customer_id + product_id`. Its
deterministic handle makes add/upsert, remove, and retry operations idempotent.
It stores customer ID, product ID, product handle, title, image URL, price text,
and ISO timestamp. The app proxy reads entries for the logged-in customer and writes them with
`metaobjectCreate`, `metaobjectUpsert`, and `metaobjectDelete`. Guest items are
kept in browser storage, while an anonymous visitor ID creates an idempotent
server record so guest saves are included in monthly usage analytics.

### Analytics

`$app:wishlist_analytics` stores one entry per calendar month with handle
`month-YYYY-MM`. It contains adds, removes, unique customers, and update time.
A successful add increments usage; a remove is tracked but does not restore an
add credit, preventing limit bypass by repeated add/remove operations.

### Plans

| Plan | Monthly wishlist saves | Price |
| --- | ---: | ---: |
| Free | 100 | $0/month |
| Standard | 500 | $10/month |
| Enterprise | Unlimited | $50/month |

The current enforcement default is Free until plan selection and billing are
connected. When billing is added, resolve the active plan per request and pass
its limit to the proxy instead of hard-coding `free`.

## Step-by-step implementation plan

1. Keep app authentication, session storage, and the existing theme extension.
2. Declare app-owned wishlist and analytics definitions in `shopify.app.toml`
   and request `read_metaobjects` and `write_metaobjects`.
3. Deploy configuration with `shopify app deploy` so definitions exist before
   entries are written.
4. Use the proxy's authenticated Admin client for storefront access. Never
   trust an unverified customer ID.
5. On add, validate the payload, read current-month analytics, enforce the plan
   limit, upsert the wishlist entry, and increment analytics.
6. On remove, delete the deterministic entry and record a remove event without
   changing add usage.
7. Return used, limit, and remaining in proxy responses for the theme extension.
8. Source the merchant dashboard usage card from the same analytics metaobject.
9. Use the Pricing page to explain all plans; add Shopify billing after the
   merchant plan-selection workflow is approved.
10. Use the How to use page and setup checklist to guide Theme Editor setup.
11. Test authentication, invalid payloads, duplicate adds, removals, monthly
    boundaries, limit enforcement, GraphQL errors, and large collections.
12. Deploy and verify the proxy, definitions, extension, and navigation on a
    development store.

## Operational safeguards

- The proxy accepts a signed app-proxy request from either a logged-in customer
  or a guest visitor with a valid anonymous visitor ID.
- Product fields are required and operations are allowlisted.
- GraphQL `userErrors` are surfaced rather than treated as success.
- Handles are sanitized and bounded.
- Analytics is not billing truth until Shopify app billing is integrated.

## Progress

- [x] Added app-owned wishlist and analytics definitions to `shopify.app.toml`.
- [x] Added metaobject create, upsert, read, delete, and analytics helpers.
- [x] Migrated proxy wishlist reads and writes to metaobjects.
- [x] Added monthly usage enforcement and usage response data.
- [x] Added Pricing and How to use pages and navigation links.
- [x] Added storefront usage text to the wishlist block.
- [ ] Connect Standard and Enterprise selection to Shopify billing.
- [ ] Add cursor pagination beyond 250 wishlist entries.
- [ ] Run Shopify CLI deployment and development-store verification.
- [x] Made multi-block storefront synchronization single-flight and idempotent.
- [x] Connected the admin activity list to normalized wishlist metaobject data.
- [x] Normalized optional product image URLs before metaobject writes.
- [x] Added automatic admin dashboard and activity-page refresh.
- [x] Replaced storefront status/usage paragraphs with silent UI synchronization.
- [x] Added datewise analytics visualization using Polaris web components.
- [x] Normalized wishlist-page image rendering and removal reconciliation.
- [x] Made storefront add/remove operations wait for initial synchronization and
  reconcile only from the authoritative proxy response.
- [x] Added a server-side clear-all operation that deletes all customer wishlist
  metaobjects and records the removals in analytics.
- [x] Added a Clear all control to the wishlist page with failure-safe state
  handling.
- [x] Counted guest and logged-in wishlist saves in the same monthly usage
  analytics and enforced the monthly limit for both audiences.
- [x] Added local-first storefront fallback, wishlist header count, and
  add/remove confirmation toast so a stale proxy deployment cannot break the
  shopper interaction.
- [x] Added dashboard and pricing reconciliation from current-month wishlist
  metaobjects so usage does not remain zero when analytics history is stale.
- [x] Made every storefront mutation send the visitor ID, including logged-in
  requests, and made monthly usage enforcement use the higher of analytics
  events or current-month saved records.
- [x] Made proxy body parsing resilient to Shopify proxy content-type changes
  and normalized missing storefront fields so valid wishlist saves are not
  rejected before analytics tracking.

## Local development troubleshooting

Prisma requires `DATABASE_URL` before `shopify app dev` can run. Copy
`.env.example` to `.env`, replace its PostgreSQL placeholder with a real
connection string, then run `npm exec prisma migrate deploy` and
`shopify app dev`. Never commit `.env` or database credentials. The app uses
PostgreSQL for Shopify sessions/settings; wishlist and analytics records are
stored in Shopify metaobjects.

If Prisma reports `P3009` because `Session` already exists, verify the existing
schema first, then run `npx prisma migrate resolve --applied
20260920153143_init` followed by `npm exec prisma migrate deploy`. Do not use
`prisma migrate reset` against a database containing app or merchant data.

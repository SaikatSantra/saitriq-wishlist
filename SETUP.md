# Saitriq Wishlist setup guide

This guide describes the app as it is currently implemented. The app uses
PostgreSQL through Prisma for wishlist items, analytics, settings, and Shopify
sessions. It does not currently store wishlist data in Shopify metaobjects.

## Merchant installation

### Online Store 2.0 themes

1. Install Saitriq Wishlist in the store.
2. Go to **Online Store → Themes → Customize** and choose the theme you intend
   to publish. If you are testing an unpublished theme, customize that theme.
3. Open **App embeds**, turn on **Saitriq Wishlist**, and save. This loads the
   shared storefront behavior and styles.
4. Add the **Product Page Button** app block to the product template.
5. Add the **Collection wishlist icons** app block to the collection template,
   inside the product-card section when the theme offers that placement.
6. Create a page whose URL handle is `wishlist` (so its URL is
   `/pages/wishlist`). Add the **Wishlist page** app block to that page template
   and save.
7. Preview the storefront, test a save and removal, then publish the theme when
   ready.

The app blocks are not inserted into theme templates automatically. Enabling
the app embed loads shared storefront assets; each visible page or button still
requires its corresponding app block.

### Header link and appearance

- To add the wishlist link automatically, open **Wishlist settings** in the
  embedded app and set a CSS selector for an element in the storefront header,
  such as `.header__icons`. The link is added to the first matching element
  while the app embed is on. An empty or unmatched selector adds no link.
- Use the app's **Wishlist settings** for page text, colors, notifications, and
  header selector. Use the Wishlist page app block settings for page layout
  options such as columns and price visibility.

### Older or custom themes without app blocks

App blocks require a theme that supports app blocks; deploying or reinstalling
the app does not upgrade a vintage theme to Online Store 2.0. Keep the current
theme if you need to. Instead:

1. Duplicate the theme first: **Online Store → Themes → … → Duplicate**.
2. In the app, open **How to use → Manual install**. Follow its three snippet
   steps and optional header-link step. The instructions use the storefront app
   proxy and do not require an API key in theme code.
3. Follow the manual guide's Step 0 to create the `wishlist.css` asset in the
   theme's **Assets** directory. The snippets load it with `asset_url`; Shopify
   does not copy extension assets into a theme automatically.
4. Add the product snippet inside the product template/section where the
   button should appear. Add the collection injection snippet before
   `</body>` in `layout/theme.liquid`. Create the wishlist page with handle
   `wishlist` and render the wishlist-page snippet from its Liquid template.
5. Save and preview the duplicated theme on desktop and mobile before
   publishing it.

For manual setup, copy the files from the app's **Manual install** instructions
or their corresponding source snippets. Do not copy `blocks/*.liquid` directly
into a theme snippet: app-block files rely on Shopify's `block` object and
block settings. If a theme's code editor does not allow Liquid template
changes, ask a theme developer to place the snippets in the relevant template.

## Local developer setup

### Requirements

- Node.js matching the `engines` entry in `package.json` (Node 20.19+ before
  22, or Node 22.12+).
- Shopify CLI and access to the linked Shopify development store/app.
- A reachable PostgreSQL database. The checked-in Prisma schema uses PostgreSQL;
  SQLite is not supported by this project configuration.

### Run locally

From the repository root in PowerShell:

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` and set `DATABASE_URL` to a real PostgreSQL connection string. Do
not commit `.env` or put real credentials in the example file. Then run:

```powershell
npm exec prisma migrate deploy
shopify app config validate --json
shopify app dev
```

Shopify CLI supplies the linked app credentials and a temporary HTTPS URL while
`shopify app dev` is running. The `DATABASE_URL` is still required locally;
Shopify CLI does not create a database or infer its credentials.

If Prisma reports `P3009` because the `Session` table already exists, do not
reset or drop the database. First verify that its schema matches this
repository's initial migration. Only then, if migration history is missing,
mark the exact migration applied and retry:

```powershell
npx prisma migrate resolve --applied 20260920153143_init
npm exec prisma migrate deploy
```

Before shipping code changes, run:

```powershell
npm run lint
npm run typecheck
npm run build
```

### Shopify API and app configuration

- `shopify.app.toml` configures the app URL, OAuth callback, app proxy,
  compliance/uninstall webhooks, and `read_themes` access scope.
- `read_themes` is used by the authenticated Admin GraphQL check that reads the
  published theme's settings to report whether the app embed appears enabled.
  No order-reading code was found, so the unused `read_orders` scope has been
  removed.
- The storefront uses Shopify's app proxy at
  `/apps/saitriq-wishlist`. The route authenticates requests with
  `authenticate.public.appProxy`; do not expose Shopify app secrets or access
  tokens in theme JavaScript.
- Admin routes use `authenticate.admin`. The `/app/api` route is an
  authenticated embedded-app route, not a generic public bearer-token or
  server-to-server API for third-party services.
- Wishlist data and app settings are in the Prisma database. No metaobject
  definitions or `read_metaobjects`/`write_metaobjects` scopes are required by
  the current code.
- The Admin GraphQL client in `app/shopify.server.js` uses API version
  `2026-07`; webhook payloads are configured separately at `2026-10` in
  `shopify.app.toml`. Keep each version intentional and supported when
  upgrading.

Review any configuration change with `shopify app config validate --json`.
The CLI validates local app configuration; it does not verify database
connectivity, hosted callback reachability, customer-data behavior, or theme
rendering.

### Production deployment

The app server and Shopify app configuration are deployed separately:

1. Deploy the React Router app to a stable HTTPS host and provision persistent
   PostgreSQL. For multiple app instances, use a shared database.
2. Set `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`,
   `SCOPES=read_themes`, and `DATABASE_URL` in the host's secret/environment
   settings. Set `NODE_ENV=production`. Never commit those values.
3. Make `application_url`, `auth.redirect_urls`, and `app_proxy.url` in the
   selected `shopify.app.toml` match the deployed app host and callback path.
4. Apply migrations with `npm exec prisma migrate deploy`, build with
   `npm run build`, and start the app using the platform's configured start
   command (`npm run start`).
5. Validate and deploy Shopify app configuration/extensions with
   `shopify app config validate --json` and `shopify app deploy`.
6. Install/update the app on a development store and test the app proxy,
   OAuth return, blocks, app embed, logged-in and guest behavior, and billing
   before publishing to merchants.

`shopify app deploy` publishes Shopify app configuration and extensions; it
does not host the React Router server or automatically place blocks into a
merchant's theme.

## API behavior and checks

- Storefront requests use same-origin requests to `/apps/saitriq-wishlist`.
  Shopify signs app-proxy requests; the server validates them before using the
  shop or logged-in customer context.
- Logged-in wishlists are stored in PostgreSQL and sync across devices.
  Guest wishlist entries remain in browser `localStorage`; guest saves count
  toward usage analytics but are not stored as guest product records on the
  server.
- `/app/api` requires Shopify Admin session authentication. It is intended for
  the embedded app, not direct calls from an arbitrary external service.
- The current app proxy endpoint accepts the documented operations in the
  storefront code and returns usage details. Validate guest save/remove,
  login sync, duplicate saves, limit reached, clear-all, and failed proxy
  responses on a development store.

## Troubleshooting

### Blocks or embed are missing after an app update

1. Confirm the app update/extension version was deployed and the app is
   installed on this store.
2. In Theme Editor, select the exact theme being tested; unpublished and live
   themes have separate editor settings.
3. Turn on **App embeds → Saitriq Wishlist**, save, and refresh Theme Editor.
4. Add the app blocks manually. Extension updates do not insert blocks into
   templates or publish the theme.
5. If the app block picker is unavailable, the theme may not support app
   blocks. Use the older/custom-theme instructions above or have a developer
   adapt the snippets.

### Buttons appear but do not work

- Check the storefront request to `/apps/saitriq-wishlist` in browser
  developer tools. Confirm it stays on the shop domain and does not return an
  app-proxy/authentication error.
- Confirm `app_proxy.url` points at the deployed app server and its route is
  reachable over HTTPS.
- For a local session, use the tunnel URL provided by `shopify app dev`; do not
  point the proxy to `localhost`.
- Check the app server logs and database availability. Guest wishlist display
  uses the browser's local storage; cross-device sync requires customer login.

### Header link does not appear

Check that the embed is enabled and that the selector in Wishlist settings
matches an element in the selected theme's rendered header. Clear the selector
to disable automatic insertion.

## References

- [Shopify app configuration](https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- [Online Store 2.0 themes](https://shopify.dev/docs/storefronts/themes/os20)
- [App blocks for themes](https://shopify.dev/docs/storefronts/themes/architecture/blocks/app-blocks)
- [Authenticate app proxies](https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies)
- [Shopify React Router app package](https://shopify.dev/docs/api/shopify-app-react-router)

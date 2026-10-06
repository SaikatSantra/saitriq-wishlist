export default function ApiDocsPage() {
  return (
    <s-page heading="Developer API">
      <style>{`
        .api-code-block > code {
          background-color: #1e1e1e;
          border: 1px solid #3c3c3c;
          border-radius: 0.5rem;
          color: #d4d4d4;
          display: block;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 0.8rem;
          line-height: 1.5;
          margin: 0;
          max-height: 32rem;
          overflow: auto;
          padding: 1rem;
          white-space: pre;
        }
      `}</style>
      <s-section heading="Overview">
        <s-paragraph>
          Saitriq Wishlist exposes a storefront app proxy and an authenticated
          embedded-app API. The app proxy is called from the shop storefront. The
          <code> /app/api</code> routes require Shopify Admin session authentication;
          they are not a public bearer-token API for third-party or headless services.
        </s-paragraph>
      </s-section>

      {/* ── STOREFRONT API ── */}
      <s-section heading="Storefront API">
        <s-paragraph>
          Base URL (from any storefront page):
        </s-paragraph>
        <div className="api-code-block">
          <code>https://yourstore.myshopify.com/apps/saitriq-wishlist</code>
        </div>
        <s-paragraph>
          All requests are authenticated automatically by Shopify via HMAC signing
          on the app proxy. No API key is needed in the storefront.
          The <code>logged_in_customer_id</code> query param is appended automatically
          by Shopify for logged-in customers.
        </s-paragraph>

        <s-section heading="GET ?api=items — Customer wishlist">
          <s-paragraph>Returns all saved items for the currently logged-in customer.</s-paragraph>
          <div className="api-code-block">
            <code>GET /apps/saitriq-wishlist?api=items</code>
          </div>
          <s-paragraph>Response:</s-paragraph>
          <div className="api-code-block">
            <code>{`{
  "items": [
    {
      "productId": "123456789",
      "productHandle": "my-product",
      "productTitle": "My Product",
      "productImage": "https://cdn.shopify.com/...",
      "productPrice": "$29.00",
      "customerId": "987",
      "createdAt": "2026-09-01T10:00:00.000Z"
    }
  ]
}`}</code>
          </div>
        </s-section>

        <s-section heading="GET ?api=check — Is product saved?">
          <s-paragraph>
            Check whether a specific product is in the customer's wishlist.
            Useful for rendering the button state server-side or in headless.
          </s-paragraph>
          <div className="api-code-block">
            <code>GET /apps/saitriq-wishlist?api=check&amp;productId=123456789</code>
          </div>
          <s-paragraph>Response:</s-paragraph>
          <div className="api-code-block">
            <code>{`{ "saved": true, "authenticated": true, "productId": "123456789" }`}</code>
          </div>
        </s-section>

        <s-section heading="GET ?api=settings — Display settings">
          <s-paragraph>Returns the merchant's wishlist page and toast notification settings.</s-paragraph>
          <div className="api-code-block">
            <code>GET /apps/saitriq-wishlist?api=settings</code>
          </div>
          <s-paragraph>Response:</s-paragraph>
          <div className="api-code-block">
            <code>{`{
  "settings": {
    "heading": "My wishlist",
    "emptyMessage": "You have not saved any products yet.",
    "showPrices": true,
    "showRemove": true,
    "buttonLabel": "Remove",
    "customCss": "",
    "toastBg": "#1a1a1a",
    "toastColor": "#ffffff",
    "toastPosition": "top-left"
  }
}`}</code>
          </div>
        </s-section>

        <s-section heading="GET ?api=analytics — Usage analytics">
          <s-paragraph>
            Returns add/remove totals and daily history for the current or specified month.
          </s-paragraph>
          <div className="api-code-block">
            <code>GET /apps/saitriq-wishlist?api=analytics</code>
            <br />
            <code>GET /apps/saitriq-wishlist?api=analytics&amp;month=2026-09</code>
          </div>
          <s-paragraph>Response:</s-paragraph>
          <div className="api-code-block">
            <code>{`{
  "month": "2026-09",
  "adds": 42,
  "removes": 5,
  "history": [
    { "day": "2026-09-01", "adds": 10, "removes": 1 },
    { "day": "2026-09-02", "adds": 32, "removes": 4 }
  ],
  "usage": { "used": 42, "limit": 100, "remaining": 58 }
}`}</code>
          </div>
        </s-section>

        <s-section heading="GET ?api=usage — Monthly usage">
          <s-paragraph>Returns used, limit, and remaining saves for the current month.</s-paragraph>
          <div className="api-code-block">
            <code>GET /apps/saitriq-wishlist?api=usage</code>
          </div>
          <s-paragraph>Response:</s-paragraph>
          <div className="api-code-block">
            <code>{`{ "used": 42, "limit": 100, "remaining": 58 }`}</code>
          </div>
        </s-section>

        <s-section heading="POST — Wishlist mutations">
          <s-paragraph>
            All wishlist writes use a single POST endpoint with an <code>operation</code> field.
          </s-paragraph>

          <s-section heading="Add a product">
            <div className="api-code-block">
              <code>{`POST /apps/saitriq-wishlist
Content-Type: application/json

{
  "operation": "add",
  "visitorId": "abc123",
  "productId": "123456789",
  "productHandle": "my-product",
  "productTitle": "My Product",
  "productImage": "https://cdn.shopify.com/...",
  "productPrice": "$29.00"
}`}</code>
            </div>
          </s-section>

          <s-section heading="Remove a product">
            <div className="api-code-block">
              <code>{`POST /apps/saitriq-wishlist
Content-Type: application/json

{
  "operation": "remove",
  "visitorId": "abc123",
  "productId": "123456789",
  "productHandle": "my-product",
  "productTitle": "My Product"
}`}</code>
            </div>
          </s-section>

          <s-section heading="Clear all items">
            <div className="api-code-block">
              <code>{`POST /apps/saitriq-wishlist
Content-Type: application/json

{ "operation": "clear", "visitorId": "abc123" }`}</code>
            </div>
          </s-section>

          <s-section heading="POST response (all mutations)">
            <div className="api-code-block">
              <code>{`{
  "authenticated": true,
  "tracked": true,
  "items": [ /* updated item list */ ],
  "usage": { "used": 43, "limit": 100, "remaining": 57 }
}`}</code>
            </div>
          </s-section>
        </s-section>
      </s-section>

      {/* ── ADMIN API ── */}
      <s-section heading="Authenticated embedded-app API">
        <s-paragraph>
          These routes are intended for requests made from the authenticated embedded
          app. They use <code>authenticate.admin</code> and the app&apos;s Shopify session
          context. They do not accept a shop access token in a custom Authorization
          header and are not currently supported as a general server-to-server API.
        </s-paragraph>
        <div className="api-code-block">
          <code>Route: /app/api (authenticated embedded-app session required)</code>
        </div>

        <s-section heading="GET ?resource=items — Customer items">
          <div className="api-code-block">
            <code>GET /app/api?resource=items&amp;customerId=987</code>
          </div>
          <s-paragraph>Response:</s-paragraph>
          <div className="api-code-block">
            <code>{`{ "customerId": "987", "count": 3, "items": [ ... ] }`}</code>
          </div>
        </s-section>

        <s-section heading="GET ?resource=check — Is product saved?">
          <div className="api-code-block">
            <code>GET /app/api?resource=check&amp;customerId=987&amp;productId=123456789</code>
          </div>
          <s-paragraph>Response:</s-paragraph>
          <div className="api-code-block">
            <code>{`{ "customerId": "987", "productId": "123456789", "saved": true }`}</code>
          </div>
        </s-section>

        <s-section heading="GET ?resource=all — All shop items (paginated)">
          <s-paragraph>Returns every wishlist item across all customers for the shop.</s-paragraph>
          <div className="api-code-block">
            <code>GET /app/api?resource=all&amp;page=1&amp;pageSize=50</code>
          </div>
          <s-paragraph>Response:</s-paragraph>
          <div className="api-code-block">
            <code>{`{
  "page": 1,
  "pageSize": 50,
  "total": 120,
  "totalPages": 3,
  "items": [
    {
      "customerId": "987",
      "productId": "123456789",
      "productHandle": "my-product",
      "productTitle": "My Product",
      "productImage": "https://cdn.shopify.com/...",
      "productPrice": "$29.00",
      "createdAt": "2026-09-01T10:00:00.000Z"
    }
  ]
}`}</code>
          </div>
        </s-section>

        <s-section heading="GET ?resource=analytics — Analytics">
          <div className="api-code-block">
            <code>GET /app/api?resource=analytics&amp;month=2026-09</code>
          </div>
        </s-section>

        <s-section heading="GET ?resource=settings — Display settings">
          <div className="api-code-block">
            <code>GET /app/api?resource=settings</code>
          </div>
        </s-section>

        <s-section heading="GET ?resource=usage — Monthly usage">
          <div className="api-code-block">
            <code>GET /app/api?resource=usage</code>
          </div>
        </s-section>

        <s-section heading="POST — Mutations (add / remove / clear)">
          <s-paragraph>
            Add a product to a customer's wishlist:
          </s-paragraph>
          <div className="api-code-block">
            <code>{`POST /app/api
Content-Type: application/json

{
  "resource": "item",
  "operation": "add",
  "customerId": "987",
  "productId": "123456789",
  "productHandle": "my-product",
  "productTitle": "My Product",
  "productImage": "https://cdn.shopify.com/...",
  "productPrice": "$29.00"
}`}</code>
          </div>
          <s-paragraph>Remove:</s-paragraph>
          <div className="api-code-block">
            <code>{`{ "resource": "item", "operation": "remove", "customerId": "987", "productId": "123456789" }`}</code>
          </div>
          <s-paragraph>Clear all for a customer:</s-paragraph>
          <div className="api-code-block">
            <code>{`{ "resource": "item", "operation": "clear", "customerId": "987" }`}</code>
          </div>
        </s-section>
      </s-section>

      {/* ── STOREFRONT USAGE EXAMPLE ── */}
      <s-section heading="Storefront JavaScript example">
        <s-paragraph>
          Fetch the customer's wishlist from any storefront page:
        </s-paragraph>
        <div className="api-code-block">
          <code>{`const res = await fetch('/apps/saitriq-wishlist?api=items', {
  credentials: 'same-origin'
});
const { items } = await res.json();
console.log(items); // array of wishlist items`}</code>
        </div>
        <s-paragraph>
          Check if a product is saved (useful for custom button rendering):
        </s-paragraph>
        <div className="api-code-block">
          <code>{`const res = await fetch(
  '/apps/saitriq-wishlist?api=check&productId=' + productId,
  { credentials: 'same-origin' }
);
const { saved } = await res.json();
button.classList.toggle('is-saved', saved);`}</code>
        </div>
      </s-section>

      {/* ── THEME JS REFERENCE ── */}
      <s-section heading="Theme JavaScript reference">
        <s-paragraph>
          Use these ready-to-paste JavaScript modules in your theme's JS files
          (<code>assets/theme.js</code>, <code>assets/custom.js</code>, etc.).
          Each module is self-contained and works alongside the app blocks and manual snippets.
        </s-paragraph>

        {/* Core client */}
        <s-section heading="1 — Core wishlist client (copy once into your theme JS)">
          <s-paragraph>
            Drop this once into your theme JavaScript. It exposes a
            {" "}<code>window.SaitriqWishlist</code> object all other modules use.
          </s-paragraph>
          <div className="api-code-block">
            <code>{`// saitriq-wishlist.js
// ─────────────────────────────────────────────────────────────────────────────
// Core wishlist client — add once to your theme JS bundle
// ─────────────────────────────────────────────────────────────────────────────
window.SaitriqWishlist = (() => {
  const STORAGE_KEY  = 'saitriq_wishlist';
  const VISITOR_KEY  = 'saitriq_wishlist_visitor';
  const ENDPOINT     = '/apps/saitriq-wishlist';

  // ── localStorage ──────────────────────────────────────────────────────────
  const getItems = () => {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  };

  const setItems = (items) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
    window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated'));
  };

  const getVisitorId = () => {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  };

  // ── Auth state ─────────────────────────────────────────────────────────────
  let _authenticated = false;
  let _settings      = {};
  let _syncPromise   = null;

  // ── Fetch helpers ──────────────────────────────────────────────────────────
  const apiFetch = async (path, options = {}) => {
    const res = await fetch(ENDPOINT + path, {
      credentials: 'same-origin',
      ...options,
    });
    if (!res.ok) throw new Error(\`Wishlist API error: \${res.status}\`);
    return res.json();
  };

  const post = (body) =>
    apiFetch('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: getVisitorId(), ...body }),
    });

  // ── Initial sync (single-flight) ───────────────────────────────────────────
  const sync = () => {
    if (_syncPromise) return _syncPromise;
    _syncPromise = apiFetch('')
      .then((data) => {
        _authenticated = data.authenticated === true;
        if (data.settings) _settings = data.settings;
        if (_authenticated && Array.isArray(data.items)) {
          setItems(data.items.map(_mapItem));
        }
      })
      .catch(() => {})
      .finally(() => { _syncPromise = null; });
    return _syncPromise;
  };

  const _mapItem = (s) => ({
    id:       s.productId,
    handle:   s.productHandle,
    title:    s.productTitle,
    image:    s.productImage  || '',
    price:    s.productPrice  || '',
    addedAt:  s.createdAt     || '',
  });

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Check if a product is in the local wishlist */
  const isSaved = (productId) =>
    getItems().some((i) => String(i.id) === String(productId));

  /** Add a product to the wishlist */
  const add = async (item) => {
    if (!_authenticated) {
      // guest: fire-and-forget analytics, local-only save
      post({ operation: 'add', ...item }).catch(() => {});
      const items = getItems();
      if (!items.some((i) => String(i.id) === String(item.productId))) {
        items.push({ id: item.productId, handle: item.productHandle, title: item.productTitle, image: item.productImage || '', price: item.productPrice || '', addedAt: new Date().toISOString() });
        setItems(items);
      }
      return items;
    }
    const data = await post({ operation: 'add', ...item });
    const synced = (data.items || []).map(_mapItem);
    setItems(synced);
    return synced;
  };

  /** Remove a product from the wishlist */
  const remove = async (item) => {
    if (!_authenticated) {
      post({ operation: 'remove', ...item }).catch(() => {});
      setItems(getItems().filter((i) => String(i.id) !== String(item.productId)));
      return getItems();
    }
    const data = await post({ operation: 'remove', ...item });
    const synced = (data.items || []).map(_mapItem);
    setItems(synced);
    return synced;
  };

  /** Toggle a product (add if not saved, remove if saved) */
  const toggle = async (item) =>
    isSaved(item.productId) ? remove(item) : add(item);

  /** Clear all wishlist items */
  const clear = async () => {
    const data = await post({ operation: 'clear' });
    const synced = (data.items || []).map(_mapItem);
    setItems(synced);
    return synced;
  };

  /** Get current items from localStorage */
  const getAll = () => getItems();

  /** Get display settings from the last sync */
  const getSettings = () => _settings;

  /** Listen for wishlist changes */
  const onChange = (fn) => window.addEventListener('saitriq:wishlist-updated', fn);
  const offChange = (fn) => window.removeEventListener('saitriq:wishlist-updated', fn);

  // Auto-sync on load
  sync();

  return { sync, isSaved, add, remove, toggle, clear, getAll, getSettings, onChange, offChange };
})();`}</code>
          </div>
        </s-section>

        {/* Wishlist button */}
        <s-section heading="2 — Custom wishlist button">
          <s-paragraph>
            Wire up any button element as a wishlist toggle. Works with your own HTML —
            no class names required.
          </s-paragraph>
          <div className="api-code-block">
            <code>{`// Usage: call this for each wishlist button on the page
// <button data-wishlist-btn data-product-id="123" data-product-handle="my-product"
//         data-product-title="My Product" data-product-image="..." data-product-price="$29">
//   ♡ Save
// </button>

function initWishlistButton(button) {
  const productId     = button.dataset.productId;
  const productHandle = button.dataset.productHandle;
  const productTitle  = button.dataset.productTitle;
  const productImage  = button.dataset.productImage || '';
  const productPrice  = button.dataset.productPrice || '';

  const refresh = () => {
    const saved = SaitriqWishlist.isSaved(productId);
    button.classList.toggle('is-active', saved);
    button.setAttribute('aria-pressed', String(saved));
    button.textContent = saved ? '♥ Saved' : '♡ Save';
  };

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await SaitriqWishlist.toggle({ productId, productHandle, productTitle, productImage, productPrice });
    } catch (err) {
      console.error('Wishlist toggle failed', err);
    } finally {
      button.disabled = false;
    }
  });

  SaitriqWishlist.onChange(refresh);
  refresh();
}

// Init all buttons on page load
document.querySelectorAll('[data-wishlist-btn]').forEach(initWishlistButton);`}</code>
          </div>
        </s-section>

        {/* Counter badge */}
        <s-section heading="3 — Live counter badge">
          <s-paragraph>
            Display a live wishlist item count that updates without a page reload.
            Put <code>{"<span data-wishlist-count></span>"}</code> anywhere in your HTML.
          </s-paragraph>
          <div className="api-code-block">
            <code>{`function initWishlistCounter(el) {
  const update = () => {
    el.textContent = SaitriqWishlist.getAll().length;
    el.hidden = SaitriqWishlist.getAll().length === 0;
  };
  SaitriqWishlist.onChange(update);
  update();
}

document.querySelectorAll('[data-wishlist-count]').forEach(initWishlistCounter);`}</code>
          </div>
        </s-section>

        {/* Wishlist page renderer */}
        <s-section heading="4 — Wishlist page renderer">
          <s-paragraph>
            Render a full wishlist grid into any container element.
            Put <code>{'<div data-wishlist-page></div>'}</code> in your page template.
          </s-paragraph>
          <div className="api-code-block">
            <code>{`function initWishlistPage(container) {
  const esc = (s) => {
    const d = document.createElement('div');
    d.textContent = String(s ?? '');
    return d.innerHTML;
  };

  const render = () => {
    const items    = SaitriqWishlist.getAll();
    const settings = SaitriqWishlist.getSettings();
    const heading       = settings.heading      || 'My wishlist';
    const emptyMessage  = settings.emptyMessage || 'No saved items yet.';
    const showPrices    = settings.showPrices   !== false;
    const showRemove    = settings.showRemove   !== false;
    const buttonLabel   = settings.buttonLabel  || 'Remove';
    

    if (items.length === 0) {
      container.innerHTML = \`<p class="sai-wishlist-page__empty">\${esc(emptyMessage)}</p>\`;
      return;
    }

    const grid = document.createElement('ul');
    grid.className = 'sai-wishlist-page__items';

    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'sai-wishlist-page__item';
      li.innerHTML = \`
        <a href="/products/\${encodeURIComponent(item.handle)}">
          <img src="\${esc(item.image)}" alt="\${esc(item.title)}" loading="lazy">
        </a>
        <div className="api-code-block">
          <a class="sai-wishlist-page__title" href="/products/\${encodeURIComponent(item.handle)}">\${esc(item.title)}</a>
          \${showPrices && item.price ? \`<div class="sai-wishlist-page__price">\${esc(item.price)}</div>\` : ''}
          \${showRemove ? \`<button type="button" class="sai-wishlist-page__remove">\${esc(buttonLabel)}</button>\` : ''}
        </div>
      \`;
      li.querySelector('.sai-wishlist-page__remove')?.addEventListener('click', async () => {
        await SaitriqWishlist.remove({ productId: item.id, productHandle: item.handle, productTitle: item.title });
      });
      grid.append(li);
    });

    const header = document.createElement('div');
    header.innerHTML = \`
      <h2>\${esc(heading)}</h2>
      <button type="button" class="sai-wishlist-page__clear button">Clear all</button>
    \`;
    header.querySelector('.sai-wishlist-page__clear button').addEventListener('click', () => {
      SaitriqWishlist.clear();
    });

    container.replaceChildren(header, grid);
  };

  SaitriqWishlist.onChange(render);
  SaitriqWishlist.sync().then(render);
}

const wishlistPage = document.querySelector('[data-wishlist-page]');
if (wishlistPage) initWishlistPage(wishlistPage);`}</code>
          </div>
        </s-section>

        {/* Collection inject */}
        <s-section heading="5 — Collection page heart icons">
          <s-paragraph>
            Auto-inject heart buttons on collection pages. Call once after the DOM is ready.
            Uses <code>MutationObserver</code> so it works with infinite scroll too.
          </s-paragraph>
          <div className="api-code-block">
            <code>{`function initCollectionWishlist() {
  const cache = new Map();

  const getProductData = async (handle) => {
    if (cache.has(handle)) return cache.get(handle);
    const res = await fetch(\`/products/\${encodeURIComponent(handle)}.js\`);
    if (!res.ok) throw new Error('Product not found');
    const p = await res.json();
    const data = {
      productId:     String(p.id),
      productHandle: p.handle,
      productTitle:  p.title,
      productImage:  p.featured_image || p.images?.[0] || '',
      productPrice:  p.price ? (p.price / 100).toFixed(2) : '',
    };
    cache.set(handle, data);
    return data;
  };

  const handleFromLink = (link) => {
    const m = new URL(link.href, location.origin).pathname.match(/^\\/products\\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  };

  const attach = async (link) => {
    const handle = handleFromLink(link);
    if (!handle) return;
    const card = link.closest('li, article, .card-wrapper, .product-card-wrapper, .card, .product-card, .grid__item, [class*="product-card"], [class*="product-item"], [class*="card--product"]');
    if (!card || card.querySelector('[data-sai-col-btn]')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sai-wishlist sai-wishlist--collection';
    btn.dataset.saiColBtn = '';
    btn.setAttribute('aria-label', 'Add to wishlist');
    card.style.position = card.style.position || 'relative';
    card.append(btn);

    let item;
    try {
      item = await getProductData(handle);
    } catch {
      btn.remove();
      return;
    }

    const refresh = () => {
      const saved = SaitriqWishlist.isSaved(item.productId);
      btn.textContent = saved ? '♥' : '♡';
      btn.classList.toggle('is-active', saved);
      btn.setAttribute('aria-label', saved ? 'Remove from wishlist' : 'Add to wishlist');
    };

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      btn.disabled = true;
      try { await SaitriqWishlist.toggle(item); }
      catch (err) { console.error('Collection wishlist failed', err); }
      finally { btn.disabled = false; }
    });

    SaitriqWishlist.onChange(refresh);
    refresh();
  };

  const scan = () => {
    [...document.querySelectorAll('a[href*="/products/"]')]
      .filter((l) => handleFromLink(l))
      .forEach(attach);
  };

  scan();
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
}

document.addEventListener('DOMContentLoaded', initCollectionWishlist);`}</code>
          </div>
        </s-section>

        {/* Events */}
        <s-section heading="6 — Custom events reference">
          <s-paragraph>
            Listen to these events on <code>window</code> to react to wishlist changes
            from anywhere in your theme JS:
          </s-paragraph>
          <div className="api-code-block">
            <code>{`// Fired whenever the wishlist changes (add, remove, clear, sync)
window.addEventListener('saitriq:wishlist-updated', () => {
  const items = SaitriqWishlist.getAll();
  console.log('Wishlist updated, item count:', items.length);
});

// Fired when a toast notification should be shown
window.addEventListener('saitriq:wishlist-toast', (event) => {
  console.log('Toast message:', event.detail.message);
  // show your own toast / snackbar here
  myToast.show(event.detail.message);
});

// Dispatch manually to trigger a wishlist re-render from outside
window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated'));`}</code>
          </div>
        </s-section>

        {/* Full HTML example */}
        <s-section heading="7 — Minimal full HTML example">
          <s-paragraph>
            A complete working example combining all the pieces above.
            Copy this into any theme template to get a working wishlist button and counter.
          </s-paragraph>
          <div className="api-code-block">
            <code>{`<!-- In your product template -->
<button
  data-wishlist-btn
  data-product-id="{{ product.id }}"
  data-product-handle="{{ product.handle }}"
  data-product-title="{{ product.title | escape }}"
  data-product-image="{{ product.featured_image | image_url: width: 600 }}"
  data-product-price="{{ product.price | money }}"
  aria-pressed="false"
>
  ♡ Save
</button>

<!-- In your header -->
<a href="/pages/wishlist">
  Wishlist <span data-wishlist-count>0</span>
</a>

<!-- At the bottom of theme.liquid, before </body> -->
<script src="{{ 'saitriq-wishlist.js' | asset_url }}" defer></script>
<script>
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-wishlist-btn]').forEach(initWishlistButton);
    document.querySelectorAll('[data-wishlist-count]').forEach(initWishlistCounter);
  });
</script>`}</code>
          </div>
        </s-section>

      </s-section>

    </s-page>
  );
}

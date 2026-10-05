export default function HowToUsePage() {
  return (
    <s-page heading="How to use Saitriq Wishlist">

      {/* ── Method 1: App Blocks ── */}
      <s-section heading="Method 1 — App blocks (recommended)">
        <s-paragraph>
          Works with any Online Store 2.0 theme (Dawn, Sense, Craft, Refresh, etc.).
          No code editing required.
        </s-paragraph>
        <s-banner tone="warning" heading="Enable the app embed first">
          Before adding any blocks, you must enable the Saitriq Wishlist app embed.
          Go to <strong>Online Store → Themes → Customize → App embeds</strong> and toggle
          <strong>Saitriq Wishlist</strong> on. This loads the CSS and activates all blocks.
          Without it, no wishlist buttons will appear.
        </s-banner>
        <s-grid gap="small-200">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-badge tone="info">1</s-badge>
            <s-paragraph>Go to <strong>Online Store → Themes → Customize → App embeds</strong>. Enable <strong>Saitriq Wishlist</strong>. Save.</s-paragraph>
          </s-stack>
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-badge tone="info">2</s-badge>
            <s-paragraph>Open the <strong>Product</strong> template → Add block → <strong>Saitriq Wishlist → Wishlist</strong>. Save.</s-paragraph>
          </s-stack>
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-badge tone="info">3</s-badge>
            <s-paragraph>Open the <strong>Collection</strong> template → Add the <strong>Collection wishlist icons</strong> block. Save.</s-paragraph>
          </s-stack>
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-badge tone="info">4</s-badge>
            <s-paragraph>Create a page with handle <code>wishlist</code>. Add the <strong>Wishlist page</strong> block in the theme editor. Save.</s-paragraph>
          </s-stack>
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-badge tone="info">5</s-badge>
            <s-paragraph>To add a Wishlist link to your header automatically, open <s-link href="/app/settings">Wishlist settings</s-link>, enter a CSS selector for your header container (for example <code>.header__icons</code>), and save. The app adds the link inside the first matching element while the app embed is enabled. Leave the selector blank to disable the automatic link. If your selector does not match your theme, no link is added. </s-paragraph>
          </s-stack>
        </s-grid>
        <s-paragraph>
          The selector is theme-specific and does not edit theme files. If you change or clear it, or disable the app embed,
          the automatic link is removed on the next storefront page load. Check the selector against your theme&apos;s header markup.
        </s-paragraph>
      </s-section>

      {/* ── Method 2: Manual (older themes) ── */}
      <s-section heading="Method 2 — Manual install (older or custom themes)">
        <s-paragraph>
          For themes that do not support app blocks (Debut, older Brooklyn, Pipeline, fully
          custom themes). All the code below is copy-paste ready — create each snippet file
          yourself in <strong>Online Store → Themes → Edit code → Snippets → Add a new snippet</strong>.
        </s-paragraph>
        <s-banner tone="warning">
          Always duplicate your theme before editing code.
        </s-banner>

        {/* ── Step 1: wishlist-button snippet ── */}
        <s-section heading="Step 1 — Create snippets/wishlist-button.liquid">
          <s-paragraph>
            Create a new snippet file named <code>wishlist-button</code> and paste this code:
          </s-paragraph>
          <s-banner tone="info">
            <code>{`{{ 'wishlist.css' | asset_url | stylesheet_tag }}
{% assign wp = product %}
<div data-sai-wishlist>
  <button type="button" class="sai-wishlist" data-sai-wishlist-button
    data-product-id="{{ wp.id }}"
    data-product-handle="{{ wp.handle }}"
    data-product-title="{{ wp.title | escape }}"
    data-product-image="{{ wp.featured_image | image_url: width: 600 | escape }}"
    data-product-price="{{ wp.price | money | escape }}"
    aria-label="Add to wishlist">
    <!-- Outline heart — shown when NOT saved -->
    <span class="sai-wishlist__icon sai-wishlist__icon--default" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
    <!-- Filled heart — shown when saved (.is-active) via CSS -->
    <span class="sai-wishlist__icon sai-wishlist__icon--active" aria-hidden="true" style="display:none">
      <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
    </span>
    <span class="sai-wishlist__label">Add to wishlist</span>
  </button>
</div>
<script>
  (() => {
    const storageKey = 'saitriq_wishlist';
    const visitorStorageKey = 'saitriq_wishlist_visitor';
    const syncEndpoint = '/apps/saitriq-wishlist';
    const script = document.currentScript;
    const block = script && script.previousElementSibling;
    const button = block && block.querySelector('[data-sai-wishlist-button]');
    if (!button) return;

    const productId     = button.dataset.productId;
    const productHandle = button.dataset.productHandle;
    const productTitle  = button.dataset.productTitle;
    const productImage  = button.dataset.productImage;
    const productPrice  = button.dataset.productPrice;
    let requestInFlight = false;
    let customerAuthenticated = false;

    // Toast
    const announce = (message) => {
      let toast = document.querySelector('[data-sai-wishlist-toast]');
      if (!toast) {
        toast = document.createElement('div');
        toast.dataset.saiWishlistToast = '';
        toast.className = 'sai-wishlist__toast';
        toast.setAttribute('role', 'status');
        document.body.append(toast);
      }
      toast.textContent = message;
      toast.classList.add('is-visible');
      clearTimeout(window.saitriqWishlistToastTimer);
      window.saitriqWishlistToastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
    };
    window.addEventListener('saitriq:wishlist-toast', (e) => { if (e.detail?.message) announce(e.detail.message); });

    const getWishlist = () => { try { const v = JSON.parse(localStorage.getItem(storageKey)||'[]'); return Array.isArray(v)?v:[]; } catch{return[];} };
    const saveWishlist = (items) => { try{localStorage.setItem(storageKey,JSON.stringify(items));}catch{} window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated')); };
    const getVisitorId = () => { let id=localStorage.getItem(visitorStorageKey); if(!id){id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,14);localStorage.setItem(visitorStorageKey,id);} return id; };

    const updateView = (saved) => {
      button.classList.toggle('is-active', saved);
      // Icons switch via CSS .is-active — just update aria-label and label text
      button.setAttribute('aria-label', saved ? 'Saved' : 'Add to wishlist');
      const label = button.querySelector('.sai-wishlist__label');
      if (label) label.textContent = saved ? 'Saved' : 'Add to wishlist';
    };
    const refresh = () => updateView(getWishlist().some(i => String(i.id) === String(productId)));

    const persistLocal = (operation, item) => {
      const items = getWishlist();
      const idx = items.findIndex(s => String(s.id) === String(item.productId));
      if (operation === 'add' && idx < 0) items.push({ id: item.productId, handle: item.productHandle, title: item.productTitle, image: item.productImage||'', price: item.productPrice||'', addedAt: new Date().toISOString() });
      if (operation === 'remove' && idx >= 0) items.splice(idx, 1);
      saveWishlist(items);
      window.dispatchEvent(new CustomEvent('saitriq:wishlist-toast', { detail: { message: operation==='add'?'Added to wishlist':'Removed from wishlist' } }));
      return items;
    };

    const sync = async (operation, item) => {
      if (!customerAuthenticated) {
        try { await fetch(syncEndpoint, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body:JSON.stringify({ operation, visitorId:getVisitorId(), ...item }) }); } catch {}
        return persistLocal(operation, item);
      }
      // Handle limit reached
      const res = await fetch(syncEndpoint, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body:JSON.stringify({ operation, visitorId:getVisitorId(), ...item }) });
      if (res.status === 429) {
        const d = await res.json().catch(()=>({}));
        if (operation !== 'add') return getWishlist();
        announce(d.error || 'Monthly wishlist limit reached. Upgrade your plan.');
        return getWishlist();
      }
      if (!res.ok) { customerAuthenticated = false; return persistLocal(operation, item); }
      const data = await res.json();
      if (!Array.isArray(data.items)) { customerAuthenticated = false; return sync(operation, item); }
      const synced = data.items.map(s => ({ id:s.productId, handle:s.productHandle, title:s.productTitle, image:s.productImage||'', price:s.productPrice||'', addedAt:s.createdAt }));
      saveWishlist(synced);
      window.dispatchEvent(new CustomEvent('saitriq:wishlist-toast', { detail: { message: operation==='add'?'Added to wishlist':'Removed from wishlist' } }));
      return synced;
    };

    // Initial sync (single-flight, merges local guest items)
    const initialSync = (() => {
      if (window.saitriqWishlistSyncPromise) return window.saitriqWishlistSyncPromise;
      const run = (async () => {
        const res = await fetch(syncEndpoint, { credentials:'same-origin' }).catch(()=>null);
        if (!res || !res.ok) { refresh(); return; }
        const data = await res.json();
        customerAuthenticated = data.authenticated === true;
        if (!data.authenticated || !Array.isArray(data.items)) { refresh(); return; }
        let synced = data.items.map(s => ({ id:s.productId, handle:s.productHandle, title:s.productTitle, image:s.productImage||'', price:s.productPrice||'', addedAt:s.createdAt }));
        for (const item of getWishlist()) {
          if (!synced.some(s => String(s.id) === String(item.id))) {
            const merged = await sync('add', { productId:item.id, productHandle:item.handle, productTitle:item.title, productImage:item.image, productPrice:item.price });
            if (merged) synced = merged;
          }
        }
        saveWishlist(synced);
        refresh();
      })();
      window.saitriqWishlistSyncPromise = run.finally(() => { window.saitriqWishlistSyncPromise = null; });
      return window.saitriqWishlistSyncPromise;
    })();

    button.addEventListener('click', async () => {
      if (requestInFlight) return;
      requestInFlight = true; button.disabled = true;
      try {
        await initialSync;
        const saved = getWishlist().some(i => String(i.id) === String(productId));
        const result = await sync(saved ? 'remove' : 'add', { productId, productHandle, productTitle, productImage, productPrice });
        if (result) updateView(!saved);
      } catch (err) {
        console.error('Wishlist failed', err);
        announce('Wishlist is temporarily unavailable. Please try again.');
      } finally { button.disabled = false; requestInFlight = false; }
    });

    refresh();
    window.addEventListener('saitriq:wishlist-updated', refresh);
    window.addEventListener('storage', (e) => { if (e.key === storageKey) refresh(); });
  })();
</script>`}</code>
          </s-banner>
          <s-paragraph>
            Then open <code>sections/main-product.liquid</code> (or <code>product-template.liquid</code>),
            find the add-to-cart button and add below it:
          </s-paragraph>
          <s-banner tone="info"><code>{"{% render 'wishlist-button' %}"}</code></s-banner>
        </s-section>

        {/* ── Step 2: collection inject ── */}
        <s-section heading="Step 2 — Create snippets/wishlist-collection-inject.liquid">
          <s-paragraph>
            Create a snippet named <code>wishlist-collection-inject</code> and paste this code.
            Then in <code>layout/theme.liquid</code> add <code>{"{% render 'wishlist-collection-inject' %}"}</code> just before <code>{"</body>"}</code>.
          </s-paragraph>
          <s-banner tone="info">
            <code>{`{{ 'wishlist.css' | asset_url | stylesheet_tag }}

<!-- Button template: JS clones this onto every product card -->
<template id="sai-collection-btn-tpl">
  <button type="button" class="sai-wishlist sai-wishlist--collection"
    data-sai-collection-wishlist aria-label="Add to wishlist">
    <span class="sai-wishlist__icon sai-wishlist__icon--default" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
    <span class="sai-wishlist__icon sai-wishlist__icon--active" aria-hidden="true" style="display:none">
      <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
    </span>
  </button>
</template>

<script>
  (() => {
    if (window.saitriqWishlistCollectionLoaded) return;
    window.saitriqWishlistCollectionLoaded = true;

    const storageKey = 'saitriq_wishlist';
    const visitorStorageKey = 'saitriq_wishlist_visitor';
    const endpoint = '/apps/saitriq-wishlist';
    const tpl = document.getElementById('sai-collection-btn-tpl');
    if (!tpl) return;

    let customerAuthenticated = false;

    const readItems = () => { try { const v=JSON.parse(localStorage.getItem(storageKey)||'[]'); return Array.isArray(v)?v:[]; } catch{return[];} };
    const saveItems = (items) => { localStorage.setItem(storageKey,JSON.stringify(items)); window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated')); };
    const getVisitorId = () => { let id=localStorage.getItem(visitorStorageKey); if(!id){id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,14);localStorage.setItem(visitorStorageKey,id);} return id; };

    // Toast
    const announce = (message) => {
      let toast = document.querySelector('[data-sai-wishlist-toast]');
      if (!toast) { toast=document.createElement('div'); toast.dataset.saiWishlistToast=''; toast.className='sai-wishlist__toast'; toast.setAttribute('role','status'); document.body.append(toast); }
      toast.textContent = message;
      toast.classList.add('is-visible');
      clearTimeout(window.saitriqWishlistToastTimer);
      window.saitriqWishlistToastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
    };
    window.addEventListener('saitriq:wishlist-toast', (e) => { if (e.detail?.message) announce(e.detail.message); });

    // View — CSS handles icon, JS only toggles class
    const renderButton = (btn, productId) => {
      const saved = readItems().some((i) => String(i.id) === String(productId));
      btn.classList.toggle('is-active', saved);
      btn.setAttribute('aria-label', saved ? 'Remove from wishlist' : 'Add to wishlist');
    };

    const toLocalItem = (item) => ({ id:item.productId, handle:item.productHandle, title:item.productTitle, image:item.productImage||'', price:item.productPrice||'' });
    const persistLocal = (operation, item) => {
      const items = readItems();
      const idx = items.findIndex((s) => String(s.id) === String(item.productId));
      if (operation==='add'&&idx<0) items.push({...toLocalItem(item), addedAt:new Date().toISOString()});
      if (operation==='remove'&&idx>=0) items.splice(idx,1);
      saveItems(items);
      announce(operation==='add'?'Added to wishlist':'Removed from wishlist');
      return items;
    };

    const sync = async (operation, item) => {
      if (!customerAuthenticated) {
        try { await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({operation,visitorId:getVisitorId(),...item})}); } catch {}
        return persistLocal(operation, item);
      }
      const res = await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({operation,visitorId:getVisitorId(),...item})});
      if (res.status===429) {
        const d = await res.json().catch(()=>({}));
        if (operation!=='add') return readItems();
        announce(d.error||'Monthly wishlist limit reached.');
        return readItems();
      }
      const data = await res.json().catch(()=>({}));
      if (!res.ok||!Array.isArray(data.items)) { customerAuthenticated=false; return persistLocal(operation,item); }
      const synced = data.items.map((s)=>({id:s.productId,handle:s.productHandle,title:s.productTitle,image:s.productImage||'',price:s.productPrice||'',addedAt:s.createdAt}));
      saveItems(synced);
      announce(operation==='add'?'Added to wishlist':'Removed from wishlist');
      return synced;
    };

    const productCache = new Map();
    const productData = async (handle) => {
      if (productCache.has(handle)) return productCache.get(handle);
      const res = await fetch('/products/'+encodeURIComponent(handle)+'.js');
      if (!res.ok) throw new Error('Product not found');
      const p = await res.json();
      const d = {productId:String(p.id),productHandle:p.handle,productTitle:p.title,productImage:p.featured_image||p.images?.[0]||'',productPrice:p.price?(p.price/100).toFixed(2):''};
      productCache.set(handle,d);
      return d;
    };

    const detectAuth = async () => {
      try {
        const res = await fetch(endpoint,{credentials:'same-origin'});
        const data = await res.json().catch(()=>({}));
        customerAuthenticated = data.authenticated === true;
        if (customerAuthenticated && Array.isArray(data.items)) {
          const serverIds = new Set(data.items.map((i)=>String(i.productId)));
          readItems().filter((i)=>!serverIds.has(String(i.id))).forEach((local)=>{
            fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({operation:'add',visitorId:getVisitorId(),productId:local.id,productHandle:local.handle,productTitle:local.title,productImage:local.image,productPrice:local.price})}).catch(()=>{});
          });
        }
      } catch {}
    };

    const handleFromLink = (link) => { const m=new URL(link.href,location.origin).pathname.match(/^\\/products\\/([^/?#]+)/); return m?decodeURIComponent(m[1]):''; };

    const attach = async (link) => {
      const handle = handleFromLink(link);
      const card = link.closest('li,article,.card-wrapper,.product-card-wrapper,.card,.product-card,.grid__item,[class*="product-card"],[class*="product-item"],[class*="card--product"]');
      if (!handle||!card||card.dataset.saiWishlistAttaching||card.querySelector('[data-sai-collection-wishlist]')) return;
      card.dataset.saiWishlistAttaching = '1';
      const btn = tpl.content.cloneNode(true).querySelector('[data-sai-collection-wishlist]');
      if (!btn) { delete card.dataset.saiWishlistAttaching; return; }
      card.style.position = card.style.position || 'relative';
      card.append(btn);
      try {
        const item = await productData(handle);
        renderButton(btn, item.productId);
        btn.addEventListener('click', async (e) => {
          e.preventDefault(); e.stopPropagation();
          if (btn.disabled) return;
          btn.disabled = true;
          try { const saved=readItems().some((i)=>String(i.id)===String(item.productId)); await sync(saved?'remove':'add',item); renderButton(btn,item.productId); }
          catch(err){console.error('Collection wishlist failed',err);}
          finally { btn.disabled=false; }
        });
      } catch { btn.remove(); delete card.dataset.saiWishlistAttaching; }
    };

    const scan = () => [...document.querySelectorAll('a[href*="/products/"]')]
      .filter((a)=>handleFromLink(a))
      .forEach(attach);

    // Scan immediately, then again after auth resolves
    scan();
    detectAuth().finally(scan);
    new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
    window.addEventListener('storage',(e)=>{ if(e.key===storageKey) scan(); });
    window.addEventListener('saitriq:wishlist-updated',()=>{
      document.querySelectorAll('[data-sai-collection-wishlist]').forEach((btn)=>{
        const link = btn.parentElement?.querySelector('a[href*="/products/"]');
        if (!link) return;
        const handle = handleFromLink(link);
        if (handle && productCache.has(handle)) renderButton(btn, productCache.get(handle).productId);
      });
    });
  })();
</script>`}</code>
          </s-banner>
        </s-section>

        {/* ── Step 3: wishlist page ── */}
        <s-section heading="Step 3 — Create snippets/wishlist-page.liquid">
          <s-paragraph>
            Create a snippet named <code>wishlist-page</code>. The full snippet code is available in your theme extension files at{" "}
            <code>extensions/wishlist-product/snippets/wishlist-page.liquid</code> — copy its contents into your theme snippet.
            Then create <code>templates/page.wishlist.liquid</code> containing:
          </s-paragraph>
          <s-banner tone="info"><code>{"{% render 'wishlist-page' %}"}</code></s-banner>
          <s-paragraph>
            Customise columns, heading, and card class by passing variables:
          </s-paragraph>
          <s-banner tone="info">
            <code>{"{% render 'wishlist-page', heading: 'Saved items', columns: 3, card_class: 'product-card' %}"}</code>
          </s-banner>
        </s-section>

        {/* ── Optional: custom card template ── */}
        <s-section heading="Optional — Match your theme's product card layout">
          <s-paragraph>
            By default the wishlist page uses a simple card layout. To match your theme's exact
            product card design, add a <code>{"<template>"}</code> element anywhere on your wishlist
            page template with the attribute <code>data-sai-wishlist-page</code>.
            The app will clone it for each saved item instead of using the default card.
          </s-paragraph>
          <s-paragraph>
            Use these data attributes as hooks — the app fills them in automatically:
          </s-paragraph>
          <s-grid gap="small-200">
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-badge tone="info">data-sai-item-link</s-badge>
              <s-text>Sets <code>href="/products/{"{handle}"}"</code> on any <code>{"<a>"}</code></s-text>
            </s-stack>
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-badge tone="info">data-sai-item-image</s-badge>
              <s-text>Sets <code>src</code> and <code>alt</code> on an <code>{"<img>"}</code></s-text>
            </s-stack>
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-badge tone="info">data-sai-item-title</s-badge>
              <s-text>Sets the product title as text content</s-text>
            </s-stack>
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-badge tone="info">data-sai-item-price</s-badge>
              <s-text>Sets the product price as text content (hidden if "Show prices" is off)</s-text>
            </s-stack>
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-badge tone="info">data-sai-item-remove</s-badge>
              <s-text>Wires up the remove click handler (hidden if "Show remove" is off)</s-text>
            </s-stack>
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-badge tone="info">data-sai-item-product-id</s-badge>
              <s-text>Sets <code>data-product-id</code> attribute — Shopify numeric product ID. Useful for cart forms.</s-text>
            </s-stack>
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-badge tone="info">data-sai-item-variant-id</s-badge>
              <s-text>Sets <code>data-variant-id</code> and <code>value</code> — first available variant ID. Useful for <code>{"<input name=\"id\">"}</code> in cart forms.</s-text>
            </s-stack>
          </s-grid>
          <s-paragraph>Example — paste into <code>templates/page.wishlist.liquid</code>:</s-paragraph>
          <s-banner tone="info">
            <pre style={{fontSize:"0.8rem", whiteSpace:"pre-wrap"}}>{`<template data-sai-wishlist-page>
  <div class="card product-card">
    <a class="card__media" data-sai-item-link>
      <img class="card__image" data-sai-item-image>
    </a>
    <div class="card__content">
      <a class="card__heading" data-sai-item-link data-sai-item-title></a>
      <span class="card__price" data-sai-item-price></span>
      <!-- Add to cart form — variant ID auto-filled -->
      <form action="/cart/add" method="post">
        <input type="hidden" name="id" data-sai-item-variant-id>
        <button type="submit" class="card__add-to-cart">Add to cart</button>
      </form>
      <button class="card__btn" data-sai-item-remove>Remove</button>
    </div>
  </div>
</template>`}</pre>
          </s-banner>
          <s-paragraph>
            Any element can have multiple hooks — for example an <code>{"<a>"}</code> with both
            <code>data-sai-item-link</code> and <code>data-sai-item-title</code> gets both
            the href and the title text.
          </s-paragraph>
          <s-paragraph>
            Use <code>data-sai-item-variant-id</code> to add an <strong>Add to cart</strong> button
            directly on the wishlist page. The app fills in the first available variant ID automatically:
          </s-paragraph>
          <s-banner tone="info">
            <pre style={{fontSize:"0.8rem", whiteSpace:"pre-wrap"}}>{`<template data-sai-wishlist-page>
  <div class="card product-card">

    <!-- Product image linking to product page -->
    <a class="card__media" data-sai-item-link>
      <img class="card__image" data-sai-item-image>
    </a>

    <div class="card__content">
      <!-- Product title linking to product page -->
      <a class="card__heading" data-sai-item-link data-sai-item-title></a>

      <!-- Product price (hidden if "Show prices" is off in settings) -->
      <span class="card__price" data-sai-item-price></span>

      <!-- Add to cart form — variant ID is filled automatically -->
      <form action="/cart/add" method="post">
        <input type="hidden" name="id" data-sai-item-variant-id>
        <input type="hidden" name="quantity" value="1">
        <button type="submit" name="add" class="btn button">
          Add to cart
        </button>
      </form>

      <!-- Remove from wishlist button -->
      <button class="card__btn" data-sai-item-remove>Remove</button>
    </div>

  </div>
</template>`}</pre>
          </s-banner>
          <s-paragraph><strong>Where to add this template:</strong></s-paragraph>
          <s-grid gap="small-200">
            <s-stack direction="inline" gap="small-200" alignItems="flex-start">
              <s-badge tone="success">App blocks</s-badge>
              <s-paragraph>
                Go to <strong>Online Store → Themes → Edit code → Templates → page.wishlist.liquid</strong>.
                Paste the <code>{"<template>"}</code> anywhere in the file, before the Wishlist page section.
              </s-paragraph>
            </s-stack>
            <s-stack direction="inline" gap="small-200" alignItems="flex-start">
              <s-badge tone="info">Manual install</s-badge>
              <s-paragraph>
                Paste the <code>{"<template>"}</code> anywhere inside <code>templates/page.wishlist.liquid</code>
                or at the top of your <code>snippets/wishlist-page.liquid</code> file.
              </s-paragraph>
            </s-stack>
          </s-grid>
          <s-paragraph>
            The <code>{"<template>"}</code> is invisible — it never renders on the page itself.
            The wishlist JS finds it, clones it for each saved item, and fills in the product data automatically.
          </s-paragraph>
          <s-banner tone="warning">
            The cart form works for simple products. For products with multiple variants
            (size, color, etc.) the app picks the first available variant. If you need
            full variant selection, use <code>data-sai-item-product-id</code> to read the
            product ID and build your own variant picker.
          </s-banner>
        </s-section>

        {/* ── Step 4: header link ── */}
        <s-section heading="Step 4 — Header wishlist link with live count (optional)">
          <s-paragraph>
            The header link cannot be added with a single render tag because the snippet file
            lives in the app extension, not in your theme's snippet folder.
            Instead, copy this code directly into your header section file
            (<code>sections/header.liquid</code>) wherever you want the link to appear:
          </s-paragraph>
          <s-banner tone="info">
            <code>{`<a href="/pages/wishlist" class="header-wishlist-link" aria-label="View wishlist" title="Wishlist">
  <span class="header-wishlist-icon-wrapper" aria-hidden="true">
    <svg class="header-wishlist-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span class="header-wishlist-badge" data-sai-wishlist-count>0</span>
  </span>
  <span class="hidden hide header-wishlist-text">Wishlist</span>
</a>

<script>
  (() => {
    const count = document.querySelector('[data-sai-wishlist-count]');
    if (!count) return;
    const update = () => {
      try {
        const items = JSON.parse(localStorage.getItem('saitriq_wishlist') || '[]');
        count.textContent = Array.isArray(items) ? items.length : '0';
      } catch { count.textContent = '0'; }
    };
    update();
    window.addEventListener('storage', (e) => { if (e.key === 'saitriq_wishlist') update(); });
    window.addEventListener('saitriq:wishlist-updated', update);
  })();
</script>

<style>
  .header-wishlist-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: inherit;
    text-decoration: none;
    font-weight: 600;
  }
  .header-wishlist-icon-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .header-wishlist-svg {
    display: block;
    transition: transform 0.2s ease, color 0.2s ease;
  }
  .header-wishlist-link:hover .header-wishlist-svg {
    transform: scale(1.08);
    color: #D4AF37;
  }
  .header-wishlist-badge {
    position: absolute;
    top: -6px;
    right: -8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.15rem;
    height: 1.15rem;
    padding: 0 0.2rem;
    border-radius: 999px;
    background: #D4AF37;
    color: #0B0F19;
    font-size: 0.65rem;
    font-weight: 700;
    line-height: 1;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }
</style>`}</code>
          </s-banner>
          <s-paragraph>
            If you prefer a separate snippet file, create <code>snippets/wishlist-header-link.liquid</code>
            in your theme (not the app) and paste the code there. Then render it with{" "}
            <code>{"{% render 'wishlist-header-link' %}"}</code>.
          </s-paragraph>
        </s-section>
      </s-section>

      {/* ── Usage tracking ── */}
      <s-section heading="Usage tracking">
        <s-paragraph>
          Each successful product save counts once toward your monthly limit.
          Removing an item is tracked for analytics but does not restore a save credit.
          Guest saves (shoppers not logged in) are also counted.
          View your current usage on the <s-link href="/app">Dashboard</s-link> or the{" "}
          <s-link href="/app/wishlist">Wishlist activity</s-link> page.
        </s-paragraph>
      </s-section>

      <s-section heading="Troubleshooting">
        <s-grid gap="base">
          <s-box border="base" borderRadius="base" padding="base">
            <s-grid gap="small-200">
              <s-text><strong>Could not find asset snippets/wishlist-header-link.liquid</strong></s-text>
              <s-paragraph>This file is in the app extension, not your theme. Paste the code directly into your header section file as shown in Step 4 above.</s-paragraph>
            </s-grid>
          </s-box>
          <s-box border="base" borderRadius="base" padding="base">
            <s-grid gap="small-200">
              <s-text><strong>Heart button not appearing on collection page</strong></s-text>
              <s-paragraph>The inject snippet looks for product card links inside <code>li</code>, <code>article</code>, <code>.card</code>, <code>.grid__item</code>, and elements with <code>product-card</code> or <code>product-item</code> in the class name. If your theme uses a different wrapper, add <code>position: relative</code> to it.</s-paragraph>
            </s-grid>
          </s-box>
          <s-box border="base" borderRadius="base" padding="base">
            <s-grid gap="small-200">
              <s-text><strong>Wishlist not syncing for logged-in customers</strong></s-text>
              <s-paragraph>Confirm the app proxy is active. Go to your Shopify Partner dashboard → App setup and verify the proxy URL. Run <code>shopify app deploy</code> if you recently changed it.</s-paragraph>
            </s-grid>
          </s-box>
          <s-box border="base" borderRadius="base" padding="base">
            <s-grid gap="small-200">
              <s-text><strong>Items disappear after login</strong></s-text>
              <s-paragraph>Expected on first sync. Guest items saved before login are merged into the customer account automatically.</s-paragraph>
            </s-grid>
          </s-box>
          <s-box border="base" borderRadius="base" padding="base">
            <s-grid gap="small-200">
              <s-text><strong>CSS conflicts</strong></s-text>
              <s-paragraph>All classes are prefixed with <code>.sai-wishlist</code>. Override them in your theme CSS.</s-paragraph>
            </s-grid>
          </s-box>
        </s-grid>
      </s-section>

    </s-page>
  );
}

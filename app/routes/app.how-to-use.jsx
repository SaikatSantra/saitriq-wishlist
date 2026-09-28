export default function HowToUsePage() {
  return (
    <s-page heading="How to use Saitriq Wishlist">

      {/* ── Method 1: App Blocks ── */}
      <s-section heading="Method 1 — App blocks (recommended)">
        <s-paragraph>
          Works with any Online Store 2.0 theme (Dawn, Sense, Craft, Refresh, etc.).
          No code editing required.
        </s-paragraph>
        <s-grid gap="small-200">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-badge tone="info">1</s-badge>
            <s-paragraph>Go to <strong>Online Store → Themes → Customize</strong>.</s-paragraph>
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
            <s-paragraph>Add a header link to <code>/pages/wishlist</code> in your navigation menu.</s-paragraph>
          </s-stack>
        </s-grid>
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
    data-product-price="{{ wp.price | money | escape }}">
    <span class="sai-wishlist__icon" aria-hidden="true">♡</span>
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
    const productId = button.dataset.productId;
    const productHandle = button.dataset.productHandle;
    const productTitle = button.dataset.productTitle;
    const productImage = button.dataset.productImage;
    const productPrice = button.dataset.productPrice;
    let customerAuthenticated = false;
    let requestInFlight = false;
    const getWishlist = () => { try { const v = JSON.parse(localStorage.getItem(storageKey)||'[]'); return Array.isArray(v)?v:[]; } catch{return[];} };
    const saveWishlist = (items) => { try{localStorage.setItem(storageKey,JSON.stringify(items));}catch{} window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated')); };
    const getVisitorId = () => { let id=localStorage.getItem(visitorStorageKey); if(!id){id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,14);localStorage.setItem(visitorStorageKey,id);} return id; };
    const updateView = (saved) => { button.classList.toggle('is-active',saved); button.querySelector('.sai-wishlist__icon').textContent=saved?'♥':'♡'; button.querySelector('.sai-wishlist__label').textContent=saved?'Saved':'Add to wishlist'; };
    const refresh = () => updateView(getWishlist().some(i=>String(i.id)===String(productId)));
    const post = (body) => fetch(syncEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({visitorId:getVisitorId(),...body})});
    const sync = async (operation,item) => {
      if(!customerAuthenticated){post({operation,...item}).catch(()=>{}); const items=getWishlist(); const idx=items.findIndex(i=>String(i.id)===String(item.productId)); if(operation==='add'&&idx<0)items.push({id:item.productId,handle:item.productHandle,title:item.productTitle,image:item.productImage||'',price:item.productPrice||'',addedAt:new Date().toISOString()}); if(operation==='remove'&&idx>=0)items.splice(idx,1); saveWishlist(items); return items; }
      const res = await post({operation,...item}); if(!res.ok){customerAuthenticated=false;return sync(operation,item);} const data=await res.json(); if(!Array.isArray(data.items)){customerAuthenticated=false;return sync(operation,item);} const synced=data.items.map(s=>({id:s.productId,handle:s.productHandle,title:s.productTitle,image:s.productImage||'',price:s.productPrice||'',addedAt:s.createdAt})); saveWishlist(synced); return synced;
    };
    (async()=>{ const res=await fetch(syncEndpoint,{credentials:'same-origin'}).catch(()=>null); if(!res||!res.ok){refresh();return;} const data=await res.json(); customerAuthenticated=data.authenticated===true; if(data.authenticated&&Array.isArray(data.items))saveWishlist(data.items.map(s=>({id:s.productId,handle:s.productHandle,title:s.productTitle,image:s.productImage||'',price:s.productPrice||'',addedAt:s.createdAt}))); refresh(); })();
    button.addEventListener('click',async()=>{ if(requestInFlight)return; requestInFlight=true; button.disabled=true; try{ const saved=getWishlist().some(i=>String(i.id)===String(productId)); await sync(saved?'remove':'add',{productId,productHandle,productTitle,productImage,productPrice}); updateView(!saved); }catch(e){console.error('Wishlist failed',e);}finally{button.disabled=false;requestInFlight=false;} });
    refresh();
    window.addEventListener('saitriq:wishlist-updated',refresh);
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
<script>
  (() => {
    if (window.saitriqWishlistCollectionLoaded) return;
    window.saitriqWishlistCollectionLoaded = true;
    const storageKey = 'saitriq_wishlist';
    const visitorStorageKey = 'saitriq_wishlist_visitor';
    const endpoint = '/apps/saitriq-wishlist';
    let customerAuthenticated = false;
    const readItems = () => { try{const v=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(v)?v:[];}catch{return[];} };
    const saveItems = (items) => { localStorage.setItem(storageKey,JSON.stringify(items)); window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated')); };
    const getVisitorId = () => { let id=localStorage.getItem(visitorStorageKey); if(!id){id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,14);localStorage.setItem(visitorStorageKey,id);} return id; };
    const cache = new Map();
    const productData = async (handle) => { if(cache.has(handle))return cache.get(handle); const r=await fetch('/products/'+encodeURIComponent(handle)+'.js'); if(!r.ok)throw new Error('not found'); const p=await r.json(); const d={id:String(p.id),handle:p.handle,title:p.title,image:p.featured_image||p.images?.[0]||'',price:p.price?(p.price/100).toFixed(2):''}; cache.set(handle,d); return d; };
    const sync = async (operation,item) => { if(!customerAuthenticated){try{await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({operation,visitorId:getVisitorId(),...item})});}catch{} const items=readItems(); const idx=items.findIndex(i=>String(i.id)===String(item.id)); if(operation==='add'&&idx<0)items.push({...item,addedAt:new Date().toISOString()}); if(operation==='remove'&&idx>=0)items.splice(idx,1); saveItems(items); return items; } const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({operation,visitorId:getVisitorId(),...item})}); const data=await res.json().catch(()=>({})); if(!res.ok||!Array.isArray(data.items)){customerAuthenticated=false;return sync(operation,item);} const synced=data.items.map(s=>({id:s.productId,handle:s.productHandle,title:s.productTitle,image:s.productImage||'',price:s.productPrice||'',addedAt:s.createdAt})); saveItems(synced); return synced; };
    const handleFromLink = (link) => { const m=new URL(link.href,location.origin).pathname.match(/^\\/products\\/([^/?#]+)/); return m?decodeURIComponent(m[1]):''; };
    const renderBtn = (btn,item) => { const saved=readItems().some(e=>String(e.id)===String(item.id)); btn.textContent=saved?'♥':'♡'; btn.classList.toggle('is-active',saved); btn.setAttribute('aria-label',saved?'Remove from wishlist':'Add to wishlist'); };
    const attach = async (link) => { const handle=handleFromLink(link); if(!handle)return; const card=link.closest('li,article,.card,.product-card,.grid__item,[class*="product-item"]'); if(!card||card.querySelector('[data-sai-col-btn]'))return; const btn=document.createElement('button'); btn.type='button'; btn.className='sai-wishlist sai-wishlist--collection'; btn.dataset.saiColBtn=''; card.style.position=card.style.position||'relative'; card.append(btn); try{ const item=await productData(handle); renderBtn(btn,item); btn.addEventListener('click',async(e)=>{ e.preventDefault();e.stopPropagation(); if(btn.disabled)return; btn.disabled=true; try{const saved=readItems().some(i=>String(i.id)===String(item.id));await sync(saved?'remove':'add',item);renderBtn(btn,item);}catch(err){console.error(err);}finally{btn.disabled=false;} }); window.addEventListener('saitriq:wishlist-updated',()=>renderBtn(btn,item)); }catch{btn.remove();} };
    const scan = () => [...document.querySelectorAll('a[href*="/products/"]')].filter((l,i,a)=>a.findIndex(x=>handleFromLink(x)===handleFromLink(l))===i).forEach(attach);
    fetch(endpoint,{credentials:'same-origin'}).then(r=>r.json()).then(d=>{customerAuthenticated=d.authenticated===true;}).catch(()=>{}).finally(scan);
    new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
  })();
</script>`}</code>
          </s-banner>
        </s-section>

        {/* ── Step 3: wishlist page ── */}
        <s-section heading="Step 3 — Create snippets/wishlist-page.liquid">
          <s-paragraph>
            Create a snippet named <code>wishlist-page</code> and paste the code from the{" "}
            <s-link href="/app/api-docs">Developer API page</s-link> (Theme JS reference section).
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
  <span aria-hidden="true">♥</span>
  <span class="hidden hide header-wishlist-text">Wishlist</span>
  <span data-sai-wishlist-count>0</span>
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
  [data-sai-wishlist-count] {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.35rem;
    height: 1.35rem;
    padding: 0 0.25rem;
    border-radius: 999px;
    background: currentColor;
    font-size: 0.75rem;
    line-height: 1;
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

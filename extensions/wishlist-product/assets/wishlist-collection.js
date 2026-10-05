(() => {
  const whenEmbedReady = (fn) => {
    if (window.saitriqEmbedEnabled) { fn(); return; }
    document.addEventListener('saitriq:embed-ready', fn, { once: true });
  };

  whenEmbedReady(() => {
    if (window.saitriqWishlistCollectionLoaded) return;
    window.saitriqWishlistCollectionLoaded = true;

    const storageKey        = 'saitriq_wishlist';
    const visitorStorageKey = 'saitriq_wishlist_visitor';
    const endpoint          = '/apps/saitriq-wishlist';

    const tpl = document.querySelector('[data-sai-collection-tpl]');
    if (!tpl) return;

    // Read the translations from the template's data attributes
    const locales = {
      addLabel:    tpl.dataset.labelAdd    || 'Add to wishlist',
      removeLabel: tpl.dataset.labelRemove || 'Remove from wishlist',
      addedMsg:    tpl.dataset.msgAdded    || 'Added to wishlist',
      removedMsg:  tpl.dataset.msgRemoved  || 'Removed from wishlist',
      limitMsg:    tpl.dataset.msgLimit    || 'Wishlist limit reached'
    };

    let customerAuthenticated = false;

    const readItems = () => {
      try {
        const v = JSON.parse(localStorage.getItem(storageKey) || '[]');
        return Array.isArray(v) ? v : [];
      } catch { return []; }
    };

    const saveItems = (items) => {
      localStorage.setItem(storageKey, JSON.stringify(items));
      window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated'));
    };

    const renderButton = (button, productId) => {
      const saved = readItems().some((i) => String(i.id) === String(productId));
      button.classList.toggle('is-active', saved);
      button.setAttribute('aria-label', saved ? locales.removeLabel : locales.addLabel);
    };

    const getVisitorId = () => {
      let id = localStorage.getItem(visitorStorageKey);
      if (!id) {
        id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
        localStorage.setItem(visitorStorageKey, id);
      }
      return id;
    };

    const toLocalItem = (item) => ({
      id: item.productId, handle: item.productHandle,
      title: item.productTitle, image: item.productImage || '',
      price: item.productPrice || ''
    });

    const persistLocalFallback = (operation, item) => {
      const items = readItems();
      const idx = items.findIndex((s) => String(s.id) === String(item.productId));
      if (operation === 'add' && idx < 0) items.push({ ...toLocalItem(item), addedAt: new Date().toISOString() });
      if (operation === 'remove' && idx >= 0) items.splice(idx, 1);
      saveItems(items);
      window.dispatchEvent(new CustomEvent('saitriq:wishlist-toast', {
        detail: {
          message: operation === 'add' ? locales.addedMsg : locales.removedMsg,
          image: item.productImage || '',
          title: item.productTitle || ''
        }
      }));
      return items;
    };

    const trackGuest = async (operation, item) => {
      try {
        const res = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ operation, visitorId: getVisitorId(), ...item })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.tracked) return;
      } catch {}
    };

    const sync = async (operation, item) => {
      if (!customerAuthenticated) {
        await trackGuest(operation, item);
        return persistLocalFallback(operation, item);
      }
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ operation, visitorId: getVisitorId(), ...item })
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        if (operation === 'remove' || operation === 'clear') return readItems();
        window.dispatchEvent(new CustomEvent('saitriq:wishlist-toast', {
          detail: { message: data.error || locales.limitMsg }
        }));
        return readItems();
      }

      if (!res.ok) {
        customerAuthenticated = false;
        return persistLocalFallback(operation, item);
      }
      const data = await res.json();
      if (!Array.isArray(data.items)) {
        customerAuthenticated = false;
        return persistLocalFallback(operation, item);
      }
      const synced = data.items.map((s) => ({
        id: s.productId, handle: s.productHandle, title: s.productTitle,
        image: s.productImage || '', price: s.productPrice || '', addedAt: s.createdAt
      }));
      saveItems(synced);
      window.dispatchEvent(new CustomEvent('saitriq:wishlist-toast', {
        detail: {
          message: operation === 'add' ? locales.addedMsg : locales.removedMsg,
          image: item.productImage || '',
          title: item.productTitle || ''
        }
      }));
      return synced;
    };

    const productCache = new Map();
    const productData = async (handle) => {
      if (productCache.has(handle)) return productCache.get(handle);
      const res = await fetch(`/products/${encodeURIComponent(handle)}.js`);
      if (!res.ok) throw new Error(`Product lookup failed: ${res.status}`);
      const p = await res.json();
      const data = {
        productId:     String(p.id),
        productHandle: p.handle,
        productTitle:  p.title,
        productImage:  p.featured_image || p.images?.[0] || '',
        productPrice:  p.price ? (p.price / 100).toFixed(2) : ''
      };
      productCache.set(handle, data);
      return data;
    };

    const handleFromLink = (link) => {
      const match = new URL(link.href, window.location.origin).pathname.match(/^\/products\/([^/]+)/);
      return match ? decodeURIComponent(match[1]) : '';
    };

    const productLinks = () => [...document.querySelectorAll('a[href*="/products/"]')]
      .filter((a) => handleFromLink(a));

    const CARD_SELECTOR = [
      'li', 'article',
      '.card-wrapper', 
      '.product-card-wrapper',
      '.card', 
      '.product-card', 
      '.grid__item',
      '[class*="product-item"]', 
      '[class*="card--product"]',
    ].join(', ');

    const attach = async (link) => {
      const handle = handleFromLink(link);
      const card = link.closest(CARD_SELECTOR);
      if (!handle || !card || card.dataset.saiWishlistAttaching || card.querySelector('[data-sai-collection-wishlist]')) return;

      card.dataset.saiWishlistAttaching = '1';

      const button = tpl.content.cloneNode(true).querySelector('[data-sai-collection-wishlist]');
      if (!button) { delete card.dataset.saiWishlistAttaching; return; }

      card.style.position = 'relative';
      card.append(button);

      try {
        const item = await productData(handle);
        renderButton(button, item.productId);

        button.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (button.disabled) return;
          button.disabled = true;
          try {
            const saved = readItems().some((i) => String(i.id) === String(item.productId));
            await sync(saved ? 'remove' : 'add', item);
            renderButton(button, item.productId);
          } catch (err) {
            console.error('Collection wishlist request failed', err);
          } finally {
            button.disabled = false;
          }
        });
      } catch (err) {
        button.remove();
        delete card.dataset.saiWishlistAttaching;
        console.error('Collection wishlist product lookup failed', err);
      }
    };

    const detectAuthentication = async () => {
      try {
        const res = await fetch(endpoint, { credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        customerAuthenticated = data.authenticated === true;
        if (customerAuthenticated && Array.isArray(data.items)) {
          const serverIds = new Set(data.items.map((i) => String(i.productId)));
          for (const local of readItems()) {
            if (!serverIds.has(String(local.id))) {
              fetch(endpoint, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                  operation: 'add', visitorId: getVisitorId(),
                  productId: local.id, productHandle: local.handle,
                  productTitle: local.title, productImage: local.image,
                  productPrice: local.price
                })
              }).catch(() => {});
            }
          }
        }
      } catch {}
    };

    const scan = () => productLinks().forEach(attach);

    scan();
    detectAuthentication().finally(scan);
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    
    window.addEventListener('storage', (e) => { if (e.key === storageKey) scan(); });

    window.addEventListener('saitriq:wishlist-updated', () => {
      document.querySelectorAll('[data-sai-collection-wishlist]').forEach((btn) => {
        const card = btn.parentElement;
        const link = card && card.querySelector('a[href*="/products/"]');
        if (!link) return;
        const handle = handleFromLink(link);
        if (handle && productCache.has(handle)) {
          renderButton(btn, productCache.get(handle).productId);
        }
      });
    });

  }); 
})();
(() => {
  const whenEmbedReady = (fn) => {
    if (window.saitriqEmbedEnabled) { fn(); return; }
    let done = false;
    const runOnce = () => {
      if (done) return;
      done = true;
      fn();
    };
    document.addEventListener('saitriq:embed-ready', runOnce, { once: true });
    setTimeout(runOnce, 800);
  };

  whenEmbedReady(() => {
    if (window.saitriqWishlistCollectionLoaded) return;
    window.saitriqWishlistCollectionLoaded = true;

    const storageKey        = 'saitriq_wishlist';
    const visitorStorageKey = 'saitriq_wishlist_visitor';
    const endpoint          = '/apps/saitriq-wishlist';

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

    const getVisitorId = () => {
      let id = localStorage.getItem(visitorStorageKey);
      if (!id) {
        id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
        localStorage.setItem(visitorStorageKey, id);
      }
      return id;
    };

    const toLocalItem = (item) => ({
      id: item.productId,
      variantId: item.variantId || '',
      handle: item.productHandle,
      title: item.productTitle,
      image: item.productImage || '',
      price: item.productPrice || ''
    });

    const formatMoney = (cents) => {
      if (cents == null || isNaN(cents)) return '';
      const amount = Number(cents) / 100;
      const moneyFormat = window.Shopify?.money_format || window.theme?.moneyFormat;
      if (window.Shopify?.formatMoney && moneyFormat) {
        try {
          return window.Shopify.formatMoney(cents, moneyFormat);
        } catch (e) {}
      }
      const currency = window.Shopify?.currency?.active || 'USD';
      try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
      } catch (e) {
        return `$${amount.toFixed(2)}`;
      }
    };

    const persistLocalFallback = (operation, item, locales) => {
      const items = readItems();
      const idx = items.findIndex((s) => String(s.id) === String(item.productId));
      if (operation === 'add' && idx < 0) {
        items.push({ ...toLocalItem(item), addedAt: new Date().toISOString() });
      }
      if (operation === 'remove' && idx >= 0) {
        items.splice(idx, 1);
      }
      saveItems(items);
      window.dispatchEvent(new CustomEvent('saitriq:wishlist-toast', {
        detail: {
          message: operation === 'add' ? (locales.addedMsg || 'Added to wishlist') : (locales.removedMsg || 'Removed from wishlist'),
          image: item.productImage || '',
          title: item.productTitle || ''
        }
      }));
      return items;
    };

    const trackGuest = async (operation, item) => {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ operation, visitorId: getVisitorId(), ...item })
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 429 || data.limitReached || data.stopped) {
          window.saitriqWishlistStopped = true;
          return { limitReached: true, stopped: true, error: data.error };
        }
        if (res.ok && data.tracked) return data;
      } catch {}
      return null;
    };

    const sync = async (operation, item, locales) => {
      if (window.saitriqWishlistStopped) return readItems();

      if (!customerAuthenticated) {
        const guestResult = await trackGuest(operation, item);
        if (guestResult?.limitReached || guestResult?.stopped) {
          window.saitriqWishlistStopped = true;
          return readItems();
        }
        return persistLocalFallback(operation, item, locales);
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ operation, visitorId: getVisitorId(), ...item })
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 429 || data.limitReached || data.stopped) {
        window.saitriqWishlistStopped = true;
        return readItems();
      }

      if (!res.ok || !Array.isArray(data.items)) {
        customerAuthenticated = false;
        return persistLocalFallback(operation, item, locales);
      }

      const synced = data.items.map((s) => ({
        id: s.productId,
        handle: s.productHandle,
        title: s.productTitle,
        image: s.productImage || '',
        price: s.productPrice || '',
        addedAt: s.createdAt
      }));
      saveItems(synced);
      window.dispatchEvent(new CustomEvent('saitriq:wishlist-toast', {
        detail: {
          message: operation === 'add' ? (locales.addedMsg || 'Added to wishlist') : (locales.removedMsg || 'Removed from wishlist'),
          image: item.productImage || '',
          title: item.productTitle || ''
        }
      }));
      return synced;
    };

    const productCache = new Map();
    const productData = async (handle) => {
      const cleanHandle = String(handle || '').replace(/^\/?products\//, '').split('?')[0].split('#')[0].replace(/\/$/, '').trim();
      if (!cleanHandle) return null;
      if (productCache.has(cleanHandle)) return productCache.get(cleanHandle);
      const root = window.Shopify?.routes?.root || '/';
      const res = await fetch(`${root}products/${encodeURIComponent(cleanHandle)}.js`);
      if (!res.ok) throw new Error(`Product lookup failed: ${res.status}`);
      const p = await res.json();
      const firstVariant = p.variants?.find((v) => v.available) || p.variants?.[0];
      const data = {
        productId:        String(p.id),
        productVariantId: firstVariant ? String(firstVariant.id) : '',
        productHandle:    p.handle,
        productTitle:     p.title,
        productImage:     p.featured_image || p.images?.[0] || '',
        productPrice:     p.price ? formatMoney(p.price) : ''
      };
      productCache.set(cleanHandle, data);
      return data;
    };

    const handleFromLink = (link) => {
      if (!link || !link.href) return '';
      try {
        const pathname = new URL(link.href, window.location.origin).pathname;
        const match = pathname.match(/\/products\/([^/?#]+)/);
        return match ? decodeURIComponent(match[1]) : '';
      } catch {
        return '';
      }
    };

    const updateButtonView = (button, productId, locales) => {
      if (!productId) return;
      const isSaved = readItems().some((i) => String(i.id) === String(productId));
      button.classList.toggle('is-active', isSaved);
      button.setAttribute('aria-label', isSaved ? locales.removeLabel : locales.addLabel);
    };

    // Initialize individual button rendered by theme app extension or snippet
    const initButton = async (button) => {
      if (button.dataset.saiInitialized === 'true') return;
      button.dataset.saiInitialized = 'true';

      const container = button.closest('[data-sai-collection-item]') || button;

      const locales = {
        addLabel:    container.dataset.labelAdd    || button.dataset.labelAdd    || 'Add to wishlist',
        removeLabel: container.dataset.labelRemove || button.dataset.labelRemove || 'Remove from wishlist',
        addedMsg:    container.dataset.msgAdded    || button.dataset.msgAdded    || 'Added to wishlist',
        removedMsg:  container.dataset.msgRemoved  || button.dataset.msgRemoved  || 'Removed from wishlist'
      };

      let productId        = container.dataset.productId        || button.dataset.productId;
      let productVariantId = container.dataset.productVariantId || button.dataset.productVariantId || '';
      let productHandle    = container.dataset.productHandle    || button.dataset.productHandle;
      let productTitle     = container.dataset.productTitle     || button.dataset.productTitle;
      let productImage     = container.dataset.productImage     || button.dataset.productImage || '';
      let productPrice     = container.dataset.productPrice     || button.dataset.productPrice;

      // Ensure parent card container is relative positioning context for clean absolute positioning
      const parentCard = button.closest('li, article, .card-wrapper, .product-card, .card, [class*="product-"]') || button.parentElement;
      if (parentCard) {
        const computed = window.getComputedStyle(parentCard);
        if (computed.position === 'static') {
          parentCard.style.position = 'relative';
        }
      }

      // If image is missing, grab from card DOM
      if (!productImage && parentCard) {
        const cardImg = parentCard.querySelector('img[src*="/products/"], img[src*="cdn.shopify.com"], img');
        if (cardImg) {
          productImage = cardImg.currentSrc || cardImg.src || '';
        }
      }

      // If handle is missing, inspect the nearest product link in the parent card
      if (!productHandle) {
        const link = parentCard?.querySelector('a[href*="/products/"]');
        if (link) {
          productHandle = handleFromLink(link);
        }
      }

      // If productId or variantId or title or image is missing but handle exists, fetch product metadata
      if ((!productId || !productVariantId || !productTitle || !productImage) && productHandle) {
        try {
          const fetched = await productData(productHandle);
          if (fetched) {
            productId        = productId        || fetched.productId;
            productVariantId = productVariantId || fetched.productVariantId;
            productTitle     = productTitle     || fetched.productTitle;
            productImage     = productImage     || fetched.productImage;
            productPrice     = productPrice     || fetched.productPrice;
            container.dataset.productId        = productId;
            container.dataset.productVariantId = productVariantId;
            container.dataset.productImage     = productImage;
            container.dataset.productTitle     = productTitle;
            button.dataset.productId           = productId;
            button.dataset.productVariantId    = productVariantId;
            button.dataset.productImage        = productImage;
            button.dataset.productTitle        = productTitle;
          }
        } catch (err) {}
      }

      if (productId) {
        button.dataset.productId = productId;
        updateButtonView(button, productId, locales);
      }

      button.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (button.disabled || window.saitriqWishlistStopped) return;
        button.disabled = true;

        try {
          // Resolve image from card DOM if still missing
          if (!productImage && parentCard) {
            const cardImg = parentCard.querySelector('img[src*="/products/"], img[src*="cdn.shopify.com"], img');
            if (cardImg) {
              productImage = cardImg.currentSrc || cardImg.src || '';
            }
          }

          // Resolve product data if not yet loaded
          if ((!productId || !productVariantId || !productImage) && productHandle) {
            const fetched = await productData(productHandle);
            if (fetched) {
              productId        = productId        || fetched.productId;
              productVariantId = productVariantId || fetched.productVariantId;
              productTitle     = productTitle     || fetched.productTitle;
              productImage     = productImage     || fetched.productImage;
              productPrice     = productPrice     || fetched.productPrice;
              button.dataset.productId        = productId;
              button.dataset.productVariantId = productVariantId;
              button.dataset.productImage     = productImage;
              button.dataset.productTitle     = productTitle;
            }
          }

          if (!productId) return;

          const saved = readItems().some((i) => String(i.id) === String(productId));
          const itemPayload = {
            productId,
            variantId:     productVariantId || '',
            productHandle: productHandle || '',
            productTitle:  productTitle  || '',
            productImage:  productImage  || '',
            productPrice:  productPrice  || ''
          };

          await sync(saved ? 'remove' : 'add', itemPayload, locales);
          updateButtonView(button, productId, locales);
        } catch (err) {
          console.error('[saitriq-wishlist] Button click failed', err);
        } finally {
          button.disabled = false;
        }
      });
    };

    const detectAuthentication = async () => {
      try {
        const res = await fetch(endpoint, { credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        if (data.limitReached || data.stopped) {
          window.saitriqWishlistStopped = true;
          saveItems([]);
          return;
        }
        customerAuthenticated = data.authenticated === true;
        if (customerAuthenticated && Array.isArray(data.items)) {
          const serverIds = new Set(data.items.map((i) => String(i.productId)));
          for (const local of readItems()) {
            if (!serverIds.has(String(local.id))) {
              fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                  operation: 'add',
                  visitorId: getVisitorId(),
                  productId: local.id,
                  variantId: local.variantId || '',
                  productHandle: local.handle,
                  productTitle: local.title,
                  productImage: local.image,
                  productPrice: local.price
                })
              }).catch(() => {});
            }
          }
        }
      } catch {}
    };

    const scan = () => {
      document.querySelectorAll('[data-sai-collection-wishlist]:not([data-sai-initialized="true"])').forEach(initButton);
    };

    scan();
    detectAuthentication().finally(scan);

    // Watch for new elements added dynamically (e.g. infinite scroll, AJAX filters)
    new MutationObserver(() => {
      scan();
    }).observe(document.body, { childList: true, subtree: true });

    // Shopify Theme Editor live updates
    document.addEventListener('shopify:section:load', scan);
    document.addEventListener('shopify:block:select', scan);

    // Update active states when wishlist changes
    const refreshAllButtons = () => {
      document.querySelectorAll('[data-sai-collection-wishlist]').forEach((btn) => {
        const id = btn.dataset.productId || btn.closest('[data-sai-collection-item]')?.dataset.productId;
        if (id) {
          const saved = readItems().some((i) => String(i.id) === String(id));
          btn.classList.toggle('is-active', saved);
        }
      });
    };

    window.addEventListener('saitriq:wishlist-updated', refreshAllButtons);
    window.addEventListener('storage', (e) => {
      if (e.key === storageKey) refreshAllButtons();
    });
  });
})();

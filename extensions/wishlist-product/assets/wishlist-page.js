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
    const page = document.querySelector('[data-sai-wishlist-page]');
    if (!page) return;

    page.hidden = false; // Reveal page — embed confirmed enabled

    const storageKey = 'saitriq_wishlist';
    const visitorStorageKey = 'saitriq_wishlist_visitor';
    const syncEndpoint = '/apps/saitriq-wishlist';
    let localRevision = 0;
    let customerAuthenticated = false;

    // Read settings & localized strings from HTML dataset
    let settings = {
      heading: page.dataset.settingHeading || 'My Wishlist',
      emptyMessage: page.dataset.settingEmptyMsg || 'Your wishlist is empty',
      columns: Number(page.dataset.settingColumns) || 4,
      showPrices: page.dataset.settingShowPrices !== 'false',
      showRemove: page.dataset.settingShowRemove !== 'false',
      buttonLabel: page.dataset.settingBtnLabel || 'Remove',
      showAddToCart: page.dataset.settingShowAtc === 'true',
      addToCartLabel: page.dataset.settingAtcLabel || 'Add to cart',
      cardClass: '',
      customCss: ''
    };

    const locales = {
      soldOut: page.dataset.locSoldOut || 'Sold out',
      atcError: page.dataset.locAtcError || 'Error adding to cart',
      addedToCart: page.dataset.locAddedCart || 'Added to cart',
      removed: page.dataset.locRemoved || 'Removed from wishlist',
      cleared: page.dataset.locCleared || 'Wishlist cleared'
    };

    const itemsContainer = page.querySelector('[data-sai-wishlist-items]');
    const emptyMessage = page.querySelector('[data-sai-wishlist-empty]');
    const clearButton = page.querySelector('[data-sai-wishlist-clear]');
    const shareButton = page.querySelector('[data-sai-wishlist-share]');

    if (!itemsContainer || !emptyMessage) return;

    const getItems = () => {
      try {
        const items = JSON.parse(localStorage.getItem(storageKey) || '[]');
        return Array.isArray(items) ? items : [];
      } catch (error) {
        return [];
      }
    };

    const getVisitorId = () => {
      let visitorId = localStorage.getItem(visitorStorageKey);
      if (!visitorId) {
        visitorId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
        localStorage.setItem(visitorStorageKey, visitorId);
      }
      return visitorId;
    };

    const persistLocalFallback = (operation, item = {}) => {
      const items = getItems();
      const itemId = String(item.productId || item.id || '');
      const index = items.findIndex((saved) => String(saved.id) === itemId);

      if (operation === 'add' && itemId && index < 0) {
        items.push({
          id: itemId,
          handle: item.productHandle || item.handle || '',
          title: item.productTitle || item.title || 'Product',
          image: item.productImage || item.image || '',
          price: item.productPrice || item.price || '',
          addedAt: new Date().toISOString()
        });
      }
      if (operation === 'remove' && index >= 0) items.splice(index, 1);

      localStorage.setItem(storageKey, JSON.stringify(items));
      window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated'));
      render();
      return items;
    };

    const trackGuest = async (operation, item = {}) => {
      try {
        const response = await fetch(syncEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ operation, visitorId: getVisitorId(), ...item })
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.tracked === true) return;
      } catch (error) {}
    };

    const applySettings = (data) => {
      if (!data?.settings) return;
      settings = { ...settings, ...data.settings };
      let customStyle = document.querySelector('[data-sai-wishlist-custom-css]');
      if (!customStyle) {
        customStyle = document.createElement('style');
        customStyle.dataset.saiWishlistCustomCss = '';
        document.head.append(customStyle);
      }
      customStyle.textContent = settings.customCss || '';
      render();
    };

    let settingsPromise;
    const loadAppSettings = async () => {
      if (settingsPromise) return settingsPromise;
      settingsPromise = (async () => {
        const response = await fetch(`${syncEndpoint}?api=settings`, { credentials: 'same-origin' }).catch(() => null);
        if (response?.ok) applySettings(await response.json().catch(() => null));
      })();
      return settingsPromise;
    };

    const syncItems = async () => {
      if (window.saitriqWishlistSyncPromise) {
        return window.saitriqWishlistSyncPromise;
      }

      const syncRun = (async () => {
        const response = await fetch(syncEndpoint, { credentials: 'same-origin' });
        if (!response.ok) {
          await loadAppSettings();
          render();
          return;
        }
        const data = await response.json().catch(() => ({}));
        if (data.limitReached || data.stopped) {
          window.saitriqWishlistStopped = true;
          localStorage.setItem(storageKey, '[]');
          render();
          return;
        }
        customerAuthenticated = data.authenticated === true;
        applySettings(data);

        if (!data.authenticated || !Array.isArray(data.items)) {
          if (!data.settings) await loadAppSettings();
          render();
          return;
        }

        let items = data.items.map((saved) => ({
          id: saved.productId,
          variantId: saved.variantId || '',
          variantTitle: saved.variantTitle || '',
          handle: saved.productHandle,
          title: saved.productTitle,
          image: saved.productImage || '',
          price: saved.productPrice || '',
          addedAt: saved.createdAt
        }));

        localStorage.setItem(storageKey, JSON.stringify(items));
        render();
      })();

      window.saitriqWishlistSyncPromise = syncRun.finally(() => {
        window.saitriqWishlistSyncPromise = null;
      });
      return window.saitriqWishlistSyncPromise;
    };

    const esc = (str) => {
      const div = document.createElement('div');
      div.textContent = String(str ?? '');
      return div.innerHTML;
    };

    const _productDataCache = new Map();
    const fetchProductData = async (handle, savedVariantId = '') => {
      const resolveVariant = (product) => {
        const variants = product.variants || [];
        const savedVariant = variants.find((variant) => String(variant.id) === String(savedVariantId));
        const variant = savedVariant || variants.find((entry) => entry.available) || variants[0];
        return {
          productId: String(product.id),
          variantId: variant ? String(variant.id) : null,
          variantTitle: variant?.title || '',
          variantAvailable: variant?.available === true,
        };
      };

      if (_productDataCache.has(handle)) return resolveVariant(_productDataCache.get(handle));
      try {
        const res = await fetch(`/products/${encodeURIComponent(handle)}.js`);
        if (!res.ok) return null;
        const p = await res.json();
        _productDataCache.set(handle, p);
        return resolveVariant(p);
      } catch { return null; }
    };

    const refreshCartUi = (cartData) => {
      const cartComponent = document.querySelector('cart-drawer, cart-notification');
      if (cartComponent && typeof cartComponent.renderContents === 'function') {
        cartComponent.renderContents(cartData);
      } else {
        Object.entries(cartData.sections || {}).forEach(([sectionId, markup]) => {
          if (!markup) return;
          const rendered = new DOMParser().parseFromString(markup, 'text/html');
          const current = document.getElementById(`shopify-section-${sectionId}`) || document.getElementById(sectionId);
          const replacement = current?.id ? rendered.getElementById(current.id) : null;
          if (current && replacement) current.replaceWith(replacement);
        });
      }

      document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart: cartData } }));
      document.dispatchEvent(new CustomEvent('cart:refresh', { detail: { cart: cartData } }));
    };

    itemsContainer.addEventListener('submit', async (event) => {
      const form = event.target.closest('.sai-wishlist-page__atc-form');
      if (!form) return;
      event.preventDefault();

      const button = form.querySelector('button[type="submit"]');
      const variantId = form.querySelector('[name="id"]')?.value;
      if (!button || !variantId || button.disabled) return;

      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      try {
        const root = window.Shopify?.routes?.root || '/';
        const response = await fetch(`${root}cart/add.js`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            items: [{ id: variantId, quantity: Number(form.querySelector('[name="quantity"]')?.value) || 1 }],
            sections: 'cart-drawer,cart-icon-bubble,cart-notification',
            sections_url: window.location.pathname
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.description || data.message || locales.atcError);

        refreshCartUi(data);
        window.dispatchEvent(new CustomEvent('saitriq:wishlist-toast', {
          detail: { message: locales.addedToCart }
        }));
      } catch (error) {
        window.dispatchEvent(new CustomEvent('saitriq:wishlist-toast', {
          detail: { message: error.message || locales.atcError }
        }));
      } finally {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    });

    const buildCard = async (item) => {
      const productData = await fetchProductData(item.handle, item.variantId);

      const card = document.createElement('div');
      card.className = `sai-wishlist-page__item ${settings.cardClass || ''}`.trim();
      card.innerHTML = `
        <div class="sai-wishlist-page__media">
          <a href="/products/${encodeURIComponent(item.handle)}" class="sai-wishlist-page__img-link">
            <img data-sai-wishlist-image alt="${esc(item.title) || 'Product'}" loading="lazy">
          </a>
          <button type="button" class="sai-wishlist-page__card-remove" aria-label="Remove from wishlist" title="Remove">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="sai-wishlist-page__info">
          <a class="sai-wishlist-page__title" href="/products/${encodeURIComponent(item.handle)}">${esc(item.title) || 'Product'}</a>
          ${productData?.variantTitle && productData.variantTitle !== 'Default Title' ? `<div class="sai-wishlist-page__variant">${esc(productData.variantTitle)}</div>` : ''}
          ${settings.showPrices && item.price ? `<div class="sai-wishlist-page__price">${esc(item.price)}</div>` : ''}
          <div class="sai-wishlist-page__card-actions">
            ${
              settings.showAddToCart && productData?.variantId
                ? `<form class="sai-wishlist-page__atc-form" action="/cart/add" method="post">
                    <input type="hidden" name="id" value="${productData.variantId}">
                    <input type="hidden" name="quantity" value="1">
                    <button type="submit" name="add" class="sai-wishlist-page__add-to-cart" ${!productData.variantAvailable ? 'disabled' : ''}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                      <span>${!productData.variantAvailable ? esc(locales.soldOut) : esc(settings.addToCartLabel || 'Add to cart')}</span>
                    </button>
                  </form>`
                : `<a href="/products/${encodeURIComponent(item.handle)}" class="sai-wishlist-page__view-btn">View Product</a>`
            }
          </div>
        </div>
      `;

      const removeBtn = card.querySelector('.sai-wishlist-page__card-remove');
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleRemove(item, removeBtn);
        });
      }

      const image = card.querySelector('[data-sai-wishlist-image]');
      image.src = item.image || `/products/${encodeURIComponent(item.handle)}.js`;

      image.addEventListener('error', async () => {
        if (image.dataset.fallbackAttempted) return;
        image.dataset.fallbackAttempted = 'true';
        try {
          const response = await fetch(`/products/${encodeURIComponent(item.handle)}.js`);
          if (!response.ok) return;
          const product = await response.json();
          const fallback = product.featured_image || product.images?.[0];
          if (fallback) image.src = fallback;
        } catch (error) {}
      }, { once: true });

      return card;
    };

    const handleRemove = async (item, removeButton) => {
      removeButton.disabled = true;
      localRevision += 1;
      try {
        if (!customerAuthenticated) {
          await trackGuest('remove', {
            productId: item.id,
            productHandle: item.handle,
            variantId: item.variantId || '',
            productTitle: item.title,
            productImage: item.image
          });
          const nextItems = getItems().filter((s) => !(String(s.id) === String(item.id) && String(s.variantId || '') === String(item.variantId || '')));
          localStorage.setItem(storageKey, JSON.stringify(nextItems));
          window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated'));
          window.dispatchEvent(new CustomEvent('saitriq:wishlist-toast', { detail: { message: locales.removed } }));
          render();
          return;
        }

        const response = await fetch(syncEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            operation: 'remove',
            visitorId: getVisitorId(),
            productId: item.id,
            variantId: item.variantId || '',
            productHandle: item.handle,
            productTitle: item.title,
            productImage: item.image
          })
        });

        if (response.status === 429) {
          window.saitriqWishlistStopped = true;
          localStorage.setItem(storageKey, '[]');
          render();
          return;
        }
        if (!response.ok) throw new Error('Wishlist remove request failed');
        const data = await response.json();
        if (!Array.isArray(data.items)) throw new Error('Wishlist remove response was invalid');

        const serverItems = data.items.map((s) => ({
          id: s.productId,
          variantId: s.variantId || '',
          variantTitle: s.variantTitle || '',
          handle: s.productHandle,
          title: s.productTitle,
          image: s.productImage || '',
          price: s.productPrice || '',
          addedAt: s.createdAt
        }));
        localStorage.setItem(storageKey, JSON.stringify(serverItems));

        window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated'));
        window.dispatchEvent(new CustomEvent('saitriq:wishlist-toast', { detail: { message: locales.removed } }));
        render();
      } catch (error) {
        console.error('Wishlist remove failed', error);
      } finally {
        removeButton.disabled = false;
      }
    };

    const render = async () => {
      if (render._pending) {
        render._again = true;
        return;
      }
      render._pending = true;
      try {
        const items = getItems();
        const titleEl = page.querySelector('.wislist-page-title');
        if (titleEl) titleEl.textContent = settings.heading || 'My Wishlist';

        const countBadge = page.querySelector('[data-sai-wishlist-page-count]');
        if (countBadge) {
          countBadge.textContent = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
          countBadge.hidden = items.length === 0;
        }

        const emptyTitle = emptyMessage.querySelector('.sai-wishlist-page__empty-title');
        if (emptyTitle && settings.emptyMessage) {
          emptyTitle.textContent = settings.emptyMessage;
        }

        itemsContainer.style.setProperty('--sai-wishlist-columns', settings.columns);
        itemsContainer.replaceChildren();

        emptyMessage.hidden = items.length > 0;
        if (clearButton) clearButton.hidden = items.length === 0;
        if (shareButton) shareButton.hidden = items.length === 0;

        const cards = await Promise.all(items.map((item) => buildCard(item)));
        cards.forEach((card) => itemsContainer.append(card));
      } finally {
        render._pending = false;
        if (render._again) {
          render._again = false;
          render();
        }
      }
    };

    if (clearButton) {
      clearButton.addEventListener('click', async () => {
        if (window.saitriqWishlistStopped) return;
        if (clearButton.disabled || getItems().length === 0) return;
        clearButton.disabled = true;
        localRevision += 1;
        try {
          if (!customerAuthenticated) {
            await trackGuest('clear');
            localStorage.setItem(storageKey, '[]');
            window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated'));
            window.dispatchEvent(new CustomEvent('saitriq:wishlist-toast', {
              detail: { message: locales.cleared }
            }));
            render();
            return;
          }

          const response = await fetch(syncEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ operation: 'clear', visitorId: getVisitorId() })
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.authenticated || !Array.isArray(data.items)) {
            throw new Error(data.error || 'Wishlist clear request failed');
          }

          localStorage.setItem(storageKey, JSON.stringify([]));
          window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated'));
          render();
        } catch (error) {
          console.error('Clear failed', error);
        } finally {
          clearButton.disabled = false;
        }
      });
    }

    const buildShareUrl = () => {
      const items = getItems();
      const payload = items.map((item) => ({
        i: item.id,
        h: item.handle,
        t: item.title,
        m: item.image,
        p: item.price
      }));
      const token = btoa(encodeURIComponent(JSON.stringify(payload)));
      const url = new URL(window.location.href);
      url.searchParams.set('share', token);
      url.searchParams.delete('logged_in_customer_id');
      return url.toString();
    };

    const loadSharedItems = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('share');
        if (!token) return null;
        const payload = JSON.parse(decodeURIComponent(atob(token)));
        if (!Array.isArray(payload)) return null;
        return payload.map((item) => ({
          id: item.i,
          handle: item.h,
          title: item.t,
          image: item.m || '',
          price: item.p || '',
          addedAt: ''
        }));
      } catch {
        return null;
      }
    };

    const sharedItems = loadSharedItems();
    const isSharedView = sharedItems !== null;

    if (isSharedView) {
      localStorage.setItem(storageKey, JSON.stringify(sharedItems));
      settings.showRemove = false;
      settings.heading = 'Shared wishlist';
      if (clearButton) clearButton.hidden = true;
      if (shareButton) shareButton.hidden = true;
    }

    if (shareButton) {
      shareButton.addEventListener('click', async () => {
        const shareUrl = buildShareUrl();
        if (navigator.share) {
          try {
            await navigator.share({ title: 'My wishlist', url: shareUrl });
            return;
          } catch {}
        }
        try {
          await navigator.clipboard.writeText(shareUrl);
          const original = shareButton.textContent;
          shareButton.textContent = 'Link copied!';
          setTimeout(() => { shareButton.textContent = original; }, 2500);
        } catch {
          prompt('Copy this link to share your wishlist:', shareUrl);
        }
      });
    }

    render();
    loadAppSettings().catch(() => {}).then(render);
    if (!isSharedView) syncItems().catch(() => {});

    window.addEventListener('saitriq:wishlist-updated', render);
    window.addEventListener('storage', (event) => {
      if (event.key === storageKey) render();
    });
  });
})();

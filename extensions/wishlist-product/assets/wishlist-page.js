(() => {
  const whenEmbedReady = (fn) => {
    if (window.saitriqEmbedEnabled) { fn(); return; }
    document.addEventListener('saitriq:embed-ready', fn, { once: true });
  };

  whenEmbedReady(() => {
    const page = document.querySelector('[data-sai-wishlist-page]');
    if (!page) return;

    page.hidden = false; // Reveal page — embed is confirmed enabled

    const storageKey = 'saitriq_wishlist';
    const visitorStorageKey = 'saitriq_wishlist_visitor';
    const syncEndpoint = '/apps/saitriq-wishlist';
    let localRevision = 0;
    let customerAuthenticated = false;    

    // Read settings & localized strings from HTML dataset
    console.log('wishlist-page.js: reading settings from dataset', page.dataset);
    let settings = {
      heading: page.dataset.settingHeading || '',
      emptyMessage: page.dataset.settingEmptyMsg || '',
      columns: Number(page.dataset.settingColumns) || 3,
      showPrices: page.dataset.settingShowPrices === 'true',
      showRemove: page.dataset.settingShowRemove === 'true',
      buttonLabel: page.dataset.settingBtnLabel || 'Remove',
      showAddToCart: page.dataset.settingShowAtc === 'true',
      addToCartLabel: page.dataset.settingAtcLabel || 'Add to cart',
      cardClass: 'sai-wishlist-page__item',
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
    
    if (!itemsContainer || !emptyMessage || !clearButton) return;

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
        console.warn('Wishlist analytics tracking unavailable', response.status, data.error || '');
      } catch (error) {
        console.warn('Wishlist analytics tracking unavailable', error);
      }
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
          console.warn('Wishlist proxy unavailable during sync; using local storage fallback.', response.status);
          await loadAppSettings();
          render();
          return;
        }
        const data = await response.json();
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

    const buildActions = (item, productData, existingRemoveButton = null) => {
      const actions = document.createElement('div');
      actions.className = 'sai-wishlist-page__card-actions';

      if (settings.showAddToCart && productData?.variantId) {
        const form = document.createElement('form');
        form.className = 'sai-wishlist-page__atc-form';
        form.action = '/cart/add';
        form.method = 'post';
        form.innerHTML = `<input type="hidden" name="id"><input type="hidden" name="quantity" value="1"><button type="submit" name="add" class="sai-wishlist-page__add-to-cart button">${esc(settings.addToCartLabel)}</button>`;
        form.querySelector('[name="id"]').value = productData.variantId;
        
        const addButton = form.querySelector('button');
        addButton.disabled = !productData.variantAvailable;
        if (!productData.variantAvailable) addButton.textContent = locales.soldOut;
        actions.append(form);
      }

      if (settings.showRemove) {
        const removeButton = existingRemoveButton || document.createElement('button');
        removeButton.type = 'button';
        removeButton.classList.add('sai-wishlist-page__remove');
        if (!removeButton.textContent.trim()) removeButton.textContent = settings.buttonLabel;
        removeButton.addEventListener('click', () => handleRemove(item, removeButton));
        actions.append(removeButton);
      } else if (existingRemoveButton) {
        existingRemoveButton.hidden = true;
      }

      return actions;
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
      card.className = `sai-wishlist-page__item product-grid__item ${settings.cardClass || ''}`.trim();
      card.innerHTML = `
        <a href="/products/${encodeURIComponent(item.handle)}">
          <img data-sai-wishlist-image alt="" loading="lazy">
        </a>
        <div class="sai-wishlist-page__info">
          <a class="sai-wishlist-page__title" href="/products/${encodeURIComponent(item.handle)}">${esc(item.title) || 'Product'}</a>
          ${productData?.variantTitle && productData.variantTitle !== 'Default Title' ? `<div class="sai-wishlist-page__variant">${esc(productData.variantTitle)}</div>` : ''}
          ${settings.showPrices && item.price ? `<div class="sai-wishlist-page__price">${esc(item.price)}</div>` : ''}
        </div>
      `;
      
      const image = card.querySelector('[data-sai-wishlist-image]');
      image.alt = item.title || 'Product';
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
        } catch (error) {
          console.error('Wishlist image fallback failed', error);
        }
      }, { once: true });
      
      card.querySelector('.sai-wishlist-page__info').append(buildActions(item, productData));
      return card;
    };

    const handleRemove = async (item, removeButton) => {
      removeButton.disabled = true;
      localRevision += 1;
      try {
        if (!customerAuthenticated) {
          await trackGuest('remove', {
            productId: item.id, productHandle: item.handle,
            variantId: item.variantId || '',
            productTitle: item.title, productImage: item.image
          });
          localStorage.setItem(storageKey, JSON.stringify(getItems().filter((s) => !(String(s.id) === String(item.id) && String(s.variantId || '') === String(item.variantId || '')))));
          window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated'));
          window.dispatchEvent(new CustomEvent('saitriq:wishlist-toast', { detail: { message: locales.removed } }));
          return;
        }
        
        const response = await fetch(syncEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ operation: 'remove', visitorId: getVisitorId(), productId: item.id, variantId: item.variantId || '', productHandle: item.handle, productTitle: item.title, productImage: item.image })
        });
        
        if (!response.ok) throw new Error('Wishlist remove request failed');
        const data = await response.json();
        if (!Array.isArray(data.items)) throw new Error('Wishlist remove response was invalid');
        
        const serverItems = data.items.map((s) => ({ id: s.productId, variantId: s.variantId || '', variantTitle: s.variantTitle || '', handle: s.productHandle, title: s.productTitle, image: s.productImage || '', price: s.productPrice || '', addedAt: s.createdAt }));
        localStorage.setItem(storageKey, JSON.stringify(serverItems));
        
        window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated'));
        window.dispatchEvent(new CustomEvent('saitriq:wishlist-toast', { detail: { message: locales.removed } }));
      } catch (error) {
        emptyMessage.textContent = error.message;
        emptyMessage.hidden = false;
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
        page.querySelector('h2').textContent = settings.heading;
        emptyMessage.textContent = settings.emptyMessage;
        itemsContainer.style.setProperty('--sai-wishlist-columns', settings.columns);
        itemsContainer.replaceChildren();
        
        emptyMessage.hidden = items.length > 0;
        clearButton.hidden = items.length === 0;
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

    clearButton.addEventListener('click', async () => {
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
          console.error('Wishlist clear proxy request failed', { status: response.status, body: data });
          throw new Error(data.error || 'Wishlist clear request failed');
        }
        
        localStorage.setItem(storageKey, JSON.stringify(data.items.map((item) => ({
          id: item.productId,
          variantId: item.variantId || '',
          variantTitle: item.variantTitle || '',
          handle: item.productHandle,
          title: item.productTitle,
          image: item.productImage || '',
          price: item.productPrice || '',
          addedAt: item.createdAt
        }))));
        
        window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated'));
      } catch (error) {
        emptyMessage.textContent = error.message;
        emptyMessage.hidden = false;
      } finally {
        clearButton.disabled = false;
      }
    });

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
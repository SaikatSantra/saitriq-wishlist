(() => {
  const whenEmbedReady = (fn) => {
    if (window.saitriqEmbedEnabled) fn();
    else document.addEventListener('saitriq:embed-ready', fn, { once: true });
  };

  whenEmbedReady(() => {
    const storageKey = 'saitriq_wishlist';
    const visitorStorageKey = 'saitriq_wishlist_visitor';
    const syncEndpoint = '/apps/saitriq-wishlist';

    // Global state shared across all buttons on the page
    let customerAuthenticated = false;

    // Helper functions
    const getWishlist = () => {
      try {
        const value = JSON.parse(localStorage.getItem(storageKey) || '[]');
        return Array.isArray(value) ? value : [];
      } catch {
        return [];
      }
    };

    const saveWishlist = (items) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(items));
        window.dispatchEvent(new CustomEvent('saitriq:wishlist-updated'));
      } catch {}
    };

    const getVisitorId = () => {
      let id = localStorage.getItem(visitorStorageKey);
      if (!id) {
        id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
        localStorage.setItem(visitorStorageKey, id);
      }
      return id;
    };

    const itemKey = (item) => `${String(item.id)}::${String(item.variantId || '')}`;

    // Initialization for individual buttons
    const initButton = (container) => {
      if (container.dataset.initialized === 'true') return;
      container.dataset.initialized = 'true';
      container.hidden = false;

      const button = container.querySelector('[data-sai-wishlist-button]');
      const labelEl = container.querySelector('[data-sai-wishlist-label]');
      if (!button) return;

      const productId = container.dataset.productId;
      const productHandle = container.dataset.productHandle;
      const productTitle = container.dataset.productTitle;
      const productImage = container.dataset.productImage;
      const productPrice = container.dataset.productPrice;
      
      const productScope = button.closest('product-info, .shopify-section') || document;
      const getVariantInput = () => productScope.querySelector('form[action*="/cart/add"] [name="id"]') || productScope.querySelector('[name="id"]');
      const getVariantId = () => String(getVariantInput()?.value || container.dataset.productVariantId || '').trim();
      
      // Load locales from dataset
      const labelAdd = container.dataset.labelAdd || 'Add to wishlist';
      const labelSaved = container.dataset.labelSaved || 'Saved';
      const locAdded = container.dataset.locAdded || 'Added to wishlist';
      const locRemoved = container.dataset.locRemoved || 'Removed from wishlist';
      const locLimit = container.dataset.locLimit || 'Wishlist limit reached';
      const locError = container.dataset.locError || 'Wishlist is temporarily unavailable';

      let requestInFlight = false;

      const updateView = (isSaved) => {
        button.classList.toggle('is-active', isSaved);
        button.setAttribute('aria-label', isSaved ? labelSaved : labelAdd);
        if (labelEl) labelEl.textContent = isSaved ? labelSaved : labelAdd;
      };

      const refresh = () => {
        const variantId = getVariantId();
        const saved = getWishlist().some(item => itemKey(item) === itemKey({ id: productId, variantId }));
        updateView(saved);
      };

      const persistLocalFallback = (operation, item) => {
        const items = getWishlist();
        const index = items.findIndex(
          saved => itemKey(saved) === itemKey({ id: item.productId, variantId: item.variantId })
        );

        if (operation === 'add' && index < 0) {
          items.push({
            id: item.productId,
            variantId: item.variantId || '',
            variantTitle: item.variantTitle || '',
            handle: item.productHandle,
            title: item.productTitle,
            image: item.productImage || '',
            price: item.productPrice || '',
            addedAt: new Date().toISOString()
          });
        }

        if (operation === 'remove' && index >= 0) {
          items.splice(index, 1);
        }

        saveWishlist(items);

        window.saitriqWishlistToast?.({
          message: operation === 'add' ? locAdded : locRemoved,
          image: item.productImage || '',
          title: item.productTitle || ''
        });

        return items;
      };

      const trackGuest = async (operation, item) => {
        try {
          const res = await fetch(syncEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
              operation,
              visitorId: getVisitorId(),
              ...item
            })
          });

          const data = await res.json().catch(() => ({}));
          if (res.ok && data.tracked) return data;
        } catch {}

        return null;
      };

      const sync = async (operation, item) => {
        if (!customerAuthenticated) {
          await trackGuest(operation, item);
          return persistLocalFallback(operation, item);
        }

        const res = await fetch(syncEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            operation,
            visitorId: getVisitorId(),
            ...item
          })
        });

        if (res.status === 429) {
          const data = await res.json().catch(() => ({}));

          if (operation === 'remove' || operation === 'clear') {
            window.saitriqWishlistToast?.({ message: locRemoved });
            return getWishlist();
          }

          window.saitriqWishlistToast?.({ message: data.error || locLimit });
          return getWishlist();
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

        const synced = data.items.map(item => ({
          id: item.productId,
          variantId: item.variantId || '',
          variantTitle: item.variantTitle || '',
          handle: item.productHandle,
          title: item.productTitle,
          image: item.productImage || '',
          price: item.productPrice || '',
          addedAt: item.createdAt
        }));

        saveWishlist(synced);

        window.saitriqWishlistToast?.({
          message: operation === 'add' ? locAdded : locRemoved,
          image: item.productImage || '',
          title: item.productTitle || ''
        });

        return synced;
      };

      const syncExistingItems = async () => {
        if (window.saitriqWishlistSyncPromise) {
          return window.saitriqWishlistSyncPromise;
        }

        const run = (async () => {
          const res = await fetch(syncEndpoint, { credentials: 'same-origin' });
          if (!res.ok) return;

          const data = await res.json();
          customerAuthenticated = data.authenticated === true;

          if (!data.authenticated || !Array.isArray(data.items)) return;

          let synced = data.items.map(item => ({
            id: item.productId,
            variantId: item.variantId || '',
            variantTitle: item.variantTitle || '',
            handle: item.productHandle,
            title: item.productTitle,
            image: item.productImage || '',
            price: item.productPrice || '',
            addedAt: item.createdAt
          }));

          for (const item of getWishlist()) {
            if (!synced.some(saved => itemKey(saved) === itemKey(item))) {
              const merged = await sync('add', {
                productId: item.id,
                variantId: item.variantId || '',
                variantTitle: item.variantTitle || '',
                productHandle: item.handle,
                productTitle: item.title,
                productImage: item.image,
                productPrice: item.price
              });

              if (merged) synced = merged;
            }
          }

          saveWishlist(synced);
          refresh();
        })();

        window.saitriqWishlistSyncPromise = run.finally(() => {
          window.saitriqWishlistSyncPromise = null;
        });

        return window.saitriqWishlistSyncPromise;
      };

      refresh();

      const initialSync = syncExistingItems().catch(() => {});

      window.addEventListener('saitriq:wishlist-updated', refresh);
      window.addEventListener('storage', (e) => {
        if (e.key === storageKey) refresh();
      });
      
      productScope.addEventListener('change', refresh);
      productScope.addEventListener('input', refresh);
      productScope.addEventListener('variant:change', refresh);

      button.addEventListener('click', async () => {
        if (requestInFlight) return;

        requestInFlight = true;
        button.disabled = true;

        try {
          await initialSync;

          const variantId = getVariantId();
          const variantData = { id: productId, variantId };
          const saved = getWishlist().some(item => itemKey(item) === itemKey(variantData));

          const result = await sync(saved ? 'remove' : 'add', {
            productId,
            variantId,
            productHandle,
            productTitle,
            productImage,
            productPrice
          });

          if (result) updateView(!saved);
        } catch (error) {
          console.error('Wishlist request failed', error);
          window.saitriqWishlistToast?.({ message: locError });
        } finally {
          button.disabled = false;
          requestInFlight = false;
        }
      });
    };

    // Initialize all existing buttons on the page
    document.querySelectorAll('[data-sai-wishlist]').forEach(initButton);

    // Watch for new buttons added dynamically (e.g. quick view modals)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
          document.querySelectorAll('[data-sai-wishlist]:not([data-initialized="true"])').forEach(initButton);
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

  });
})();
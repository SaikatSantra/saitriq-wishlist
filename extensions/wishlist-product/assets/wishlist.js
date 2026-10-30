(() => {
  const endpoint = '/apps/saitriq-wishlist';
  const storageKey = 'saitriq_wishlist';
  const visitorStorageKey = 'saitriq_wishlist_visitor';

  /* ── 1. Toast Notification ────────────────────────────────────────── */
  const applyToastSettings = (settings) => {
    if (!settings) return;
    const root = document.documentElement;

    if (settings.toastBg)    root.style.setProperty('--sai-toast-bg',    settings.toastBg);
    if (settings.toastColor) root.style.setProperty('--sai-toast-color', settings.toastColor);

    const pos = settings.toastPosition || 'top-left';
    root.style.setProperty('--sai-toast-top',    pos.startsWith('top')    ? '1rem' : 'auto');
    root.style.setProperty('--sai-toast-bottom', pos.startsWith('bottom') ? '1rem' : 'auto');
    root.style.setProperty('--sai-toast-left',   pos.endsWith('left')     ? '1rem' : 'auto');
    root.style.setProperty('--sai-toast-right',  pos.endsWith('right')    ? '1rem' : 'auto');

    const slideY = pos.startsWith('top') ? '-0.5rem' : '0.5rem';
    root.style.setProperty('--sai-toast-slide', slideY);
  };

  const initWishlistToast = () => {
    if (window.saitriqWishlistToastReady) return;
    window.saitriqWishlistToastReady = true;

    const showToast = (detail = {}) => {
      const { message, image, title } = detail;
      if (!message) return;

      let toast = document.querySelector('[data-sai-wishlist-toast]');
      if (!toast) {
        toast = document.createElement('div');
        toast.dataset.saiWishlistToast = '';
        toast.className = 'sai-wishlist__toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.append(toast);
      }

      if (image || title) {
        toast.innerHTML = `
          <div class="sai-wishlist__toast-inner">
            ${image ? `<img class="sai-wishlist__toast-img" src="${image}" alt="" aria-hidden="true">` : ''}
            <div class="sai-wishlist__toast-body">
              <span class="sai-wishlist__toast-label">${message}</span>
              ${title ? `<span class="sai-wishlist__toast-title">${title}</span>` : ''}
            </div>
          </div>
        `;
      } else {
        toast.textContent = message;
      }

      toast.classList.add('is-visible');
      clearTimeout(window.saitriqWishlistToastTimer);
      window.saitriqWishlistToastTimer = setTimeout(() => {
        toast.classList.remove('is-visible');
      }, 2200);
    };

    window.saitriqWishlistToast = showToast;
    window.addEventListener('saitriq:wishlist-toast', (event) => {
      if (event.detail?.message) {
        showToast(event.detail);
      }
    });
  };

  initWishlistToast();

  /* ── 2. Header Wishlist Link & Counter ────────────────────────────── */
  const updateAllHeaderCounts = () => {
    let countNum = 0;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(stored)) countNum = stored.length;
    } catch (error) {
      console.warn('[saitriq-wishlist] Could not read saved wishlist items:', error);
    }
    document.querySelectorAll('[data-sai-wishlist-count]').forEach((el) => {
      el.textContent = String(countNum);
    });
  };

  const createHeaderWishlistLink = () => {
    const link = document.createElement('a');
    link.id = 'sai-wishlist-header-link';
    link.className = 'sai-wishlist-header__link header__icon header__icon--wishlist link focus-inset';
    link.href = '/pages/wishlist';
    link.setAttribute('aria-label', 'View wishlist');
    link.setAttribute('title', 'Wishlist');
    link.setAttribute('data-sai-wishlist-auto', '');

    const icon = document.createElement('span');
    icon.className = 'sai-wishlist-header__icon';
    icon.setAttribute('aria-hidden', 'true');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('fill', 'none');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
    icon.append(svg);

    const count = document.createElement('span');
    count.className = 'sai-wishlist-header__count';
    count.setAttribute('data-sai-wishlist-count', '');
    icon.append(count);

    const label = document.createElement('span');
    label.className = 'sai-wishlist-header__label';
    label.textContent = 'Wishlist';
    link.append(icon, label);

    return link;
  };

  const applyHeaderSelector = (settings) => {
    // If merchant already manually placed {% render 'wishlist-header-link' %}, do not duplicate
    const manualLink = document.querySelector('.header-wishlist-link:not([data-sai-wishlist-auto])');
    if (manualLink) {
      updateAllHeaderCounts();
      return;
    }

    const customSelector = typeof settings?.headerSelector === 'string'
      ? settings.headerSelector.trim()
      : '';

    const DEFAULT_HEADER_SELECTORS = [
      '.header__icons',
      '.header-actions',
      '.header__actions',
      '.header-icons',
      '.site-header__icons-wrapper',
      '.site-header__icons',
      '.site-header__actions',
      'header .header__icon--cart',
      'header a[href*="/cart"]',
      'header [href="/cart"]',
      'a[href*="/cart"]',
      '[data-cart-drawer]',
      'header'
    ];

    const findTarget = () => {
      if (customSelector) {
        const raw = customSelector.trim();
        const candidates = [
          raw,
          !raw.startsWith('.') && !raw.startsWith('#') && !raw.startsWith('[') ? `.${raw}` : null,
          !raw.startsWith('.') && !raw.startsWith('#') && !raw.startsWith('[') ? `#${raw}` : null,
          raw.includes('-') ? `.${raw.replace(/-/g, '__')}` : null,
          raw.includes('__') ? `.${raw.replace(/__/g, '-')}` : null,
          !raw.startsWith('.') && !raw.startsWith('#') ? `header .${raw}` : null
        ].filter(Boolean);

        for (const candidate of candidates) {
          try {
            const el = document.querySelector(candidate);
            if (el) return { el, mode: candidate };
          } catch (e) {}
        }
        console.warn('[saitriq-wishlist] Custom header selector did not match:', customSelector);
      }

      for (const sel of DEFAULT_HEADER_SELECTORS) {
        try {
          const el = document.querySelector(sel);
          if (el) return { el, mode: sel };
        } catch (e) {}
      }
      return null;
    };

    const injectLink = (targetInfo) => {
      const existing = document.getElementById('sai-wishlist-header-link');
      const target = targetInfo.el;

      if (existing && (existing.parentElement === target || target.contains(existing))) {
        updateAllHeaderCounts();
        return;
      }
      existing?.remove();

      const link = createHeaderWishlistLink();

      // If target is directly a cart button/link, insert right before it
      if (target.matches('a[href*="/cart"], [href*="/cart"], .header__icon--cart, .cart-link')) {
        target.parentElement?.insertBefore(link, target);
        updateAllHeaderCounts();
        return;
      }

      // If target is a container, look for a cart icon inside it to place right before cart
      const cartInTarget = target.querySelector('.header__icon--cart, a[href*="/cart"], [href*="/cart"], .cart-link');
      if (cartInTarget) {
        cartInTarget.parentElement?.insertBefore(link, cartInTarget);
      } else {
        target.append(link);
      }

      updateAllHeaderCounts();
    };

    const found = findTarget();
    if (found) {
      injectLink(found);
    } else {
      const observer = new MutationObserver(() => {
        const late = findTarget();
        if (late) {
          observer.disconnect();
          clearTimeout(timeout);
          injectLink(late);
        }
      });
      const timeout = setTimeout(() => observer.disconnect(), 10000);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  };

  window.addEventListener('storage', (event) => {
    if (event.key === storageKey) updateAllHeaderCounts();
  });
  window.addEventListener('saitriq:wishlist-updated', updateAllHeaderCounts);
  updateAllHeaderCounts();

  /* ── 3. Collection Cards Auto-Initialization ─────────────────────── */
  const initCollectionWishlistFallback = () => {
    if (window.saitriqWishlistCollectionLoaded) return;
    window.saitriqWishlistCollectionLoaded = true;

    let tpl = document.querySelector('[data-sai-collection-tpl]');
    if (!tpl) {
      tpl = document.createElement('template');
      tpl.setAttribute('data-sai-collection-tpl', '');
      tpl.innerHTML = `
        <button
          type="button"
          class="sai-wishlist sai-wishlist--collection sai-wishlist--collection-top-right"
          data-sai-collection-wishlist
          aria-label="Add to wishlist"
        >
          <span class="sai-wishlist__icon sai-wishlist__icon--default" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="sai-wishlist__icon sai-wishlist__icon--active" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </span>
        </button>
      `;
      document.body.appendChild(tpl);
    }

    const locales = {
      addLabel:    tpl.dataset.labelAdd    || 'Add to wishlist',
      removeLabel: tpl.dataset.labelRemove || 'Remove from wishlist',
      addedMsg:    tpl.dataset.msgAdded    || 'Added to wishlist',
      removedMsg:  tpl.dataset.msgRemoved  || 'Removed from wishlist',
      limitMsg:    tpl.dataset.msgLimit    || 'Wishlist is temporarily unavailable'
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
      id: item.productId,
      handle: item.productHandle,
      title: item.productTitle,
      image: item.productImage || '',
      price: item.productPrice || ''
    });

    const persistLocalFallback = (operation, item) => {
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

    const sync = async (operation, item) => {
      if (!customerAuthenticated) {
        const guestResult = await trackGuest(operation, item);
        if (guestResult?.limitReached || guestResult?.stopped) {
          window.saitriqWishlistStopped = true;
          return readItems();
        }
        return persistLocalFallback(operation, item);
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
        return persistLocalFallback(operation, item);
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
      if (!link || !link.href) return '';
      try {
        const pathname = new URL(link.href, window.location.origin).pathname;
        const match = pathname.match(/\/products\/([^/?#]+)/);
        return match ? decodeURIComponent(match[1]) : '';
      } catch {
        return '';
      }
    };

    const productLinks = () => [...document.querySelectorAll('a[href*="/products/"]')]
      .filter((a) => handleFromLink(a));

    const CARD_SELECTOR = [
      '.card-wrapper',
      '.product-card-wrapper',
      '.card',
      '.product-card',
      '[class*="product-card"]',
      '[class*="product-item"]',
      '[class*="card--product"]',
      'article',
      '.grid__item',
      'li'
    ].join(', ');

    const attach = async (link) => {
      const handle = handleFromLink(link);
      const card = link.closest(CARD_SELECTOR);
      if (!handle || !card || card.dataset.saiWishlistAttaching || card.querySelector('[data-sai-collection-wishlist]')) return;

      card.dataset.saiWishlistAttaching = '1';

      const button = tpl.content.cloneNode(true).querySelector('[data-sai-collection-wishlist]');
      if (!button) {
        delete card.dataset.saiWishlistAttaching;
        return;
      }

      const targetContainer = card.querySelector('.card__inner') || card.querySelector('.card__media') || card;
      if (getComputedStyle(targetContainer).position === 'static') {
        targetContainer.style.position = 'relative';
      }
      targetContainer.append(button);

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

    const scan = () => productLinks().forEach(attach);

    scan();
    detectAuthentication().finally(scan);
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });

    window.addEventListener('storage', (e) => { if (e.key === storageKey) scan(); });

    window.addEventListener('saitriq:wishlist-updated', () => {
      document.querySelectorAll('[data-sai-collection-wishlist]').forEach((btn) => {
        const card = btn.closest(CARD_SELECTOR) || btn.parentElement;
        const link = card && card.querySelector('a[href*="/products/"]');
        if (!link) return;
        const handle = handleFromLink(link);
        if (handle && productCache.has(handle)) {
          renderButton(btn, productCache.get(handle).productId);
        }
      });
    });
  };

  /* ── 4. Load Merchant Settings & Finish Bootstrapping ─────────────── */
  fetch(`${endpoint}?api=settings`, { credentials: 'same-origin' })
    .then((r) => r.ok ? r.json() : {})
    .then((data) => {
      applyToastSettings(data.settings);
      applyHeaderSelector(data.settings);
    })
    .catch(() => {
      applyHeaderSelector({});
    })
    .finally(() => {
      window.saitriqEmbedEnabled = true;
      document.dispatchEvent(new CustomEvent('saitriq:embed-ready'));
      initCollectionWishlistFallback();
    });
})();

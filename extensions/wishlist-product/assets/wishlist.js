(() => {
  const endpoint = '/apps/saitriq-wishlist';
  const storageKey = 'saitriq_wishlist';

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
        let imgSrc = String(image || '').trim();
        if (imgSrc.startsWith('//')) {
          imgSrc = 'https:' + imgSrc;
        }
        const hasImg = Boolean(imgSrc && imgSrc !== 'null' && imgSrc !== 'undefined');

        toast.innerHTML = `
          <div class="sai-wishlist__toast-inner">
            ${hasImg ? `<img class="sai-wishlist__toast-img" src="${imgSrc}" alt="${title ? String(title).replace(/"/g, '&quot;') : ''}" aria-hidden="true" onerror="this.style.display='none'">` : ''}
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

  /* ── 3. Load Merchant Settings & Finish Bootstrapping ─────────────── */
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
    });
})();

(() => {
    const endpoint = '/apps/saitriq-wishlist';

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

    const updateHeaderWishlistCount = (count) => {
      let items = [];
      try {
        const stored = JSON.parse(localStorage.getItem('saitriq_wishlist') || '[]');
        if (Array.isArray(stored)) items = stored;
      } catch (error) {
        console.warn('[saitriq-wishlist] Could not read saved wishlist items:', error);
      }
      count.textContent = String(items.length);
    };

    const createHeaderWishlistLink = () => {
      const link = document.createElement('a');
      link.id = 'sai-wishlist-header-link';
      link.className = 'sai-wishlist-header__link';
      link.href = '/pages/wishlist';
      link.setAttribute('aria-label', 'View wishlist');
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
      updateHeaderWishlistCount(count);
      icon.append(count);

      const label = document.createElement('span');
      label.className = 'sai-wishlist-header__label';
      label.textContent = 'Wishlist';
      link.append(icon, label);

      window.addEventListener('storage', (event) => {
        if (event.key === 'saitriq_wishlist') updateHeaderWishlistCount(count);
      });
      window.addEventListener('saitriq:wishlist-updated', () => updateHeaderWishlistCount(count));

      return link;
    };

    const applyHeaderSelector = (settings) => {
      const selector = typeof settings?.headerSelector === 'string'
        ? settings.headerSelector.trim()
        : '';
      const existing = document.getElementById('sai-wishlist-header-link');
      if (!selector) {
        existing?.remove();
        return;
      }

      const appendToTarget = (target) => {
        if (existing?.parentElement === target) return;
        existing?.remove();
        target.append(createHeaderWishlistLink());
      };

      let target;
      try {
        target = document.querySelector(selector);
      } catch (error) {
        console.warn('[saitriq-wishlist] Invalid header CSS selector:', selector, error);
        existing?.remove();
        return;
      }
      if (target) {
        appendToTarget(target);
        return;
      }

      existing?.remove();
      const observer = new MutationObserver(() => {
        const lateTarget = document.querySelector(selector);
        if (lateTarget) {
          observer.disconnect();
          clearTimeout(timeout);
          appendToTarget(lateTarget);
        }
      });
      const timeout = setTimeout(() => observer.disconnect(), 10000);
      observer.observe(document.documentElement, { childList: true, subtree: true });
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

    fetch(`${endpoint}?api=settings`, { credentials: 'same-origin' })
      .then((r) => r.ok ? r.json() : {})
      .then((data) => {
        applyToastSettings(data.settings);
        applyHeaderSelector(data.settings);
      })
      .catch(() => {})
      .finally(() => {
        window.saitriqEmbedEnabled = true;
        document.dispatchEvent(new CustomEvent('saitriq:embed-ready'));
      });
  })();
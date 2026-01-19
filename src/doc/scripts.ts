// Icons from https://lucide.dev/
export const icons = {
  tool: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wrench-icon lucide-wrench"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/></svg>`,
  resource: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-icon lucide-folder"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`,
  prompt: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square-icon lucide-message-square"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/></svg>`,
  setup: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`,
  copy: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy-icon lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9 17l-5-5"/></svg>`,
  info: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
};

export const clientScript = `
(function() {
  // Theme toggle
  const root = document.documentElement;
  const toggle = document.getElementById('theme-toggle');

  function getStoredTheme() {
    return localStorage.getItem('theme');
  }

  function setTheme(theme) {
    if (theme === 'dark' || theme === 'light') {
      root.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    } else {
      root.removeAttribute('data-theme');
      localStorage.removeItem('theme');
    }
  }

  // Initialize theme from localStorage
  const stored = getStoredTheme();
  if (stored) {
    setTheme(stored);
  }

  toggle.addEventListener('click', function() {
    const current = root.getAttribute('data-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (current === 'dark') {
      setTheme('light');
    } else if (current === 'light') {
      setTheme('dark');
    } else {
      // No explicit theme set, toggle based on system preference
      setTheme(prefersDark ? 'light' : 'dark');
    }
  });

  // Search functionality
  const searchInput = document.getElementById('search-input');
  const sidebarItems = document.querySelectorAll('.sidebar-item');

  searchInput.addEventListener('input', function(e) {
    const query = e.target.value.toLowerCase().trim();

    sidebarItems.forEach(function(item) {
      const label = item.querySelector('.sidebar-label');
      const text = label ? label.textContent.toLowerCase() : '';

      if (query === '' || text.includes(query)) {
        item.classList.remove('hidden');
      } else {
        item.classList.add('hidden');
      }
    });
  });

  // Navigate and scroll to first match on Enter
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      const visibleItems = document.querySelectorAll('.sidebar-item:not(.hidden)');
      if (visibleItems.length > 0) {
        const href = visibleItems[0].getAttribute('href');
        if (href) {
          window.location.hash = href;
          searchInput.blur();
        }
      }
    }
  });

  // Copy button functionality
  document.querySelectorAll('.copy-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const textToCopy = btn.getAttribute('data-copy');
      if (!textToCopy) return;

      navigator.clipboard.writeText(textToCopy).then(function() {
        btn.classList.add('copied');
        setTimeout(function() {
          btn.classList.remove('copied');
        }, 2000);
      }).catch(function(err) {
        console.error('Failed to copy:', err);
      });
    });
  });

  // Open details element when navigating via sidebar or hash
  function openDetailsForHash() {
    const hash = window.location.hash;
    if (!hash) return;

    const targetId = hash.slice(1); // Remove the '#'
    const target = document.getElementById(targetId);

    if (target && target.tagName === 'DETAILS') {
      target.open = true;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Handle hash changes (sidebar clicks)
  window.addEventListener('hashchange', openDetailsForHash);

  // Handle initial page load with hash
  openDetailsForHash();

  // Handle sidebar link clicks directly for immediate feedback
  document.querySelectorAll('.sidebar-item').forEach(function(item) {
    item.addEventListener('click', function(e) {
      const href = item.getAttribute('href');
      if (!href) return;

      const targetId = href.slice(1);
      const target = document.getElementById(targetId);

      if (target && target.tagName === 'DETAILS') {
        target.open = true;
      }
    });
  });
})();
`;

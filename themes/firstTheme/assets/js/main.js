// Site-level UI: theme toggle, overlay scrollbar (drag + click-to-jump),
// scroll-to-top button. Script tag is deferred (see head/js.html), so the DOM
// is already parsed by the time this runs.

(function () {
  const root = document.documentElement;
  const desktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // ---- Theme toggle ---------------------------------------------------------
  const toggle = document.querySelector('.theme-toggle');
  function syncToggleIcon() {
    if (!toggle) return;
    const dark = root.getAttribute('data-theme') === 'dark';
    toggle.textContent = dark ? '☀' : '☾'; // ☀ / ☾
    toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }
  if (toggle) {
    syncToggleIcon();
    toggle.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (_) {}
      syncToggleIcon();
    });
  }

  // ---- Overlay scrollbar (desktop only) -------------------------------------
  if (desktop) {
    const bar = document.createElement('div');
    bar.className = 'site-scrollbar';
    const thumb = document.createElement('div');
    thumb.className = 'site-scrollbar__thumb';
    bar.appendChild(thumb);
    document.body.appendChild(bar);
    root.classList.add('has-overlay-scrollbar');

    let hideTimer = 0;
    let dragging = null; // { startMouseY, startThumbTop }

    // The thumb height = (viewport / document) ratio of the track; its top
    // position = (scrollY / maxScroll) * (track - thumbH). We cache the
    // measurements on each update so drag math stays cheap.
    let cache = { vh: 0, dh: 0, thumbH: 0, maxTrackY: 0, maxScroll: 0 };

    function measure() {
      const vh = window.innerHeight;
      const dh = root.scrollHeight;
      if (dh <= vh + 1) { bar.style.display = 'none'; return false; }
      bar.style.display = '';
      const thumbH = Math.max(50, Math.round(vh * (vh / dh)));
      cache = {
        vh, dh, thumbH,
        maxTrackY: vh - thumbH,
        maxScroll: dh - vh
      };
      thumb.style.height = thumbH + 'px';
      return true;
    }

    function paintFromScroll() {
      if (cache.maxScroll <= 0) return;
      const y = Math.round((window.scrollY / cache.maxScroll) * cache.maxTrackY);
      thumb.style.transform = 'translateY(' + y + 'px)';
    }

    function update() {
      if (measure()) paintFromScroll();
    }

    function show() {
      bar.classList.add('is-visible');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!dragging) bar.classList.remove('is-visible');
      }, 1500);
    }

    // Scroll from the thumb's visual position to a window.scrollY, then paint.
    function scrollToThumbTop(thumbTopPx) {
      const clamped = Math.max(0, Math.min(cache.maxTrackY, thumbTopPx));
      const ratio = cache.maxTrackY === 0 ? 0 : clamped / cache.maxTrackY;
      window.scrollTo({ top: ratio * cache.maxScroll });
    }

    // --- drag the thumb ---
    thumb.addEventListener('mousedown', (e) => {
      e.preventDefault();
      measure();
      const rect = thumb.getBoundingClientRect();
      dragging = { grabOffset: e.clientY - rect.top };
      document.body.classList.add('is-scrollbar-dragging');
      show();
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const barTop = bar.getBoundingClientRect().top;
      scrollToThumbTop(e.clientY - barTop - dragging.grabOffset);
    });

    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = null;
      document.body.classList.remove('is-scrollbar-dragging');
      show(); // restart hide timer
    });

    // --- click on empty track jumps there ---
    bar.addEventListener('mousedown', (e) => {
      if (e.target === thumb) return;
      measure();
      const barTop = bar.getBoundingClientRect().top;
      scrollToThumbTop(e.clientY - barTop - cache.thumbH / 2);
    });

    window.addEventListener('scroll', () => { paintFromScroll(); show(); }, { passive: true });
    window.addEventListener('resize', update);
    bar.addEventListener('mouseenter', show);
    bar.addEventListener('mouseleave', () => {
      if (dragging) return;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => bar.classList.remove('is-visible'), 400);
    });
    update();
  }

  // ---- Scroll-to-top button -------------------------------------------------
  const top = document.createElement('button');
  top.className = 'scroll-top';
  top.setAttribute('aria-label', 'Scroll to top');
  top.textContent = '↑'; // ↑
  document.body.appendChild(top);

  function syncTop() {
    top.classList.toggle('is-visible', window.scrollY > 300);
  }
  window.addEventListener('scroll', syncTop, { passive: true });
  top.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  syncTop();
})();

(() => {
  // <stdin>
  (function() {
    const root = document.documentElement;
    const desktop = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const toggle = document.querySelector(".theme-toggle");
    function syncToggleIcon() {
      if (!toggle) return;
      const dark = root.getAttribute("data-theme") === "dark";
      toggle.textContent = dark ? "\u2600" : "\u263E";
      toggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    }
    if (toggle) {
      syncToggleIcon();
      toggle.addEventListener("click", () => {
        const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        try {
          localStorage.setItem("theme", next);
        } catch (_) {
        }
        syncToggleIcon();
      });
    }
    if (desktop) {
      let measure2 = function() {
        const vh = window.innerHeight;
        const dh = root.scrollHeight;
        if (dh <= vh + 1) {
          bar.style.display = "none";
          return false;
        }
        bar.style.display = "";
        const thumbH = Math.max(50, Math.round(vh * (vh / dh)));
        cache = {
          vh,
          dh,
          thumbH,
          maxTrackY: vh - thumbH,
          maxScroll: dh - vh
        };
        thumb.style.height = thumbH + "px";
        return true;
      }, paintFromScroll2 = function() {
        if (cache.maxScroll <= 0) return;
        const y = Math.round(window.scrollY / cache.maxScroll * cache.maxTrackY);
        thumb.style.transform = "translateY(" + y + "px)";
      }, update2 = function() {
        if (measure2()) paintFromScroll2();
      }, show2 = function() {
        bar.classList.add("is-visible");
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          if (!dragging) bar.classList.remove("is-visible");
        }, 1500);
      }, scrollToThumbTop2 = function(thumbTopPx) {
        const clamped = Math.max(0, Math.min(cache.maxTrackY, thumbTopPx));
        const ratio = cache.maxTrackY === 0 ? 0 : clamped / cache.maxTrackY;
        window.scrollTo({ top: ratio * cache.maxScroll });
      };
      var measure = measure2, paintFromScroll = paintFromScroll2, update = update2, show = show2, scrollToThumbTop = scrollToThumbTop2;
      const bar = document.createElement("div");
      bar.className = "site-scrollbar";
      const thumb = document.createElement("div");
      thumb.className = "site-scrollbar__thumb";
      bar.appendChild(thumb);
      document.body.appendChild(bar);
      root.classList.add("has-overlay-scrollbar");
      let hideTimer = 0;
      let dragging = null;
      let cache = { vh: 0, dh: 0, thumbH: 0, maxTrackY: 0, maxScroll: 0 };
      thumb.addEventListener("mousedown", (e) => {
        e.preventDefault();
        measure2();
        const rect = thumb.getBoundingClientRect();
        dragging = { grabOffset: e.clientY - rect.top };
        document.body.classList.add("is-scrollbar-dragging");
        show2();
      });
      window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const barTop = bar.getBoundingClientRect().top;
        scrollToThumbTop2(e.clientY - barTop - dragging.grabOffset);
      });
      window.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = null;
        document.body.classList.remove("is-scrollbar-dragging");
        show2();
      });
      bar.addEventListener("mousedown", (e) => {
        if (e.target === thumb) return;
        measure2();
        const barTop = bar.getBoundingClientRect().top;
        scrollToThumbTop2(e.clientY - barTop - cache.thumbH / 2);
      });
      window.addEventListener("scroll", () => {
        paintFromScroll2();
        show2();
      }, { passive: true });
      window.addEventListener("resize", update2);
      bar.addEventListener("mouseenter", show2);
      bar.addEventListener("mouseleave", () => {
        if (dragging) return;
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => bar.classList.remove("is-visible"), 400);
      });
      update2();
    }
    const top = document.createElement("button");
    top.className = "scroll-top";
    top.setAttribute("aria-label", "Scroll to top");
    top.textContent = "\u2191";
    document.body.appendChild(top);
    function syncTop() {
      top.classList.toggle("is-visible", window.scrollY > 300);
    }
    window.addEventListener("scroll", syncTop, { passive: true });
    top.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    syncTop();
  })();
})();

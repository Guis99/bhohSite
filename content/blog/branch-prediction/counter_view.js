'use strict';
// Counter views: the graphic that draws one saturating counter.
//
// app.js only talks to a view through this interface, so a different graphic
// can be swapped in by writing another factory with the same shape and
// pointing `makeCounterView` in app.js at it:
//
//   const view = factory({ bits, label });
//   view.el              // root DOM node; the caller inserts it
//   view.setValue(v)     // raw counter value, 0 .. 2^bits - 1
//   view.setActive(on)   // highlight while this counter is being read/trained
//
// Values >= 2^(bits-1) predict taken, matching SatCounter::predict().

const CounterViews = (() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs = {}, ns) {
    const node = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  function describe(v, bits) {
    const max = (1 << bits) - 1;
    const taken = v >= 1 << (bits - 1);
    const strength = v === 0 || v === max ? 'strong' : 'weak';
    return `${v.toString(2).padStart(bits, '0')} · ${strength} ${taken ? 'T' : 'NT'}`;
  }

  // --- semicircular dial -----------------------------------------------------
  // One arc segment per counter value, NT on the left, T on the right. The
  // segment for the current value is lit and a needle points at it.
  const DIAL_CSS = `
    .cv-dial { margin: 0; padding: 4px; border: 2px solid transparent; border-radius: 8px; text-align: center; }
    .cv-dial.cv-active { border-color: #2f6fdf; }
    .cv-dial svg { display: block; width: 100%; max-width: 140px; margin: 0 auto; overflow: visible; }
    .cv-seg { opacity: .18; transition: opacity .1s; }
    .cv-seg.cv-on { opacity: 1; }
    .cv-nt { fill: rgb(203, 0, 0); }
    .cv-t { fill: rgb(0, 162, 70); }
    .cv-needle { stroke: currentColor; stroke-width: 3; stroke-linecap: round;
                 transform-box: view-box; transform-origin: 60px 60px; transition: transform .12s ease-out; }
    .cv-hub { fill: currentColor; }
    .cv-end { font: 10px system-ui, sans-serif; fill: currentColor; opacity: .6; }
    .cv-label { font-weight: 600; font-variant-numeric: tabular-nums; }
    .cv-value { font-size: 12px; font-variant-numeric: tabular-nums; opacity: .8; }
  `;
  let dialCssInjected = false;

  function semicircleDial({ bits, label = '' }) {
    if (!dialCssInjected) {
      document.head.append(Object.assign(document.createElement('style'), { textContent: DIAL_CSS }));
      dialCssInjected = true;
    }

    const levels = 1 << bits;
    const cx = 60, cy = 60, rOut = 52, rIn = 34, gap = 0.03;
    const at = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy - r * Math.sin(a)).toFixed(2)}`;

    const root = el('figure', { class: 'cv-dial' });
    const svg = el('svg', { viewBox: '0 0 120 74', role: 'img' }, SVG_NS);

    // Segment i sweeps clockwise from angle a0 (left) to a1.
    const segs = [];
    for (let i = 0; i < levels; i++) {
      const a0 = Math.PI * (1 - i / levels) - gap;
      const a1 = Math.PI * (1 - (i + 1) / levels) + gap;
      const d = `M ${at(rOut, a0)} A ${rOut} ${rOut} 0 0 1 ${at(rOut, a1)} ` +
                `L ${at(rIn, a1)} A ${rIn} ${rIn} 0 0 0 ${at(rIn, a0)} Z`;
      const seg = el('path', { d, class: `cv-seg ${i >= levels / 2 ? 'cv-t' : 'cv-nt'}` }, SVG_NS);
      svg.append(seg);
      segs.push(seg);
    }

    const needle = el('line', { x1: cx, y1: cy, x2: cx + rOut - 6, y2: cy, class: 'cv-needle' }, SVG_NS);
    const hub = el('circle', { cx, cy, r: 4, class: 'cv-hub' }, SVG_NS);
    const ntEnd = el('text', { x: cx - (rOut + rIn) / 2, y: 72, 'text-anchor': 'middle', class: 'cv-end' }, SVG_NS);
    const tEnd = el('text', { x: cx + (rOut + rIn) / 2, y: 72, 'text-anchor': 'middle', class: 'cv-end' }, SVG_NS);
    ntEnd.textContent = 'NT';
    tEnd.textContent = 'T';
    svg.append(needle, hub, ntEnd, tEnd);

    const caption = el('figcaption');
    const labelEl = el('div', { class: 'cv-label' });
    const valueEl = el('div', { class: 'cv-value' });
    labelEl.textContent = label;
    caption.append(labelEl, valueEl);
    root.append(svg, caption);

    return {
      el: root,
      setValue(v) {
        segs.forEach((seg, i) => seg.classList.toggle('cv-on', i === v));
        const deg = 180 * (1 - (v + 0.5) / levels);  // centre of segment v
        needle.style.transform = `rotate(${-deg}deg)`;
        valueEl.textContent = describe(v, bits);
        svg.setAttribute('aria-label', `counter ${describe(v, bits)}`);
      },
      setActive(on) {
        root.classList.toggle('cv-active', on);
      },
    };
  }

  // --- vertical slider ---------------------------------------------------------
  // A track with a tick that slides between the counter's values: NT at the
  // bottom, T at the top, with the prediction threshold marked across the
  // middle. Reads at a glance in a grid of sixteen, where sixteen dials do not.
  const SLIDER_CSS = `
    .cv-slider { margin: 0; padding: 2px; border: 2px solid transparent; border-radius: 6px; text-align: center; }
    .cv-slider.cv-active { border-color: #2f6fdf; }
    .cv-slider svg { display: block; width: 100%; max-width: 30px; margin: 0 auto; overflow: visible; }
    .cv-track { fill: currentColor; opacity: .12; }
    .cv-half-nt { fill:rgb(203, 0, 0); opacity: .18; }
    .cv-half-t { fill:rgb(0, 162, 70); opacity: .18; }
    .cv-mid { stroke: currentColor; stroke-width: 1; opacity: .35; }
    .cv-tick { transition: transform .12s ease-out; transform-box: view-box; transform-origin: 0 0; }
    .cv-tick-nt { fill:rgb(203, 0, 0); }
    .cv-tick-t { fill:rgb(0, 162, 70); }
    .cv-slabel { font-size: 10px; font-variant-numeric: tabular-nums; opacity: .7; }
  `;
  let sliderCssInjected = false;

  function verticalSlider({ bits, label = '' }) {
    if (!sliderCssInjected) {
      document.head.append(Object.assign(document.createElement('style'), { textContent: SLIDER_CSS }));
      sliderCssInjected = true;
    }

    const levels = 1 << bits;
    const top = 5, bottom = 65, span = bottom - top;
    const step = span / levels;
    const mid = top + span / 2;

    const root = el('figure', { class: 'cv-slider' });
    const svg = el('svg', { viewBox: '0 0 24 70', role: 'img' }, SVG_NS);

    svg.append(
      el('rect', { x: 10, y: top, width: 4, height: span, rx: 2, class: 'cv-track' }, SVG_NS),
      el('rect', { x: 10, y: mid, width: 4, height: span / 2, class: 'cv-half-nt' }, SVG_NS),
      el('rect', { x: 10, y: top, width: 4, height: span / 2, class: 'cv-half-t' }, SVG_NS),
      el('line', { x1: 6, y1: mid, x2: 18, y2: mid, class: 'cv-mid' }, SVG_NS),
    );

    // The tick sits at y = 0 and is moved by transform, so the slide animates.
    const tick = el('rect', { x: 3, y: -1.75, width: 18, height: 3.5, rx: 1.75, class: 'cv-tick' }, SVG_NS);
    svg.append(tick);

    const caption = el('figcaption', { class: 'cv-slabel' });
    caption.textContent = label;
    root.append(svg, caption);

    return {
      el: root,
      setValue(v) {
        const taken = v >= levels / 2;
        tick.setAttribute('class', `cv-tick ${taken ? 'cv-tick-t' : 'cv-tick-nt'}`);
        tick.style.transform = `translateY(${(bottom - (v + 0.5) * step).toFixed(2)}px)`;
        svg.setAttribute('aria-label', `counter ${describe(v, bits)}`);
        root.title = describe(v, bits);
      },
      setActive(on) {
        root.classList.toggle('cv-active', on);
      },
    };
  }

  return { semicircleDial, verticalSlider };
})();

'use strict';
// Drives the two demos in index.html. They are fully independent: each has its
// own knobs, branches, queue, and predictor instance inside the WASM module
// (driver.cpp, which runs the real classes from predictors.h). This file only
// sequences clicks and draws the state the module reports.

const QUEUE_CAP = 5;  // clicks past this are dropped
const STEP_MS = 200;  // pause between queued branches so each update is visible
const BRANCHES = [    // the branches a demo can have, added in this order
  { name: 'A', pc: 0x0 },
  { name: 'B', pc: 0x1 },
  { name: 'C', pc: 0x2 },
  { name: 'D', pc: 0x3 },
  { name: 'E', pc: 0x4 },
  { name: 'F', pc: 0x5 },
];

const makeCounterView = CounterViews.verticalSlider;  // swap the counter graphic here

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const binary = (v, width) => v.toString(2).padStart(width, '0');
const TNT = (taken) => (taken ? 'T' : 'NT');
const make = (tag, props = {}) => Object.assign(document.createElement(tag), props);

// Binds one predictor's WASM exports (see the API comment in driver.cpp).
function bindPredictor(m, prefix) {
  const fn = (name) => m[`_${prefix}_${name}`];
  return {
    entries: fn('entries'),
    index: fn('index'),
    counter: fn('counter'),
    predict: (pc) => fn('predict')(pc) !== 0,
    update: (pc, taken) => fn('update')(pc, taken ? 1 : 0),
  };
}

// One demo panel. `spec` is:
//   sim            a bound predictor
//   knobs          sliders that rebuild the predictor: { key, label, min, max, value, format(v) }
//   reset(values)  rebuild the predictor from the knob values (keyed by knob key)
//   info(el, values)  optional: draw how the index is formed
// Every demo also gets a Branches slider, which adds or removes branches
// without resetting the predictor.
class Demo {
  constructor(root, spec, counterBits) {
    this.id = root.id;
    this.spec = spec;
    this.sim = spec.sim;
    this.counterBits = counterBits;
    this.epoch = 0;  // bumped by reset() so an in-flight run() stops
    this.values = {};
    this.queue = [];

    this.branchesEl = root.querySelector('.branches');
    this.queueEl = root.querySelector('.queue');
    this.statusEl = root.querySelector('.status');
    this.tallyEl = root.querySelector('.tally');
    this.infoEl = root.querySelector('.info');
    this.dialsEl = root.querySelector('.dials');

    const knobsEl = root.querySelector('.knobs');
    for (const knob of spec.knobs) this.addKnob(knobsEl, knob, () => this.reset());
    this.addKnob(knobsEl, {
      key: 'branches', label: 'Branches', min: 1, max: BRANCHES.length, value: 1,
      format: (n) => BRANCHES.slice(0, n).map((b) => b.name).join(' '),
    }, () => this.setBranches());
    root.querySelector('[data-reset]').addEventListener('click', () => this.reset());

    this.renderBranches();
    this.reset();
  }

  addKnob(container, { key, label, min, max, value, format }, onChange) {
    const id = `${this.id}-${key}`;
    const input = make('input', { type: 'range', id, min, max, value });
    const output = make('output', { htmlFor: id });
    const sync = () => {
      this.values[key] = Number(input.value);
      output.textContent = format(this.values[key]);
    };
    input.addEventListener('input', () => { sync(); onChange(); });
    sync();
    container.append(make('label', { htmlFor: id, textContent: label }), input, output);
  }

  // Fresh predictor from the current knobs. Branches are kept.
  reset() {
    this.epoch++;
    this.running = false;
    this.queue = [];
    this.seen = 0;
    this.correct = 0;
    this.spec.reset(this.values);

    // One fixed slot per table entry so dials keep their place; a slot stays
    // empty until some branch maps to its counter.
    const entries = this.sim.entries();
    this.indexBits = Math.log2(entries);
    this.views = [];
    this.slots = Array.from({ length: entries }, () => {
      const slot = make('div', { className: 'slot' });
      slot.append(make('div', { className: 'tags' }));
      return slot;
    });
    this.dialsEl.replaceChildren(...this.slots);
    this.active = -1;

    this.renderQueue();
    this.renderTally();
    this.statusEl.textContent = 'Waiting for branches.';
    this.refresh();
  }

  setBranches() {
    this.renderBranches();
    this.queue = this.queue.filter((q) => this.branches.includes(q.branch));
    this.renderQueue();
    this.refresh();
  }

  renderBranches() {
    this.branches = BRANCHES.slice(0, this.values.branches);
    this.mapsEls = [];
    const rows = this.branches.map((b) => {
      const maps = make('span', { className: 'maps' });
      this.mapsEls.push(maps);
      const row = make('div', { className: 'branch' });
      row.append(
        make('b', { textContent: b.name }),
        make('span', { className: 'pc', textContent: `PC 0x${b.pc.toString(16)}` }),
        make('button', { textContent: 'T', onclick: () => this.enqueue(b, true) }),
        make('button', { textContent: 'NT', onclick: () => this.enqueue(b, false) }),
        maps,
      );
      return row;
    });
    this.branchesEl.replaceChildren(...rows);
  }

  enqueue(branch, taken) {
    if (this.queue.length >= QUEUE_CAP) return;
    this.queue.push({ branch, taken });
    this.renderQueue();
    this.run();
  }

  async run() {
    if (this.running) return;
    this.running = true;
    const epoch = this.epoch;

    while (this.queue.length) {
      this.train(this.queue.shift());
      this.renderQueue();
      await sleep(STEP_MS);
      if (epoch !== this.epoch) return;
    }
    this.running = false;
  }

  // Predict and train on one branch; the counter's view updates immediately
  // and stays highlighted until the next branch.
  train({ branch: b, taken }) {
    const i = this.sim.index(b.pc);
    const view = this.spawn(i);
    const predicted = this.sim.predict(b.pc);
    this.sim.update(b.pc, taken);  // for gshare this also shifts the history
    view.setValue(this.sim.counter(i));
    if (this.active >= 0) this.views[this.active].setActive(false);
    view.setActive(true);
    this.active = i;

    this.seen++;
    if (predicted === taken) this.correct++;
    this.statusEl.textContent = `${b.name} was ${TNT(taken)}. Counter ${this.label(i)} predicted ` +
      `${TNT(predicted)}: ${predicted === taken ? 'correct' : 'mispredict'}.`;
    this.renderTally();
    this.refresh();
  }

  // Redraw which counter each branch maps to now and what it would predict.
  refresh() {
    const tags = this.slots.map(() => []);
    this.branches.forEach((b, k) => {
      const i = this.sim.index(b.pc);
      this.spawn(i);
      tags[i].push(b.name);
      this.mapsEls[k].textContent = `→ counter ${this.label(i)}, predicts ${TNT(this.sim.predict(b.pc))}`;
    });
    this.slots.forEach((slot, i) => { slot.querySelector('.tags').textContent = tags[i].join(' '); });
    if (this.spec.info) this.spec.info(this.infoEl, this.values);
  }

  // The dial for counter i, spawned the first time a branch maps to it.
  spawn(i) {
    if (!this.views[i]) {
      const view = makeCounterView({ bits: this.counterBits, label: this.label(i) });
      view.setValue(this.sim.counter(i));
      this.slots[i].prepend(view.el);
      this.slots[i].classList.add('spawned');
      this.views[i] = view;
    }
    return this.views[i];
  }

  label(i) {
    return binary(i, this.indexBits);
  }

  renderQueue() {
    const chips = [];
    for (let k = 0; k < QUEUE_CAP; k++) {
      const q = this.queue[k];
      chips.push(q ? make('span', { className: TNT(q.taken), textContent: `${q.branch.name} ${TNT(q.taken)}` })
                   : make('span'));
    }
    this.queueEl.replaceChildren(...chips);
  }

  renderTally() {
    this.tallyEl.textContent = `${this.correct} / ${this.seen} correct`;
  }
}

// "history 10110110 (newest last), index = (PC ⊕ history) & 1111". History
// bits at or above the index width are dimmed: GSharePredictor::get_idx masks
// them off, so they never reach the index.
function renderGShareInfo(el, history, h, k) {
  const bits = binary(history, h).split('').map((c, pos) =>
    make('span', { textContent: c, className: h - 1 - pos >= k ? 'masked' : '' }));
  el.replaceChildren('history ', ...bits, ` (newest last), index = (PC ⊕ history) & ${binary((1 << k) - 1, k)}.`);
  if (h > k) el.append(' Crossed-out bits are masked off, so they never affect the index.');
  if (h < k) el.append(` The top ${k - h} index bit${k - h > 1 ? 's come' : ' comes'} from the PC alone.`);
}

createDriver().then((m) => {
  const counterBits = m._counter_bits();
  const tableKnob = {
    key: 'indexBits', label: 'Table size', min: m._min_index_bits(), max: m._max_index_bits(),
    value: m._max_index_bits(), format: (k) => `${1 << k} counters (${k}-bit index)`,
  };

  // Each demo is optional: a page may carry one, both, or neither.
  const bimodalEl = document.getElementById('bimodal');
  if (bimodalEl) new Demo(bimodalEl, {
    sim: bindPredictor(m, 'bim'),
    knobs: [tableKnob],
    reset: ({ indexBits }) => m._bim_reset(indexBits),
    info: (el, { indexBits: k }) => {
      el.textContent = `index = PC & ${binary((1 << k) - 1, k)} (the low ${k} bit${k > 1 ? 's' : ''} of the PC).`;
    },
  }, counterBits);

  const gshareEl = document.getElementById('gshare');
  if (gshareEl) new Demo(gshareEl, {
    sim: bindPredictor(m, 'gsh'),
    knobs: [tableKnob, {
      key: 'history', label: 'History length', min: m._min_history(), max: m._max_history(),
      value: Math.min(4, m._max_history()), format: (h) => `${h} outcomes`,
    }],
    reset: ({ indexBits, history }) => m._gsh_reset(indexBits, history),
    info: (el, { indexBits, history }) => renderGShareInfo(el, m._gsh_history(), history, indexBits),
  }, counterBits);
});

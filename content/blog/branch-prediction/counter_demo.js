'use strict';
// A single saturating counter, with no table, no PC and no indexing: the
// mechanism on its own. Click T or NT to send it an outcome; the dial shows
// the counter's state and which way it would predict next.
//
// This is the same predictor the other demos use (driver.cpp, running
// SatCounter from predictors.h) with the smallest possible table and a fixed
// PC, so exactly one counter is ever touched. app.js drives the table demos;
// this file is independent of it.
//
// Unlike those demos there is no click queue: one counter has nothing to
// animate between, so every click is applied on the spot.

(() => {
  const root = document.getElementById('satcounter');
  if (!root) return;

  const PC = 0;
  const TNT = (taken) => (taken ? 'T' : 'NT');

  createDriver().then((m) => {
    const statusEl = root.querySelector('.status');
    const tallyEl = root.querySelector('.tally');
    const view = CounterViews.semicircleDial({ bits: m._counter_bits() });
    root.querySelector('.dial').append(view.el);

    let seen = 0;
    let correct = 0;

    const renderTally = () => {
      tallyEl.textContent = `${correct} / ${seen} correct`;
    };

    // The smallest table the driver allows, so PC 0 always lands on counter 0.
    const reset = () => {
      m._bim_reset(m._min_index_bits());
      seen = 0;
      correct = 0;
      view.setValue(m._bim_counter(0));
      statusEl.textContent = 'Waiting for an outcome.';
      renderTally();
    };

    const train = (taken) => {
      const predicted = m._bim_predict(PC) !== 0;
      m._bim_update(PC, taken ? 1 : 0);
      view.setValue(m._bim_counter(0));

      seen++;
      if (predicted === taken) correct++;
      statusEl.textContent = `${taken ? 'Taken' : 'Not taken'}. The counter predicted ` +
        `${TNT(predicted)}: ${predicted === taken ? 'correct' : 'mispredict'}.`;
      renderTally();
    };

    root.querySelector('[data-taken]').addEventListener('click', () => train(true));
    root.querySelector('[data-not-taken]').addEventListener('click', () => train(false));
    root.querySelector('[data-reset]').addEventListener('click', reset);
    reset();
  });
})();

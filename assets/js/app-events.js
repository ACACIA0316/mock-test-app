(function () {
  'use strict';

  var ACTIONS = {
    switchTab: function (el) { window.switchTab && window.switchTab(el.dataset.tab); },
    addPassage: function () { window.addPassage && window.addPassage(); },
    trAddPassage: function () { window.trAddPassage && window.trAddPassage(); },
    synAddPassage: function () { window.synAddPassage && window.synAddPassage(); },
    runQueue: function () { window.runQueue && window.runQueue(); },
    runTraining: function () { window.runTraining && window.runTraining(); },
    synRunAll: function () { window.synRunAll && window.synRunAll(); },
    runVariant: function () { window.runPassageVariant && window.runPassageVariant(); },
  };

  document.addEventListener('click', function (event) {
    var actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    var action = ACTIONS[actionEl.dataset.action];
    if (!action) return;
    event.preventDefault();
    action(actionEl, event);
  });

  function migrateStaticButtons() {
    [
      ['tab-btn-main', 'switchTab', 'main'],
      ['tab-btn-training', 'switchTab', 'training'],
      ['tab-btn-synonym', 'switchTab', 'synonym'],
      ['tab-btn-blueprint', 'switchTab', 'blueprint'],
      ['run-btn', 'runQueue', null],
      ['tr-run-btn', 'runTraining', null],
      ['syn-run-all-btn', 'synRunAll', null],
    ].forEach(function (item) {
      var el = document.getElementById(item[0]);
      if (!el) return;
      el.dataset.action = item[1];
      if (item[2]) el.dataset.tab = item[2];
      el.removeAttribute('onclick');
    });

    document.querySelectorAll('.add-passage-btn').forEach(function (btn) {
      if (btn.dataset.action) return;
      if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes('trAddPassage')) {
        btn.dataset.action = 'trAddPassage';
      } else {
        btn.dataset.action = 'addPassage';
      }
      btn.removeAttribute('onclick');
    });

    var synAdd = Array.from(document.querySelectorAll('.syn-run-btn')).find(function (btn) {
      return (btn.textContent || '').includes('지문 추가');
    });
    if (synAdd) {
      synAdd.dataset.action = 'synAddPassage';
      synAdd.removeAttribute('onclick');
    }
  }

  document.addEventListener('DOMContentLoaded', migrateStaticButtons);
})();

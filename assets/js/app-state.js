(function () {
  'use strict';

  var STORAGE_KEY = 'mock_app_autosave_v1';
  var saveTimer = null;
  var restoring = false;

  function snapshot() {
    if (!Array.isArray(window.passages)) return null;
    if (typeof window.saveState === 'function') {
      try { window.saveState(); } catch (_e) {}
    }
    return {
      passages: window.passages,
      selectedId: window.selectedId,
      pid: window._pid,
      globals: {
        vocab: window.gVocab,
        attr: window.gAttr,
      },
      variant: {
        cat: window._varCat,
        val: window._varVal,
        vocab: window._varVocab,
      },
      training: {
        passages: Array.isArray(window._trPassages) ? window._trPassages : [],
        selectedId: window._trSelectedId,
        idCounter: window._trIdCounter,
      },
      savedAt: new Date().toISOString(),
    };
  }

  function persistNow() {
    if (restoring) return;
    var data = snapshot();
    if (!data) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[autosave] failed:', e);
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, 400);
  }

  function restore() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    var data;
    try { data = JSON.parse(raw); } catch (_e) { return false; }
    if (!Array.isArray(data.passages)) return false;

    var migrated = false;
    restoring = true;
    try {
      if (typeof window.normalizeGrammarSubjectiveQueue === 'function') {
        migrated = window.normalizeGrammarSubjectiveQueue(data.passages);
      }
      window.passages = data.passages;
      window.selectedId = data.selectedId == null ? null : data.selectedId;
      window._pid = Number(data.pid || 0);
      if (data.globals) {
        if (data.globals.vocab) window.gVocab = data.globals.vocab;
        if (data.globals.attr) window.gAttr = data.globals.attr;
      }
      if (data.variant) {
        window._varCat = data.variant.cat || null;
        window._varVal = data.variant.val || null;
        window._varVocab = data.variant.vocab || window._varVocab || '03';
      }
      if (data.training && Array.isArray(data.training.passages)) {
        window._trPassages = data.training.passages;
        window._trSelectedId = data.training.selectedId == null ? null : data.training.selectedId;
        window._trIdCounter = Number(data.training.idCounter || 0);
        if (typeof window._trRenderQueue === 'function') window._trRenderQueue();
        if (typeof window._trRenderRight === 'function') window._trRenderRight();
      }
      if (typeof window.renderQueueItem === 'function'
        && typeof window.updateQueueStatus === 'function'
        && typeof window.selectPassage === 'function') {
        var queue = document.getElementById('passage-queue');
        if (queue) queue.innerHTML = '';
        window.passages.forEach(function (p) { window.renderQueueItem(p); });
        window.updateQueueStatus();
        if (window.selectedId != null && window.passages.some(function (p) { return p.id === window.selectedId; })) {
          window.selectPassage(window.selectedId);
        } else if (window.passages[0]) {
          window.selectPassage(window.passages[0].id);
        }
      }
      return true;
    } finally {
      restoring = false;
      if (migrated) setTimeout(persistNow, 0);
    }
  }

  window.AppState = {
    persistNow: persistNow,
    scheduleSave: scheduleSave,
    restore: restore,
    clear: function () { localStorage.removeItem(STORAGE_KEY); },
  };

  document.addEventListener('input', function (e) {
    if (e.target && (e.target.matches('textarea') || e.target.matches('input') || e.target.matches('select'))) {
      scheduleSave();
    }
  }, true);

  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest('button,[data-var-cat],[data-var-vocab],.ps,.tchip')) {
      scheduleSave();
    }
  }, true);

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(restore, 0);
  });

  window.addEventListener('beforeunload', persistNow);
})();

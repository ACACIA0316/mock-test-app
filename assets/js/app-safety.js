(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.AppSafety = {
    escapeHtml: escapeHtml,
    setText: function (el, value) {
      if (el) el.textContent = value == null ? '' : String(value);
    },
  };

  if (!window.escH) window.escH = escapeHtml;
  if (!window._esc) window._esc = escapeHtml;
})();

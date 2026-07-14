(function () {
  'use strict';

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!nativeFetch) return;

  var AI_HOSTS = new Set([
    'api.anthropic.com',
    'generativelanguage.googleapis.com',
    'api.openai.com',
    'api.deepseek.com',
  ]);

  function shouldProxy(url) {
    try {
      var parsed = new URL(url, window.location.href);
      return (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        && AI_HOSTS.has(parsed.hostname);
    } catch (_e) {
      return false;
    }
  }

  window.fetch = function proxiedFetch(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url);
    if (!url || !shouldProxy(url)) {
      return nativeFetch(input, init);
    }

    init = init || {};
    var headers = {};
    try {
      new Headers(init.headers || (input && input.headers) || {}).forEach(function (value, key) {
        headers[key] = value;
      });
    } catch (_e) {}

    return nativeFetch('/llm-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: url,
        method: init.method || (input && input.method) || 'GET',
        headers: headers,
        body: init.body || null,
      }),
    });
  };
})();

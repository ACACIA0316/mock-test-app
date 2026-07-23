(function () {
  'use strict';

  if (typeof window._callLLM !== 'function' || typeof window._detectProvider !== 'function') return;

  var originalCallLLM = window._callLLM;

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function callClaude(system, userMsg, model, apiKey, onEvent, qType) {
    var requestBody = {
      model: model,
      max_tokens: 32000,
      messages: [{ role: 'user', content: userMsg }]
    };
    if (String(system || '').trim()) requestBody.system = system;

    for (var attempt = 0; attempt < 3; attempt++) {
      var response;
      try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify(requestBody)
        });
      } catch (networkError) {
        if (attempt < 2) {
          if (onEvent) onEvent({ type: 'progress', qType: qType, step: 'Claude 네트워크 오류 — 재시도 중' });
          await wait(3000 * (attempt + 1));
          continue;
        }
        throw networkError;
      }

      if ((response.status === 429 || response.status === 529) && attempt < 2) {
        var retryAfter = parseInt(response.headers.get('retry-after') || '0', 10);
        var delay = retryAfter > 0 ? retryAfter * 1000 : 5000 * (attempt + 1);
        if (onEvent) onEvent({ type: 'progress', qType: qType, step: 'Claude 사용량 제한 — 재시도 중' });
        await wait(delay);
        continue;
      }

      if (!response.ok) {
        var errorBody = await response.json().catch(function () { return {}; });
        throw new Error((errorBody.error && errorBody.error.message) || ('Claude HTTP ' + response.status));
      }

      var data = await response.json();
      if (data.usage && typeof window._addTokens === 'function') {
        window._addTokens(model, data.usage.input_tokens || 0, data.usage.output_tokens || 0);
      }

      // Sonnet 계열은 thinking/reasoning 블록 뒤에 실제 text 블록을 둘 수 있다.
      // content[0]을 가정하지 않고 모든 text 블록만 순서대로 합친다.
      var text = Array.isArray(data.content) ? data.content.filter(function (block) {
        return block && block.type === 'text' && typeof block.text === 'string';
      }).map(function (block) {
        return block.text;
      }).join('\n') : '';

      if (data.stop_reason === 'max_tokens') {
        var truncated = new Error('Claude 응답이 최대 출력 토큰에서 잘렸습니다.');
        truncated.code = 'CLAUDE_MAX_TOKENS';
        throw truncated;
      }
      if (!text.trim()) throw new Error('Claude 응답에 처리 가능한 text 블록이 없습니다.');
      return text.trim();
    }

    throw new Error('Claude 호출 재시도 횟수를 초과했습니다.');
  }

  window._callLLM = async function (system, userMsg, modelId, apiKey, onEvent, qType) {
    var provider = window._detectProvider(modelId);
    if (provider.type !== 'claude') {
      return originalCallLLM(system, userMsg, modelId, apiKey, onEvent, qType);
    }
    var text = await callClaude(system, userMsg, provider.model, apiKey, onEvent, qType);
    if (qType === 'analyze' && typeof window._extractJson === 'function') {
      var parsed = window._extractJson(text);
      if (!parsed || !parsed.obj || !parsed.subj) {
        if (onEvent) onEvent({ type: 'progress', qType: qType, step: 'Claude 분석 JSON 자동 복구 중' });
        text = await callClaude(system, userMsg + [
          '',
          'IMPORTANT RETRY: Your previous response was not a usable JSON object.',
          'Return exactly one complete JSON object with top-level obj, subj, and transform keys.',
          'Do not include reasoning, markdown, comments, or code fences.'
        ].join('\n'), provider.model, apiKey, onEvent, qType);
      }
    }
    return text;
  };
})();

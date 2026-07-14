(function() {
  'use strict';

  var BP_MODEL_KEY = 'mp_bp_models';
  var bpAnalysisResults = [];
  var bpWorkbookResults = [];
  var bpCurrentView = 'analysis';
  var bpTimer = null;
  var bpStartTime = 0;
  var bpPassages = [];
  var bpSelectedId = null;
  var bpNextId = 0;

  var BP_ANALYSIS_PROMPT = [
    '당신은 수능·내신 영어 지문을 분석하여 "지문 blueprint"를 만드는 전문가입니다.',
    '반드시 단일 JSON 객체만 반환하세요. 마크다운 코드블록은 쓰지 마세요.',
    '목표는 학생과 강사가 지문의 구조, 출제 포인트, 문장별 해석 포인트를 빠르게 파악하게 하는 것입니다.',
    '',
    'JSON 스키마:',
    '{',
    '  "title": "짧은 영어 제목",',
    '  "reference": "사용자가 준 참조 정보",',
    '  "one_sentence_summary_en": "영어 한 문장 요약",',
    '  "one_sentence_summary_ko": "한국어 한 문장 요약",',
    '  "main_idea": "핵심 주장/요지",',
    '  "structure": [{"label":"도입|전개|반전|결론 등","content":"해당 내용 요약"}],',
    '  "sentences": [{"num":1,"english":"원문 문장","korean":"자연스러운 해석","role":"문장 기능","examiner":"출제 포인트","grammar":"문법/구문 포인트","vocab":[{"word":"단어","meaning":"뜻"}]}],',
    '  "exam_points": [{"type":"어법|어휘|빈칸|순서|삽입|요지|제목|함축|내용일치","reason":"출제 가능 이유","target":"본문 근거"}],',
    '  "key_vocab": [{"word":"단어","meaning":"뜻","note":"문맥상 포인트"}],',
    '  "wrapup": {"flow":"논리 흐름을 화살표로 요약","teacher_note":"수업용 핵심 코멘트"}',
    '}'
  ].join('\n');

  var BP_WORKBOOK_PROMPT = [
    '당신은 영어 지문 1개로 "블루프린트 워크북 STEP 1~11"을 만드는 전문가입니다.',
    '반드시 단일 JSON 객체만 반환하세요. 마크다운 코드블록은 쓰지 마세요.',
    '원문 지문에 근거한 훈련 자료와 정답지를 만드세요.',
    '',
    'JSON 스키마:',
    '{',
    '  "header": {"title_en":"제목","subtitle_ko":"한국어 부제","genre":"글 유형"},',
    '  "step1": {"summary_en":"영어 요약","summary_ko":"한국어 요약","keywords":["핵심어"]},',
    '  "step2": [{"num":1,"sentence":"원문 문장","chunked":"직독직해 단위","korean":"해석"}],',
    '  "step3": [{"num":1,"question":"문법 질문","answer":"정답과 이유"}],',
    '  "step4": [{"num":1,"question":"논리 연결 질문","answer":"정답"}],',
    '  "step5": [{"num":1,"question":"함의추론 5지선다","options":["① ...","② ...","③ ...","④ ...","⑤ ..."],"answer":"정답과 이유"}],',
    '  "step6": {"flow_lines":["논리 흐름 빈칸형 라인들"],"answers":["정답"]},',
    '  "step7": [{"type":"어법|삽입|어휘","question":"실전 변형 문제","answer":"정답과 이유"}],',
    '  "step8": {"conditions":["조건"],"korean":"한글 해석","word_box":["보기 단어"],"answer":"모범 영작"},',
    '  "step9": [{"num":1,"question":"동사 변형 빈칸 문장","answer":"정답"}],',
    '  "step10": [{"num":1,"question":"명사/형용사/부사 빈칸 문장","answer":"정답"}],',
    '  "step11": [{"code":"S1","type":"서술형 유형","score":"배점","question":"문항","conditions":["조건"],"answer":"모범답안","teacher_note":"해설"}],',
    '  "teachers_only": {"deep_read":"행간 읽기","traps":"오답 함정","tips":"지도 팁"},',
    '  "answer_key": "전체 정답지를 보기 좋게 정리"',
    '}'
  ].join('\n');

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    return sec < 60 ? sec + '초' : Math.floor(sec / 60) + '분 ' + (sec % 60) + '초';
  }
  function log(msg) {
    var el = $('bp-log');
    if (!el) return;
    var now = new Date();
    var t = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
    el.textContent = (el.textContent === '대기 중' ? '' : el.textContent + '\n') + '[' + t + '] ' + msg;
    el.scrollTop = el.scrollHeight;
  }
  function extractJson(text) {
    var s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try { return JSON.parse(s); } catch(e) {}
    var start = s.indexOf('{');
    var end = s.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1));
    throw new Error('JSON 객체를 찾지 못했습니다.');
  }
  function getKeyForModel(modelId) {
    var cfg = window._detectProvider ? _detectProvider(modelId) : { type: 'claude' };
    if (cfg.type === 'gemini') return window.getGeminiKey ? getGeminiKey() : localStorage.getItem('mp_gemini_key') || '';
    if (cfg.type === 'openai') return window.getOpenAIKey ? getOpenAIKey() : localStorage.getItem('mp_openai_key') || '';
    if (cfg.type === 'deepseek') return window.getDeepSeekKey ? getDeepSeekKey() : localStorage.getItem('mp_deepseek_key') || '';
    return window.getKey ? getKey() : localStorage.getItem('mp_key') || '';
  }
  function selectedAnalysisModels() {
    return [1,2,3,4].map(function(i) {
      var el = $('bp-ai' + i);
      return el ? el.value : '';
    }).filter(Boolean);
  }
  function saveModelConfig() {
    try {
      localStorage.setItem(BP_MODEL_KEY, JSON.stringify({
        ai1: $('bp-ai1') && $('bp-ai1').value,
        ai2: $('bp-ai2') && $('bp-ai2').value,
        ai3: $('bp-ai3') && $('bp-ai3').value,
        ai4: $('bp-ai4') && $('bp-ai4').value,
        workbook: $('bp-workbook-ai') && $('bp-workbook-ai').value,
        workbook2: $('bp-workbook-ai2') && $('bp-workbook-ai2').value,
        workbook3: $('bp-workbook-ai3') && $('bp-workbook-ai3').value,
        workbook4: $('bp-workbook-ai4') && $('bp-workbook-ai4').value
      }));
    } catch(e) {}
  }
  function restoreModelConfig() {
    try {
      var cfg = JSON.parse(localStorage.getItem(BP_MODEL_KEY) || 'null');
      if (!cfg) return;
      ['ai1','ai2','ai3','ai4'].forEach(function(k) {
        var el = $('bp-' + k);
        if (el && cfg[k] != null) el.value = cfg[k];
      });
      if ($('bp-workbook-ai') && cfg.workbook) $('bp-workbook-ai').value = cfg.workbook;
      if ($('bp-workbook-ai2') && cfg.workbook2 != null) $('bp-workbook-ai2').value = cfg.workbook2;
      if ($('bp-workbook-ai3') && cfg.workbook3 != null) $('bp-workbook-ai3').value = cfg.workbook3;
      if ($('bp-workbook-ai4') && cfg.workbook4 != null) $('bp-workbook-ai4').value = cfg.workbook4;
    } catch(e) {}
  }
  function selectedWorkbookModels() {
    return ['bp-workbook-ai','bp-workbook-ai2','bp-workbook-ai3','bp-workbook-ai4'].map(function(id) {
      var el = $(id);
      return el ? el.value : '';
    }).filter(Boolean);
  }
  function setStatusText(id, ok) {
    var el = $(id);
    if (!el) return;
    el.textContent = ok ? '✓ 저장됨' : '키 필요';
    el.className = ok ? 'pk-status ok' : 'pk-status';
  }
  function refreshKeys() {
    if ($('bp-api-key-input')) $('bp-api-key-input').value = localStorage.getItem('mp_key') || '';
    if ($('bp-gemini-key-input')) $('bp-gemini-key-input').value = localStorage.getItem('mp_gemini_key') || '';
    if ($('bp-openai-key-input')) $('bp-openai-key-input').value = localStorage.getItem('mp_openai_key') || '';
    if ($('bp-deepseek-key-input')) $('bp-deepseek-key-input').value = localStorage.getItem('mp_deepseek_key') || '';
    setStatusText('bp-c-status', !!localStorage.getItem('mp_key'));
    setStatusText('bp-g-status', !!localStorage.getItem('mp_gemini_key'));
    setStatusText('bp-o-status', !!localStorage.getItem('mp_openai_key'));
    setStatusText('bp-d-status', !!localStorage.getItem('mp_deepseek_key'));
  }
  function startProgress(total, label) {
    var box = $('bp-gp-box'), count = $('bp-gp-count'), fill = $('bp-gp-fill'), time = $('bp-gp-time'), lab = $('bp-gp-label');
    bpStartTime = Date.now();
    if (box) { box.style.display = 'flex'; box.classList.remove('done'); }
    if (count) count.textContent = '0 / ' + total;
    if (fill) fill.style.width = '0%';
    if (time) time.textContent = '0초';
    if (lab) lab.textContent = label || '실행 중…';
    clearInterval(bpTimer);
    bpTimer = setInterval(function() {
      if (time) time.textContent = fmtTime((Date.now() - bpStartTime) / 1000);
    }, 500);
  }
  function updateProgress(done, total, label) {
    var count = $('bp-gp-count'), fill = $('bp-gp-fill'), lab = $('bp-gp-label');
    if (count) count.textContent = done + ' / ' + total;
    if (fill) fill.style.width = Math.round(done / Math.max(1, total) * 100) + '%';
    if (lab && label) lab.textContent = label;
  }
  function finishProgress(label) {
    clearInterval(bpTimer);
    bpTimer = null;
    var elapsed = fmtTime((Date.now() - bpStartTime) / 1000);
    if ($('bp-gp-time')) $('bp-gp-time').textContent = elapsed + ' 소요';
    if ($('bp-gp-label')) $('bp-gp-label').textContent = label || '완료';
    if ($('bp-gp-box')) $('bp-gp-box').classList.add('done');
  }
  async function callBlueprint(system, userMsg, modelId) {
    if (!window._callLLM) throw new Error('공통 AI 호출 함수(_callLLM)를 찾지 못했습니다.');
    var key = getKeyForModel(modelId);
    if (!key) throw new Error(modelId + ' API 키가 없습니다.');
    return _callLLM(system, userMsg, modelId, key, null, 'blueprint');
  }
  function buildUserMsg(reference, passage, mode) {
    return '참조 정보: ' + (reference || '(없음)') + '\n\n[영어 지문]\n' + passage + '\n\n작업: ' + mode + '\n반드시 단일 JSON 객체로 반환하세요.';
  }
  function selectedPassage() {
    return bpPassages.find(function(p) { return p.id === bpSelectedId; }) || null;
  }
  function syncSelectedFromInputs() {
    var p = selectedPassage();
    if (!p) return;
    p.reference = ($('bp-reference') && $('bp-reference').value || '').trim();
    p.text = ($('bp-passage') && $('bp-passage').value || '').trim();
  }
  function syncInputsFromSelected() {
    var p = selectedPassage();
    if ($('bp-reference')) $('bp-reference').value = p ? (p.reference || '') : '';
    if ($('bp-passage')) $('bp-passage').value = p ? (p.text || '') : '';
  }
  function passageSnippet(p) {
    var t = (p && p.text || '').replace(/\s+/g, ' ').trim();
    return t || '영어 지문을 입력하세요';
  }
  function renderQueue() {
    var list = $('bp-queue-list');
    var stat = $('bp-queue-status');
    if (stat) stat.textContent = bpPassages.length + '개';
    if (!list) return;
    if (!bpPassages.length) {
      list.innerHTML = '<div class="bp-queue-empty">지문을 추가하세요</div>';
      return;
    }
    list.innerHTML = bpPassages.map(function(p, i) {
      var active = p.id === bpSelectedId ? ' active' : '';
      var status = p.status || '대기';
      return '<div class="bp-queue-item' + active + '" onclick="bpSelectPassage(' + p.id + ')">' +
        '<div class="bp-queue-top"><span class="bp-queue-title">지문 ' + (i + 1) + '</span><span class="bp-queue-status">' + esc(status) + '</span>' +
        '<button type="button" class="bp-queue-del" title="삭제" onclick="event.stopPropagation();bpDeletePassage(' + p.id + ')">×</button></div>' +
        '<div class="bp-queue-snippet">' + esc(passageSnippet(p)) + '</div></div>';
    }).join('');
  }
  function setSelectedStatus(status) {
    var p = selectedPassage();
    if (p) {
      p.status = status;
      renderQueue();
    }
  }
  function ensureInitialPassage() {
    if (bpPassages.length) return;
    bpPassages.push({ id: ++bpNextId, reference: '', text: '', status: '대기' });
    bpSelectedId = bpPassages[0].id;
    syncInputsFromSelected();
    renderQueue();
  }

  function renderAnalysis() {
    var panel = $('bp-analysis-panel');
    if (!panel) return;
    if (!bpAnalysisResults.length) {
      panel.innerHTML = '<div class="empty-state"><div class="empty-icon">←</div><div>분석 결과가 없습니다</div></div>';
      return;
    }
    panel.innerHTML = '<div class="bp-result-inner">' + bpAnalysisResults.map(function(r, idx) {
      if (r.error) return '<div class="bp-error"><b>' + esc(r.model) + '</b><br>' + esc(r.error) + '</div>';
      var d = r.data || {};
      var structure = Array.isArray(d.structure) ? d.structure.map(function(x) {
        return '<div class="bp-section"><h3>' + esc(x.label || '구조') + '</h3><p>' + esc(x.content || '') + '</p></div>';
      }).join('') : '';
      var sentences = Array.isArray(d.sentences) ? d.sentences.map(function(s) {
        var vocab = Array.isArray(s.vocab) ? s.vocab.map(function(v) { return esc(v.word || '') + ': ' + esc(v.meaning || ''); }).join(' / ') : '';
        return '<div class="bp-sentence"><p><span class="bp-sentence-num">' + esc(s.num || '') + '</span>' + esc(s.english || '') + '</p><p>' + esc(s.korean || '') + '</p><p><b>역할</b> ' + esc(s.role || '') + '</p><p><b>출제</b> ' + esc(s.examiner || '') + '</p><p><b>구문</b> ' + esc(s.grammar || '') + '</p>' + (vocab ? '<p><b>어휘</b> ' + vocab + '</p>' : '') + '</div>';
      }).join('') : '';
      var exam = Array.isArray(d.exam_points) ? d.exam_points.map(function(x) {
        return '<tr><td>' + esc(x.type || '') + '</td><td>' + esc(x.reason || '') + '</td><td>' + esc(x.target || '') + '</td></tr>';
      }).join('') : '';
      var vocabRows = Array.isArray(d.key_vocab) ? d.key_vocab.map(function(x) {
        return '<tr><td>' + esc(x.word || '') + '</td><td>' + esc(x.meaning || '') + '</td><td>' + esc(x.note || '') + '</td></tr>';
      }).join('') : '';
      return '<div class="bp-result-block" data-result-idx="' + idx + '">' +
        '<div class="bp-result-hd"><div class="bp-result-title">' + esc(d.title || 'Blueprint Analysis') + '</div><div class="bp-result-meta">' + esc(r.model) + '<br>' + esc(r.elapsed) + '</div></div>' +
        '<div class="bp-chip-row"><span class="bp-chip main">' + esc(d.reference || r.reference || '참조 없음') + '</span><span class="bp-chip">' + esc(d.one_sentence_summary_ko || '') + '</span></div>' +
        '<div class="bp-section"><h3>핵심 요지</h3><p>' + esc(d.main_idea || d.one_sentence_summary_en || '') + '</p></div>' +
        structure +
        (exam ? '<div class="bp-section"><h3>출제 포인트</h3><table class="bp-table"><thead><tr><th>유형</th><th>이유</th><th>근거</th></tr></thead><tbody>' + exam + '</tbody></table></div>' : '') +
        (sentences ? '<div class="bp-section"><h3>문장별 분석</h3>' + sentences + '</div>' : '') +
        (vocabRows ? '<div class="bp-section"><h3>핵심 어휘</h3><table class="bp-table"><thead><tr><th>어휘</th><th>뜻</th><th>포인트</th></tr></thead><tbody>' + vocabRows + '</tbody></table></div>' : '') +
        (d.wrapup ? '<div class="bp-section"><h3>Wrap-up</h3><p>' + esc(d.wrapup.flow || '') + '</p><p>' + esc(d.wrapup.teacher_note || '') + '</p></div>' : '') +
      '</div>';
    }).join('<hr style="border:none;border-top:1px solid #E5E7EB;margin:18px 0">') + '</div>';
  }

  function renderWorkbook() {
    var panel = $('bp-workbook-panel');
    if (!panel) return;
    if (!bpWorkbookResults.length) {
      panel.innerHTML = '<div class="empty-state"><div class="empty-icon">←</div><div>워크북 결과가 없습니다</div></div>';
      return;
    }
    var html = '<div class="bp-result-inner">' + bpWorkbookResults.map(function(r) {
      if (r.error) return '<div class="bp-error"><b>' + esc(r.model) + '</b><br>' + esc(r.error) + '</div>';
      var d = r.data || {};
      var part = '<div class="bp-result-hd"><div class="bp-result-title">' + esc((d.header && d.header.title_en) || 'Blueprint Workbook') + '</div><div class="bp-result-meta">' + esc(r.model) + '<br>' + esc(r.elapsed) + '</div></div>';
      if (d.header) part += '<div class="bp-chip-row"><span class="bp-chip main">' + esc(d.header.subtitle_ko || '') + '</span><span class="bp-chip">' + esc(d.header.genre || '') + '</span></div>';
      ['step1','step2','step3','step4','step5','step6','step7','step8','step9','step10','step11'].forEach(function(k) {
        if (!d[k]) return;
        part += '<div class="bp-section"><h3>' + esc(k.toUpperCase()) + '</h3>' + renderAny(d[k]) + '</div>';
      });
      if (d.teachers_only) part += '<div class="bp-section"><h3>Teacher Only</h3>' + renderAny(d.teachers_only) + '</div>';
      if (d.answer_key) part += '<div class="bp-section"><h3>정답지</h3>' + renderAny(d.answer_key) + '</div>';
      return part;
    }).join('<hr style="border:none;border-top:1px solid #E5E7EB;margin:18px 0">');
    html += '</div>';
    panel.innerHTML = html;
  }
  function renderAny(value) {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return '<p>' + esc(value) + '</p>';
    if (Array.isArray(value)) {
      return value.map(function(item, i) { return '<div class="bp-sentence"><span class="bp-sentence-num">' + (i + 1) + '</span>' + renderAny(item) + '</div>'; }).join('');
    }
    if (typeof value === 'object') {
      return Object.keys(value).map(function(k) {
        return '<p><b>' + esc(k) + '</b>: ' + (typeof value[k] === 'object' ? renderAny(value[k]) : esc(value[k])) + '</p>';
      }).join('');
    }
    return '<p>' + esc(value) + '</p>';
  }

  window.bpSwitchView = function(view) {
    bpCurrentView = view;
    if ($('bp-analysis-panel')) $('bp-analysis-panel').style.display = view === 'analysis' ? '' : 'none';
    if ($('bp-workbook-panel')) $('bp-workbook-panel').style.display = view === 'workbook' ? '' : 'none';
    if ($('bp-view-analysis')) $('bp-view-analysis').classList.toggle('active', view === 'analysis');
    if ($('bp-view-workbook')) $('bp-view-workbook').classList.toggle('active', view === 'workbook');
  };

  window.bpRunAnalysis = async function() {
    syncSelectedFromInputs();
    var passage = ($('bp-passage') && $('bp-passage').value || '').trim();
    var reference = ($('bp-reference') && $('bp-reference').value || '').trim();
    if (!passage) { showToast && showToast('영어 지문을 입력하세요'); return; }
    var models = selectedAnalysisModels();
    if (!models.length) { showToast && showToast('분석 AI를 1개 이상 선택하세요'); return; }
    saveModelConfig();
    setSelectedStatus('분석 중');
    bpAnalysisResults = [];
    renderAnalysis();
    bpSwitchView('analysis');
    $('bp-run-analysis-btn').disabled = true;
    startProgress(models.length, '블루프린트 분석 중…');
    log('분석 시작: ' + models.join(', '));
    var done = 0;
    var userMsg = buildUserMsg(reference, passage, '지문 blueprint 분석');
    var tasks = models.map(async function(modelId) {
      var st = Date.now();
      try {
        log(modelId + ' 호출 중');
        var raw = await callBlueprint(BP_ANALYSIS_PROMPT, userMsg, modelId);
        var data = extractJson(raw);
        bpAnalysisResults.push({ model: modelId, data: data, reference: reference, elapsed: fmtTime((Date.now() - st) / 1000) });
        log(modelId + ' 완료');
      } catch(e) {
        bpAnalysisResults.push({ model: modelId, error: e.message, elapsed: fmtTime((Date.now() - st) / 1000) });
        log(modelId + ' 오류: ' + e.message);
      } finally {
        done++;
        updateProgress(done, models.length, done + ' / ' + models.length + ' 분석 완료');
        renderAnalysis();
      }
    });
    await Promise.all(tasks);
    finishProgress('분석 완료');
    setSelectedStatus(bpAnalysisResults.some(function(r) { return !r.error; }) ? '분석 완료' : '오류');
    $('bp-run-analysis-btn').disabled = false;
    if ($('bp-pdf-btn')) $('bp-pdf-btn').style.display = bpAnalysisResults.some(function(r){ return !r.error; }) ? '' : 'none';
  };

  window.bpRunWorkbook = async function() {
    syncSelectedFromInputs();
    var passage = ($('bp-passage') && $('bp-passage').value || '').trim();
    var reference = ($('bp-reference') && $('bp-reference').value || '').trim();
    var models = selectedWorkbookModels();
    if (!passage) { showToast && showToast('영어 지문을 입력하세요'); return; }
    if (!models.length) { showToast && showToast('워크북 AI를 1개 이상 선택하세요'); return; }
    saveModelConfig();
    setSelectedStatus('워크북 중');
    bpWorkbookResults = [];
    renderWorkbook();
    bpSwitchView('workbook');
    $('bp-run-workbook-btn').disabled = true;
    startProgress(models.length, '워크북 생성 중…');
    log('워크북 생성 시작: ' + models.join(', '));
    var done = 0;
    var userMsg = buildUserMsg(reference, passage, '워크북 STEP 1~11 생성');
    await Promise.all(models.map(async function(modelId) {
      var st = Date.now();
      try {
        log(modelId + ' 워크북 호출 중');
        var raw = await callBlueprint(BP_WORKBOOK_PROMPT, userMsg, modelId);
        bpWorkbookResults.push({ model: modelId, data: extractJson(raw), elapsed: fmtTime((Date.now() - st) / 1000) });
        log(modelId + ' 워크북 완료');
      } catch(e) {
        bpWorkbookResults.push({ model: modelId, error: e.message, elapsed: fmtTime((Date.now() - st) / 1000) });
        log(modelId + ' 워크북 오류: ' + e.message);
      } finally {
        done++;
        updateProgress(done, models.length, done + ' / ' + models.length + ' 워크북 완료');
        renderWorkbook();
      }
    }));
    finishProgress(bpWorkbookResults.some(function(r) { return !r.error; }) ? '워크북 완료' : '오류 발생');
    setSelectedStatus(bpWorkbookResults.some(function(r) { return !r.error; }) ? '워크북 완료' : '오류');
    $('bp-run-workbook-btn').disabled = false;
    if ($('bp-word-btn')) $('bp-word-btn').style.display = bpWorkbookResults.some(function(r) { return !r.error; }) ? '' : 'none';
  };

  window.bpDownloadAnalysisPdf = function() {
    var panel = $('bp-analysis-panel');
    if (!panel || !bpAnalysisResults.length) return;
    var styles = Array.from(document.querySelectorAll('style,link[rel="stylesheet"]')).map(function(n) {
      return n.tagName === 'STYLE' ? '<style>' + n.innerHTML + '</style>' : '<link rel="stylesheet" href="' + n.getAttribute('href') + '">';
    }).join('\n');
    var w = window.open('', '_blank', 'width=900,height=700');
    w.document.write('<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>blueprint_analysis</title>' + styles + '<style>body{background:#fff;padding:20px}.card{box-shadow:none}.bp-result-card{border:none}</style></head><body>' + panel.innerHTML + '<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>');
    w.document.close();
  };

  window.bpDownloadWorkbookWord = function() {
    if (!bpWorkbookResults.some(function(r) { return !r.error; })) return;
    var panel = $('bp-workbook-panel');
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Malgun Gothic,Arial,sans-serif;font-size:11pt;line-height:1.6}.bp-section{border:1px solid #ddd;padding:10px;margin:10px 0}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px}</style></head><body>' + (panel ? panel.innerHTML : '') + '</body></html>';
    try {
      var blob = window.htmlDocx ? window.htmlDocx.asBlob(html) : new Blob([html], { type: 'application/msword' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'blueprint_workbook.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch(e) {
      showToast && showToast('Word 다운로드 오류: ' + e.message);
    }
  };

  window.bpSaveApiKey = function(){ localStorage.setItem('mp_key', ($('bp-api-key-input').value || '').trim()); refreshKeys(); showToast && showToast('Claude 키 저장됨'); };
  window.bpClearApiKey = function(){ localStorage.removeItem('mp_key'); refreshKeys(); };
  window.bpSaveGeminiKey = function(){ localStorage.setItem('mp_gemini_key', ($('bp-gemini-key-input').value || '').trim()); refreshKeys(); showToast && showToast('Gemini 키 저장됨'); };
  window.bpClearGeminiKey = function(){ localStorage.removeItem('mp_gemini_key'); refreshKeys(); };
  window.bpSaveOpenAIKey = function(){ localStorage.setItem('mp_openai_key', ($('bp-openai-key-input').value || '').trim()); refreshKeys(); showToast && showToast('OpenAI 키 저장됨'); };
  window.bpClearOpenAIKey = function(){ localStorage.removeItem('mp_openai_key'); refreshKeys(); };
  window.bpSaveDeepSeekKey = function(){ localStorage.setItem('mp_deepseek_key', ($('bp-deepseek-key-input').value || '').trim()); refreshKeys(); showToast && showToast('DeepSeek 키 저장됨'); };
  window.bpClearDeepSeekKey = function(){ localStorage.removeItem('mp_deepseek_key'); refreshKeys(); };

  window.bpAddPassage = function() {
    syncSelectedFromInputs();
    var id = ++bpNextId;
    bpPassages.push({ id: id, reference: '', text: '', status: '대기' });
    bpSelectedId = id;
    bpAnalysisResults = [];
    bpWorkbookResults = [];
    syncInputsFromSelected();
    renderQueue();
    renderAnalysis();
    renderWorkbook();
    setTimeout(function() {
      var ta = $('bp-passage');
      if (ta) ta.focus();
    }, 40);
  };
  window.bpSelectPassage = function(id) {
    syncSelectedFromInputs();
    bpSelectedId = id;
    bpAnalysisResults = [];
    bpWorkbookResults = [];
    syncInputsFromSelected();
    renderQueue();
    renderAnalysis();
    renderWorkbook();
  };
  window.bpDeletePassage = function(id) {
    bpPassages = bpPassages.filter(function(p) { return p.id !== id; });
    if (bpSelectedId === id) {
      bpSelectedId = bpPassages.length ? bpPassages[Math.max(0, bpPassages.length - 1)].id : null;
    }
    if (!bpPassages.length) {
      bpPassages.push({ id: ++bpNextId, reference: '', text: '', status: '대기' });
      bpSelectedId = bpPassages[0].id;
    }
    bpAnalysisResults = [];
    bpWorkbookResults = [];
    syncInputsFromSelected();
    renderQueue();
    renderAnalysis();
    renderWorkbook();
  };

  window.bpInit = function() {
    refreshKeys();
    restoreModelConfig();
    ensureInitialPassage();
    ['bp-ai1','bp-ai2','bp-ai3','bp-ai4','bp-workbook-ai','bp-workbook-ai2','bp-workbook-ai3','bp-workbook-ai4'].forEach(function(id) {
      var el = $(id);
      if (el && !el._bpBound) {
        el.addEventListener('change', saveModelConfig);
        el._bpBound = true;
      }
    });
    ['bp-reference','bp-passage'].forEach(function(id) {
      var el = $(id);
      if (el && !el._bpInputBound) {
        el.addEventListener('input', function() {
          syncSelectedFromInputs();
          renderQueue();
        });
        el._bpInputBound = true;
      }
    });
  };

  document.addEventListener('DOMContentLoaded', function() {
    if ($('tab-blueprint')) window.bpInit();
  });
})();

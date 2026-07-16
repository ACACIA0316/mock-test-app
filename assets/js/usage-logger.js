(function () {
  'use strict';

  var SUPABASE_URL = 'https://ownvnfjkdsokzrwncekg.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_uAbGLWv5_NcJX9pkh7EWhA_BDLJstcn';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('[usage-logger] supabase-js가 로드되지 않았습니다.');
    return;
  }
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  var TYPE_LABEL_MAP = {
    '어법':'어법', '빈칸B형':'빈칸 B형', '빈칸A-1형':'빈칸 A-1형', '빈칸A형':'빈칸 A형', '빈칸C형':'빈칸 C형',
    '제목':'제목', '주제':'주제', '요지':'요지', '삽입A형':'삽입 A형', '삽입B형':'삽입 B형',
    '순서A형':'순서 A형', '순서B형':'순서 B형', '순서B-1형':'순서 B-1형', '순서C형':'순서 C형',
    '어휘':'어휘', '무관한문장':'무관한 문장', '함축의미':'함축의미', '의미오지선다':'의미오지선다',
    '내용일치':'내용일치', '추론':'추론', '사례형':'사례형',
    '네모박스(HO)':'네모박스(HO)', '핵심어적절(HO)':'핵심어적절(HO)', '요약어휘(HO)':'요약어휘(HO)',
    '어법(HO)':'어법(HO)', '어법(HO)(DC)':'어법(HO)(DC)',
    '어법서술':'어법서술', 'summary_blank':'요약 빈칸형', 'restatement_blank':'재진술 빈칸형',
    'word_order_blank':'어순배열형', 'new_order_blank':'New 어순배열형', 'understanding_sm':'핵심내용형(SM)'
  };

  var SUBJECTIVE_TYPES = new Set([
    'summary_blank', 'restatement_blank', 'word_order_blank', 'new_order_blank', 'understanding_sm', '어법서술'
  ]);

  var VALID_DIFFICULTY = new Set(['하', '중', '상', '최상']);

  function logQuestion(ev, passageObj) {
    try {
      var teacher = window.AuthGate && window.AuthGate.getTeacher ? window.AuthGate.getTeacher() : null;
      if (!teacher || !teacher.id) return;

      var label = TYPE_LABEL_MAP[ev.qType];
      if (!label) return;

      var category = SUBJECTIVE_TYPES.has(ev.qType) ? '서답형' : '객관식';
      var difficulty = VALID_DIFFICULTY.has(ev.attractiveness) ? ev.attractiveness : '중';
      var passageText = (ev.passageText || (passageObj && passageObj.text) || '').slice(0, 4000);

      sb.from('questions').insert({
        teacher_id: teacher.id,
        passage: passageText,
        question_category: category,
        question_type: label,
        difficulty: difficulty,
        generated_content: JSON.stringify(ev.question || {}).slice(0, 20000)
      }).then(function (res) {
        if (res.error) console.warn('[usage-logger] 기록 실패:', res.error.message);
      });
    } catch (e) {
      console.warn('[usage-logger] 오류:', e);
    }
  }

  function hookHandleEvent() {
    if (typeof window.handleEvent !== 'function') return false;
    if (window.handleEvent.__usageLoggerHooked) return true;
    var original = window.handleEvent;
    var wrapped = function (ev, p, progItems) {
      var r = original.apply(this, arguments);
      if (ev && ev.type === 'result') logQuestion(ev, p);
      return r;
    };
    wrapped.__usageLoggerHooked = true;
    window.handleEvent = wrapped;
    return true;
  }

  if (!hookHandleEvent()) {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (hookHandleEvent() || tries > 20) clearInterval(timer);
    }, 200);
  }
})();

(function () {
  'use strict';

  // ── Supabase 연결 정보 ──────────────────────────────
  var SUPABASE_URL = 'https://ownvnfjkdsokzrwncekg.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_uAbGLWv5_NcJX9pkh7EWhA_BDLJstcn';
  var SESSION_KEY = 'mp_teacher_session';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('[auth-gate] supabase-js가 로드되지 않았습니다. index.html에 CDN 스크립트가 있는지 확인하세요.');
    return;
  }
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── 세션 저장/조회 ──────────────────────────────────
  function getSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) { return null; }
  }
  function setSession(teacher) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(teacher));
  }
  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  // 다른 스크립트(문제 생성 로직 등)에서 현재 로그인한 선생님 정보를 쓸 수 있도록 전역 노출
  window.AuthGate = {
    getTeacher: getSession,
    logout: function () { clearSession(); location.reload(); },
  };

  // ── 오버레이 UI 생성 ────────────────────────────────
  function buildOverlay() {
    var overlay = document.createElement('div');
    overlay.id = 'auth-gate-overlay';
    overlay.innerHTML =
      '<div class="ag-card">' +
        '<div class="ag-title">multiple-produce</div>' +
        '<div class="ag-sub">선생님 로그인 코드를 입력하세요</div>' +
        '<input id="ag-code-input" class="ag-input" type="text" placeholder="코드 입력" maxlength="20" autocomplete="off" autocapitalize="characters">' +
        '<button id="ag-submit-btn" class="ag-btn">입장하기</button>' +
        '<div id="ag-error" class="ag-error"></div>' +
        '<div class="ag-badge">🔒 학원 내부 전용</div>' +
      '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function buildUserBar(teacher) {
    var old = document.getElementById('auth-gate-userbar');
    if (old) old.remove();
    var bar = document.createElement('div');
    bar.id = 'auth-gate-userbar';
    var roleLabel = teacher.role === 'admin' ? '관리자' : '선생님';
    var roleClass = teacher.role === 'admin' ? 'ag-role admin' : 'ag-role';
    bar.innerHTML =
      '<span class="ag-name">' + AppSafety_escape(teacher.name) + '</span>' +
      '<span class="' + roleClass + '">' + roleLabel + '</span>' +
      '<button class="ag-logout" id="ag-logout-btn">로그아웃</button>';
    document.body.appendChild(bar);
    document.getElementById('ag-logout-btn').addEventListener('click', function () {
      window.AuthGate.logout();
    });
  }

  function AppSafety_escape(s) {
    if (window.AppSafety && window.AppSafety.escapeHtml) return window.AppSafety.escapeHtml(s);
    return String(s == null ? '' : s);
  }

  // ── 로그인 처리 ─────────────────────────────────────
  async function attemptLogin(overlay, code) {
    var btn = document.getElementById('ag-submit-btn');
    var errBox = document.getElementById('ag-error');
    errBox.textContent = '';
    if (!code) {
      errBox.textContent = '코드를 입력해주세요';
      return;
    }
    btn.disabled = true;
    btn.textContent = '확인 중...';
    try {
      var res = await sb.rpc('verify_login', { p_code: code.trim() });
      if (res.error) throw res.error;
      var rows = res.data;
      if (!rows || rows.length === 0) {
        errBox.textContent = '코드가 올바르지 않습니다';
        btn.disabled = false;
        btn.textContent = '입장하기';
        return;
      }
      var row = rows[0];
      var teacher = { id: row.teacher_id, name: row.teacher_name, role: row.teacher_role };
      setSession(teacher);
      overlay.classList.add('hidden');
      buildUserBar(teacher);
    } catch (e) {
      console.error('[auth-gate] login error:', e);
      errBox.textContent = '연결 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      btn.disabled = false;
      btn.textContent = '입장하기';
    }
  }

  // ── 초기화 ──────────────────────────────────────────
  function init() {
    var existing = getSession();
    if (existing) {
      buildUserBar(existing);
      return;
    }
    var overlay = buildOverlay();
    var input = document.getElementById('ag-code-input');
    var btn = document.getElementById('ag-submit-btn');
    btn.addEventListener('click', function () { attemptLogin(overlay, input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') attemptLogin(overlay, input.value);
    });
    input.addEventListener('input', function () {
      input.value = input.value.toUpperCase();
    });
    setTimeout(function () { input.focus(); }, 50);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

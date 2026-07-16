// 공유 Supabase 클라이언트 + 클라이언트 세션 (서버리스)
// supabase-js UMD 전역(window.supabase)이 먼저 로드돼 있어야 함
(() => {
  const SUPABASE_URL  = 'https://tvurqqinpivnbkoyczte.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2dXJxcWlucGl2bmJrb3ljenRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxOTk4MDgsImV4cCI6MjA5Nzc3NTgwOH0.gGbMY0Da5M81JhEQrintFfxe11hllssF8hPttX2DVGc';

  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  // 로그인 세션 (sessionStorage)
  window.session = {
    set(u) { sessionStorage.setItem('dcp_user', JSON.stringify(u)); },
    get() { try { return JSON.parse(sessionStorage.getItem('dcp_user')); } catch { return null; } },
    clear() { sessionStorage.removeItem('dcp_user'); },
    // 페이지 가드: 허용 role 배열 또는 단일 문자열, 없으면 로그인으로
    require(roles) {
      const u = this.get();
      const allowed = roles ? (Array.isArray(roles) ? roles : [roles]) : null;
      if (!u || (allowed && !allowed.includes(u.role))) { window.location.href = '/'; return null; }
      return u;
    },
  };
})();

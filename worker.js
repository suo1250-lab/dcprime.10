// 바인딩 이름에 공백이 섞여 들어가도 키를 찾아낸다
function resolveKey(env) {
  if (env.GEMINI_API_KEY) return env.GEMINI_API_KEY;
  for (const k of Object.keys(env)) {
    if (k.trim() === 'GEMINI_API_KEY' && typeof env[k] === 'string') return env[k];
  }
  return '';
}

const SUPABASE_URL = 'https://tvurqqinpivnbkoyczte.supabase.co';

// service_role 키로만 login_logs 테이블에 접근 (RLS 우회, 클라이언트엔 절대 노출 안 됨)
async function insertLoginLog(env, payload) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/login_logs`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    });
  } catch { /* 로그 실패는 로그인 흐름을 막지 않음 */ }
}

async function fetchLoginLogs(env) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/login_logs?select=*&order=created_at.desc&limit=300`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) return [];
  return res.json();
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // 키 전달 (동일 출처에서만). 브라우저가 한국 IP로 Gemini를 직접 호출하기 위함.
      // 워커 IP는 Gemini 미지원 지역으로 잡혀 서버사이드 프록시가 막힘.
      if (url.pathname === '/api/key') {
        const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';
        if (!origin.includes(url.host)) {
          return new Response(JSON.stringify({ error: 'forbidden' }), {
            status: 403, headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ key: resolveKey(env) }), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });
      }

      // 관리자 로그인 기록 (원장/부원장/튜터 전용, same-origin만 허용)
      if (url.pathname === '/api/log-login' && request.method === 'POST') {
        const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';
        if (!origin.includes(url.host)) {
          return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        const body = await request.json().catch(() => null);
        if (!body || !body.sid) {
          return new Response(JSON.stringify({ error: 'bad request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        const ip = request.headers.get('CF-Connecting-IP') || '';
        const ua = request.headers.get('User-Agent') || '';
        await insertLoginLog(env, { sid: body.sid, sname: body.sname || null, role: body.role || null, ip, ua });
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      }

      // 슈퍼 관리자 전용 로그 조회 (PIN은 Worker secret, 클라이언트/DB 어디에도 저장 안 됨)
      if (url.pathname === '/api/super-logs' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        if (!body || !body.pin || body.pin !== env.SUPER_PIN) {
          return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        const logs = await fetchLoginLogs(env);
        return new Response(JSON.stringify({ logs }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }

      return env.ASSETS.fetch(request);
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

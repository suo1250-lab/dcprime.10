// 바인딩 이름에 공백이 섞여 들어가도 키를 찾아낸다
function resolveKey(env) {
  if (env.GEMINI_API_KEY) return env.GEMINI_API_KEY;
  for (const k of Object.keys(env)) {
    if (k.trim() === 'GEMINI_API_KEY' && typeof env[k] === 'string') return env[k];
  }
  return '';
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

      return env.ASSETS.fetch(request);
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

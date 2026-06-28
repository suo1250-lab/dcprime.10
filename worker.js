export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname === '/api/debug-key') {
        const key = env.GEMINI_API_KEY || '';
        return new Response(JSON.stringify({ keyLength: key.length, keyStart: key.slice(0, 6) }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url.pathname === '/api/report' && request.method === 'POST') {
        const { system, user } = await request.json();
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`;

        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { temperature: 0.7 }
          })
        });

        const json = await res.json();
        if (!res.ok) {
          return new Response(JSON.stringify({ error: json }), {
            status: res.status,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return new Response(JSON.stringify({ text }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
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

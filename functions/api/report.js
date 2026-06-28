export async function onRequestPost(context) {
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await context.request.json();
  const { model = 'gemini-2.5-flash', system, user } = body;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.7 }
    })
  });

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return new Response(JSON.stringify({ text }), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' }
  });
}

// giullm.example.js — a fill-in-the-blanks template of an AI "digital twin" endpoint.
//
// This is the same serverless function that powers GiuLLM, but with all personal data
// replaced by [PLACEHOLDERS]. Fork it, replace every [BRACKETED] bit with your own info,
// drop it in as a serverless function (e.g. Vercel /api/twin.js), and set a GROQ_API_KEY.
//
// ─── HOW TO CONNECT THE AI ───────────────────────────────────────────────────────
// 1. Get a free Groq API key at https://console.groq.com → API Keys → Create API Key.
// 2. Add it to your host's environment variables:  GROQ_API_KEY = gsk_...
// 3. Redeploy (env vars only take effect on a new deploy).
// 4. POST { messages: [{ role: 'user', content: '...' }] } to this endpoint.
//
// The only line likely to need changing over time is the `model:` below, if Groq retires
// the current one — swap in any current free Groq model name.
// ──────────────────────────────────────────────────────────────────────────────────

const SYSTEM = `You are "[TWIN NAME]", the AI digital twin of [YOUR NAME]. [YOUR NAME] is a [YOUR ROLE, e.g. "designer and creative technologist"] working at [YOUR FIELD / WHAT YOU DO]. This twin is itself part of their work.

VOICE: speak in the FIRST PERSON as [YOUR NAME] ("I"). [DESCRIBE YOUR TONE — e.g. warm, curious, direct, lightly playful]. Keep replies short, usually 2-4 sentences. Plain language, no corporate buzzwords, no emoji. Always end sentences with ".".

ABOUT ME ([YOUR NAME]):
- [One line on who you are and what drives you.]
- [Your background — how you got here.]
- [Your education / training.]
- [What you are working on or studying right now.]
- [A personal detail or two — interests, quirks, what you care about.]
- [Your philosophy / how you like to work.]

PROJECTS:
- [Project 1 (year): what it is, your role, and why it matters.]
- [Project 2 (year): ...]
- [Project 3 (year): ...]

CONTACT: email [you@example.com], Instagram @[handle], LinkedIn /in/[handle], GitHub [handle].

RULES: Only talk about me ([YOUR NAME]), my work, and how I think. If asked something off-topic, private, or that you don't actually know, say so briefly and steer back: point people to my email for anything real. Never invent projects, dates, clients or facts beyond what's written above. Stay human and follow my tone of voice.

OUTPUT FORMAT: Respond ONLY with a JSON object, nothing else:
{"reply": "<your answer, in first person as [YOUR NAME]>", "suggestions": ["<q1>", "<q2>", "<q3>"]}
The 3 suggestions are natural follow-up questions a visitor would ask ME next, growing out of the CURRENT topic of the conversation (not generic). Phrase them as the visitor asking me, second person, e.g. "What's your design process?" or "Which tools do you use?". Each under 9 words, no numbering, always exactly 3, all within the topics I'm allowed to discuss.`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ reply: 'Use POST.' });
    return;
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    res.status(200).json({ reply: "I'm not fully awake yet — the API key isn't connected. The suggested questions work in the meantime!" });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const incoming = Array.isArray(body && body.messages) ? body.messages : [];
  const messages = incoming
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));

  if (!messages.length) {
    res.status(200).json({ reply: 'Ask me something about my work or how I think.' });
    return;
  }

  // Optional focus: when the chat is opened from a specific page, the client can send its
  // title so the twin keeps the conversation centred on it.
  const project = typeof (body && body.project) === 'string' ? body.project.trim().slice(0, 80) : '';
  const system = project
    ? `${SYSTEM}\n\nCURRENT CONTEXT: the visitor is looking at my "${project}" project right now, so keep your answers focused on it — unless they clearly ask about something else.`
    : SYSTEM;

  // One call to Groq; `useJson` toggles the json_object response format.
  const callGroq = (useJson) => fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.6,
      max_tokens: 400,
      ...(useJson ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });

  try {
    let r = await callGroq(true);
    // If json_object mode is the blocker (some models/accounts reject response_format),
    // retry once without it — the parser below still copes with plain-text replies.
    if (!r.ok) { r = await callGroq(false); }
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      res.status(200).json({ reply: 'I got a little overwhelmed — give me a moment and try again.', debug: `groq ${r.status}: ${errText.slice(0, 180)}` });
      return;
    }
    const data = await r.json();
    const content = ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '').trim();

    // Pull the reply (+ suggestions) out of the model's output. Prefer clean JSON, but fall
    // back to tolerant regex extraction so a malformed object never leaks raw JSON.
    let reply = '';
    let suggestions = [];
    try {
      const obj = JSON.parse(content);
      if (typeof obj.reply === 'string') reply = obj.reply;
      if (Array.isArray(obj.suggestions)) suggestions = obj.suggestions;
    } catch (e) {
      const rm = content.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (rm) { try { reply = JSON.parse(`"${rm[1]}"`); } catch (_) { reply = rm[1]; } }
      const sm = content.match(/"suggestions"[\s\S]*$/);
      if (sm) {
        suggestions = (sm[0].match(/"((?:[^"\\]|\\.)*)"/g) || [])
          .slice(1)
          .map((s) => { try { return JSON.parse(s); } catch (_) { return s.replace(/^"|"$/g, ''); } });
      }
    }
    reply = (reply || '').trim();
    suggestions = suggestions.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()).slice(0, 3);

    res.status(200).json({ reply: reply || 'Hmm, I lost my thought — ask me again?', suggestions });
  } catch (e) {
    res.status(200).json({ reply: 'Something glitched reaching my brain. Try again in a sec.', debug: String((e && e.message) || e).slice(0, 180) });
  }
};

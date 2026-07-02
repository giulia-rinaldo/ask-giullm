# Build your own “Ask GiuLLM” — an AI digital twin you can chat with

**GiuLLM** is the little chat button on giuliarinaldo.com: a *digital twin* of me that answers questions
about my work, in my own voice. This is a guide to how it works and how you can build **your own**
version of it for any person, brand or project.

It’s deliberately simple: **a plain static website + one small serverless function + a hosted AI model.**
No framework, no database, no accounts. If you can deploy a website to [Vercel](https://vercel.com),
you can build this.

---

## How it works (the whole thing in one picture)

```
   Visitor types a question
            │
            ▼
   ┌──────────────────────┐     is it one of the
   │  Front-end widget    │──── curated questions? ──► answer instantly from a
   │  (giullm.js, in the  │        (yes)               local list. No AI call.
   │   browser)           │
   └──────────┬───────────┘
              │ (no — anything else)
              ▼
   ┌──────────────────────┐        ┌───────────────────┐
   │  Serverless function │──────► │   Groq API        │
   │  (api/giullm.js)     │  adds  │  (the AI model)   │
   │  keeps the API key   │ persona└───────────────────┘
   │  secret, adds the    │ prompt           │
   │  "who am I" prompt   │◄──────── reply + 3 follow-up
   └──────────┬───────────┘          suggestions (JSON)
              ▼
        shown in the chat
```

Two important ideas:

1. **Hybrid chat.** Common questions are answered *instantly* from a hand-written list (fast, free,
   always on-brand). Everything else goes to a real AI model.
2. **The API key never touches the browser.** It lives on the server (a Vercel *environment
   variable*), so nobody can steal it by opening the page source.

---

## What you need

- A static site (HTML/CSS/JS) hosted on **Vercel** — the serverless function is just a file in an
  `/api` folder, Vercel runs it automatically.
- A **free Groq API key** (Groq hosts open AI models and has a generous free tier).

---

## Step 1 — Get a free AI key (Groq)

1. Go to <https://console.groq.com> (log in with **email** if GitHub login misbehaves).
2. **API Keys → Create API Key** → give it any name (e.g. `portfolio-giullm`), Expiration **Never** → Submit.
3. **Copy the key** (`gsk_…`) now — it’s shown only once.

## Step 2 — Give your twin a personality (the “system prompt”)

This is the heart of it, and the part you’ll spend the most time on. It’s just a long piece of text
that tells the AI **who it is, how to speak, what it knows, and what it must not do.** Write it in
the first person. A good structure:

- **VOICE** — tone, length of replies, quirks (“warm, direct, 2–4 sentences, no emoji”).
- **ABOUT ME** — bullet points: background, studies, work, values, fun facts.
- **PROJECTS** — one bullet per project (in case you're building a portfolio).
- **CONTACT** — email / socials.
- **RULES** — “only talk about me and my work; never invent facts; if you don’t know, say so and
  point to my email.” This is what keeps it honest.

> Tip: the more concrete and specific your bullets, the more the twin sounds like *you* and the less
> it makes things up.

## Step 3 — The serverless function (the secret-keeping middleman)

Create a file `api/giullm.js`. It receives the chat, adds your system prompt, calls Groq with the
key, and returns the reply. The essential shape:

```js
const SYSTEM = `You are the AI twin of <NAME>. VOICE: ... ABOUT ME: ... RULES: ...`;

module.exports = async (req, res) => {
  const key = process.env.GROQ_API_KEY;              // ← secret, set on Vercel (Step 5)
  if (!key) { res.status(200).json({ reply: "The AI isn't connected yet." }); return; }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const messages = (body.messages || []).slice(-12); // keep the last few turns for context

  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',              // any current free Groq model
      temperature: 0.6,
      max_tokens: 400,
      messages: [{ role: 'system', content: SYSTEM }, ...messages],
    }),
  });

  const data = await r.json();
  const reply = data.choices?.[0]?.message?.content?.trim() || "Ask me again?";
  res.status(200).json({ reply });
};
```

That’s the minimum. This site’s real version also: asks the model to return **3 follow-up
suggestions** as JSON, tolerates malformed JSON, keeps replies focused on the project you opened the
chat from, and has friendly fallback messages when the AI is unreachable. All optional polish.

## Step 4 — The front-end widget

A small script (`giullm.js`) that:

1. Draws a floating button + a chat panel.
2. Shows a few **suggested questions** to start.
3. On send: first checks your **curated list** of canned answers; if none match, `fetch('/api/giullm', …)`
   with the conversation and shows the reply.

Because the curated answers are handled in the browser, the most common questions cost you **nothing**
and answer **instantly** — the AI is only the fallback.

## Step 5 — Connect the key on Vercel (so it stays secret)

1. [vercel.com](https://vercel.com) → your project → **Settings** → **Environment Variables**.
2. Add one: **Key** `GROQ_API_KEY`, **Value** the `gsk_…` key. Keep it *Sensitive*. Save.
3. **Redeploy** (env vars only apply to a new deploy): Deployments → latest → ⋯ → **Redeploy**,
   or just push a commit.
4. Test: ask a question that is *not* one of the suggested ones. A reasoned reply = it’s alive. ✅

---

## Make it yours

- **Different person/brand?** Rewrite the `SYSTEM` prompt. That’s basically the whole job.
- **Change the personality?** Edit VOICE. Want longer answers? Change “2–4 sentences”.
- **Model retired?** Swap the `model:` name for any current free Groq model. That’s the only line
  that’s ever likely to need maintenance.
- **Want a record of what people ask?** Log each exchange to a Google Sheet via a tiny Apps Script
  web app (set its URL as another env var). Optional and never blocks a reply.

## What it costs

Basically nothing: Groq’s free tier covers normal traffic, Vercel’s Hobby plan hosts
the site and the function for free, and the curated answers absorb the most frequent questions before
they ever reach the AI.

---

*Built by [Giulia Rinaldo](https://giuliarinaldo.com) — designer & creative technologist — with the
help of Claude Code. Questions: rinaldo.giulia99@gmail.com*

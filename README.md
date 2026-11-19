# Ask Nadeem — AI Assistant (text + voice)

A standalone AI chatbot that answers visitors' questions about Nadeem, by text or by voice
(Gemini-style: tap the orb, talk, it answers out loud, then listens again).

Everything runs on **Groq**:
- **LLM** (answers): `openai/gpt-oss-120b` (change with `GROQ_CHAT_MODEL`)
- **Speech-to-text**: `whisper-large-v3-turbo`
- **Text-to-speech**: `canopylabs/orpheus-v1-english` (English voices)

## 1. Run it locally
Requirements: Node.js 18.18+ (20+ recommended).

```bash
npm install
cp .env.example .env.local      # Windows: copy .env.example .env.local
# open .env.local and paste your Groq key (https://console.groq.com/keys)
npm run dev
```
Open http://localhost:3000.

> The microphone only works on `localhost` or on an `https://` site.
> If voice gives a "terms" error, open the Groq console playground once, choose the
> `canopylabs/orpheus-v1-english` model and accept its terms.

## 2. Edit what the bot knows
Everything the bot knows is in **`data/about-me.md`**. Fill in the `[TODO]` lines.
Anything still marked `[TODO]` is treated as "not provided", so the bot never guesses it.
Restart `npm run dev` after editing.

## 3. Deploy (free) on Vercel
1. Push this folder to a GitHub repo (`.env.local` is ignored — your key stays private).
2. On https://vercel.com → **Add New → Project** → import the repo.
3. In **Environment Variables** add `GROQ_API_KEY` (and optionally the other `GROQ_*` values).
4. Deploy. Your bot gets an `https://…vercel.app` link — put it on your portfolio/LinkedIn.

## How it works
```
Browser ──text──► /api/chat ──► Groq LLM (streams the answer back)
Browser ──mic──►  /api/transcribe ──► Groq Whisper ──► /api/chat ──► /api/speak ──► Groq Orpheus ──► speaker
```
- Your Groq key lives only on the server (API routes), never in the browser.
- Each visitor IP is rate-limited (chat 30 / STT 40 / TTS 80 per 10 minutes) to protect your bill.
- In voice mode the bot answers in short, spoken English; in text mode it replies in the visitor's language.
- Voice turn ends after ~1.2 s of silence; tap the orb while it speaks to interrupt.

## Files
| File | Purpose |
| --- | --- |
| `data/about-me.md` | Your profile — the bot's only knowledge |
| `lib/profile.ts` | System prompt + rules (honesty, privacy, stay on topic) |
| `app/api/chat/route.ts` | Streams answers from the Groq LLM |
| `app/api/transcribe/route.ts` | Voice → text (Whisper) |
| `app/api/speak/route.ts` | Text → voice (Orpheus) |
| `app/page.tsx` | Chat UI + voice mode |

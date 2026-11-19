import { GROQ_BASE, MODELS, groqKey, safeFetch } from '@/lib/groq';
import { buildSystemPrompt } from '@/lib/profile';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Msg = { role: 'user' | 'assistant'; content: string };

function isMsg(m: unknown): m is Msg {
  if (!m || typeof m !== 'object') return false;
  const r = (m as Msg).role;
  return (r === 'user' || r === 'assistant') && typeof (m as Msg).content === 'string';
}

export async function POST(req: Request) {
  if (!rateLimit(`chat:${clientIp(req)}`, 30, 10 * 60_000)) {
    return new Response('Too many questions — please wait a few minutes.', { status: 429 });
  }

  let body: { messages?: unknown; voice?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter(isMsg)
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return new Response('Bad request', { status: 400 });
  }

  const key = groqKey();
  if (!key) return new Response('Server is missing GROQ_API_KEY.', { status: 500 });

  const voice = body.voice === true;
  const upstream = await safeFetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELS.chat,
      stream: true,
      temperature: 0.4,
      max_tokens: voice ? 300 : 700,
      messages: [{ role: 'system', content: buildSystemPrompt(voice) }, ...messages],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    console.error('Groq chat error', upstream.status, detail);
    return new Response('The AI service returned an error. Please try again.', { status: 502 });
  }

  // Convert Groq's SSE stream into a plain text stream for the browser
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const source = upstream.body;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();
      let buf = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            const l = line.trim();
            if (!l.startsWith('data:')) continue;
            const data = l.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(enc.encode(delta));
            } catch {
              /* ignore partial lines */
            }
          }
        }
      } catch (err) {
        console.error('Stream error', err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}

import { GROQ_BASE, MODELS, groqKey, safeFetch } from '@/lib/groq';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!rateLimit(`tts:${clientIp(req)}`, 80, 10 * 60_000)) {
    return new Response('Too many requests — please wait a few minutes.', { status: 429 });
  }

  const key = groqKey();
  if (!key) return new Response('Server is missing GROQ_API_KEY.', { status: 500 });

  let text = '';
  try {
    const body = (await req.json()) as { text?: unknown };
    text = typeof body.text === 'string' ? body.text.trim().slice(0, 600) : '';
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (!text) return new Response('No text', { status: 400 });

  const upstream = await safeFetch(`${GROQ_BASE}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELS.tts,
      voice: MODELS.voice,
      input: text,
      response_format: 'wav',
    }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    console.error('Groq TTS error', upstream.status, detail);
    const hint = /terms/i.test(detail)
      ? ' (Accept the Orpheus model terms once in the Groq console playground.)'
      : '';
    return new Response(`Voice service error.${hint}`, { status: 502 });
  }

  return new Response(await upstream.arrayBuffer(), {
    headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' },
  });
}

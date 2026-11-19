import { GROQ_BASE, MODELS, groqKey, safeFetch } from '@/lib/groq';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!rateLimit(`stt:${clientIp(req)}`, 40, 10 * 60_000)) {
    return new Response('Too many requests — please wait a few minutes.', { status: 429 });
  }

  const key = groqKey();
  if (!key) return new Response('Server is missing GROQ_API_KEY.', { status: 500 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const audio = form.get('audio');
  if (!(audio instanceof Blob) || audio.size === 0) return new Response('No audio', { status: 400 });
  if (audio.size > 5 * 1024 * 1024) return new Response('Audio too long', { status: 413 });

  const name = audio instanceof File && audio.name ? audio.name : 'speech.webm';
  const upstreamForm = new FormData();
  upstreamForm.append('file', audio, name);
  upstreamForm.append('model', MODELS.stt);
  upstreamForm.append('response_format', 'json');
  upstreamForm.append('temperature', '0');

  const upstream = await safeFetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: upstreamForm,
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    console.error('Groq STT error', upstream.status, detail);
    return new Response('Could not understand the audio. Please try again.', { status: 502 });
  }

  const data = (await upstream.json()) as { text?: string };
  return Response.json({ text: (data.text || '').trim() });
}

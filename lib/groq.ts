export const GROQ_BASE = 'https://api.groq.com/openai/v1';

export const MODELS = {
  chat: process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-120b',
  stt: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
  tts: process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english',
  voice: process.env.GROQ_TTS_VOICE || 'troy',
};

export function groqKey(): string | null {
  return process.env.GROQ_API_KEY || null;
}

// fetch that never throws (network errors become a 503 response)
export async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    console.error('Network error calling Groq', err);
    return new Response('Could not reach Groq', { status: 503 });
  }
}

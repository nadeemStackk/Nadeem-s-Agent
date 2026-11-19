'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type Msg = { role: 'user' | 'assistant'; content: string };
type Status = 'idle' | 'listening' | 'thinking' | 'speaking';

const GREETING: Msg = {
  role: 'assistant',
  content:
    "Hi! I'm Nadeem's AI assistant. Ask me anything about his skills, projects or experience — or tap the mic and just talk to me.",
};

const SUGGESTIONS = [
  'Who is Nadeem?',
  'What projects has he built?',
  'What is his tech stack?',
  'How can I contact him?',
];

const STATUS_TEXT: Record<Status, string> = {
  idle: 'Tap the orb to talk',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking… tap to interrupt',
};

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const messagesRef = useRef<Msg[]>([GREETING]);
  const voiceRef = useRef(false);
  const stopSpeakRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Release the microphone if the page is closed during voice chat
  useEffect(() => () => stopVoice(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function update(next: Msg[]) {
    messagesRef.current = next;
    setMessages(next);
  }

  // ---------- Chat ----------
  async function ask(text: string, speak: boolean): Promise<void> {
    const clean = text.trim();
    if (!clean) return;
    setError(null);

    const history: Msg[] = [...messagesRef.current, { role: 'user', content: clean }];
    update([...history, { role: 'assistant', content: '' }]);
    setBusy(true);
    setStatus('thinking');

    let full = '';
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(1).slice(-10), voice: speak }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || 'Request failed');

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += dec.decode(value, { stream: true });
        update([...history, { role: 'assistant', content: full }]);
      }
      if (!full.trim()) throw new Error('No answer received. Please try again.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      update(history);
      full = '';
    } finally {
      setBusy(false);
    }

    if (speak && full) await speakText(full);
    setStatus(voiceRef.current ? 'listening' : 'idle');
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || voiceOn) return;
    const text = input;
    setInput('');
    void ask(text, false);
  }

  // ---------- Text to speech ----------
  function splitForSpeech(text: string): string[] {
    const plain = text
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[*_#`>\[\]()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const sentences = plain.match(/[^.!?]+[.!?]*/g) ?? [plain];
    const chunks: string[] = [];
    let cur = '';
    for (const s of sentences) {
      if (cur && (cur + s).length > 220) {
        chunks.push(cur.trim());
        cur = s;
      } else {
        cur += s;
      }
    }
    if (cur.trim()) chunks.push(cur.trim());
    return chunks;
  }

  async function fetchAudio(chunk: string): Promise<string> {
    const r = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: chunk }),
    });
    if (!r.ok) throw new Error((await r.text()) || 'Voice failed');
    return URL.createObjectURL(await r.blob());
  }

  function playUrl(url: string): Promise<void> {
    return new Promise((resolve) => {
      const a = new Audio(url);
      audioRef.current = a;
      const done = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      a.onended = done;
      a.onerror = done;
      a.onpause = done;
      a.play().catch(done);
    });
  }

  async function speakText(text: string) {
    const chunks = splitForSpeech(text);
    if (!chunks.length) return;
    stopSpeakRef.current = false;
    setStatus('speaking');
    try {
      // Fetch the next sentence while the current one plays → faster replies
      let next: Promise<string> = fetchAudio(chunks[0]);
      for (let i = 0; i < chunks.length; i++) {
        const url = await next;
        if (i + 1 < chunks.length) {
          next = fetchAudio(chunks[i + 1]);
          next.catch(() => undefined);
        }
        if (stopSpeakRef.current) {
          URL.revokeObjectURL(url);
          break;
        }
        await playUrl(url);
        if (stopSpeakRef.current) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Voice failed');
    }
    audioRef.current = null;
  }

  function stopSpeaking() {
    stopSpeakRef.current = true;
    audioRef.current?.pause();
  }

  // ---------- Voice mode (Gemini-style conversation) ----------
  async function startVoice() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      ctxRef.current = new AudioContext();
      voiceRef.current = true;
      setVoiceOn(true);
      void listenLoop();
    } catch {
      setError('Please allow microphone access to use voice mode.');
    }
  }

  function stopVoice() {
    voiceRef.current = false;
    setVoiceOn(false);
    stopSpeaking();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    setStatus('idle');
  }

  function onOrbClick() {
    if (!voiceOn) void startVoice();
    else if (status === 'speaking') stopSpeaking();
  }

  async function listenLoop() {
    while (voiceRef.current) {
      const blob = await recordUtterance();
      if (!voiceRef.current) break;
      if (!blob) continue;

      setStatus('thinking');
      let text = '';
      try {
        const fd = new FormData();
        const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
        fd.append('audio', blob, `speech.${ext}`);
        const r = await fetch('/api/transcribe', { method: 'POST', body: fd });
        if (!r.ok) throw new Error((await r.text()) || 'Transcription failed');
        text = (((await r.json()) as { text?: string }).text || '').trim();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Transcription failed');
        await new Promise((res) => setTimeout(res, 1500));
        continue;
      }
      if (!text || !voiceRef.current) continue;
      await ask(text, true);
    }
  }

  // Records until the visitor stops talking (simple voice-activity detection)
  function recordUtterance(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const stream = streamRef.current;
      const ctx = ctxRef.current;
      if (!stream || !ctx) return resolve(null);

      setStatus('listening');
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      const mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      const parts: Blob[] = [];

      let spoke = false;
      let finished = false;
      let lastVoice = Date.now();
      const started = Date.now();

      const finish = () => {
        if (finished) return;
        finished = true;
        clearInterval(timer);
        source.disconnect();
        if (rec.state === 'recording') rec.stop();
        else resolve(null);
      };

      rec.ondataavailable = (e) => {
        if (e.data.size) parts.push(e.data);
      };
      rec.onstop = () => resolve(spoke ? new Blob(parts, { type: rec.mimeType || 'audio/webm' }) : null);

      const timer = setInterval(() => {
        if (!voiceRef.current) return finish();
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const now = Date.now();
        if (rms > 0.035) {
          spoke = true;
          lastVoice = now;
        }
        if (spoke && now - lastVoice > 1200) finish(); // 1.2s of silence = end of turn
        else if (!spoke && now - started > 15000) finish(); // nobody spoke, listen again
        else if (now - started > 30000) finish(); // hard limit per turn
      }, 50);

      rec.start(250);
    });
  }

  // ---------- UI ----------
  return (
    <main className="page">
      <section className="card">
        <header className="header">
          <div className="avatar">N</div>
          <div>
            <h1>Ask Nadeem</h1>
            <p>AI assistant · Full Stack Developer &amp; SQA Engineer</p>
          </div>
          <button
            className={`voiceToggle ${voiceOn ? 'on' : ''}`}
            onClick={() => (voiceOn ? stopVoice() : void startVoice())}
            title={voiceOn ? 'End voice chat' : 'Start voice chat'}
          >
            {voiceOn ? 'End voice' : '🎙 Voice chat'}
          </button>
        </header>

        {voiceOn && (
          <div className="voicePanel">
            <button className={`orb ${status}`} onClick={onOrbClick} aria-label="Voice orb">
              <span />
            </button>
            <p className="voiceStatus">{STATUS_TEXT[status]}</p>
          </div>
        )}

        <div className="messages">
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className="bubble">
                {m.content || <span className="typing">●●●</span>}
              </div>
              {m.role === 'assistant' && m.content && i > 0 && !voiceOn && (
                <button className="speakBtn" onClick={() => void speakText(m.content)} title="Read aloud">
                  🔊
                </button>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {messages.length === 1 && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => void ask(s, voiceOn)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        )}

        {error && <div className="error">{error}</div>}

        <form className="inputBar" onSubmit={onSubmit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={voiceOn ? 'Voice chat is on — just talk' : 'Ask about Nadeem…'}
            disabled={voiceOn}
            maxLength={1000}
          />
          <button type="submit" disabled={busy || voiceOn || !input.trim()}>
            Send
          </button>
        </form>
        <p className="footnote">AI assistant — answers come from Nadeem&apos;s profile and may not be perfect.</p>
      </section>
    </main>
  );
}

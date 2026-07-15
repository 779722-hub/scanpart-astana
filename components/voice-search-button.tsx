"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Loader2, Square } from "lucide-react";

function speechLang(locale: string): string {
  return locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU";
}

function pickMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  const MR = typeof MediaRecorder !== "undefined" ? MediaRecorder : null;
  for (const c of candidates) {
    if (MR && (MR as any).isTypeSupported?.(c)) return c;
  }
  return "";
}

type State = "idle" | "listening" | "processing";

/**
 * Voice search: uses the browser's free Web Speech API when available
 * (Chrome/Android); otherwise records a short clip and sends it to the server
 * for transcription (Gemini/OpenAI), when a server provider is configured.
 */
export function VoiceSearchButton({
  onText,
  locale,
  sttServer,
  className,
}: {
  onText: (text: string) => void;
  locale: string;
  sttServer: boolean;
  className?: string;
}) {
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState("");
  const recogRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SR =
    typeof window !== "undefined"
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      try {
        recogRef.current?.stop?.();
      } catch {
        /* ignore */
      }
      recorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function startWebSpeech() {
    const rec = new SR();
    recogRef.current = rec;
    rec.lang = speechLang(locale);
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript ?? "";
      if (text) onText(text);
    };
    rec.onerror = (e: any) => {
      setState("idle");
      setMsg(
        e?.error === "not-allowed"
          ? "Разрешите доступ к микрофону в браузере."
          : "Не удалось распознать. Попробуйте ещё раз."
      );
    };
    rec.onend = () => setState((s) => (s === "listening" ? "idle" : s));
    setMsg("");
    setState("listening");
    rec.start();
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime();
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        setState("processing");
        try {
          const form = new FormData();
          form.append("audio", blob, "voice.webm");
          form.append("locale", locale);
          const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
          const j = await res.json().catch(() => ({}));
          if (res.ok && j.ok && j.text) {
            onText(j.text);
            setMsg("");
          } else {
            setMsg("Не удалось распознать голос. Попробуйте ещё раз.");
          }
        } catch {
          setMsg("Не удалось отправить аудио. Проверьте связь.");
        } finally {
          setState("idle");
        }
      };
      setMsg("");
      setState("listening");
      mr.start();
      // Safety auto-stop after 8 seconds.
      stopTimerRef.current = setTimeout(() => {
        if (mr.state === "recording") mr.stop();
      }, 8000);
    } catch {
      setState("idle");
      setMsg("Разрешите доступ к микрофону в браузере.");
    }
  }

  function onClick() {
    if (state === "processing") return;
    if (state === "listening") {
      // Stop whichever path is active.
      try {
        recogRef.current?.stop?.();
      } catch {
        /* ignore */
      }
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      setState((s) => (s === "listening" ? "idle" : s));
      return;
    }
    if (SR) startWebSpeech();
    else if (sttServer) startRecording();
    else setMsg("Голосовой ввод не поддерживается в этом браузере — откройте в Chrome.");
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={onClick}
        aria-label="Голосовой поиск"
        className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
          state === "listening"
            ? "border-brand bg-brand text-white"
            : "border-paper-mute text-ink hover:border-brand hover:text-brand dark:border-ink-mute dark:text-paper"
        }`}
      >
        {state === "processing" ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : state === "listening" ? (
          <Square className="h-5 w-5" />
        ) : (
          <Mic className="h-5 w-5" />
        )}
        {state === "listening" ? "Стоп" : "Сказать голосом"}
      </button>
      {(state === "listening" || state === "processing" || msg) && (
        <p className="mt-2 text-xs text-ink-mute dark:text-paper-mute">
          {state === "listening"
            ? "Говорите… (нажмите «Стоп», когда закончите)"
            : state === "processing"
              ? "Распознаём…"
              : msg}
        </p>
      )}
    </div>
  );
}

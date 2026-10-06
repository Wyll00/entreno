"use client";

import { useEffect, useRef, useState } from "react";
import { mergeSegments } from "@/lib/speech.ts";
import { IconMic, IconSend } from "./icons.tsx";

// Reconocimiento de voz del navegador (Chrome en Android, Safari en iOS).
// El audio lo procesa el servicio de voz del propio navegador; a este
// servidor solo llega el texto.
//
// Escucha de forma continua: termina cuando tocas «Listo», tras SILENCE_MS
// callado (después de haber dicho algo) o a los MAX_MS. Si el navegador corta
// por su cuenta, se vuelve a arrancar sin perder lo ya dicho.
const SILENCE_MS = 4000;
const NOTHING_SAID_MS = 8000;
const MAX_MS = 60_000;

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionClass(): (new () => Recognition) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Sin permiso para el micrófono. Actívalo en los ajustes del navegador o escribe la serie.",
  "service-not-allowed": "El navegador no permite el dictado aquí. Escribe la serie o usa el micrófono del teclado.",
  "audio-capture": "No encuentro el micrófono.",
  network: "El dictado necesita conexión. Escribe la serie o reinténtalo.",
};

export function VoiceCapture({
  onSubmit,
  busy,
  hint,
  editRequest,
}: {
  onSubmit: (text: string) => Promise<void>;
  busy: boolean;
  hint: string | null;
  /** Pone una frase en el campo de texto para corregirla a mano («Corregir texto»). */
  editRequest: { text: string; n: number } | null;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const input = useRef<HTMLInputElement>(null);
  const submit = useRef(onSubmit);
  submit.current = onSubmit;
  const recognition = useRef<Recognition | null>(null);
  const wanted = useRef(false); // seguir escuchando aunque el navegador corte
  const previousRuns = useRef<string[]>([]); // texto de arranques anteriores
  const currentRun = useRef<string[]>([]); // resultados del arranque actual
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const heard = () => mergeSegments([...previousRuns.current, mergeSegments(currentRun.current)]);

  useEffect(() => {
    setSupported(recognitionClass() !== null);
    return () => {
      wanted.current = false;
      recognition.current?.abort();
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      if (maxTimer.current) clearTimeout(maxTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!editRequest) return;
    setText(editRequest.text);
    setError(null);
    requestAnimationFrame(() => {
      const el = input.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [editRequest]);

  function armSilence(ms: number) {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(finish, ms);
  }

  function finish() {
    if (!wanted.current) return;
    wanted.current = false;
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    if (maxTimer.current) clearTimeout(maxTimer.current);
    recognition.current?.stop(); // onend entrega el texto
    if (!recognition.current) deliver();
  }

  function deliver() {
    setListening(false);
    const said = heard().trim();
    previousRuns.current = [];
    currentRun.current = [];
    setLive("");
    if (said) {
      setText(said);
      void submit.current(said).then(() => setText(""));
    } else {
      setError("No he oído nada. Vuelve a intentarlo.");
    }
  }

  function runOnce() {
    const Klass = recognitionClass();
    if (!Klass) return;
    const rec = new Klass();
    rec.lang = "es-ES";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    currentRun.current = [];
    rec.onresult = (event) => {
      const parts: string[] = [];
      for (let i = 0; i < event.results.length; i++) parts.push(event.results[i][0].transcript);
      currentRun.current = parts;
      setLive(heard());
      armSilence(SILENCE_MS);
    };
    rec.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return; // el temporizador decide
      wanted.current = false;
      setError(ERRORS[event.error] ?? `Error de dictado (${event.error}).`);
    };
    rec.onend = () => {
      recognition.current = null;
      const runText = mergeSegments(currentRun.current);
      if (runText) previousRuns.current.push(runText);
      currentRun.current = [];
      if (wanted.current) {
        runOnce(); // el navegador cortó por su cuenta: seguimos escuchando
      } else {
        deliver();
      }
    };
    recognition.current = rec;
    rec.start();
  }

  function start() {
    setError(null);
    setLive("");
    previousRuns.current = [];
    currentRun.current = [];
    wanted.current = true;
    setListening(true);
    armSilence(NOTHING_SAID_MS);
    if (maxTimer.current) clearTimeout(maxTimer.current);
    maxTimer.current = setTimeout(finish, MAX_MS);
    runOnce();
  }

  function cancel() {
    wanted.current = false;
    previousRuns.current = [];
    currentRun.current = [];
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    if (maxTimer.current) clearTimeout(maxTimer.current);
    recognition.current?.abort();
    recognition.current = null;
    setListening(false);
    setLive("");
  }

  async function submitText(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    await onSubmit(value);
    setText("");
  }

  return (
    <section className="card capture" aria-label="Apuntar series">
      {supported && !listening && (
        <button type="button" className="mic" onClick={start} disabled={busy}>
          <IconMic size={30} />
          <span>{busy ? "Apuntando…" : "Toca y di tu serie"}</span>
        </button>
      )}
      {listening && (
        <div className="listening" role="status">
          <p className="listening-label">
            <span className="rec-dot" aria-hidden="true" /> Escuchando… di ejercicio, peso, repeticiones y series
          </p>
          <p className="transcript">{live ? `«${live}»` : "…"}</p>
          <div className="actions">
            <button type="button" className="btn" onClick={cancel}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary btn-large" onClick={finish}>
              Listo
            </button>
          </div>
          <p className="hint">Si te quedas {SILENCE_MS / 1000} segundos callado, termina solo.</p>
        </div>
      )}
      {error && <p className="notice notice-error">{error}</p>}
      {!listening && (
        <form className="composer" onSubmit={submitText}>
          <input
            ref={input}
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Press banca 60 kilos 8 repeticiones"
            aria-label="Escribe o dicta la serie"
            enterKeyHint="send"
            autoComplete="off"
          />
          <button className="icon-btn icon-btn-filled" aria-label="Apuntar" disabled={busy || !text.trim()}>
            <IconSend />
          </button>
        </form>
      )}
      {supported === false && (
        <p className="hint">Este navegador no dicta: usa el micrófono del teclado o escribe la serie.</p>
      )}
      {hint && !listening && <p className="hint">{hint}</p>}
    </section>
  );
}

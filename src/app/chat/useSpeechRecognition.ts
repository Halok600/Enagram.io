"use client";

import { useRef, useState, useSyncExternalStore } from "react";

/**
 * Feature #8. Pure browser API (Web Speech API) — no backend, no gbrain,
 * no new env vars. Not universally supported: Chrome/Edge ship it under the
 * `webkitSpeechRecognition` prefix, Firefox doesn't support it at all as of
 * this writing. `isSupported` lets the caller hide the mic button entirely
 * rather than show a control that silently does nothing.
 */

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = { error: string };

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Browser support never changes over a page's lifetime, so a subscription
// that never fires is correct here — this only exists to give
// useSyncExternalStore an SSR-safe way to read a client-only value (no
// window during server render) without the hydration mismatch a plain
// `useState(() => window...)` lazy initializer would cause, and without an
// effect+setState combo that trips the "no setState in effect body" lint
// rule for a value that's a one-time browser capability check, not
// external state that actually changes.
function subscribeNever() {
  return () => {};
}
function getSupportSnapshot() {
  return getSpeechRecognitionCtor() !== null;
}
function getServerSupportSnapshot() {
  return false;
}

export function useSpeechRecognition(onTranscriptChange: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const isSupported = useSyncExternalStore(subscribeNever, getSupportSnapshot, getServerSupportSnapshot);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");

  function start(currentText: string) {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    setError(null);
    baseTextRef.current = currentText.trim() ? `${currentText.trim()} ` : "";

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (finalText) baseTextRef.current += `${finalText} `;
      onTranscriptChange(baseTextRef.current + interimText);
    };

    recognition.onerror = (event) => {
      setError(
        event.error === "not-allowed" || event.error === "permission-denied"
          ? "Microphone access denied"
          : event.error === "no-speech"
            ? "No speech detected"
            : `Voice input error: ${event.error}`,
      );
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  function stop() {
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  return { isListening, isSupported, error, start, stop };
}

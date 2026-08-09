"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Mic, Square } from "lucide-react";
import type { UIMessage, ChatStatus } from "ai";
import { MessageBubble } from "./MessageBubble";
import { SystemErrorBanner } from "./SystemErrorBanner";
import { extractSources } from "./extractSources";
import { useSpeechRecognition } from "./useSpeechRecognition";

export function Chat({
  messages,
  status,
  userTimestamps,
  assistantTimestamps,
  onSend,
  systemError,
  onRetry,
}: {
  messages: UIMessage[];
  status: ChatStatus;
  userTimestamps: number[];
  assistantTimestamps: Record<string, number>;
  onSend: (text: string) => void;
  systemError: string | null;
  onRetry: () => void;
}) {
  const [input, setInput] = useState("");
  const isBusy = status === "submitted" || status === "streaming";

  const speech = useSpeechRecognition(setInput);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isBusy) return;
    if (speech.isListening) speech.stop();
    onSend(input);
    setInput("");
  }

  function toggleListening() {
    if (speech.isListening) speech.stop();
    else speech.start(input);
  }

  return (
    <div className="flex h-full flex-1 flex-col gap-5">
      <div className="clip-corner flex flex-1 flex-col gap-6 overflow-y-auto border-2 border-[var(--border-dim)] bg-[var(--bg-panel)]/60 p-8">
        {messages.length === 0 && !systemError && (
          <p className="font-mono text-base text-[var(--text-dim)]">
            <span className="text-[var(--neon-cyan)]">&gt;</span> Ask something like &ldquo;What&apos;s
            my status on the SkillLayer application?&rdquo;
          </p>
        )}

        {(() => {
          const userMessageIds = messages.filter((m) => m.role === "user").map((m) => m.id);

          return messages.map((message) => {
            const isUser = message.role === "user";
            const text = message.parts
              .filter((p) => p.type === "text")
              .map((p) => (p as { text: string }).text)
              .join("");

            // A failed generation can leave a real-but-empty assistant
            // message in the transcript (the request errored before any
            // tokens arrived). Once we're no longer busy, an empty bubble
            // with nothing in it is just visual noise — the error banner
            // below explains what happened instead.
            if (!isUser && !text && !isBusy) return null;

            return (
              <MessageBubble
                key={message.id}
                role={isUser ? "user" : "assistant"}
                text={text}
                sources={extractSources(message.parts)}
                pending={isBusy}
                timestamp={
                  isUser
                    ? userTimestamps[userMessageIds.indexOf(message.id)]
                    : assistantTimestamps[message.id]
                }
              />
            );
          });
        })()}

        {systemError && <SystemErrorBanner message={systemError} onRetry={onRetry} />}
      </div>

      <div className="flex flex-col gap-1.5">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <span className="flex items-center font-mono text-xl text-[var(--neon-yellow)] glow-text-yellow">
            &gt;
          </span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={speech.isListening ? "listening..." : "ask your brain..."}
            disabled={isBusy}
            className="clip-corner-sm flex-1 border-2 border-[var(--border-dim)] bg-[var(--bg-panel)] px-5 py-4 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--neon-yellow)] focus:shadow-[var(--glow-yellow)] disabled:opacity-50"
          />
          {speech.isSupported && (
            <motion.button
              type="button"
              onClick={toggleListening}
              disabled={isBusy}
              whileHover={isBusy ? undefined : { scale: 1.02 }}
              whileTap={isBusy ? undefined : { scale: 0.98 }}
              transition={{ duration: 0.15 }}
              aria-label={speech.isListening ? "Stop voice input" : "Start voice input"}
              className={`clip-corner-sm border-2 px-5 py-4 transition-shadow disabled:opacity-40 disabled:hover:shadow-none ${
                speech.isListening
                  ? "border-[var(--neon-pink)] bg-[var(--bg-panel-raised)] text-[var(--neon-pink)] glow-border-pink"
                  : "border-[var(--neon-cyan)]/70 bg-[var(--bg-panel-raised)] text-[var(--neon-cyan)] hover:glow-border-cyan"
              }`}
            >
              {speech.isListening ? (
                <motion.span
                  className="flex items-center justify-center"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Square size={20} fill="currentColor" />
                </motion.span>
              ) : (
                <Mic size={20} />
              )}
            </motion.button>
          )}
          <motion.button
            type="submit"
            disabled={isBusy || !input.trim()}
            whileHover={isBusy || !input.trim() ? undefined : { scale: 1.02 }}
            whileTap={isBusy || !input.trim() ? undefined : { scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="clip-corner-sm border-2 border-[var(--neon-pink)]/70 bg-[var(--bg-panel-raised)] px-8 py-4 font-mono text-base font-bold text-[var(--neon-pink)] transition-shadow hover:glow-border-pink disabled:opacity-40 disabled:hover:shadow-none"
          >
            SEND
          </motion.button>
        </form>
        {speech.error && (
          <p className="pl-9 font-mono text-xs text-[var(--neon-pink)]">{speech.error}</p>
        )}
      </div>
    </div>
  );
}

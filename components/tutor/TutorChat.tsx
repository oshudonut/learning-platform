"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Bot,
  User,
  Loader2,
  Lightbulb,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

const SUGGESTED_QUESTIONS = [
  "Can you explain this in simpler terms?",
  "What are the most important things to remember?",
  "Give me a real-world example",
  "What questions might appear on an exam?",
  "What do students often misunderstand about this?",
];

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex gap-3", isUser && "flex-row-reverse")}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ring-1",
          isUser
            ? "bg-primary/15 ring-primary/20"
            : "bg-secondary ring-white/[0.06]",
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary" />
        ) : (
          <Bot className="h-4 w-4 text-foreground" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "rounded-tr-sm bg-primary/15 text-foreground"
            : "rounded-tl-sm bg-[#D8ECF4] border border-sky-200/60 text-foreground/90",
        )}
      >
        {message.content.split("\n").map((line, i) => {
          // Bold: **text**
          const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={j} className="font-semibold text-foreground">
                {part.slice(2, -2)}
              </strong>
            ) : (
              part
            ),
          );
          return (
            <p key={i} className={i > 0 ? "mt-2" : ""}>
              {parts}
            </p>
          );
        })}
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3"
    >
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sky-100 ring-1 ring-sky-200/60">
        <Bot className="h-4 w-4 text-foreground" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-[#D8ECF4] border border-sky-200/60 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
            animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
    </motion.div>
  );
}

export function TutorChat({
  documentId,
  documentTitle,
  initialConversationId,
}: {
  documentId?: string;
  documentTitle?: string;
  initialConversationId?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [streamedText, setStreamedText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedText]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading || streaming) return;

      const userMsg: Message = {
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);
      setStreamedText("");

      try {
        const res = await fetch("/api/tutor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            conversationId,
            documentId,
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`Request failed: ${res.status}`);
        }

        setLoading(false);
        setStreaming(true);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

          for (const line of lines) {
            const json = line.slice(6).trim();
            if (!json) continue;

            try {
              const parsed = JSON.parse(json) as {
                text?: string;
                conversationId?: string;
                done?: boolean;
                error?: string;
              };

              if (parsed.error) throw new Error(parsed.error);
              if (parsed.conversationId) setConversationId(parsed.conversationId);
              if (parsed.text) {
                accumulated += parsed.text;
                setStreamedText(accumulated);
              }
              if (parsed.done) {
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: accumulated, timestamp: Date.now() },
                ]);
                setStreamedText("");
                setStreaming(false);
              }
            } catch {
              // ignore parse errors on individual lines
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `I encountered an error: ${msg}. Please try again.`,
            timestamp: Date.now(),
          },
        ]);
        setStreamedText("");
        setLoading(false);
        setStreaming(false);
      }
    },
    [loading, streaming, conversationId, documentId],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  const empty = messages.length === 0 && !streaming;

  return (
    <div className="flex flex-col h-full min-h-[500px]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
        {empty && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center py-12 gap-6"
          >
            <div className="h-16 w-16 rounded-full bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {documentTitle ? `Ask me about "${documentTitle}"` : "Ask me anything"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                I&apos;m your personal AI professor. Ask questions, request explanations, or challenge me to test your understanding.
              </p>
            </div>
            {documentTitle && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 border border-primary/10 rounded-full px-3 py-1.5">
                <BookOpen className="h-3 w-3 text-primary" />
                <span>Using context from your document</span>
              </div>
            )}

            {/* Suggested questions */}
            <div className="w-full max-w-md space-y-2">
              <p className="text-xs text-muted-foreground">Try asking:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTED_QUESTIONS.slice(0, 4).map((q) => (
                  <button
                    key={q}
                    onClick={() => void sendMessage(q)}
                    className="text-xs text-muted-foreground hover:text-foreground border border-border hover:border-sky-400/40 rounded-full px-3 py-1.5 transition-colors hover:bg-primary/5"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
        </AnimatePresence>

        {loading && <TypingIndicator />}

        {streaming && streamedText && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sky-100 ring-1 ring-sky-200/60">
              <Bot className="h-4 w-4 text-foreground" />
            </div>
            <div className="max-w-[78%] rounded-2xl rounded-tl-sm bg-[#D8ECF4] border border-sky-200/60 px-4 py-3 text-sm text-foreground/90 leading-relaxed">
              {streamedText}
              <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse" />
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Suggestion chips (after first message) */}
      {messages.length > 0 && messages.length <= 4 && (
        <div className="py-2 flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.slice(0, 3).map((q) => (
            <button
              key={q}
              onClick={() => void sendMessage(q)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-sky-400/40 rounded-full px-2.5 py-1 transition-colors hover:bg-primary/5"
            >
              <Lightbulb className="h-2.5 w-2.5" />
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border pt-4">
        <div className="flex items-end gap-3 rounded-xl border border-sky-200/60 bg-[#D8ECF4] px-4 py-3 focus-within:border-sky-400/60 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your professor anything…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none max-h-32"
            style={{ height: "auto" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
            }}
          />
          <Button
            size="icon"
            variant="accent"
            onClick={() => void sendMessage(input)}
            disabled={!input.trim() || loading || streaming}
            className="h-8 w-8 flex-shrink-0"
          >
            {loading || streaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

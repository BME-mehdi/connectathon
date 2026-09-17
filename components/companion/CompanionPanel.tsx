"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const FALLBACK_REPLY =
  "Désolé, l'assistant santé n'est pas disponible pour le moment. Réessayez dans un instant, ou consultez votre médecin pour toute question urgente.";

export default function CompanionPanel() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (pathname?.startsWith("/auth")) return null;

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const history = messages;
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/companion/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json().catch(() => ({}));
      const reply = res.ok ? data.reply : (data.error ?? FALLBACK_REPLY);
      setMessages(prev => [...prev, { role: "assistant", content: reply || FALLBACK_REPLY }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: FALLBACK_REPLY }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 flex size-14 items-center justify-center rounded-full bg-hero-gradient text-white shadow-glow transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring z-50"
        aria-label={open ? "Fermer l'assistant santé" : "Ouvrir l'assistant santé"}
      >
        {open ? <X className="size-5" strokeWidth={2} /> : <MessageCircle className="size-6" strokeWidth={2} />}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 w-[calc(100vw-3rem)] max-w-sm bg-card rounded-2xl shadow-soft border border-border flex flex-col z-50"
          style={{ height: "min(28rem, 70vh)" }}
        >
          <div className="px-4 py-3 border-b border-border rounded-t-2xl bg-hero-gradient">
            <p className="text-sm font-heading font-bold text-white">Assistant santé (bêta)</p>
            <p className="text-xs text-white/80">Conseil de mode de vie · Pas de diagnostic</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center mt-8">
                Posez une question sur l&apos;alimentation, l&apos;activité physique ou la gestion du stress.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-secondary rounded-xl px-3 py-2 flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-secondary-foreground/50 animate-bounce [animation-delay:-0.3s]" />
                  <span className="size-1.5 rounded-full bg-secondary-foreground/50 animate-bounce [animation-delay:-0.15s]" />
                  <span className="size-1.5 rounded-full bg-secondary-foreground/50 animate-bounce" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={sendMessage} className="p-3 border-t border-border flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Votre question…"
              disabled={loading}
              className="flex-1 text-sm rounded-lg border border-input bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Envoyer"
              className="flex items-center justify-center rounded-lg bg-primary text-primary-foreground size-9 shrink-0 disabled:opacity-40 hover:bg-primary/80 transition-colors"
            >
              <Send className="size-4" strokeWidth={2} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

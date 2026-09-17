"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function CompanionPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg: Message = { role: "user", content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const res = await fetch("/api/companion/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input }),
    });
    const data = await res.json();

    setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    setLoading(false);
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-brand-accent text-white shadow-glow flex items-center justify-center text-xl hover:brightness-95 transition-all z-50"
        aria-label="Ouvrir l'assistant santé"
      >
        {open ? "×" : "💬"}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 w-80 sm:w-96 bg-card rounded-2xl shadow-soft border border-border flex flex-col z-50" style={{ height: 420 }}>
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Assistant santé (bêta)</p>
              <p className="text-xs text-muted-foreground">Conseil de mode de vie · Pas de diagnostic</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center mt-8">
                Posez une question sur l'alimentation, l'activité physique ou la gestion du stress.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
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
                <div className="bg-secondary rounded-xl px-3 py-2">
                  <span className="text-secondary-foreground text-xs">…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={sendMessage} className="p-3 border-t border-border flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Votre question…"
              className="flex-1 text-sm rounded-lg border border-input bg-card px-3 py-2 text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
            <button type="submit" disabled={loading || !input.trim()}
              className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm disabled:opacity-40 hover:bg-primary/80 transition-colors"
            >
              →
            </button>
          </form>
        </div>
      )}
    </>
  );
}

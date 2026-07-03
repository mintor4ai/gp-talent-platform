"use client";

import { useState, useRef, useEffect } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function CoachChat({
  contexto,
  tokensUsados,
  tokensLimite,
}: {
  contexto: string;
  tokensUsados: number;
  tokensLimite: number;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [tokenCount, setTokenCount] = useState(tokensUsados);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const tokenPct = Math.min(100, (tokenCount / tokensLimite) * 100);
  const atLimit = tokenCount >= tokensLimite;

  async function sendMessage() {
    const text = input.trim();
    if (!text || isStreaming || atLimit) return;

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);
    setError(null);

    const assistantMessage: Message = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMessage]);

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, contexto }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Error al conectar con el Coach IA");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              accumulated += data.text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: accumulated,
                };
                return updated;
              });
            }
            if (data.done && data.tokens) {
              setTokenCount((prev) => prev + data.tokens);
            }
            if (data.error) {
              throw new Error(data.error);
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[500px]">
      {/* Token usage bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>Tokens usados este mes</span>
          <span className={atLimit ? "text-red-600 font-semibold" : ""}>
            {tokenCount.toLocaleString()} / {tokensLimite.toLocaleString()}
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${
              tokenPct > 80 ? "bg-red-500" : "bg-[#1a3a5c]"
            }`}
            style={{ width: `${tokenPct}%` }}
          />
        </div>
        {atLimit && (
          <p className="text-xs text-red-600 mt-1.5">
            Has alcanzado el límite mensual. Contacta a Capital Humano para ampliarlo.
          </p>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-xl bg-[#1a3a5c] flex items-center justify-center mx-auto mb-4">
              <span className="text-white text-xl font-bold">C</span>
            </div>
            <p className="text-gray-600 font-medium mb-1">Coach IA — GP Talent Intelligence</p>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">
              Estoy aquí para apoyarte en tu desarrollo profesional. Puedes preguntarme sobre tu
              plan de carrera, competencias, metas o cualquier aspecto de tu crecimiento.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {[
                "¿Cómo puedo desarrollar mis competencias de liderazgo?",
                "Ayúdame a reflexionar sobre mis metas de este ciclo",
                "¿Qué acciones me recomiendas para crecer en mi carrera?",
              ].map((sugg) => (
                <button
                  key={sugg}
                  onClick={() => setInput(sugg)}
                  className="text-xs px-3 py-1.5 border border-gray-200 rounded-full text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  {sugg}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-[#1a3a5c] text-white rounded-br-sm"
                  : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
              }`}
            >
              {msg.content}
              {msg.role === "assistant" && isStreaming && i === messages.length - 1 && (
                <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse rounded-sm" />
              )}
            </div>
          </div>
        ))}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 flex gap-3 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming || atLimit}
          rows={1}
          placeholder={
            atLimit
              ? "Límite de tokens alcanzado"
              : "Escribe tu mensaje... (Enter para enviar, Shift+Enter para nueva línea)"
          }
          className="flex-1 resize-none text-sm text-gray-800 placeholder-gray-400 focus:outline-none max-h-32 overflow-y-auto disabled:opacity-50"
          style={{ lineHeight: "1.5" }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || isStreaming || atLimit}
          className="flex-shrink-0 w-9 h-9 bg-[#1a3a5c] text-white rounded-lg hover:bg-[#152e4d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
        >
          {isStreaming ? (
            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

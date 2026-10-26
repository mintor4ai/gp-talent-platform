"use client";

import { useState, useEffect } from "react";
import { KB_ARTICLES, KB_CATEGORIES, type KbArticle } from "@/lib/kb-articles";

export default function HelpPanel() {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const filtered = KB_ARTICLES.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q) || a.category.toLowerCase().includes(q);
  });

  const selected = selectedId ? KB_ARTICLES.find((a) => a.id === selectedId) ?? null : null;

  function handleOpen() {
    setOpen(true);
    setSearch("");
    if (!selectedId && KB_ARTICLES.length > 0) setSelectedId(KB_ARTICLES[0].id);
  }

  return (
    <>
      {/* Floating help button */}
      <button
        onClick={handleOpen}
        aria-label="Ayuda"
        className="fixed bottom-5 right-5 z-40 w-9 h-9 rounded-full bg-[#1a3a5c]/80 hover:bg-[#1a3a5c] text-white shadow-lg flex items-center justify-center transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/50"
        title="Centro de ayuda"
      >
        <span className="text-sm font-semibold select-none">?</span>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Side panel */}
      <div
        className={`fixed top-0 right-0 h-full z-50 flex flex-col bg-white shadow-2xl border-l border-gray-200 transition-all duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: "min(600px, 95vw)" }}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-[#1a3a5c] text-white flex-shrink-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50 mb-0.5">GP Talent Platform</p>
            <h2 className="text-base font-bold leading-tight">Centro de Ayuda</h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-white/70 hover:text-white"
            aria-label="Cerrar ayuda"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar — article list */}
          <div className="w-52 flex-shrink-0 border-r border-gray-100 flex flex-col overflow-hidden">
            {/* Search */}
            <div className="px-3 py-3 border-b border-gray-100">
              <input
                type="text"
                placeholder="Buscar…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelectedId(null); }}
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]/40 bg-gray-50 placeholder-gray-400"
              />
            </div>

            <div className="overflow-y-auto flex-1 py-2">
              {search.trim() ? (
                // Flat search results
                filtered.length === 0 ? (
                  <p className="text-xs text-gray-400 px-4 py-3">Sin resultados</p>
                ) : (
                  filtered.map((a) => (
                    <ArticleButton
                      key={a.id}
                      article={a}
                      active={selectedId === a.id}
                      onClick={() => { setSelectedId(a.id); setSearch(""); }}
                    />
                  ))
                )
              ) : (
                // Grouped by category
                KB_CATEGORIES.map((cat) => {
                  const articles = KB_ARTICLES.filter((a) => a.category === cat);
                  if (articles.length === 0) return null;
                  return (
                    <div key={cat} className="mb-1">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 px-4 pt-3 pb-1">{cat}</p>
                      {articles.map((a) => (
                        <ArticleButton
                          key={a.id}
                          article={a}
                          active={selectedId === a.id}
                          onClick={() => setSelectedId(a.id)}
                        />
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Article content */}
          <div className="flex-1 overflow-y-auto">
            {selected ? (
              <ArticleView article={selected} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <span className="text-lg font-bold text-gray-300">?</span>
                </div>
                <p className="text-sm font-medium text-gray-500">Selecciona un artículo</p>
                <p className="text-xs text-gray-400 mt-1">o usa el buscador para encontrar lo que necesitas</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ArticleButton({ article, active, onClick }: { article: KbArticle; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2 text-xs transition-colors ${
        active
          ? "bg-[#1a3a5c]/8 text-[#1a3a5c] font-semibold border-r-2 border-[#1a3a5c]"
          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      }`}
    >
      {article.title}
    </button>
  );
}

function fmtPublished(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-MX", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function ArticleView({ article }: { article: KbArticle }) {
  return (
    <div className="p-6">
      {/* Category + title */}
      <div className="mb-4">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#1a3a5c]/70 bg-[#1a3a5c]/8 px-2 py-0.5 rounded-full">
          {article.category}
        </span>
        <h3 className="text-base font-bold text-gray-900 mt-2 leading-snug">{article.title}</h3>
      </div>

      {/* Meta: published + modules */}
      <div className="flex flex-col gap-2 mb-5 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>Publicado: <span className="text-gray-600 font-medium">{fmtPublished(article.publishedAt)}</span></span>
        </div>
        {article.modules.length > 0 && (
          <div className="flex items-start gap-1.5">
            <svg className="w-3 h-3 flex-shrink-0 text-gray-400 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            <div className="flex flex-wrap gap-1">
              {article.modules.map((m) => (
                <span key={m} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
                  {m}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div
        className="text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap"
        style={{ fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace" }}
      >
        {article.content}
      </div>
    </div>
  );
}

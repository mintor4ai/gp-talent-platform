"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { getNotificaciones, marcarLeida, marcarTodasLeidas } from "@/app/actions/notificaciones";

type Notif = {
  id: string;
  tipo: "accion" | "informativo" | "sistema";
  titulo: string;
  cuerpo: string | null;
  url: string | null;
  leida: boolean;
  created_at: string;
};

const TIPO_COLOR: Record<string, string> = {
  accion:      "bg-red-500",
  informativo: "bg-blue-500",
  sistema:     "bg-amber-500",
};

const TIPO_LABEL: Record<string, string> = {
  accion:      "Acción requerida",
  informativo: "Aviso",
  sistema:     "Sistema",
};

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return "ahora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function NotificationBell() {
  const [open, setOpen]           = useState(false);
  const [notifs, setNotifs]       = useState<Notif[]>([]);
  const [, startTransition]       = useTransition();
  const dropdownRef               = useRef<HTMLDivElement>(null);

  const unread = notifs.filter((n) => !n.leida).length;

  async function load() {
    const data = await getNotificaciones();
    setNotifs(data as Notif[]);
  }

  // Initial load + polling cada 30s
  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Cerrar al click fuera
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function handleOpen() {
    setOpen((v) => !v);
  }

  function handleClick(notif: Notif) {
    if (!notif.leida) {
      startTransition(async () => {
        await marcarLeida(notif.id);
        setNotifs((prev) =>
          prev.map((n) => n.id === notif.id ? { ...n, leida: true } : n)
        );
      });
    }
    if (notif.url) {
      window.location.href = notif.url;
      setOpen(false);
    }
  }

  function handleMarcarTodas() {
    startTransition(async () => {
      await marcarTodasLeidas();
      setNotifs((prev) => prev.map((n) => ({ ...n, leida: true })));
    });
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative p-1.5 rounded-full hover:bg-white/10 transition-colors"
        aria-label="Notificaciones"
      >
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-bold text-[#1a3a5c]">
              Notificaciones {unread > 0 && <span className="text-red-500">({unread})</span>}
            </span>
            {unread > 0 && (
              <button
                onClick={handleMarcarTodas}
                className="text-xs text-[#1a3a5c]/70 hover:text-[#1a3a5c] underline"
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {notifs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sin notificaciones</p>
            ) : (
              notifs.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex gap-3 ${
                    !n.leida ? "bg-blue-50/40" : ""
                  }`}
                >
                  {/* Dot */}
                  <div className="flex-shrink-0 pt-1">
                    <span className={`block w-2 h-2 rounded-full mt-0.5 ${
                      !n.leida ? TIPO_COLOR[n.tipo] : "bg-gray-200"
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold uppercase tracking-wide mb-0.5 ${
                      !n.leida ? "text-[#1a3a5c]" : "text-gray-400"
                    }`}>
                      {TIPO_LABEL[n.tipo]}
                    </p>
                    <p className={`text-sm leading-snug ${!n.leida ? "font-semibold text-gray-900" : "text-gray-600"}`}>
                      {n.titulo}
                    </p>
                    {n.cuerpo && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.cuerpo}</p>
                    )}
                  </div>
                  <span className="flex-shrink-0 text-xs text-gray-400 pt-1">
                    {timeAgo(n.created_at)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

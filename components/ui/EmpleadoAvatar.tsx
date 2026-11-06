"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { getFotoUrl } from "@/lib/foto-empleado";

type Props = {
  /** The employee's id_empleado (numeric string like "4575"), NOT the UUID. */
  idEmpleado: string | null | undefined;
  nombre: string | null | undefined;
  size?: number;   // px, used for width/height
  className?: string;
  rounded?: "full" | "lg" | "md";
  clickable?: boolean;
};

function Lightbox({ url, nombre, onClose }: { url: string; nombre: string; onClose: () => void }) {
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <img
          src={url}
          alt={nombre}
          className="rounded-xl object-cover object-top max-w-[80vw] max-h-[80vh] shadow-2xl"
          style={{ maxWidth: 480, maxHeight: 480 }}
        />
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white text-gray-800 flex items-center justify-center shadow-lg hover:bg-gray-100 transition-colors"
          aria-label="Cerrar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>,
    document.body
  );
}

export default function EmpleadoAvatar({ idEmpleado, nombre, size = 28, className = "", rounded = "lg", clickable = false }: Props) {
  const [failed, setFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const url = getFotoUrl(idEmpleado);
  const inicial = (nombre ?? "?").charAt(0).toUpperCase();
  const rnd = rounded === "full" ? "rounded-full" : rounded === "lg" ? "rounded-lg" : "rounded-md";

  if (!url || failed) {
    return (
      <div
        className={`flex items-center justify-center flex-shrink-0 bg-[#1a3a5c] ${rnd} ${className}`}
        style={{ width: size, height: size, minWidth: size }}
      >
        <span className="text-white font-bold" style={{ fontSize: Math.max(10, Math.round(size * 0.4)) }}>
          {inicial}
        </span>
      </div>
    );
  }

  const img = (
    <img
      src={url}
      alt={nombre ?? ""}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`object-cover object-top flex-shrink-0 ${rnd} ${className}${clickable ? " cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
      style={{ width: size, height: size, minWidth: size }}
    />
  );

  return (
    <>
      {clickable ? (
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className={`p-0 border-0 bg-transparent flex-shrink-0 ${rnd} focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1`}
          style={{ width: size, height: size, minWidth: size }}
          aria-label={`Ver foto de ${nombre ?? "colaborador"}`}
        >
          {img}
        </button>
      ) : (
        img
      )}
      {lightboxOpen && url && (
        <Lightbox url={url} nombre={nombre ?? ""} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  );
}

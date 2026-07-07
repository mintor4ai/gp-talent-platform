"use client";

import { useState, useTransition } from "react";
import type { SucesionItem } from "./SucesionEditor";
import { readinessBadge } from "./SucesionEditor";
import { validarSucesionV1, validarSucesionV2 } from "@/app/actions/sucesion";

export default function SucesionValidacion({
  items,
  idEmpleado,
  isV2,
  onValidated,
}: {
  items: SucesionItem[];
  idEmpleado: string;
  isV2: boolean;
  onValidated: (item: SucesionItem) => void;
}) {
  const targetEstado = isV2 ? "pendiente_v2" : "pendiente_v1";
  const pending = items.filter((i) => i.estado === targetEstado);
  if (pending.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse flex-shrink-0" />
        <p className="text-xs font-semibold text-orange-700 uppercase tracking-wider">
          {isV2 ? "Validación Dirección (V2)" : "Pendientes de revisión (V1)"} — {pending.length}
        </p>
      </div>
      {pending.map((item) => (
        <ValidacionCard key={item.id} item={item} idEmpleado={idEmpleado} isV2={isV2} onValidated={onValidated} />
      ))}
    </div>
  );
}

function ValidacionCard({
  item,
  idEmpleado,
  isV2,
  onValidated,
}: {
  item: SucesionItem;
  idEmpleado: string;
  isV2: boolean;
  onValidated: (item: SucesionItem) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [comentario, setComentario] = useState("");
  const [informar, setInformar]     = useState(true);
  const [err, setErr]               = useState<string | null>(null);
  const [deciding, setDeciding]     = useState<"approve" | "reject" | null>(null);
  const readiness                   = readinessBadge(item.readiness);

  function handleValidar(aprobado: boolean) {
    startTransition(async () => {
      try {
        if (isV2) {
          await validarSucesionV2({ id: item.id, id_empleado: idEmpleado, aprobado, comentario });
          onValidated({ ...item, estado: aprobado ? "aprobado" : "rechazado" });
        } else {
          await validarSucesionV1({ id: item.id, id_empleado: idEmpleado, aprobado, comentario, informar_sucesor: aprobado ? informar : false });
          const newEstado = !aprobado ? "rechazado" : item.requiere_v2 ? "pendiente_v2" : "aprobado";
          onValidated({ ...item, estado: newEstado, informar_sucesor: aprobado ? informar : false });
        }
        setDeciding(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Error al validar");
      }
    });
  }

  return (
    <div className="border border-orange-200 bg-orange-50/30 rounded-xl p-4 space-y-3">
      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#1a3a5c] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-sm font-bold">{item.sucesor_nombre.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{item.sucesor_nombre}</p>
          <div className="flex items-center gap-1.5">
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${readiness.color}`}>
              {readiness.label}
            </span>
            {item.requiere_v2 && (
              <span className="text-xs text-orange-600 font-medium">· Requiere V2 (diferente UEN/Área)</span>
            )}
          </div>
        </div>
      </div>

      {item.brechas && (
        <div className="bg-white/80 rounded-lg px-3 py-2.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Brechas</p>
          <p className="text-sm text-gray-700">{item.brechas}</p>
        </div>
      )}
      {item.acciones_desarrollo && (
        <div className="bg-white/80 rounded-lg px-3 py-2.5">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Acciones de desarrollo</p>
          <p className="text-sm text-gray-700">{item.acciones_desarrollo}</p>
        </div>
      )}
      {!item.brechas && item.desarrollo_necesario && (
        <div className="bg-white/80 rounded-lg px-3 py-2.5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Desarrollo</p>
          <p className="text-sm text-gray-700">{item.desarrollo_necesario}</p>
        </div>
      )}
      {item.fecha_objetivo && (
        <p className="text-xs text-gray-500">
          Fecha objetivo:{" "}
          {new Date(item.fecha_objetivo + "T00:00:00").toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      )}
      {item.notas && <p className="text-xs text-gray-400 italic">{item.notas}</p>}

      {deciding === null ? (
        <div className="flex gap-2 pt-1">
          <button onClick={() => setDeciding("approve")}
            className="flex-1 text-xs bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 font-medium transition-colors">
            Aprobar
          </button>
          <button onClick={() => setDeciding("reject")}
            className="flex-1 text-xs bg-white border border-red-300 text-red-600 py-2 rounded-lg hover:bg-red-50 font-medium transition-colors">
            Rechazar
          </button>
        </div>
      ) : (
        <div className="space-y-3 pt-1">
          <textarea value={comentario} onChange={(e) => setComentario(e.target.value)}
            rows={2}
            placeholder={deciding === "approve" ? "Comentario (opcional)..." : "Motivo del rechazo..."}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none" />

          {!isV2 && deciding === "approve" && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={informar} onChange={(e) => setInformar(e.target.checked)}
                className="rounded border-gray-300 text-[#1a3a5c]" />
              <span className="text-xs text-gray-700 font-medium">
                Informar al sucesor de su candidatura en su próxima Entrevista de Desarrollo
              </span>
            </label>
          )}

          <div className="flex gap-2">
            <button onClick={() => handleValidar(deciding === "approve")} disabled={isPending}
              className={`flex-1 text-xs py-2 rounded-lg font-medium transition-colors disabled:opacity-40 ${
                deciding === "approve"
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "bg-red-600 text-white hover:bg-red-700"
              }`}>
              {isPending ? "Guardando..." : deciding === "approve" ? "Confirmar aprobación" : "Confirmar rechazo"}
            </button>
            <button onClick={() => setDeciding(null)}
              className="text-xs text-gray-400 hover:text-gray-600 px-3">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

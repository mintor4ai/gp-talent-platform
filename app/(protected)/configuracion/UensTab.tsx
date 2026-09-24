"use client";

import { useState, useTransition } from "react";
import { toggleUenActiva } from "@/app/actions/configuracion";

export type UenConfigRow = {
  organización: string;
  activa: boolean;
};

export default function UensTab({ uens }: { uens: UenConfigRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [local, setLocal] = useState<Map<string, boolean>>(
    new Map(uens.map((u) => [u.organización, u.activa]))
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle(org: string) {
    const next = !local.get(org);
    setLocal((prev) => new Map(prev).set(org, next));
    startTransition(async () => {
      const res = await toggleUenActiva(org, next);
      if (res?.error) {
        setLocal((prev) => new Map(prev).set(org, !next));
        setMsg({ ok: false, text: res.error ?? "Error desconocido" });
      } else {
        setMsg({ ok: true, text: `"${org}" ${next ? "activada" : "desactivada"}` });
      }
      setTimeout(() => setMsg(null), 3000);
    });
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Visibilidad de UENs</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Las UENs desactivadas se ocultan en todo el sistema. Los colaboradores siguen existiendo en la base de datos.
        </p>
      </div>

      {msg && (
        <div className={`text-sm px-3 py-2 rounded-lg ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
        {uens.length === 0 && (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">Sin UENs registradas</p>
        )}
        {uens.map((u) => {
          const activa = local.get(u.organización) ?? u.activa;
          return (
            <div key={u.organización} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
              <span className={`text-sm font-medium ${activa ? "text-gray-800" : "text-gray-400 line-through"}`}>
                {u.organización}
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => toggle(u.organización)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] focus:ring-offset-1 disabled:opacity-50 ${
                  activa ? "bg-[#1a3a5c]" : "bg-gray-200"
                }`}
                role="switch"
                aria-checked={activa}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                    activa ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

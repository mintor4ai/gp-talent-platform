"use client";

import { useState, useMemo } from "react";
import type { PicdDiscrepancia, PicdSinVinculo, OrgOption } from "@/app/actions/higiene_picd";
import { crearPuestoPropuesto } from "@/app/actions/higiene_picd";

const CAMPO_LABEL: Record<string, string> = {
  opcion1: "Opción 1",
  opcion2: "Opción 2",
};

// ─── Shared filter bar ────────────────────────────────────────────────────────

function FilterBar({
  search, onSearch,
  filterEstado, onFilterEstado,
  total, filtered,
}: {
  search: string; onSearch: (v: string) => void;
  filterEstado: "todos" | "borrador" | "publicado"; onFilterEstado: (v: "todos" | "borrador" | "publicado") => void;
  total: number; filtered: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="text"
        placeholder="Buscar por nombre o puesto…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c] w-64"
      />
      <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg p-1">
        {(["todos", "publicado", "borrador"] as const).map((v) => (
          <button
            key={v}
            onClick={() => onFilterEstado(v)}
            className={`text-xs px-3 py-1 rounded-md transition-colors font-medium ${
              filterEstado === v ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {v === "todos" ? "Todos" : v === "publicado" ? "Publicados" : "Borradores"}
          </button>
        ))}
      </div>
      <span className="text-xs text-gray-400 ml-auto">
        {filtered} de {total} registros
      </span>
    </div>
  );
}

// ─── Discrepancias tab ────────────────────────────────────────────────────────

function DiscrepanciasTab({ discrepancias }: { discrepancias: PicdDiscrepancia[] }) {
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState<"todos" | "borrador" | "publicado">("todos");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return discrepancias.filter((d) => {
      if (filterEstado === "borrador" && d.estado !== "borrador") return false;
      if (filterEstado === "publicado" && d.estado === "borrador") return false;
      if (!q) return true;
      return (
        d.colaboradorNombre.toLowerCase().includes(q) ||
        d.textoEscrito.toLowerCase().includes(q) ||
        d.nombreEnCatalogo.toLowerCase().includes(q)
      );
    });
  }, [discrepancias, search, filterEstado]);

  const borradorCount = discrepancias.filter((d) => d.estado === "borrador").length;

  if (discrepancias.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <p className="text-green-700 font-medium">Sin inconsistencias detectadas</p>
        <p className="text-sm text-green-600 mt-1">
          Todos los registros PICD con catálogo vinculado coinciden con el texto registrado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-amber-800">
            {discrepancias.length} registro{discrepancias.length !== 1 ? "s" : ""} con texto distinto al nombre en catálogo
            {borradorCount > 0 && ` · ${borradorCount} en borrador`}
          </p>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            El colaborador escribió un texto que no coincide exactamente con el nombre del puesto al que apunta el vínculo interno.
            Puede ser un error tipográfico, un puesto renombrado, o un vínculo asignado incorrectamente.
          </p>
        </div>
      </div>

      <FilterBar
        search={search} onSearch={setSearch}
        filterEstado={filterEstado} onFilterEstado={setFilterEstado}
        total={discrepancias.length} filtered={filtered.length}
      />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium">Colaborador</th>
                <th className="text-left px-4 py-3 font-medium w-20">Ciclo</th>
                <th className="text-left px-4 py-3 font-medium w-28">Estado</th>
                <th className="text-left px-4 py-3 font-medium w-24">Campo</th>
                <th className="text-left px-4 py-3 font-medium">
                  <span className="text-red-500">Texto escrito</span>
                </th>
                <th className="text-left px-4 py-3 font-medium">
                  <span className="text-blue-600">Nombre en catálogo</span>
                </th>
                <th className="text-left px-4 py-3 font-medium w-28">Acción sugerida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((d, i) => {
                const textoUpper = d.textoEscrito.toUpperCase();
                const catalogoUpper = d.nombreEnCatalogo.toUpperCase();
                const probablyTextError =
                  textoUpper.includes(catalogoUpper.substring(0, 8)) ||
                  catalogoUpper.includes(textoUpper.substring(0, 8));

                return (
                  <tr key={i} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-800">
                      {d.colaboradorNombre || <span className="text-gray-400 font-mono text-xs">{d.colaboradorId.substring(0, 8)}…</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-500 tabular-nums text-xs">{d.cicloAño}</td>
                    <td className="px-4 py-3">
                      {d.estado === "borrador" ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Borrador
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Publicado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {CAMPO_LABEL[d.campo] ?? d.campo}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded">{d.textoEscrito}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{d.nombreEnCatalogo}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                        probablyTextError ? "bg-orange-50 text-orange-700" : "bg-purple-50 text-purple-700"
                      }`}>
                        {probablyTextError ? "Corregir texto" : "Revisar vínculo"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-sm text-gray-400">Sin registros que coincidan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Sin Vínculo tab ──────────────────────────────────────────────────────────

type ModalState = {
  picdId: string;
  campo: "opcion1" | "opcion2";
  colaboradorNombre: string;
  textoEscrito: string;
};

function SinVinculoTab({
  sinVinculo: initialRows,
  orgOptions,
}: {
  sinVinculo: PicdSinVinculo[];
  orgOptions: OrgOption[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState<"todos" | "borrador" | "publicado">("todos");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalNombre, setModalNombre] = useState("");
  const [modalOrg, setModalOrg] = useState("");
  const [modalArea, setModalArea] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter((r) => {
      if (filterEstado === "borrador" && r.estado !== "borrador") return false;
      if (filterEstado === "publicado" && r.estado === "borrador") return false;
      if (!q) return true;
      return (
        r.colaboradorNombre.toLowerCase().includes(q) ||
        r.textoEscrito.toLowerCase().includes(q)
      );
    });
  }, [rows, search, filterEstado]);

  const areaOptions = useMemo(
    () => orgOptions.find((o) => o.org === modalOrg)?.areas ?? [],
    [orgOptions, modalOrg]
  );

  function openModal(row: PicdSinVinculo) {
    setModal({ picdId: row.picdId, campo: row.campo, colaboradorNombre: row.colaboradorNombre, textoEscrito: row.textoEscrito });
    setModalNombre(row.textoEscrito);
    setModalOrg("");
    setModalArea("");
    setErrorMsg("");
  }

  async function handleCrear() {
    if (!modal) return;
    if (!modalNombre.trim() || !modalOrg) {
      setErrorMsg("Nombre y UEN son obligatorios.");
      return;
    }
    setGuardando(true);
    setErrorMsg("");
    const result = await crearPuestoPropuesto({
      picdId: modal.picdId,
      campo: modal.campo,
      nombre: modalNombre,
      org: modalOrg,
      area: modalArea,
    });
    setGuardando(false);
    if (!result.ok) {
      setErrorMsg(result.error ?? "Error desconocido.");
      return;
    }
    // Remove from list optimistically
    setRows((prev) => prev.filter((r) => !(r.picdId === modal.picdId && r.campo === modal.campo)));
    setModal(null);
  }

  if (rows.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <p className="text-green-700 font-medium">Sin aspiraciones sin catálogo</p>
        <p className="text-sm text-green-600 mt-1">Todos los textos escritos tienen un puesto de catálogo vinculado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-blue-800">
            {rows.length} aspiración{rows.length !== 1 ? "es" : ""} sin puesto vinculado en catálogo
          </p>
          <p className="text-xs text-blue-700 mt-1 leading-relaxed">
            El colaborador escribió un puesto al que aspira, pero no existe o no fue vinculado en el catálogo.
            Puedes crear ese puesto como <strong>Propuesto</strong> (pendiente de aprobación) para que aparezca
            en Rutas de Talento y ayude a identificar demanda de nuevas posiciones.
          </p>
        </div>
      </div>

      <FilterBar
        search={search} onSearch={setSearch}
        filterEstado={filterEstado} onFilterEstado={setFilterEstado}
        total={rows.length} filtered={filtered.length}
      />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium">Colaborador</th>
                <th className="text-left px-4 py-3 font-medium w-20">Ciclo</th>
                <th className="text-left px-4 py-3 font-medium w-28">Estado</th>
                <th className="text-left px-4 py-3 font-medium w-24">Campo</th>
                <th className="text-left px-4 py-3 font-medium">Puesto aspirado</th>
                <th className="text-left px-4 py-3 font-medium w-36">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-800">{r.colaboradorNombre}</td>
                  <td className="px-4 py-3 font-mono text-gray-500 tabular-nums text-xs">{r.cicloAño}</td>
                  <td className="px-4 py-3">
                    {r.estado === "borrador" ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Borrador
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Publicado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {CAMPO_LABEL[r.campo] ?? r.campo}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">
                      {r.textoEscrito}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openModal(r)}
                      className="text-xs font-medium px-3 py-1.5 bg-[#1a3a5c] text-white rounded-lg hover:bg-[#1a3a5c]/85 transition-colors whitespace-nowrap"
                    >
                      + Crear puesto propuesto
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-sm text-gray-400">Sin registros que coincidan.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Creation modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Crear puesto propuesto</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Colaborador: <strong>{modal.colaboradorNombre}</strong> · {CAMPO_LABEL[modal.campo]}
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nombre del puesto</label>
                <input
                  value={modalNombre}
                  onChange={(e) => setModalNombre(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
                  placeholder="Nombre del puesto…"
                />
                <p className="text-xs text-gray-400 mt-1">Pre-llenado con lo que escribió el colaborador. Puedes corregirlo.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">UEN <span className="text-red-500">*</span></label>
                <select
                  value={modalOrg}
                  onChange={(e) => { setModalOrg(e.target.value); setModalArea(""); }}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 bg-white"
                >
                  <option value="">Selecciona UEN…</option>
                  {orgOptions.map((o) => (
                    <option key={o.org} value={o.org}>{o.org}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Área</label>
                {areaOptions.length > 0 ? (
                  <select
                    value={modalArea}
                    onChange={(e) => setModalArea(e.target.value)}
                    disabled={!modalOrg}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 bg-white disabled:opacity-40"
                  >
                    <option value="">Sin área específica</option>
                    {areaOptions.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={modalArea}
                    onChange={(e) => setModalArea(e.target.value)}
                    placeholder="Escribe el área…"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30"
                  />
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Ubica el puesto en un área existente o déjalo sin área. Esto ayuda a identificar su cercanía a otros puestos.
                </p>
              </div>

              {errorMsg && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorMsg}</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button
                onClick={() => setModal(null)}
                disabled={guardando}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCrear}
                disabled={guardando || !modalNombre.trim() || !modalOrg}
                className="px-5 py-2 text-sm font-medium bg-[#1a3a5c] text-white rounded-lg hover:bg-[#1a3a5c]/85 transition-colors disabled:opacity-40"
              >
                {guardando ? "Creando…" : "Crear puesto propuesto"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HigienePicdClient({
  discrepancias,
  sinVinculo,
  orgOptions,
}: {
  discrepancias: PicdDiscrepancia[];
  sinVinculo: PicdSinVinculo[];
  orgOptions: OrgOption[];
}) {
  const [tab, setTab] = useState<"discrepancias" | "sin_vinculo">("sin_vinculo");

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("sin_vinculo")}
          className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
            tab === "sin_vinculo" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Sin catálogo vinculado
          {sinVinculo.length > 0 && (
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              tab === "sin_vinculo" ? "bg-violet-100 text-violet-700" : "bg-gray-200 text-gray-500"
            }`}>
              {sinVinculo.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("discrepancias")}
          className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
            tab === "discrepancias" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Texto vs catálogo
          {discrepancias.length > 0 && (
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              tab === "discrepancias" ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-500"
            }`}>
              {discrepancias.length}
            </span>
          )}
        </button>
      </div>

      {tab === "discrepancias"
        ? <DiscrepanciasTab discrepancias={discrepancias} />
        : <SinVinculoTab sinVinculo={sinVinculo} orgOptions={orgOptions} />
      }

      <p className="text-xs text-gray-400">
        "Sin catálogo vinculado" — crea puestos propuestos y vincula al colaborador.
        "Texto vs catálogo" — corrige directamente en el expediente del colaborador.
      </p>
    </div>
  );
}

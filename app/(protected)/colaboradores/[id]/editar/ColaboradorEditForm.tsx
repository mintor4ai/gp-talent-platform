"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actualizarColaborador, type ColaboradorEditPayload } from "@/app/actions/colaborador_editar";

type Inicial = {
  nombre_completo: string;
  puesto: string;
  nivel: string;
  area: string;
  organización: string;
  segmento_organizacional: string;
  jefe_inmediato_nombre: string;
  entidad: string;
  fecha_antiguedad: string;
  fecha_ingreso_posicion: string;
  nivel_academico: string;
  resumen_formacion_profesional: string;
  resumen_exp_interno: string;
  resumen_exp_externo: string;
};

type Opciones = {
  uens: string[];
  areas: string[];
  segmentos: string[];
  entidades: string[];
  jefes: string[];
  niveles: string[];
  nivelesAcad: string[];
};

type Props = {
  colaboradorId: string;
  inicial: Inicial;
  opciones: Opciones;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c] bg-white";

const textareaCls =
  "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c] resize-none bg-white";

function DatalistInput({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <>
      <input
        list={`dl-${id}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
      <datalist id={`dl-${id}`}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

export default function ColaboradorEditForm({ colaboradorId, inicial, opciones }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<Inicial>(inicial);
  const [error, setError] = useState<string | null>(null);

  function set(field: keyof Inicial, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.nombre_completo.trim()) {
      setError("El nombre completo es requerido.");
      return;
    }

    const payload: ColaboradorEditPayload = {
      nombre_completo:               form.nombre_completo,
      puesto:                        form.puesto || null,
      nivel:                         form.nivel || null,
      area:                          form.area || null,
      organización:                  form.organización || null,
      segmento_organizacional:       form.segmento_organizacional || null,
      jefe_inmediato_nombre:         form.jefe_inmediato_nombre || null,
      entidad:                       form.entidad || null,
      fecha_antiguedad:              form.fecha_antiguedad || null,
      fecha_ingreso_posicion:          form.fecha_ingreso_posicion || null,
      nivel_academico:               form.nivel_academico || null,
      resumen_formacion_profesional: form.resumen_formacion_profesional || null,
      resumen_exp_interno:           form.resumen_exp_interno || null,
      resumen_exp_externo:           form.resumen_exp_externo || null,
    };

    startTransition(async () => {
      const res = await actualizarColaborador(colaboradorId, payload);
      if (res.ok) {
        router.push(`/colaboradores/${colaboradorId}`);
      } else {
        setError(res.error ?? "Error al guardar cambios.");
      }
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <a href="/colaboradores" className="hover:text-gray-600 transition-colors">Colaboradores</a>
        <span>/</span>
        <a href={`/colaboradores/${colaboradorId}`} className="hover:text-gray-600 transition-colors">
          {inicial.nombre_completo}
        </a>
        <span>/</span>
        <span className="text-gray-700 font-medium">Editar</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Editar datos del colaborador</h1>
        <p className="text-sm text-gray-500 mt-1">Los cambios se reflejarán inmediatamente en el sistema.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Identificación */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">
            Identificación
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="Nombre completo *">
                <input
                  value={form.nombre_completo}
                  onChange={(e) => set("nombre_completo", e.target.value)}
                  required
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Puesto">
              <input
                value={form.puesto}
                onChange={(e) => set("puesto", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Nivel">
              <DatalistInput
                id="nivel"
                value={form.nivel}
                onChange={(v) => set("nivel", v)}
                options={opciones.niveles}
                placeholder="Ej. 03 GERENTE"
              />
            </Field>
          </div>
        </div>

        {/* Organización */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">
            Organización
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="UEN / Organización">
              <DatalistInput
                id="uen"
                value={form.organización}
                onChange={(v) => set("organización", v)}
                options={opciones.uens}
              />
            </Field>
            <Field label="Área">
              <DatalistInput
                id="area"
                value={form.area}
                onChange={(v) => set("area", v)}
                options={opciones.areas}
              />
            </Field>
            <Field label="Segmento organizacional">
              <DatalistInput
                id="segmento"
                value={form.segmento_organizacional}
                onChange={(v) => set("segmento_organizacional", v)}
                options={opciones.segmentos}
              />
            </Field>
            <Field label="Entidad">
              <DatalistInput
                id="entidad"
                value={form.entidad}
                onChange={(v) => set("entidad", v)}
                options={opciones.entidades}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Jefe inmediato">
                <DatalistInput
                  id="jefe"
                  value={form.jefe_inmediato_nombre}
                  onChange={(v) => set("jefe_inmediato_nombre", v)}
                  options={opciones.jefes}
                />
              </Field>
            </div>
          </div>
        </div>

        {/* Fechas */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">
            Fechas
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Fecha de antigüedad">
              <input
                type="date"
                value={form.fecha_antiguedad}
                onChange={(e) => set("fecha_antiguedad", e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label="Fecha ingreso al puesto actual">
              <input
                type="date"
                value={form.fecha_ingreso_posicion}
                onChange={(e) => set("fecha_ingreso_posicion", e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        </div>

        {/* Formación */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">
            Formación y Experiencia
          </h2>
          <Field label="Nivel académico">
            <DatalistInput
              id="nivAcad"
              value={form.nivel_academico}
              onChange={(v) => set("nivel_academico", v)}
              options={opciones.nivelesAcad}
              placeholder="Ej. Ingeniería, Maestría…"
            />
          </Field>
          <Field label="Formación profesional">
            <textarea
              rows={3}
              value={form.resumen_formacion_profesional}
              onChange={(e) => set("resumen_formacion_profesional", e.target.value)}
              className={textareaCls}
            />
          </Field>
          <Field label="Experiencia interna">
            <textarea
              rows={3}
              value={form.resumen_exp_interno}
              onChange={(e) => set("resumen_exp_interno", e.target.value)}
              className={textareaCls}
            />
          </Field>
          <Field label="Experiencia externa">
            <textarea
              rows={3}
              value={form.resumen_exp_externo}
              onChange={(e) => set("resumen_exp_externo", e.target.value)}
              className={textareaCls}
            />
          </Field>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-4">
          <a
            href={`/colaboradores/${colaboradorId}`}
            className="px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancelar
          </a>
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2.5 text-sm font-semibold bg-[#1a3a5c] text-white rounded-lg hover:bg-[#152e4d] disabled:opacity-50 transition-colors"
          >
            {isPending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}

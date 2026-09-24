"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "fotos-empleados";
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_MB = 5;

type FileStatus = {
  file: File;
  id: string;
  status: "pending" | "uploading" | "ok" | "error";
  error?: string;
};

function parseId(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").trim();
}

export default function ImportadorFotos() {
  const [items, setItems] = useState<FileStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    const next: FileStatus[] = arr
      .filter((f) => ALLOWED.includes(f.type) && f.size <= MAX_MB * 1024 * 1024)
      .map((f) => ({ file: f, id: parseId(f.name), status: "pending" as const }));
    const skipped = arr.length - next.length;
    setItems((prev) => {
      const existingIds = new Set(prev.map((i) => i.id));
      const unique = next.filter((n) => !existingIds.has(n.id));
      return [...prev, ...unique];
    });
    if (skipped > 0) alert(`${skipped} archivo(s) ignorados: solo JPG/PNG/WEBP hasta ${MAX_MB}MB.`);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }, []);

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function clearDone() {
    setItems((prev) => prev.filter((i) => i.status !== "ok"));
  }

  async function uploadAll() {
    const pending = items.filter((i) => i.status === "pending" || i.status === "error");
    if (!pending.length) return;
    setUploading(true);
    const supabase = createClient();

    for (const item of pending) {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "uploading" } : i));
      const ext = item.file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const path = `${item.id}.${ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, item.file, { upsert: true, contentType: item.file.type });
      setItems((prev) => prev.map((i) =>
        i.id === item.id
          ? { ...i, status: error ? "error" : "ok", error: error?.message }
          : i
      ));
    }
    setUploading(false);
  }

  const pending  = items.filter((i) => i.status === "pending").length;
  const errors   = items.filter((i) => i.status === "error").length;
  const done     = items.filter((i) => i.status === "ok").length;

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h3 className="text-base font-semibold text-gray-800">Fotos de empleados</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Selecciona o arrastra las fotos. El nombre del archivo debe ser el <strong>ID del empleado</strong> (ej: <code>EMP-001.jpg</code>).
          Formatos: JPG, PNG, WEBP · Máx {MAX_MB} MB por foto.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl px-6 py-10 text-center cursor-pointer transition-colors ${
          dragging ? "border-[#1a3a5c] bg-blue-50" : "border-gray-300 hover:border-[#1a3a5c]/60 hover:bg-gray-50"
        }`}
      >
        <div className="text-3xl mb-2">📂</div>
        <p className="text-sm font-medium text-gray-700">Arrastra las fotos aquí</p>
        <p className="text-xs text-gray-400 mt-0.5">o haz clic para seleccionarlas (selección múltiple)</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onInputChange}
        />
      </div>

      {/* Stats + actions */}
      {items.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500">{items.length} foto(s)</span>
            {done > 0    && <span className="text-green-600 font-medium">✓ {done} subidas</span>}
            {errors > 0  && <span className="text-red-600 font-medium">✗ {errors} con error</span>}
            {pending > 0 && <span className="text-gray-500">{pending} pendiente(s)</span>}
          </div>
          <div className="flex gap-2">
            {done > 0 && (
              <button onClick={clearDone}
                className="text-xs text-gray-400 hover:text-gray-600 underline">
                Limpiar subidas
              </button>
            )}
            <button
              onClick={uploadAll}
              disabled={uploading || (pending === 0 && errors === 0)}
              className="text-sm px-4 py-1.5 rounded-lg bg-[#1a3a5c] text-white font-medium hover:bg-[#1a3a5c]/90 disabled:opacity-40 transition-colors"
            >
              {uploading ? "Subiendo…" : errors > 0 ? `Reintentar ${errors} error(es)` : `Subir ${pending} foto(s)`}
            </button>
          </div>
        </div>
      )}

      {/* File list */}
      {items.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                {/* Thumbnail */}
                <img
                  src={URL.createObjectURL(item.file)}
                  alt=""
                  className="w-9 h-9 rounded-lg object-cover object-top flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.file.name}</p>
                  <p className="text-[11px] text-gray-400">ID: {item.id} · {(item.file.size / 1024).toFixed(0)} KB</p>
                  {item.error && <p className="text-[11px] text-red-500">{item.error}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.status === "ok"        && <span className="text-green-500 text-lg">✓</span>}
                  {item.status === "uploading" && <span className="text-gray-400 text-xs animate-pulse">…</span>}
                  {item.status === "error"     && <span className="text-red-500 text-lg">✗</span>}
                  {item.status === "pending"   && (
                    <button onClick={() => removeItem(item.id)}
                      className="text-gray-300 hover:text-gray-500 text-sm leading-none">✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

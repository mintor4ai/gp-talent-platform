"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { upsertEntrevista, addComentario, updateEstadoEntrevista } from "@/app/actions/entrevista";

type Entrevista = {
  id: string;
  id_empleado: string;
  ciclo_ano: number;
  notas: string;
  estado: string;
  fecha_entrevista: string | null;
  participantes: string;
  created_at: string;
  updated_at: string;
};

type Comentario = {
  id: string;
  autor_rol: string;
  autor_nombre: string;
  texto: string;
  created_at: string;
};

const ESTADO_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pendiente_revision: { label: "Pendiente de revisión", bg: "bg-yellow-100", text: "text-yellow-800" },
  en_revision:        { label: "En revisión",           bg: "bg-blue-100",   text: "text-blue-800"   },
  ajustes_solicitados:{ label: "Ajustes solicitados",   bg: "bg-orange-100", text: "text-orange-800" },
  acordado:           { label: "Acordado",              bg: "bg-green-100",  text: "text-green-800"  },
};

export default function EntrevistaThread({
  colaboradorId,
  cicloAno,
  entrevista,
  comentarios,
  isOwn,
  isJefe,
  isAdmin,
  nombreColaborador,
}: {
  colaboradorId: string;
  cicloAno: number;
  entrevista: Entrevista | null;
  comentarios: Comentario[];
  isOwn: boolean;
  isJefe: boolean;
  isAdmin: boolean;
  nombreColaborador: string;
}) {
  const [open, setOpen] = useState(!!entrevista);
  const [editingNotas, setEditingNotas] = useState(!entrevista && isOwn);
  const [notasValue, setNotasValue] = useState(entrevista?.notas ?? "");
  const [fechaValue, setFechaValue] = useState(entrevista?.fecha_entrevista ?? "");
  const [participantesValue, setParticipantesValue] = useState(entrevista?.participantes ?? "");
  const [commentText, setCommentText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [comentarios.length, open]);

  const estadoInfo = entrevista ? (ESTADO_CONFIG[entrevista.estado] ?? ESTADO_CONFIG.pendiente_revision) : null;
  const canComment = !!entrevista && (isJefe || isAdmin);
  const canChangeEstado = !!entrevista && (isJefe || isAdmin);

  function handleSaveNotas(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await upsertEntrevista(fd);
      setEditingNotas(false);
      setSavedMsg("Entrevista documentada");
      setOpen(true);
      setTimeout(() => setSavedMsg(null), 3000);
    });
  }

  function handleAddComentario(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!commentText.trim()) return;
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await addComentario(fd);
      setCommentText("");
    });
  }

  function handleChangeEstado(estado: string) {
    if (!entrevista) return;
    const fd = new FormData();
    fd.set("id_entrevista", entrevista.id);
    fd.set("id_empleado", colaboradorId);
    fd.set("estado", estado);
    startTransition(async () => {
      await updateEstadoEntrevista(fd);
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Entrevista de Desarrollo — {cicloAno}
          </p>
          {estadoInfo && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${estadoInfo.bg} ${estadoInfo.text}`}>
              {estadoInfo.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {savedMsg && <span className="text-xs text-green-600 font-medium">{savedMsg}</span>}
          {!entrevista && isOwn && (
            <button
              onClick={() => { setOpen(true); setEditingNotas(true); }}
              className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] transition-colors"
            >
              Documentar entrevista
            </button>
          )}
          {entrevista && isOwn && !editingNotas && entrevista.estado !== "acordado" && (
            <button
              onClick={() => setEditingNotas(true)}
              className="text-xs text-[#1a3a5c] hover:underline"
            >
              Editar notas
            </button>
          )}
          {entrevista && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="text-gray-400 text-sm px-1"
            >
              {open ? "▲" : "▼"}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="p-5 space-y-5">
          {/* Notes form (colaborador) */}
          {(editingNotas || !entrevista) && isOwn ? (
            <form onSubmit={handleSaveNotas} className="space-y-4">
              <input type="hidden" name="id_empleado" value={colaboradorId} />
              <input type="hidden" name="ciclo_ano" value={cicloAno} />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Fecha de la entrevista *
                  </label>
                  <input
                    type="date"
                    name="fecha_entrevista"
                    value={fechaValue}
                    onChange={(e) => setFechaValue(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Participantes *
                  </label>
                  <input
                    type="text"
                    name="participantes"
                    value={participantesValue}
                    onChange={(e) => setParticipantesValue(e.target.value)}
                    required
                    placeholder="Ej. Juan Pérez (jefe), María López (RH)"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Notas de la entrevista *
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  Documenta los acuerdos, compromisos y puntos clave de tu conversación sobre el PICD.
                </p>
                <textarea
                  name="notas"
                  value={notasValue}
                  onChange={(e) => setNotasValue(e.target.value)}
                  rows={6}
                  required
                  placeholder="Ej. Acordamos que me enfocaré en fortalecer habilidades de liderazgo. Mi jefe propuso el curso de gestión de equipos. Nos comprometimos a revisar el avance en marzo..."
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end">
                {editingNotas && entrevista && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingNotas(false);
                      setNotasValue(entrevista.notas);
                      setFechaValue(entrevista.fecha_entrevista ?? "");
                      setParticipantesValue(entrevista.participantes ?? "");
                    }}
                    className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isPending || !notasValue.trim() || !fechaValue || !participantesValue.trim()}
                  className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-50 transition-colors"
                >
                  {isPending ? "Guardando..." : entrevista ? "Actualizar" : "Enviar a revisión →"}
                </button>
              </div>
            </form>
          ) : entrevista ? (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-500">
                {entrevista.fecha_entrevista && (
                  <span>
                    <span className="text-gray-400">Fecha: </span>
                    <span className="font-medium text-gray-700">
                      {new Date(entrevista.fecha_entrevista + "T12:00:00").toLocaleDateString("es-MX", {
                        day: "numeric", month: "long", year: "numeric",
                      })}
                    </span>
                  </span>
                )}
                {entrevista.participantes && (
                  <span>
                    <span className="text-gray-400">Participantes: </span>
                    <span className="font-medium text-gray-700">{entrevista.participantes}</span>
                  </span>
                )}
                <span className="text-gray-400 ml-auto">
                  Documentado por {nombreColaborador} ·{" "}
                  {new Date(entrevista.updated_at).toLocaleDateString("es-MX", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{entrevista.notas}</p>
            </div>
          ) : null}

          {/* Thread de comentarios */}
          {entrevista && (
            <div className="space-y-3">
              {comentarios.length > 0 && (
                <div className="space-y-3">
                  {comentarios.map((c) => {
                    const isColabComment = c.autor_rol === "colaborador";
                    return (
                      <div
                        key={c.id}
                        className={`flex gap-3 ${isColabComment ? "" : "flex-row-reverse"}`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white ${
                            isColabComment ? "bg-[#1a3a5c]" : "bg-emerald-600"
                          }`}
                        >
                          {c.autor_nombre.charAt(0)}
                        </div>
                        <div className={`flex-1 ${isColabComment ? "" : "items-end flex flex-col"}`}>
                          <div
                            className={`rounded-xl px-3.5 py-2.5 text-sm max-w-sm ${
                              isColabComment
                                ? "bg-gray-100 text-gray-800"
                                : "bg-emerald-50 text-emerald-900"
                            }`}
                          >
                            {c.texto}
                          </div>
                          <p className="text-xs text-gray-400 mt-1 px-1">
                            {c.autor_nombre} ·{" "}
                            {new Date(c.created_at).toLocaleDateString("es-MX", {
                              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={threadEndRef} />
                </div>
              )}

              {comentarios.length === 0 && (isJefe || isAdmin) && (
                <p className="text-xs text-gray-400 italic">
                  El colaborador ha documentado la entrevista. Puedes agregar comentarios o cambiar el estado.
                </p>
              )}

              {/* Estado actions for jefe/admin */}
              {canChangeEstado && entrevista.estado !== "acordado" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="text-xs text-gray-400 self-center">Marcar como:</span>
                  {entrevista.estado !== "ajustes_solicitados" && (
                    <button
                      onClick={() => handleChangeEstado("ajustes_solicitados")}
                      disabled={isPending}
                      className="text-xs px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors disabled:opacity-50"
                    >
                      Solicitar ajustes
                    </button>
                  )}
                  <button
                    onClick={() => handleChangeEstado("acordado")}
                    disabled={isPending}
                    className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
                  >
                    Marcar como acordado ✓
                  </button>
                </div>
              )}

              {entrevista.estado === "acordado" && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-4 py-2.5 rounded-lg">
                  <span>✓</span>
                  <span className="font-medium">Esta entrevista ha sido acordada entre colaborador y jefe.</span>
                </div>
              )}

              {/* Comment input for jefe/admin */}
              {canComment && entrevista.estado !== "acordado" && (
                <form onSubmit={handleAddComentario} className="flex gap-2 pt-1">
                  <input type="hidden" name="id_entrevista" value={entrevista.id} />
                  <input type="hidden" name="id_empleado" value={colaboradorId} />
                  <input
                    name="texto"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Escribe un comentario o sugerencia..."
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
                  />
                  <button
                    type="submit"
                    disabled={isPending || !commentText.trim()}
                    className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-50 transition-colors flex-shrink-0"
                  >
                    Enviar
                  </button>
                </form>
              )}

              {/* Colaborador reply to adjustments */}
              {isOwn && entrevista.estado === "ajustes_solicitados" && (
                <form onSubmit={handleAddComentario} className="flex gap-2 pt-1">
                  <input type="hidden" name="id_entrevista" value={entrevista.id} />
                  <input type="hidden" name="id_empleado" value={colaboradorId} />
                  <input
                    name="texto"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Responde a los ajustes solicitados..."
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
                  />
                  <button
                    type="submit"
                    disabled={isPending || !commentText.trim()}
                    className="text-sm bg-[#1a3a5c] text-white px-4 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-50 transition-colors flex-shrink-0"
                  >
                    Responder
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

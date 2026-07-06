"use client";

import { useState, useTransition } from "react";
import { createUser, updateUsuario, resetPassword } from "@/app/actions/usuarios";

export type AuthUsuario = {
  id: string;
  email: string;
  last_sign_in_at: string | null;
  auth_created_at: string;
  has_password: boolean;
  providers: string[];
  rol: string;
  activo: boolean;
  coach_habilitado: boolean | null;
  id_empleado: string | null;
  display_name: string | null;
  tokens_consumidos_mes: number | null;
  tokens_limite_mes: number | null;
  empleado_nombre: string | null;
  empleado_puesto: string | null;
  empleado_uen: string | null;
};

type ColabRow = {
  id: string;
  nombre_completo: string | null;
  puesto: string | null;
  razon_social: string | null;
};

const ROL_LABELS: Record<string, string> = {
  superadmin:     "Superadmin",
  capital_humano: "Capital Humano",
  jefe:           "Jefe",
  colaborador:    "Colaborador",
};

const ROL_COLORS: Record<string, string> = {
  superadmin:     "bg-purple-100 text-purple-700",
  capital_humano: "bg-blue-100 text-blue-700",
  jefe:           "bg-amber-100 text-amber-700",
  colaborador:    "bg-gray-100 text-gray-600",
};

const PROVIDER_LABELS: Record<string, string> = {
  email:     "Contraseña",
  azure:     "Microsoft",
  google:    "Google",
  github:    "GitHub",
  magiclink: "Magic Link",
};

function ProviderBadge({ provider }: { provider: string }) {
  const label = PROVIDER_LABELS[provider] ?? provider;
  const colors: Record<string, string> = {
    email:     "bg-gray-100 text-gray-500",
    azure:     "bg-sky-100 text-sky-700",
    google:    "bg-red-100 text-red-600",
    github:    "bg-neutral-100 text-neutral-600",
    magiclink: "bg-violet-100 text-violet-700",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${colors[provider] ?? "bg-gray-100 text-gray-500"}`}>
      {label}
    </span>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Create User Form ──────────────────────────────────────────────────────────

function CreateUserForm({
  colaboradores,
  onDone,
  onCancel,
}: {
  colaboradores: ColabRow[];
  onDone: (u: Partial<AuthUsuario>) => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    email:            "",
    password:         "",
    rol:              "colaborador",
    id_empleado:      "",
    nombre:           "",
    coach_habilitado: false,
    usePassword:      true,
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.email.trim()) { setErr("El correo es obligatorio"); return; }
    if (form.usePassword && form.password.length < 8) { setErr("La contraseña debe tener al menos 8 caracteres"); return; }

    startTransition(async () => {
      try {
        await createUser({
          email:           form.email.trim(),
          password:        form.usePassword ? form.password : null,
          rol:             form.rol,
          id_empleado:     form.id_empleado || null,
          nombre:          form.nombre.trim() || null,
          coach_habilitado: form.coach_habilitado,
        });
        onDone({
          email:           form.email.trim(),
          rol:             form.rol,
          activo:          true,
          coach_habilitado: form.coach_habilitado,
          providers:       form.usePassword ? ["email"] : [],
          display_name:    form.nombre.trim() || null,
        });
      } catch (err) {
        setErr(err instanceof Error ? err.message : "Error al crear usuario");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50/50 border border-blue-200 rounded-xl p-5 space-y-4">
      <p className="text-sm font-semibold text-gray-700">Nuevo usuario</p>

      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Correo electrónico *</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="usuario@empresa.com"
            required
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre visible</label>
          <input
            type="text"
            value={form.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            placeholder="Nombre (opcional si vincula colaborador)"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Rol *</label>
          <select
            value={form.rol}
            onChange={(e) => set("rol", e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
          >
            {Object.entries(ROL_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Vincular colaborador</label>
          <select
            value={form.id_empleado}
            onChange={(e) => set("id_empleado", e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
          >
            <option value="">— Sin vincular —</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre_completo}{c.puesto ? ` · ${c.puesto}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={form.usePassword}
              onChange={(e) => set("usePassword", e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-checked:bg-[#1a3a5c] rounded-full transition-colors" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
          </label>
          <span className="text-xs text-gray-700">Crear con contraseña inicial</span>
        </div>
        {!form.usePassword && (
          <p className="text-xs text-gray-400 ml-11">
            El usuario podrá acceder vía magic link o SSO de Microsoft / Google una vez que se configure su proveedor de identidad.
          </p>
        )}
        {form.usePassword && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contraseña inicial (min. 8 caracteres)</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="Mínimo 8 caracteres"
              minLength={8}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={form.coach_habilitado}
            onChange={(e) => set("coach_habilitado", e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-gray-200 peer-checked:bg-[#1a3a5c] rounded-full transition-colors" />
          <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
        </label>
        <span className="text-xs text-gray-700">Habilitar Coach IA</span>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
        >
          {isPending ? "Creando..." : "Crear usuario"}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ── Edit User Panel ───────────────────────────────────────────────────────────

function EditUserPanel({
  usuario,
  colaboradores,
  onDone,
  onClose,
}: {
  usuario: AuthUsuario;
  colaboradores: ColabRow[];
  onDone: (updated: Partial<AuthUsuario>) => void;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [err, setErr]   = useState<string | null>(null);
  const [msg, setMsg]   = useState<string | null>(null);
  const [form, setForm] = useState({
    rol:              usuario.rol,
    activo:           usuario.activo,
    coach_habilitado: usuario.coach_habilitado ?? false,
    id_empleado:      usuario.id_empleado ?? "",
    nombre:           usuario.display_name ?? "",
    clear_empleado:   false,
  });
  const [pwForm, setPwForm] = useState({ show: false, password: "", confirm: "" });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function flash(text: string, ok = true) {
    if (ok) setMsg(text);
    else setErr(text);
    setTimeout(() => { setMsg(null); setErr(null); }, 3500);
  }

  function handleSave() {
    setErr(null);
    startTransition(async () => {
      try {
        await updateUsuario({
          user_id:         usuario.id,
          rol:             form.rol,
          activo:          form.activo,
          coach_habilitado: form.coach_habilitado,
          id_empleado:     form.clear_empleado ? null : (form.id_empleado || null),
          clear_empleado:  form.clear_empleado,
          nombre:          form.nombre.trim() || null,
        });
        onDone({
          rol:             form.rol,
          activo:          form.activo,
          coach_habilitado: form.coach_habilitado,
          id_empleado:     form.clear_empleado ? null : (form.id_empleado || null),
          display_name:    form.nombre.trim() || usuario.display_name,
        });
        flash("Cambios guardados");
      } catch (err) {
        flash(err instanceof Error ? err.message : "Error al guardar", false);
      }
    });
  }

  function handleResetPassword() {
    if (pwForm.password.length < 8) { setErr("Mínimo 8 caracteres"); return; }
    if (pwForm.password !== pwForm.confirm) { setErr("Las contraseñas no coinciden"); return; }
    setErr(null);
    startTransition(async () => {
      try {
        await resetPassword(usuario.id, pwForm.password);
        flash("Contraseña actualizada");
        setPwForm({ show: false, password: "", confirm: "" });
      } catch (err) {
        flash(err instanceof Error ? err.message : "Error al resetear", false);
      }
    });
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">
            {usuario.display_name ?? usuario.email}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{usuario.email}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            {usuario.providers.map((p) => <ProviderBadge key={p} provider={p} />)}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      {msg && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{msg}</p>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre visible</label>
          <input
            type="text"
            value={form.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Rol</label>
          <select
            value={form.rol}
            onChange={(e) => set("rol", e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c] bg-white"
          >
            {Object.entries(ROL_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Colaborador vinculado</label>
        {form.clear_empleado ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 italic">Se desvinculará al guardar</span>
            <button
              onClick={() => set("clear_empleado", false)}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={form.id_empleado}
              onChange={(e) => set("id_empleado", e.target.value)}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c] bg-white"
            >
              <option value="">— Sin vincular —</option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre_completo}{c.puesto ? ` · ${c.puesto}` : ""}
                </option>
              ))}
            </select>
            {usuario.id_empleado && (
              <button
                onClick={() => set("clear_empleado", true)}
                className="text-xs text-red-400 hover:text-red-600"
              >
                Desvincular
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-gray-700">Cuenta activa</span>
          <div className="relative inline-flex items-center">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => set("activo", e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-checked:bg-[#1a3a5c] rounded-full transition-colors" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
          </div>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-gray-700">Coach IA</span>
          <div className="relative inline-flex items-center">
            <input
              type="checkbox"
              checked={form.coach_habilitado}
              onChange={(e) => set("coach_habilitado", e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-200 peer-checked:bg-[#1a3a5c] rounded-full transition-colors" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
          </div>
        </label>
      </div>

      {/* Token quota */}
      {(usuario.tokens_consumidos_mes !== null || usuario.tokens_limite_mes !== null) && (
        <div className="text-xs text-gray-500 bg-white border border-gray-100 rounded-lg px-3 py-2">
          Tokens este mes:{" "}
          <span className="font-mono font-medium text-gray-700">
            {(usuario.tokens_consumidos_mes ?? 0).toLocaleString()}
          </span>
          {usuario.tokens_limite_mes && (
            <> / <span className="font-mono">{usuario.tokens_limite_mes.toLocaleString()}</span></>
          )}
        </div>
      )}

      {/* Password reset */}
      <div className="border-t border-gray-200 pt-4 space-y-3">
        <div className="flex items-center gap-3">
          <p className="text-xs font-medium text-gray-600 flex-1">Contraseña</p>
          {!pwForm.show ? (
            <button
              onClick={() => setPwForm((p) => ({ ...p, show: true }))}
              className="text-xs text-[#1a3a5c] hover:underline"
            >
              Restablecer contraseña
            </button>
          ) : (
            <button
              onClick={() => setPwForm({ show: false, password: "", confirm: "" })}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Cancelar
            </button>
          )}
        </div>
        {!pwForm.show && (
          <p className="text-xs text-gray-400">
            Si el usuario accede por SSO (Microsoft, Google) o magic link, no necesita contraseña.
            Puedes establecer una como respaldo sin afectar los otros métodos de acceso.
          </p>
        )}
        {pwForm.show && (
          <div className="space-y-2">
            <input
              type="password"
              value={pwForm.password}
              onChange={(e) => setPwForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="Nueva contraseña (mín. 8 caracteres)"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
            />
            <input
              type="password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))}
              placeholder="Confirmar contraseña"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c]"
            />
            <button
              onClick={handleResetPassword}
              disabled={isPending || pwForm.password.length < 8}
              className="text-sm bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 disabled:opacity-40 transition-colors"
            >
              {isPending ? "Guardando..." : "Establecer nueva contraseña"}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-gray-200 pt-4">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="text-sm bg-[#1a3a5c] text-white px-5 py-2 rounded-lg hover:bg-[#152e4d] disabled:opacity-40 transition-colors"
        >
          {isPending ? "Guardando..." : "Guardar cambios"}
        </button>
        <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ── Main UsuariosTab ──────────────────────────────────────────────────────────

export default function UsuariosTab({
  usuarios: initialUsuarios,
  colaboradores,
}: {
  usuarios: AuthUsuario[];
  colaboradores: ColabRow[];
}) {
  const [rows, setRows]         = useState<AuthUsuario[]>(initialUsuarios);
  const [search, setSearch]     = useState("");
  const [rolFilter, setRolFilter] = useState("todos");
  const [editing, setEditing]   = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg]           = useState<string | null>(null);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 3500);
  }

  function handleCreated(partial: Partial<AuthUsuario>) {
    setRows((prev) => [
      {
        id:                    "pending-" + Date.now(),
        email:                 partial.email ?? "",
        last_sign_in_at:       null,
        auth_created_at:       new Date().toISOString(),
        has_password:          (partial.providers ?? []).includes("email"),
        providers:             partial.providers ?? [],
        rol:                   partial.rol ?? "colaborador",
        activo:                partial.activo ?? true,
        coach_habilitado:      partial.coach_habilitado ?? false,
        id_empleado:           partial.id_empleado ?? null,
        display_name:          partial.display_name ?? null,
        tokens_consumidos_mes: null,
        tokens_limite_mes:     null,
        empleado_nombre:       null,
        empleado_puesto:       null,
        empleado_uen:          null,
      },
      ...prev,
    ]);
    setCreating(false);
    flash("Usuario creado. Recarga la página para ver todos los datos.");
  }

  function handleUpdated(id: string, partial: Partial<AuthUsuario>) {
    setRows((prev) => prev.map((u) => (u.id === id ? { ...u, ...partial } : u)));
    setEditing(null);
  }

  const filtered = rows.filter((u) => {
    if (rolFilter !== "todos" && u.rol !== rolFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(s) ||
      (u.display_name ?? "").toLowerCase().includes(s) ||
      (u.empleado_nombre ?? "").toLowerCase().includes(s)
    );
  });

  const editingUser = editing ? rows.find((u) => u.id === editing) ?? null : null;

  return (
    <div className="space-y-5 max-w-5xl">
      {msg && (
        <div className="text-sm bg-green-50 text-green-700 border border-green-200 rounded-lg px-4 py-2.5">
          {msg}
        </div>
      )}

      {creating && (
        <CreateUserForm
          colaboradores={colaboradores}
          onDone={handleCreated}
          onCancel={() => setCreating(false)}
        />
      )}

      {editingUser && (
        <EditUserPanel
          usuario={editingUser}
          colaboradores={colaboradores}
          onDone={(partial) => handleUpdated(editingUser.id, partial)}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-gray-700">Usuarios</p>
            <span className="text-xs text-gray-400 font-mono">{rows.length} total</span>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={rolFilter}
              onChange={(e) => setRolFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c] bg-white"
            >
              <option value="todos">Todos los roles</option>
              {Object.entries(ROL_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Buscar por nombre o correo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c] w-52"
            />
            {!creating && (
              <button
                onClick={() => { setCreating(true); setEditing(null); }}
                className="text-xs bg-[#1a3a5c] text-white px-3 py-1.5 rounded-lg hover:bg-[#152e4d] transition-colors whitespace-nowrap"
              >
                + Nuevo usuario
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left px-5 py-2.5">Usuario</th>
                <th className="text-left px-3 py-2.5">Rol</th>
                <th className="text-left px-3 py-2.5">Acceso</th>
                <th className="text-left px-3 py-2.5">Estado</th>
                <th className="text-left px-3 py-2.5">Último ingreso</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  className={`hover:bg-gray-50 transition-colors ${!u.activo ? "opacity-50" : ""} ${editing === u.id ? "bg-blue-50/30" : ""}`}
                >
                  <td className="px-5 py-3">
                    <p className="font-medium text-gray-800 truncate max-w-[200px]">
                      {u.display_name ?? u.email}
                    </p>
                    <p className="text-xs text-gray-400 truncate max-w-[200px]">
                      {u.display_name ? u.email : (u.empleado_nombre ?? "—")}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROL_COLORS[u.rol] ?? "bg-gray-100 text-gray-500"}`}>
                      {ROL_LABELS[u.rol] ?? u.rol}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.providers.length > 0
                        ? u.providers.map((p) => <ProviderBadge key={p} provider={p} />)
                        : <span className="text-xs text-gray-400">—</span>
                      }
                      {u.coach_habilitado && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">
                          Coach IA
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-medium ${u.activo ? "text-green-600" : "text-gray-400"}`}>
                      {u.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {fmtDate(u.last_sign_in_at)}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => {
                        if (editing === u.id) {
                          setEditing(null);
                        } else {
                          setEditing(u.id);
                          setCreating(false);
                        }
                      }}
                      className="text-xs text-[#1a3a5c] hover:underline"
                    >
                      {editing === u.id ? "Cerrar" : "Editar"}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-sm text-gray-400 py-8">
                    Sin resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Los usuarios creados con contraseña pueden igualmente conectar su cuenta a Microsoft SSO o usar magic link — los métodos de acceso son aditivos.
        Restablece la contraseña solo si el usuario la necesita; no afecta otros proveedores ya vinculados.
      </p>
    </div>
  );
}

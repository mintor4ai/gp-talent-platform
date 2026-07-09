import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES_VALIDOS = new Set(["colaborador", "jefe", "capital_humano"]);

const ROL_ALIAS: Record<string, string> = {
  colaborador: "colaborador",
  empleado: "colaborador",
  employee: "colaborador",
  jefe: "jefe",
  manager: "jefe",
  lider: "jefe",
  líder: "jefe",
  capital_humano: "capital_humano",
  capitalhumano: "capital_humano",
  rrhh: "capital_humano",
  rh: "capital_humano",
  ch: "capital_humano",
  admin: "capital_humano",
  hr: "capital_humano",
};

function col(row: Record<string, unknown>, ...aliases: string[]): unknown {
  for (const a of aliases) {
    const key = Object.keys(row).find(
      (k) => k.trim().toLowerCase().replace(/[_\s]/g, "") === a.toLowerCase().replace(/[_\s]/g, "")
    );
    if (key !== undefined && row[key] != null && row[key] !== "") return row[key];
  }
  return null;
}

function str(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v).trim() || null;
}

function parseRol(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim().toLowerCase().replace(/[_\s]/g, "");
  return ROL_ALIAS[s] ?? null;
}

function parseBool(v: unknown): boolean {
  if (v == null || v === "") return false;
  const s = String(v).trim().toUpperCase();
  return s === "SI" || s === "SÍ" || s === "YES" || s === "1" || s === "TRUE";
}

export type UsuarioPreviewRow = {
  fila: number;
  no_empleado: string;
  nombre_completo: string | null;
  colaborador_id: string | null;
  correo: string;
  rol: string | null;
  coach_habilitado: boolean;
  usuario_existe: boolean;
  usuarios_app_existe: boolean;
  error?: string;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: perfil } = await supabase
    .from("usuarios_app").select("rol").eq("id", user.id).single();
  const isAdmin = perfil?.rol === "capital_humano" || perfil?.rol === "superadmin";
  if (!isAdmin) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const admin = createAdminClient();

  const formData = await req.formData();
  const file = formData.get("archivo") as File | null;
  const modo = (formData.get("modo") as string) || "preview";
  const enviarInvitacion = formData.get("enviar_invitacion") === "true";

  if (!file) return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

  if (!rows.length) return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });

  // Load all colaboradores indexed by id_empleado
  const { data: colabsRaw } = await supabase
    .from("colaboradores").select("id, id_empleado, nombre_completo");
  const colabById = new Map<string, { id: string; nombre_completo: string }>();
  for (const c of colabsRaw ?? []) {
    colabById.set(String(c.id_empleado).trim(), { id: c.id, nombre_completo: c.nombre_completo });
  }

  // Load all existing auth users via admin API (paginated)
  const authEmailToId = new Map<string, string>();
  {
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage });
      if (!data?.users?.length) break;
      for (const u of data.users) {
        if (u.email) authEmailToId.set(u.email.toLowerCase(), u.id);
      }
      if (data.users.length < perPage) break;
      page++;
    }
  }

  // Load existing usuarios_app ids
  const { data: usuariosAppRaw } = await admin
    .from("usuarios_app").select("id");
  const usuariosAppIds = new Set((usuariosAppRaw ?? []).map((u) => u.id));

  // Parse rows
  const results: UsuarioPreviewRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const fila = i + 2;

    const no_empleado = str(col(row, "no_empleado", "id_empleado", "no empleado", "numero", "clave"));
    const correo = str(col(row, "correo", "email", "correo_electronico"));
    const rolRaw = parseRol(col(row, "rol", "role", "perfil"));
    const coach_habilitado = parseBool(col(row, "coach_habilitado", "coach"));

    if (!no_empleado) {
      results.push({
        fila, no_empleado: "", nombre_completo: null, colaborador_id: null,
        correo: correo ?? "", rol: rolRaw, coach_habilitado,
        usuario_existe: false, usuarios_app_existe: false,
        error: "Falta no_empleado",
      });
      continue;
    }
    if (!correo) {
      results.push({
        fila, no_empleado, nombre_completo: null, colaborador_id: null,
        correo: "", rol: rolRaw, coach_habilitado,
        usuario_existe: false, usuarios_app_existe: false,
        error: "Falta correo",
      });
      continue;
    }
    if (!rolRaw) {
      results.push({
        fila, no_empleado, nombre_completo: null, colaborador_id: null,
        correo, rol: null, coach_habilitado,
        usuario_existe: false, usuarios_app_existe: false,
        error: "Rol inválido (usar: colaborador, jefe, capital_humano)",
      });
      continue;
    }

    const colab = colabById.get(no_empleado);
    if (!colab) {
      results.push({
        fila, no_empleado, nombre_completo: null, colaborador_id: null,
        correo, rol: rolRaw, coach_habilitado,
        usuario_existe: false, usuarios_app_existe: false,
        error: `Colaborador ${no_empleado} no encontrado`,
      });
      continue;
    }

    const emailLower = correo.toLowerCase();
    const authId = authEmailToId.get(emailLower);
    const usuario_existe = !!authId;
    const usuarios_app_existe = authId ? usuariosAppIds.has(authId) : false;

    results.push({
      fila,
      no_empleado,
      nombre_completo: colab.nombre_completo,
      colaborador_id: colab.id,
      correo,
      rol: rolRaw,
      coach_habilitado,
      usuario_existe,
      usuarios_app_existe,
    });
  }

  if (modo === "preview") {
    return NextResponse.json({
      rows: results,
      total: results.length,
      nuevos: results.filter((r) => !r.error && !r.usuario_existe).length,
      existentes: results.filter((r) => !r.error && r.usuario_existe).length,
      errores: results.filter((r) => !!r.error).length,
    });
  }

  // ── IMPORT ──────────────────────────────────────────────────────────────────
  const validos = results.filter((r) => !r.error && r.colaborador_id && r.correo && r.rol);
  const errors: string[] = [];
  let creados = 0;
  let actualizados = 0;
  let invitados = 0;

  for (const r of validos) {
    let authUserId: string | null = null;

    if (!r.usuario_existe) {
      if (enviarInvitacion) {
        const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(r.correo, {
          data: { nombre: r.nombre_completo },
        });
        if (invErr) { errors.push(`${r.correo}: ${invErr.message}`); continue; }
        authUserId = inv.user.id;
        invitados++;
      } else {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: r.correo,
          email_confirm: true,
          user_metadata: { nombre: r.nombre_completo },
        });
        if (createErr) { errors.push(`${r.correo}: ${createErr.message}`); continue; }
        authUserId = created.user.id;
        creados++;
      }
    } else {
      authUserId = authEmailToId.get(r.correo.toLowerCase()) ?? null;
      if (!authUserId) { errors.push(`${r.correo}: No se pudo obtener ID de auth`); continue; }
      actualizados++;
    }

    const { error: upsertErr } = await admin.from("usuarios_app").upsert(
      {
        id: authUserId,
        id_empleado: r.colaborador_id,
        rol: r.rol,
        nombre: r.nombre_completo,
        coach_habilitado: r.coach_habilitado,
        activo: true,
      },
      { onConflict: "id" }
    );
    if (upsertErr) errors.push(`${r.correo}: ${upsertErr.message}`);
  }

  return NextResponse.json({
    ok: true,
    total: results.length,
    creados,
    actualizados,
    invitados,
    errores: results.filter((r) => !!r.error).length,
    errors: errors.slice(0, 10),
  });
}

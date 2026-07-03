import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
import NavSidebar from "@/components/NavSidebar";
import { ROL_LABELS } from "@/lib/types";
import type { Rol } from "@/lib/types";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("usuarios_app")
    .select("rol, activo, coach_habilitado, tokens_consumidos_mes, tokens_limite_mes, id_empleado")
    .eq("id", user.id)
    .single();

  if (!perfil || !perfil.activo) redirect("/login?error=cuenta_inactiva");

  const rolLabel = ROL_LABELS[perfil.rol as Rol] ?? perfil.rol;

  // Fetch collaborator name for display in header
  let displayName: string | null = null;
  if (perfil.id_empleado) {
    const { data: colab } = await supabase
      .from("colaboradores")
      .select("nombre_completo")
      .eq("id", perfil.id_empleado)
      .single();
    displayName = (colab as { nombre_completo: string } | null)?.nombre_completo ?? null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#1a3a5c] text-white shadow-md flex-shrink-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <a href="/dashboard" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
              <span className="text-sm font-bold">GP</span>
            </div>
            <span className="font-semibold text-sm hidden sm:block">
              Talent Intelligence
            </span>
          </a>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-medium text-white leading-tight">
                {displayName ?? user.email}
              </span>
              <span className="text-xs text-white/50 leading-tight">{rolLabel}</span>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 gap-6">
        <NavSidebar
          rol={perfil.rol}
          coachHabilitado={perfil.coach_habilitado ?? false}
          idEmpleado={perfil.id_empleado ?? null}
        />
        <main className="flex-1 min-w-0 pb-16 md:pb-0">
          {children}
        </main>
      </div>
    </div>
  );
}

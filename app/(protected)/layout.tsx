import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";
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
    .select("rol, activo, coach_habilitado, tokens_consumidos_mes, tokens_limite_mes")
    .eq("id", user.id)
    .single();

  if (!perfil || !perfil.activo) redirect("/login?error=cuenta_inactiva");

  const rolLabel = ROL_LABELS[perfil.rol as Rol] ?? perfil.rol;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a3a5c] text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
              <span className="text-sm font-bold">GP</span>
            </div>
            <span className="font-semibold text-sm hidden sm:block">
              Talent Intelligence
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/60 hidden sm:block">
              {user.email} · {rolLabel}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

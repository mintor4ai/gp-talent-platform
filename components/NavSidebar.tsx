"use client";

import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
};

const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard",      label: "Inicio",               icon: "⊞",  exact: true },
  { href: "/colaboradores",  label: "Colaboradores",        icon: "👥" },
  { href: "/evaluaciones",   label: "Carpetas individuales", icon: "📊" },
  { href: "/sucesion",       label: "Plan de Sucesión",     icon: "🔄" },
  { href: "/configuracion/catalogo-puestos", label: "Catálogo de Puestos", icon: "🗂️" },
  { href: "/importar",       label: "Importar datos",       icon: "📥" },
  { href: "/coach",          label: "Coach IA",             icon: "✦" },
];

const SUPERADMIN_EXTRA: NavItem = { href: "/configuracion", label: "Configuración", icon: "⚙️" };

const COLABORADOR_NAV: NavItem[] = [
  { href: "/dashboard",  label: "Inicio",             icon: "⊞",  exact: true },
  { href: "/carpeta",    label: "Mi Carpeta",          icon: "📁" },
  { href: "/coach",      label: "Coach IA",            icon: "✦" },
];

const JEFE_NAV: NavItem[] = [
  { href: "/dashboard",  label: "Inicio",             icon: "⊞", exact: true },
  { href: "/carpeta",    label: "Mi Carpeta",          icon: "📁" },
  { href: "/equipo",     label: "Mi Equipo",           icon: "👥" },
  { href: "/coach",      label: "Coach IA",            icon: "✦" },
];

export default function NavSidebar({
  rol,
  coachHabilitado,
  idEmpleado,
}: {
  rol: string;
  coachHabilitado: boolean;
  idEmpleado: string | null;
}) {
  const pathname = usePathname();
  const isAdmin = rol === "capital_humano" || rol === "superadmin";

  let items: NavItem[];
  if (isAdmin) {
    items = ADMIN_NAV;
  } else if (rol === "jefe") {
    items = JEFE_NAV;
  } else {
    items = COLABORADOR_NAV;
  }

  // Add Configuración for superadmin
  if (rol === "superadmin") {
    items = [...items, SUPERADMIN_EXTRA];
  }

  // Filter Coach IA if not enabled (non-admin)
  if (!isAdmin && !coachHabilitado) {
    items = items.filter((i) => i.href !== "/coach");
  }

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col w-52 flex-shrink-0">
        <div className="space-y-0.5">
          {items.map((item) => {
            const active = isActive(item);
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-[#1a3a5c] text-white font-medium"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </a>
            );
          })}
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 px-2 py-1 flex justify-around">
        {items.slice(0, 5).map((item) => {
          const active = isActive(item);
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                active ? "text-[#1a3a5c] font-semibold" : "text-gray-400"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="leading-tight text-center" style={{ fontSize: "10px" }}>
                {item.label.split(" ")[0]}
              </span>
            </a>
          );
        })}
      </nav>
    </>
  );
}

"use client";

import { usePathname } from "next/navigation";

type SubItem = {
  href: string;
  label: string;
};

type NavItem = {
  href?: string;       // omit to make it a non-clickable section header
  label: string;
  icon: string;
  exact?: boolean;
  children?: SubItem[];
};

const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard",     label: "Inicio",          icon: "⊞", exact: true },
  { href: "/colaboradores", label: "Colaboradores",   icon: "👥" },
  {
    label: "Carpetas individuales",
    icon: "📊",
    children: [
      { href: "/evaluaciones",    label: "Mapa de Talento" },
      { href: "/talento-clave",   label: "Talento Clave" },
    ],
  },
  { href: "/sucesion",      label: "Plan de Sucesión", icon: "🔄" },
  { href: "/movilidad",     label: "Movilidad",        icon: "🚦" },
  { href: "/configuracion/catalogo-puestos", label: "Catálogo de Puestos", icon: "🗂️" },
  { href: "/importar",      label: "Importar datos",   icon: "📥" },
  { href: "/coach",         label: "Coach IA",         icon: "✦" },
];

const SUPERADMIN_EXTRA: NavItem = { href: "/configuracion", label: "Configuración", icon: "⚙️" };

const COLABORADOR_NAV: NavItem[] = [
  { href: "/dashboard", label: "Inicio",    icon: "⊞", exact: true },
  { href: "/carpeta",   label: "Mi Carpeta", icon: "📁" },
  { href: "/coach",     label: "Coach IA",   icon: "✦" },
];

const JEFE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Inicio",    icon: "⊞", exact: true },
  { href: "/carpeta",   label: "Mi Carpeta", icon: "📁" },
  { href: "/equipo",    label: "Mi Equipo",  icon: "👥" },
  { href: "/coach",     label: "Coach IA",   icon: "✦" },
];

export default function NavSidebar({
  rol,
  coachHabilitado,
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

  if (rol === "superadmin") items = [...items, SUPERADMIN_EXTRA];
  if (!isAdmin && !coachHabilitado) items = items.filter((i) => i.href !== "/coach");

  function isActive(item: NavItem): boolean {
    if (!item.href) return false;
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  function isSectionActive(item: NavItem): boolean {
    if (isActive(item)) return true;
    return (item.children ?? []).some((c) =>
      pathname === c.href || pathname.startsWith(c.href + "/")
    );
  }

  // Flat list for mobile bottom nav (skip section-only items, use children instead)
  const mobileItems: { href: string; label: string; icon: string }[] = [];
  for (const item of items) {
    if (item.href) {
      mobileItems.push({ href: item.href, label: item.label, icon: item.icon });
    } else if (item.children) {
      for (const child of item.children) {
        mobileItems.push({ href: child.href, label: child.label, icon: item.icon });
      }
    }
  }

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col w-52 flex-shrink-0">
        <div className="space-y-0.5">
          {items.map((item, idx) => {
            const sectionActive = isSectionActive(item);

            if (item.children) {
              // Section with children
              return (
                <div key={idx}>
                  {/* Section header — not clickable */}
                  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium select-none ${
                    sectionActive ? "text-[#1a3a5c]" : "text-gray-500"
                  }`}>
                    <span className="text-base leading-none">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  {/* Children — always visible */}
                  <div className="ml-4 space-y-0.5 border-l border-gray-200 pl-3">
                    {item.children.map((child) => {
                      const childActive = pathname === child.href || pathname.startsWith(child.href + "/");
                      return (
                        <a
                          key={child.href}
                          href={child.href}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                            childActive
                              ? "bg-[#1a3a5c] text-white font-medium"
                              : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                          }`}
                        >
                          {child.label}
                        </a>
                      );
                    })}
                  </div>
                </div>
              );
            }

            // Regular item
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
        {mobileItems.slice(0, 5).map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
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

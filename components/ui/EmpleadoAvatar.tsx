"use client";

import { useState } from "react";
import { getFotoUrl } from "@/lib/foto-empleado";

type Props = {
  /** The employee's id_empleado (numeric string like "4575"), NOT the UUID. */
  idEmpleado: string | null | undefined;
  nombre: string | null | undefined;
  size?: number;   // px, used for width/height
  className?: string;
  rounded?: "full" | "lg" | "md";
};

export default function EmpleadoAvatar({ idEmpleado, nombre, size = 28, className = "", rounded = "lg" }: Props) {
  const [failed, setFailed] = useState(false);
  const url = getFotoUrl(idEmpleado);
  const inicial = (nombre ?? "?").charAt(0).toUpperCase();
  const rnd = rounded === "full" ? "rounded-full" : rounded === "lg" ? "rounded-lg" : "rounded-md";

  if (!url || failed) {
    return (
      <div
        className={`flex items-center justify-center flex-shrink-0 bg-[#1a3a5c] ${rnd} ${className}`}
        style={{ width: size, height: size, minWidth: size }}
      >
        <span className="text-white font-bold" style={{ fontSize: Math.max(10, Math.round(size * 0.4)) }}>
          {inicial}
        </span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={nombre ?? ""}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`object-cover object-top flex-shrink-0 ${rnd} ${className}`}
      style={{ width: size, height: size, minWidth: size }}
    />
  );
}

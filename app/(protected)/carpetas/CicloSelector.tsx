"use client";

import { useRouter } from "next/navigation";

export default function CicloSelector({
  ciclos,
  cicloActual,
}: {
  ciclos: number[];
  cicloActual: number;
}) {
  const router = useRouter();
  return (
    <select
      value={cicloActual}
      onChange={(e) => router.push(`/carpetas?ciclo=${e.target.value}`)}
      className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]/30 focus:border-[#1a3a5c] text-gray-700"
    >
      {ciclos.map((c) => (
        <option key={c} value={c}>Ciclo {c}</option>
      ))}
    </select>
  );
}

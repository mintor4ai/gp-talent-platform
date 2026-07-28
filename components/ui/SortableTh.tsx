"use client";

type Props = {
  label: string;
  sortKey: string;
  currentKey: string;
  dir: "asc" | "desc";
  onSort: (key: string) => void;
  className?: string;
};

export function SortableTh({ label, sortKey, currentKey, dir, onSort, className = "" }: Props) {
  const active = currentKey === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`font-medium cursor-pointer select-none hover:text-gray-700 transition-colors ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-[10px] ${active ? "text-[#1a3a5c] opacity-100" : "opacity-25"}`}>
          {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  );
}

export function useSortState<T extends string>(defaultKey: T, defaultDir: "asc" | "desc" = "asc") {
  const [sortKey, setSortKey] = useState<T>(defaultKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultDir);

  function handleSort(key: string) {
    const k = key as T;
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }

  return { sortKey, sortDir, handleSort };
}

// needed for the hook
import { useState } from "react";

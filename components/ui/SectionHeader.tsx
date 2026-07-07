import type { ReactNode } from "react";

export function SectionHeader({
  label,
  action,
}: {
  label: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-0.5">
      <div className="flex-1 h-px bg-[#1a3a5c]/15" />
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[11px] font-semibold text-[#1a3a5c] uppercase tracking-[0.07em] whitespace-nowrap bg-[#1a3a5c]/5 border border-[#1a3a5c]/20 rounded-full px-3 py-[3px]">
          {label}
        </span>
        {action}
      </div>
      <div className="flex-1 h-px bg-[#1a3a5c]/15" />
    </div>
  );
}

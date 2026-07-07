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
      <div className="flex-1 h-px bg-gray-200" />
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-[0.07em] whitespace-nowrap bg-white border border-gray-200 rounded-full px-3 py-[3px] shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          {label}
        </span>
        {action}
      </div>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

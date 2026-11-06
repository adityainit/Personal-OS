import type { ComponentProps } from "react";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/domain/constants";
import type { LeadStatus } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function StatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
        STATUS_TONE[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function FitScore({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <span className="text-xs text-muted">—</span>;
  const tone = score >= 75 ? "bg-success" : score >= 50 ? "bg-warning" : "bg-danger";
  return (
    <span className="inline-flex items-center gap-1.5" title={`Fit score ${score}/100`}>
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-2">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${score}%` }} />
      </span>
      <span className="text-xs tabular-nums text-muted">{score}</span>
    </span>
  );
}

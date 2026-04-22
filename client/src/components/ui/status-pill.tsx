import * as React from "react";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Circle,
  type LucideIcon,
} from "lucide-react";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const toneSurface: Record<StatusTone, string> = {
  success: "surface-success",
  warning: "surface-warning",
  danger: "surface-danger",
  info: "surface-info",
  neutral: "surface-neutral",
};

const toneIcon: Record<StatusTone, LucideIcon> = {
  success: CheckCircle2,
  warning: Clock,
  danger: AlertCircle,
  info: Circle,
  neutral: Circle,
};

interface StatusPillProps {
  tone: StatusTone;
  label: string;
  icon?: LucideIcon | null;
  size?: "sm" | "md";
  className?: string;
}

export function StatusPill({
  tone,
  label,
  icon,
  size = "sm",
  className,
}: StatusPillProps) {
  const Icon = icon === null ? null : icon ?? toneIcon[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
        toneSurface[tone],
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className
      )}
      data-testid={`status-pill-${tone}`}
    >
      {Icon && <Icon className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />}
      {label}
    </span>
  );
}

const CONTRACT_STATUS_MAP: Record<
  string,
  { tone: StatusTone; label: string; icon?: LucideIcon }
> = {
  bid_release: { tone: "info", label: "Bid Release", icon: Clock },
  under_review: { tone: "warning", label: "Under Review", icon: AlertTriangle },
  awarded: { tone: "success", label: "Awarded", icon: CheckCircle2 },
  in_execution: { tone: "info", label: "In Execution", icon: Circle },
  final_closeout: { tone: "neutral", label: "Final Closeout" },
};

export function ContractStatusPill({ status, className }: { status: string; className?: string }) {
  const config = CONTRACT_STATUS_MAP[status] ?? {
    tone: "neutral" as StatusTone,
    label: status.replace(/_/g, " "),
  };
  return (
    <StatusPill
      tone={config.tone}
      label={config.label}
      icon={config.icon}
      className={className}
    />
  );
}

const BUDGET_MAP: Record<string, { tone: StatusTone; label: string }> = {
  under: { tone: "success", label: "Under Budget" },
  on_track: { tone: "success", label: "On Track" },
  warning: { tone: "warning", label: "Nearing Budget" },
  over: { tone: "danger", label: "Over Budget" },
};

export function BudgetStatusPill({ status, className }: { status: string; className?: string }) {
  const config = BUDGET_MAP[status] ?? {
    tone: "neutral" as StatusTone,
    label: status,
  };
  return <StatusPill tone={config.tone} label={config.label} className={className} />;
}

const SCHEDULE_MAP: Record<string, { tone: StatusTone; label: string }> = {
  not_started: { tone: "neutral", label: "Not Started" },
  upcoming: { tone: "info", label: "Upcoming" },
  on_track: { tone: "success", label: "On Track" },
  warning: { tone: "warning", label: "At Risk" },
  overdue: { tone: "danger", label: "Overdue" },
  complete: { tone: "success", label: "Complete" },
};

export function ScheduleStatusPill({ status, className }: { status: string; className?: string }) {
  const config = SCHEDULE_MAP[status] ?? {
    tone: "neutral" as StatusTone,
    label: status,
  };
  return <StatusPill tone={config.tone} label={config.label} className={className} />;
}

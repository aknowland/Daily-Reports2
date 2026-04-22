import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: "draft" | "submitted" | "pending" | "sent" | "failed";
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusConfig = {
    draft: { label: "Draft", variant: "warning" as const },
    submitted: { label: "Submitted", variant: "success" as const },
    pending: { label: "Pending", variant: "warning" as const },
    sent: { label: "Sent", variant: "info" as const },
    failed: { label: "Failed", variant: "destructive" as const },
  };

  const config = statusConfig[status] || statusConfig.draft;

  return (
    <Badge
      variant={config.variant}
      className={className}
      data-testid={`badge-status-${status}`}
    >
      {config.label}
    </Badge>
  );
}

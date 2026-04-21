import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const STATUS_LEGEND = [
  {
    variant: "info" as const,
    label: "Blue",
    statuses: ["Bid Release", "Bid Received", "Substantial Completion"],
  },
  {
    variant: "warning" as const,
    label: "Amber",
    statuses: ["Under Review"],
  },
  {
    variant: "success" as const,
    label: "Green",
    statuses: ["Awarded", "In Execution"],
  },
  {
    variant: "destructive" as const,
    label: "Red",
    statuses: ["Not Awarded"],
  },
  {
    variant: "muted" as const,
    label: "Gray",
    statuses: ["Cancelled", "Final Closeout"],
  },
];

export function ContractStatusLegend() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          data-testid="button-status-legend"
          aria-label="Status badge color legend"
        >
          <Info className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end" data-testid="popover-status-legend">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Status Legend
        </p>
        <div className="space-y-2">
          {STATUS_LEGEND.map((entry) => (
            <div key={entry.variant} className="flex items-center gap-2">
              <Badge variant={entry.variant} className="shrink-0 pointer-events-none">
                {entry.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {entry.statuses.join(", ")}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Calendar, MapPin, User, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import type { DailyReportWithDetails } from "@shared/schema";

interface ReportCardProps {
  report: DailyReportWithDetails;
  onClick?: () => void;
}

export function ReportCard({ report, onClick }: ReportCardProps) {
  const statusColor = report.status === "submitted" ? "border-l-green-500" : "border-l-orange-500";

  return (
    <Card 
      className={`hover-elevate cursor-pointer border-l-4 ${statusColor} transition-all`}
      data-testid={`card-report-${report.id}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground truncate">
                {report.project?.name || report.customProjectName || "Unassigned Report"}
              </h3>
              <StatusBadge status={report.status || "draft"} />
            </div>
            
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{format(new Date(report.date), "MMM d, yyyy")}</span>
              </div>
              {report.project?.projectNumber && (
                <div className="flex items-center gap-1">
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">
                    #{report.project.projectNumber}
                  </span>
                </div>
              )}
            </div>

            {report.project?.address && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{report.project.address}</span>
              </div>
            )}

            {report.inspectorName && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <User className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{report.inspectorName}</span>
              </div>
            )}
          </div>

          <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

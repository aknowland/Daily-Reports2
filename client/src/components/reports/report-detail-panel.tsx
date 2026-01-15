import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  Calendar,
  Cloud,
  MapPin,
  Edit,
  FileText,
  Download,
  Loader2,
  AlertTriangle,
  Shield,
  HardHat,
  MessageSquare,
  Image,
  PenTool,
  User,
  ClipboardCheck,
  Wrench,
  Package,
  Hash,
} from "lucide-react";
import type { DailyReport, Project, Photo, VisitorRow, WorkActivityRow } from "@shared/schema";

type ReportWithDetails = DailyReport & {
  project?: Project;
  photos?: Photo[];
  inspectorName?: string;
};

interface ReportDetailPanelProps {
  report: ReportWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReportDetailPanel({ report, open, onOpenChange }: ReportDetailPanelProps) {
  const { toast } = useToast();

  const generatePdfMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/reports/${report?.id}/pdf`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      // Navigate in same tab for mobile compatibility (avoids popup blockers)
      window.location.href = data.pdfUrl;
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate PDF",
        variant: "destructive",
      });
    },
  });

  const handlePdfAction = () => {
    if (report?.pdfPath) {
      // Navigate in same tab for mobile compatibility
      window.location.href = report.pdfPath;
    } else {
      generatePdfMutation.mutate();
    }
  };

  if (!report) return null;

  const workActivities = (report.workActivities as WorkActivityRow[]) || [];
  const visitors = (report.visitors as VisitorRow[]) || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="space-y-1">
              <SheetTitle className="text-xl">{report.project?.name || "Report"}</SheetTitle>
              <SheetDescription className="flex items-center gap-2">
                <Hash className="w-3 h-3" />
                {report.project?.projectNumber}
                {report.project?.client && ` • ${report.project.client}`}
              </SheetDescription>
            </div>
            <StatusBadge status={report.status || "draft"} />
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {report.status === "draft" && (
              <Button asChild variant="outline" size="sm" data-testid="button-edit-report">
                <Link href={`/reports/${report.id}/edit`} onClick={() => onOpenChange(false)}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handlePdfAction}
              disabled={generatePdfMutation.isPending}
              data-testid="button-pdf-action"
            >
              {generatePdfMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileText className="w-4 h-4 mr-2" />
              )}
              {report.pdfPath ? "View PDF" : "Generate PDF"}
            </Button>
            {report.pdfPath && (
              <Button variant="outline" size="sm" asChild data-testid="button-download-pdf">
                <a href={report.pdfPath} download>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </a>
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            <section className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Report Details
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">{format(new Date(report.date), "MMMM d, yyyy")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Inspector</p>
                  <p className="font-medium">{report.inspectorName || "Unknown"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {report.project?.client && (
                  <div>
                    <p className="text-muted-foreground">Client</p>
                    <p className="font-medium">{report.project.client}</p>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <Cloud className="w-4 h-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Weather</p>
                    <p className="font-medium capitalize">{report.weatherType}</p>
                    {report.weatherNotes && (
                      <p className="text-muted-foreground text-xs">{report.weatherNotes}</p>
                    )}
                  </div>
                </div>
              </div>
              {report.project?.address && (
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Location</p>
                    <p className="font-medium">{report.project.address}</p>
                  </div>
                </div>
              )}
            </section>

            {workActivities.length > 0 && (
              <section className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <HardHat className="w-4 h-4" />
                  Work Activities
                </h3>
                <div className="space-y-2">
                  {workActivities.map((activity, index) => (
                    <div key={index} className="p-3 bg-muted/50 border border-border text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{activity.contractor}</span>
                        <span className="text-muted-foreground">{activity.headcount} workers</span>
                      </div>
                      <p className="whitespace-pre-wrap">{activity.workDescription}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {report.inspections && (
              <section className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4" />
                  Inspections
                </h3>
                <p className="text-sm whitespace-pre-wrap">{report.inspections}</p>
              </section>
            )}

            {report.workPerformed && (
              <section className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Additional Notes
                </h3>
                <p className="text-sm whitespace-pre-wrap">{report.workPerformed}</p>
              </section>
            )}

            {report.equipment && (
              <section className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Wrench className="w-4 h-4" />
                  Equipment
                </h3>
                <p className="text-sm whitespace-pre-wrap">{report.equipment}</p>
              </section>
            )}

            {report.materialsDelivered && (
              <section className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Materials Delivered
                </h3>
                <p className="text-sm whitespace-pre-wrap">{report.materialsDelivered}</p>
              </section>
            )}

            {visitors.length > 0 && (
              <section className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Visitors
                </h3>
                <div className="space-y-2">
                  {visitors.map((visitor, index) => (
                    <div key={index} className="p-3 bg-muted/50 rounded-lg text-sm">
                      <p className="font-medium">{visitor.name}</p>
                      <p className="text-muted-foreground">{visitor.company}</p>
                      {visitor.notes && <p className="mt-1">{visitor.notes}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {(report.issuesFlag || report.safetyFlag) && (
              <section className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                  Issues & Safety
                </h3>
                {report.issuesFlag && (
                  <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800 text-sm">
                    <p className="font-medium text-orange-800 dark:text-orange-300">Delays/Issues Reported</p>
                    <p className="mt-1">{report.issuesDetails}</p>
                  </div>
                )}
                {report.safetyFlag && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 text-sm">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-red-600 dark:text-red-400" />
                      <p className="font-medium text-red-800 dark:text-red-300">Safety Incident Reported</p>
                    </div>
                    <p className="mt-1">{report.safetyDetails}</p>
                  </div>
                )}
              </section>
            )}

            {report.photos && report.photos.length > 0 && (
              <section className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  Photos ({report.photos.length})
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {report.photos.map((photo) => (
                    <div key={photo.id} className="space-y-1">
                      <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                        <img
                          src={photo.filePath}
                          alt={photo.caption || "Report photo"}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => window.open(photo.filePath, "_blank")}
                        />
                      </div>
                      {photo.caption && (
                        <p className="text-xs text-muted-foreground">{photo.caption}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {report.signaturePath && (
              <section className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <PenTool className="w-4 h-4" />
                  Signature
                </h3>
                <div className="bg-white border rounded-lg p-3 max-w-xs">
                  <img
                    src={report.signaturePath}
                    alt="Inspector signature"
                    className="max-h-20 mx-auto"
                  />
                </div>
                {report.signedAt && (
                  <p className="text-xs text-muted-foreground">
                    Signed on {format(new Date(report.signedAt), "MMMM d, yyyy 'at' h:mm a")}
                  </p>
                )}
              </section>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

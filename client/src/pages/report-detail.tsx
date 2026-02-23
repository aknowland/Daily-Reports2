import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { PageLayout } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatPacificDate } from "@/lib/timezone";
import {
  ArrowLeft,
  Calendar,
  Cloud,
  MapPin,
  User,
  Edit,
  FileText,
  Download,
  Mail,
  Loader2,
  AlertTriangle,
  Shield,
  Users,
  HardHat,
  MessageSquare,
  Image,
  PenTool,
  AlertCircle,
  Trash2,
  ClipboardCheck,
  ClipboardList,
  Wrench,
  Package,
} from "lucide-react";
import type { DailyReport, Project, Photo, VisitorRow, WorkActivityRow } from "@shared/schema";

type ReportWithDetails = DailyReport & {
  project?: Project;
  photos?: Photo[];
  inspectorName?: string;
};

export default function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showDistributeDialog, setShowDistributeDialog] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: report, isLoading, error } = useQuery<ReportWithDetails>({
    queryKey: ["/api/reports", id],
  });

  const generatePdfMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/reports/${id}/pdf`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports", id] });
      window.open(`/api/reports/${id}/pdf`, "_blank");
      toast({
        title: "PDF Generated",
        description: "Your PDF has been generated and will open in a new tab",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate PDF",
        variant: "destructive",
      });
    },
  });

  const distributeMutation = useMutation({
    mutationFn: async (recipients: string[]) => {
      return apiRequest("POST", `/api/reports/${id}/distribute`, { recipients });
    },
    onSuccess: () => {
      setShowDistributeDialog(false);
      toast({
        title: "Report Distributed",
        description: "The report has been sent to the specified recipients",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to distribute report",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/reports/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Report Deleted",
        description: "The report has been deleted successfully",
      });
      navigate("/reports");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete report",
        variant: "destructive",
      });
    },
  });

  const handleDistribute = () => {
    const recipients = emailRecipients
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e);

    if (recipients.length === 0) {
      toast({
        title: "Error",
        description: "Please enter at least one email address",
        variant: "destructive",
      });
      return;
    }

    distributeMutation.mutate(recipients);
  };

  if (isLoading) {
    return (
      <PageLayout>
        <div className="container px-4 py-6 mx-auto max-w-2xl space-y-6">
          <Skeleton className="h-8 w-48" />
          <Card>
            <CardContent className="p-6 space-y-4">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  if (error || !report) {
    return (
      <PageLayout>
        <div className="container px-4 py-6 mx-auto max-w-2xl">
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
              <p className="text-lg font-medium">Report not found</p>
              <p className="text-sm text-muted-foreground mt-1">
                The report you're looking for doesn't exist or has been deleted
              </p>
              <Button asChild className="mt-4" data-testid="button-back-to-reports">
                <Link href="/reports">Back to Reports</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  const workActivities = (report.workActivities as WorkActivityRow[]) || [];
  const visitors = (report.visitors as VisitorRow[]) || [];

  return (
    <PageLayout>
      <PageHeader
        icon={ClipboardList}
        title="Daily Report"
        subtitle={`${report.project?.name || report.customProjectName || "Unassigned Report"} ${report.date ? `• ${formatPacificDate(report.date, "MMMM d, yyyy")}` : ""}`}
      >
        <Button
          variant="outline"
          className="border-white/30 text-white hover:bg-white/10"
          onClick={() => navigate("/reports")}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        {report.status === "draft" && (
          <Button asChild className="bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] hover:bg-[hsl(36,90%,45%)] font-semibold" data-testid="button-edit-report">
            <Link href={`/reports/${id}/edit`}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Link>
          </Button>
        )}
      </PageHeader>
      <div className="container px-4 py-6 mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={report.status || "draft"} />
          {report.project?.projectNumber && (
            <Badge variant="outline">#{report.project.projectNumber}</Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => generatePdfMutation.mutate()}
            disabled={generatePdfMutation.isPending}
            data-testid="button-generate-pdf"
          >
            {generatePdfMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FileText className="w-4 h-4 mr-2" />
            )}
            {report.pdfPath ? "View PDF" : "Generate PDF"}
          </Button>
          {report.pdfPath && (
            <Button variant="outline" asChild data-testid="button-download-pdf">
              <a href={`/api/reports/${id}/pdf?download=true`} download>
                <Download className="w-4 h-4 mr-2" />
                Download
              </a>
            </Button>
          )}
          {report.status === "submitted" && (
            <Button
              variant="outline"
              onClick={() => {
                setEmailRecipients(report.project?.distributionEmails?.join(", ") || "");
                setShowDistributeDialog(true);
              }}
              data-testid="button-distribute"
            >
              <Mail className="w-4 h-4 mr-2" />
              Distribute
            </Button>
          )}
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setShowDeleteDialog(true)}
            data-testid="button-delete-report"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Report Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Date</p>
                <p className="font-medium">{formatPacificDate(report.date, "MMMM d, yyyy")}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Inspector</p>
                <p className="font-medium">{report.inspectorName || "Unknown"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start gap-2">
                <Cloud className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Weather</p>
                  <p className="font-medium capitalize">{report.weatherType}</p>
                  {report.weatherNotes && (
                    <p className="text-sm text-muted-foreground">{report.weatherNotes}</p>
                  )}
                </div>
              </div>
              {report.project?.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Location</p>
                    <p className="font-medium">{report.project.address}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {workActivities.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <HardHat className="w-5 h-5" />
                Work Activities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {workActivities.map((activity, index) => (
                  <div key={index} className="p-3 bg-muted/50 border border-border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{activity.contractor}</span>
                      <span className="text-sm text-muted-foreground">{activity.headcount} workers</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{activity.workDescription}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {report.inspections && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5" />
                Inspections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{report.inspections}</p>
            </CardContent>
          </Card>
        )}

        {report.workPerformed && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Additional Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{report.workPerformed}</p>
            </CardContent>
          </Card>
        )}

        {report.equipment && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wrench className="w-5 h-5" />
                Equipment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{report.equipment}</p>
            </CardContent>
          </Card>
        )}

        {report.materialsDelivered && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="w-5 h-5" />
                Materials Delivered
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{report.materialsDelivered}</p>
            </CardContent>
          </Card>
        )}

        {visitors.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5" />
                Visitors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {visitors.map((visitor, index) => (
                  <div key={index} className="p-3 bg-muted/50 rounded-lg">
                    <p className="font-medium">{visitor.name}</p>
                    <p className="text-sm text-muted-foreground">{visitor.company}</p>
                    {visitor.notes && (
                      <p className="text-sm mt-1">{visitor.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {(report.issuesFlag || report.safetyFlag) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                Issues & Safety
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {report.issuesFlag && (
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                  <p className="font-medium text-orange-800 dark:text-orange-300">Delays/Issues Reported</p>
                  <p className="text-sm mt-1">{report.issuesDetails}</p>
                </div>
              )}
              {report.safetyFlag && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <p className="font-medium text-red-800 dark:text-red-300">Safety Incident Reported</p>
                  </div>
                  <p className="text-sm mt-1">{report.safetyDetails}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {report.photos && report.photos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Image className="w-5 h-5" />
                Photos ({report.photos.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {report.photos.map((photo) => (
                  <div key={photo.id} className="space-y-2">
                    <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                      <img
                        src={photo.filePath}
                        alt={photo.caption || "Report photo"}
                        className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                        onClick={() => window.open(photo.filePath, "_blank")}
                      />
                    </div>
                    {photo.caption && (
                      <p className="text-sm text-muted-foreground">{photo.caption}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {report.signaturePath && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <PenTool className="w-5 h-5" />
                Signature
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-white border rounded-lg p-4 max-w-sm">
                <img
                  src={report.signaturePath}
                  alt="Inspector signature"
                  className="max-h-24 mx-auto"
                />
              </div>
              {report.signedAt && (
                <p className="text-sm text-muted-foreground mt-2">
                  Signed on {formatPacificDate(report.signedAt, "MMMM d, yyyy 'at' h:mm a")}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Dialog open={showDistributeDialog} onOpenChange={setShowDistributeDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Distribute Report</DialogTitle>
              <DialogDescription>
                Send this report to the specified email addresses
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recipients">Recipients</Label>
                <Input
                  id="recipients"
                  value={emailRecipients}
                  onChange={(e) => setEmailRecipients(e.target.value)}
                  placeholder="email1@example.com, email2@example.com"
                  data-testid="input-recipients"
                />
                <p className="text-sm text-muted-foreground">
                  Separate multiple email addresses with commas
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDistributeDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleDistribute}
                disabled={distributeMutation.isPending}
                data-testid="button-confirm-distribute"
              >
                {distributeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4 mr-2" />
                )}
                Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Report</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this report? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageLayout>
  );
}

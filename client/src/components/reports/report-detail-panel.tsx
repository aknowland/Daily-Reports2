import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatPacificDate } from "@/lib/timezone";
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
  Trash2,
  FolderPlus,
  Mail,
  RefreshCw,
  ChevronDown,
  Eye,
} from "lucide-react";
import { EmailDistributionDialog } from "@/components/reports/email-distribution-dialog";
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
  currentUserId?: string;
  isAdmin?: boolean;
  isCompanyAdmin?: boolean;
}

export function ReportDetailPanel({ 
  report, 
  open, 
  onOpenChange,
  currentUserId,
  isAdmin = false,
  isCompanyAdmin = false,
}: ReportDetailPanelProps) {
  const { toast } = useToast();
  const [showAssignProject, setShowAssignProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  const { data: fullReport } = useQuery<ReportWithDetails>({
    queryKey: ["/api/reports", report?.id],
    enabled: open && !!report?.id,
  });

  const displayReport = fullReport || report;

  // Fetch projects for assignment dropdown
  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: showAssignProject,
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: string) => {
      await apiRequest("DELETE", `/api/photos/${photoId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports", report?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      setDeletingPhotoId(null);
      toast({
        title: "Photo Deleted",
        description: "The photo has been removed from this report.",
      });
    },
    onError: (error) => {
      setDeletingPhotoId(null);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete photo",
        variant: "destructive",
      });
    },
  });

  const assignProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      return apiRequest("PATCH", `/api/reports/${report?.id}`, { projectId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Project Assigned",
        description: "The report has been assigned to the selected project.",
      });
      setShowAssignProject(false);
      setSelectedProjectId("");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to assign project",
        variant: "destructive",
      });
    },
  });

  const generatePdfMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/reports/${report?.id}/pdf`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports", report?.id] });
      // Open the freshly-generated PDF immediately (cache-busted with timestamp)
      window.open(`/api/reports/${report?.id}/pdf?t=${Date.now()}`, '_blank');
      toast({
        title: "PDF Generated",
        description: "Your PDF has opened in a new tab.",
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

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/reports/${report?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      onOpenChange(false);
      toast({
        title: "Report Deleted",
        description: "The report has been permanently deleted.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete report",
        variant: "destructive",
      });
    },
  });

  const deletePdfMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/reports/${report?.id}/pdf`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports", report?.id] });
      toast({
        title: "PDF Deleted",
        description: "The PDF has been deleted. You can generate a new one anytime.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete PDF",
        variant: "destructive",
      });
    },
  });

  if (!report) return null;

  // Permission logic
  const isOwner = currentUserId === displayReport?.inspectorId;
  const canEdit = isAdmin || isCompanyAdmin || (isOwner && displayReport?.status === "draft");
  const canDelete = isAdmin || isCompanyAdmin;
  const canDeletePhoto = isAdmin || isCompanyAdmin || isOwner;

  const workActivities = (displayReport?.workActivities as WorkActivityRow[]) || [];
  const visitors = (displayReport?.visitors as VisitorRow[]) || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="space-y-1">
              <SheetTitle className="text-xl">
                {displayReport?.project?.name || displayReport?.customProjectName || "Unassigned Report"}
              </SheetTitle>
              {displayReport?.project ? (
                <SheetDescription className="flex items-center gap-2">
                  <Hash className="w-3 h-3" />
                  {displayReport?.project?.projectNumber}
                  {displayReport?.project?.client && ` • ${displayReport.project.client}`}
                </SheetDescription>
              ) : displayReport?.customProjectName ? (
                <SheetDescription className="text-muted-foreground">
                  Custom project (not assigned)
                </SheetDescription>
              ) : !displayReport?.projectId ? (
                <SheetDescription className="text-muted-foreground">
                  Not assigned to a project
                </SheetDescription>
              ) : null}
            </div>
            <StatusBadge status={displayReport?.status || "draft"} />
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            {canEdit && (
              <Button asChild variant="outline" size="sm" data-testid="button-edit-report">
                <Link href={`/reports/${report.id}/edit`} onClick={() => onOpenChange(false)}>
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Link>
              </Button>
            )}
            {!displayReport?.projectId && isOwner && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowAssignProject(true)}
                data-testid="button-assign-project"
              >
                <FolderPlus className="w-4 h-4 mr-2" />
                Assign Project
              </Button>
            )}
            {displayReport?.pdfPath ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-pdf-actions">
                    <FileText className="w-4 h-4 mr-2" />
                    PDF
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem asChild>
                    <a 
                      href={`/api/reports/${report.id}/pdf?t=${Date.now()}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center cursor-pointer"
                      data-testid="menu-view-pdf"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View PDF
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a 
                      href={`/api/reports/${report.id}/pdf?download=true&t=${Date.now()}`} 
                      download
                      className="flex items-center cursor-pointer"
                      data-testid="menu-download-pdf"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => setShowEmailDialog(true)}
                    className="cursor-pointer"
                    data-testid="menu-email-pdf"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Email Report
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onSelect={(e) => {
                      if (generatePdfMutation.isPending || !report?.id) {
                        e.preventDefault();
                        return;
                      }
                      generatePdfMutation.mutate();
                    }}
                    className="cursor-pointer"
                    data-testid="menu-regenerate-pdf"
                  >
                    {generatePdfMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Regenerate PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onSelect={(e) => {
                      if (deletePdfMutation.isPending || !report?.id) {
                        e.preventDefault();
                        return;
                      }
                      deletePdfMutation.mutate();
                    }}
                    className="text-destructive cursor-pointer"
                    data-testid="menu-delete-pdf"
                  >
                    {deletePdfMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Delete PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!report?.id || generatePdfMutation.isPending) return;
                  generatePdfMutation.mutate();
                }}
                disabled={generatePdfMutation.isPending}
                data-testid="button-generate-pdf"
              >
                {generatePdfMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4 mr-2" />
                )}
                Generate PDF
              </Button>
            )}
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-destructive hover:bg-destructive/10"
                    data-testid="button-delete-report"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Report</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this report? This action cannot be undone.
                      All photos and associated data will be permanently removed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
                  <p className="font-medium">{displayReport?.date ? formatPacificDate(displayReport.date, "MMMM d, yyyy") : ""}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Inspector</p>
                  <p className="font-medium">{displayReport?.inspectorName || "Unknown"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {displayReport?.project?.client && (
                  <div>
                    <p className="text-muted-foreground">Client</p>
                    <p className="font-medium">{displayReport.project.client}</p>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <Cloud className="w-4 h-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Weather</p>
                    <p className="font-medium capitalize">{displayReport?.weatherType}</p>
                    {displayReport?.weatherNotes && (
                      <p className="text-muted-foreground text-xs">{displayReport.weatherNotes}</p>
                    )}
                  </div>
                </div>
              </div>
              {displayReport?.project?.address && (
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Location</p>
                    <p className="font-medium">{displayReport.project.address}</p>
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

            {displayReport?.inspections && (
              <section className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4" />
                  Inspections
                </h3>
                <p className="text-sm whitespace-pre-wrap">{displayReport.inspections}</p>
              </section>
            )}

            {displayReport?.workPerformed && (
              <section className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Additional Notes
                </h3>
                <p className="text-sm whitespace-pre-wrap">{displayReport.workPerformed}</p>
              </section>
            )}

            {displayReport?.equipment && (
              <section className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Wrench className="w-4 h-4" />
                  Equipment
                </h3>
                <p className="text-sm whitespace-pre-wrap">{displayReport.equipment}</p>
              </section>
            )}

            {displayReport?.materialsDelivered && (
              <section className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Materials Delivered
                </h3>
                <p className="text-sm whitespace-pre-wrap">{displayReport.materialsDelivered}</p>
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

            {(displayReport?.issuesFlag || displayReport?.safetyFlag) && (
              <section className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                  Issues & Safety
                </h3>
                {displayReport?.issuesFlag && (
                  <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800 text-sm">
                    <p className="font-medium text-orange-800 dark:text-orange-300">Delays/Issues Reported</p>
                    <p className="mt-1">{displayReport.issuesDetails}</p>
                  </div>
                )}
                {displayReport?.safetyFlag && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 text-sm">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-red-600 dark:text-red-400" />
                      <p className="font-medium text-red-800 dark:text-red-300">Safety Incident Reported</p>
                    </div>
                    <p className="mt-1">{displayReport.safetyDetails}</p>
                  </div>
                )}
              </section>
            )}

            {displayReport?.photos && displayReport.photos.length > 0 && (
              <section className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  Photos ({displayReport.photos.length})
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {displayReport.photos.map((photo) => (
                    <div key={photo.id} className="space-y-1">
                      <div className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
                        <img
                          src={photo.filePath}
                          alt={photo.caption || "Report photo"}
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => window.open(photo.filePath, "_blank")}
                          data-testid={`img-photo-${photo.id}`}
                        />
                        {canDeletePhoto && (
                          <Button
                            size="icon"
                            variant="destructive"
                            className="absolute top-1 right-1 h-7 w-7 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingPhotoId(photo.id);
                            }}
                            data-testid={`button-delete-photo-${photo.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                      {photo.caption && (
                        <p className="text-xs text-muted-foreground">{photo.caption}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {displayReport?.signaturePath && (
              <section className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <PenTool className="w-4 h-4" />
                  Signature
                </h3>
                <div className="bg-white border rounded-lg p-3 max-w-xs">
                  <img
                    src={displayReport.signaturePath}
                    alt="Inspector signature"
                    className="max-h-20 mx-auto"
                  />
                </div>
                {displayReport?.signedAt && (
                  <p className="text-xs text-muted-foreground">
                    Signed on {formatPacificDate(displayReport.signedAt, "MMMM d, yyyy 'at' h:mm a")}
                  </p>
                )}
              </section>
            )}

            <section className="space-y-3" data-testid="section-pdf-preview">
              <h3 className="font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4" />
                PDF Document
              </h3>
              {displayReport?.pdfPath ? (
                <>
                  <div className="border rounded-lg overflow-hidden bg-muted">
                    <iframe
                      src={`/api/reports/${report.id}/pdf`}
                      className="w-full h-[400px]"
                      title="Report PDF Preview"
                      data-testid="iframe-pdf-preview"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    If the preview doesn't load, use the PDF button above to view or download.
                  </p>
                </>
              ) : (
                <div className="border rounded-lg p-6 bg-muted/50 text-center space-y-4" data-testid="section-no-pdf">
                  <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <FileText className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium">No PDF Generated</p>
                    <p className="text-sm text-muted-foreground">
                      Generate a PDF to view, download, or email this report.
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      if (!report?.id || generatePdfMutation.isPending) return;
                      generatePdfMutation.mutate();
                    }}
                    disabled={generatePdfMutation.isPending}
                    data-testid="button-generate-pdf-prompt"
                  >
                    {generatePdfMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="w-4 h-4 mr-2" />
                    )}
                    Generate PDF
                  </Button>
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
      </SheetContent>

      <AlertDialog open={showAssignProject} onOpenChange={setShowAssignProject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Assign to Project</AlertDialogTitle>
            <AlertDialogDescription>
              Select a project to assign this report to. This will associate the report with the selected project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger data-testid="select-assign-project">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects?.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name} ({project.projectNumber})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedProjectId("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => assignProjectMutation.mutate(selectedProjectId)}
              disabled={!selectedProjectId || assignProjectMutation.isPending}
              data-testid="button-confirm-assign"
            >
              {assignProjectMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                "Assign"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {report && (
        <EmailDistributionDialog
          open={showEmailDialog}
          onOpenChange={setShowEmailDialog}
          reportId={report.id}
          projectName={displayReport?.project?.name || displayReport?.customProjectName || undefined}
          defaultEmails={displayReport?.project?.distributionEmails as string[] || []}
        />
      )}

      <AlertDialog open={!!deletingPhotoId} onOpenChange={(open) => { if (!open) setDeletingPhotoId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this photo? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingPhotoId) {
                  deletePhotoMutation.mutate(deletingPhotoId);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletePhotoMutation.isPending}
              data-testid="button-confirm-delete-photo"
            >
              {deletePhotoMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

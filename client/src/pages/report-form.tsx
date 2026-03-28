import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { getTodayPacific, formatPacificDate } from "@/lib/timezone";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SignaturePad } from "@/components/ui/signature-pad";
import { PhotoUpload } from "@/components/ui/photo-upload";
import {
  VisitorRowInput,
  WorkActivityRowInput,
  EquipmentRowInput,
  MaterialRowInput,
  AddRowButton,
} from "@/components/reports/repeatable-row";
import { EmailDistributionDialog } from "@/components/reports/email-distribution-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Save, Send, ArrowLeft, FolderPlus, FileText, ClipboardEdit } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { format } from "date-fns";
import type { Project, DailyReport, VisitorRow, WorkActivityRow, EquipmentRow, MaterialRow } from "@shared/schema";
import { VoiceInput } from "@/components/ui/voice-input";

interface PhotoItem {
  id?: string;
  file?: File;
  preview: string;
  caption: string;
}

const WEATHER_OPTIONS = [
  { value: "clear", label: "Clear" },
  { value: "cloudy", label: "Cloudy" },
  { value: "rain", label: "Rain" },
  { value: "wind", label: "Wind" },
  { value: "heat", label: "Heat" },
  { value: "cold", label: "Cold" },
];

const TYPE_OF_WORK_OPTIONS = [
  { value: "reinf_concrete", label: "Reinf. Concrete" },
  { value: "structural_steel", label: "Structural Steel" },
  { value: "reinf_masonry", label: "Reinf. Masonry" },
  { value: "fire_proofing", label: "Fire Proofing" },
  { value: "shotcrete", label: "Shotcrete" },
  { value: "anchors", label: "Anchors" },
  { value: "other", label: "Other" },
];

export default function ReportFormPage() {
  const { id } = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const isEditing = !!id;

  const [formData, setFormData] = useState({
    projectId: "",
    customProjectName: "",
    date: getTodayPacific(),
    weatherType: "clear" as const,
    weatherNotes: "",
    weatherAM: "",
    weatherPM: "",
    precipitation: "",
    siteConditions: "",
    typeOfWork: [] as string[],
    workPerformed: "",
    workActivities: [] as WorkActivityRow[],
    visitors: [] as VisitorRow[],
    equipment: "",
    equipmentRows: [] as EquipmentRow[],
    inspections: "",
    materialsDelivered: "",
    materialRows: [] as MaterialRow[],
    notes: "",
    issuesFlag: false,
    issuesDetails: "",
    safetyFlag: false,
    safetyDetails: "",
    safetyIncidents: 0,
    safetyNearMisses: 0,
    safetyAttendees: "" as string | number,
    safetySiteConditions: "",
    toolboxTalkTopic: "",
    // Time tracking - defaults for new reports
    timeIn: "07:00",
    timeOut: "15:00",
    regularHours: "",
    otHours: "",
  });

  // Calculate regular hours when time fields change
  useEffect(() => {
    const { timeIn, timeOut } = formData;
    
    const parseTime = (t: string): number | null => {
      if (!t) return null;
      const [h, m] = t.split(":").map(Number);
      if (isNaN(h) || isNaN(m)) return null;
      return h * 60 + m;
    };
    
    // Clear if required fields are missing
    if (!timeIn || !timeOut) {
      if (formData.regularHours !== "") {
        setFormData(prev => ({ ...prev, regularHours: "" }));
      }
      return;
    }
    
    const inMins = parseTime(timeIn);
    const outMins = parseTime(timeOut);
    
    // Clear if invalid or timeOut <= timeIn
    if (inMins === null || outMins === null || outMins <= inMins) {
      if (formData.regularHours !== "") {
        setFormData(prev => ({ ...prev, regularHours: "" }));
      }
      return;
    }
    
    const totalMinutes = outMins - inMins;
    const hours = Math.max(0, totalMinutes / 60);
    const regularHrs = Math.min(hours, 8).toFixed(2);
    setFormData(prev => ({ ...prev, regularHours: regularHrs }));
  }, [formData.timeIn, formData.timeOut]);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [signature, setSignature] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null);
  const [showNoProjectsDialog, setShowNoProjectsDialog] = useState(false);
  const [hasShownNoProjectsDialog, setHasShownNoProjectsDialog] = useState(false);
  const [lastFetchedProjectId, setLastFetchedProjectId] = useState<string | null>(null);

  const { data: projects, isLoading: loadingProjects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  // Show dialog when user has no projects (only for new reports, only once)
  useEffect(() => {
    if (!isEditing && !loadingProjects && projects && projects.length === 0 && !hasShownNoProjectsDialog) {
      setShowNoProjectsDialog(true);
      setHasShownNoProjectsDialog(true);
    }
  }, [isEditing, loadingProjects, projects, hasShownNoProjectsDialog]);

  const { data: existingReport, isLoading: loadingReport } = useQuery<DailyReport & { photos?: { id: string; filePath: string; caption: string }[] }>({
    queryKey: ["/api/reports", id],
    enabled: isEditing,
  });

  // Set active project as default for new reports
  useEffect(() => {
    if (!isEditing && profile?.activeProjectId && !formData.projectId) {
      setFormData(prev => ({ ...prev, projectId: profile.activeProjectId! }));
    }
  }, [isEditing, profile?.activeProjectId]);

  // Fetch previous report values when project is selected (for new reports only)
  useEffect(() => {
    const fetchPreviousReportDefaults = async () => {
      if (isEditing || !formData.projectId || formData.projectId === lastFetchedProjectId) {
        return;
      }
      
      setLastFetchedProjectId(formData.projectId);
      
      try {
        const response = await fetch(`/api/projects/${formData.projectId}/latest-report`, {
          credentials: 'include'
        });
        
        if (!response.ok) {
          // No previous report found, which is fine
          return;
        }
        
        const previousReport = await response.json();
        
        // Apply previous report values (except date and photos)
        setFormData(prev => ({
          ...prev,
          // Keep current date and projectId
          projectId: prev.projectId,
          date: prev.date,
          // Pull from previous report
          weatherType: (previousReport.weatherType || "clear") as typeof formData.weatherType,
          weatherNotes: previousReport.weatherNotes || "",
          weatherAM: previousReport.weatherAM || "",
          weatherPM: previousReport.weatherPM || "",
          precipitation: previousReport.precipitation || "",
          siteConditions: previousReport.siteConditions || "",
          typeOfWork: (previousReport.typeOfWork as string[]) || [],
          workPerformed: previousReport.workPerformed || "",
          workActivities: (previousReport.workActivities as WorkActivityRow[]) || [],
          visitors: (previousReport.visitors as VisitorRow[]) || [],
          equipment: previousReport.equipment || "",
          equipmentRows: (previousReport.equipmentRows as EquipmentRow[] | null) || [],
          inspections: previousReport.inspections || "",
          materialsDelivered: previousReport.materialsDelivered || "",
          materialRows: (previousReport.materialRows as MaterialRow[] | null) || [],
          notes: previousReport.notes || "",
          issuesFlag: previousReport.issuesFlag || false,
          issuesDetails: previousReport.issuesDetails || "",
          safetyFlag: previousReport.safetyFlag || false,
          safetyDetails: previousReport.safetyDetails || "",
          safetyIncidents: previousReport.safetyIncidents || 0,
          safetyNearMisses: previousReport.safetyNearMisses || 0,
          safetyAttendees: previousReport.safetyAttendees || "",
          safetySiteConditions: previousReport.safetySiteConditions || "",
          toolboxTalkTopic: previousReport.toolboxTalkTopic || "",
          timeIn: previousReport.timeIn || "07:00",
          timeOut: previousReport.timeOut || "15:00",
          regularHours: previousReport.regularHours || "",
          otHours: previousReport.otHours || "",
        }));
        
        toast({
          title: "Previous report loaded",
          description: "Form pre-filled with values from the last report for this project",
        });
      } catch (error) {
        // Silent fail - not critical if we can't load previous report
        console.error("Error fetching previous report defaults:", error);
      }
    };
    
    fetchPreviousReportDefaults();
  }, [isEditing, formData.projectId, lastFetchedProjectId, toast]);

  useEffect(() => {
    if (existingReport) {
      setFormData({
        projectId: existingReport.projectId || "",
        customProjectName: existingReport.customProjectName || "",
        date: formatPacificDate(existingReport.date, "yyyy-MM-dd"),
        weatherType: (existingReport.weatherType || "clear") as typeof formData.weatherType,
        weatherNotes: existingReport.weatherNotes || "",
        weatherAM: existingReport.weatherAM || "",
        weatherPM: existingReport.weatherPM || "",
        precipitation: existingReport.precipitation || "",
        siteConditions: existingReport.siteConditions || "",
        typeOfWork: (existingReport.typeOfWork as string[]) || [],
        workPerformed: existingReport.workPerformed || "",
        workActivities: (existingReport.workActivities as WorkActivityRow[]) || [],
        visitors: (existingReport.visitors as VisitorRow[]) || [],
        equipment: existingReport.equipment || "",
        equipmentRows: (existingReport.equipmentRows as EquipmentRow[] | null) || [],
        inspections: existingReport.inspections || "",
        materialsDelivered: existingReport.materialsDelivered || "",
        materialRows: (existingReport.materialRows as MaterialRow[] | null) || [],
        notes: existingReport.notes || "",
        issuesFlag: existingReport.issuesFlag || false,
        issuesDetails: existingReport.issuesDetails || "",
        safetyFlag: existingReport.safetyFlag || false,
        safetyDetails: existingReport.safetyDetails || "",
        safetyIncidents: existingReport.safetyIncidents || 0,
        safetyNearMisses: existingReport.safetyNearMisses || 0,
        safetyAttendees: existingReport.safetyAttendees || "",
        safetySiteConditions: existingReport.safetySiteConditions || "",
        toolboxTalkTopic: existingReport.toolboxTalkTopic || "",
        timeIn: existingReport.timeIn || "",
        timeOut: existingReport.timeOut || "",
        regularHours: existingReport.regularHours || "",
        otHours: existingReport.otHours || "",
      });

      if (existingReport.photos) {
        setPhotos(existingReport.photos.map(p => ({
          id: p.id,
          preview: p.filePath,
          caption: p.caption || "",
        })));
      }

      if (existingReport.signaturePath) {
        setSignature(existingReport.signaturePath);
      }
    }
  }, [existingReport]);

  const saveMutation = useMutation({
    mutationFn: async (status: "draft" | "submitted") => {
      setIsSaving(true);
      
      const reportData = {
        ...formData,
        projectId: formData.projectId || null, // Send null for personal reports
        customProjectName: formData.projectId ? null : (formData.customProjectName || null), // Only save custom name if no project selected
        date: formData.date, // Keep as YYYY-MM-DD string to avoid timezone shifts
        status,
        inspectorId: user?.id,
        safetyAttendees: formData.safetyAttendees !== "" ? Number(formData.safetyAttendees) : null,
      };

      let reportId = id;

      if (isEditing) {
        await apiRequest("PATCH", `/api/reports/${id}`, reportData);
      } else {
        // Use raw fetch to catch limit exceeded error with custom handling
        const response = await fetch("/api/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reportData),
          credentials: "include",
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to create report");
        }
        const result = await response.json();
        reportId = result.id;
      }

      // Only save signature if it's new (base64 data, not an existing file path)
      if (signature && reportId && signature.startsWith("data:")) {
        await apiRequest("POST", `/api/reports/${reportId}/signature`, { signature });
      }

      if (removedPhotoIds.length > 0) {
        for (const photoId of removedPhotoIds) {
          try {
            await apiRequest("DELETE", `/api/photos/${photoId}`);
          } catch (e) {
          }
        }
        setRemovedPhotoIds([]);
      }

      const newPhotos = photos.filter(p => p.file);
      if (newPhotos.length > 0 && reportId) {
        const formDataUpload = new FormData();
        newPhotos.forEach((photo, index) => {
          if (photo.file) {
            formDataUpload.append("photos", photo.file);
            formDataUpload.append(`captions[${index}]`, photo.caption);
          }
        });
        
        await fetch(`/api/reports/${reportId}/photos`, {
          method: "POST",
          body: formDataUpload,
          credentials: "include",
        });
      }

      return reportId;
    },
    onSuccess: async (reportId, status) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      
      if (status === "submitted" && reportId) {
        // Get project's default distribution emails
        const project = projects?.find(p => p.id === formData.projectId);
        const defaultEmails = project?.distributionEmails || [];
        
        try {
          toast({
            title: "Report Submitted",
            description: "Generating PDF and sending...",
          });
          
          // Generate PDF
          await apiRequest("POST", `/api/reports/${reportId}/pdf`);
          
          // Auto-distribute if project has default emails
          if (defaultEmails.length > 0) {
            try {
              await apiRequest("POST", `/api/reports/${reportId}/distribute`, {
                recipients: defaultEmails,
                message: "",
              });
              
              setIsSaving(false);
              toast({
                title: "Report Sent",
                description: `PDF generated and emailed to ${defaultEmails.length} recipient(s).`,
              });
              navigate(`/reports/${reportId}`);
            } catch (distError) {
              console.error("Failed to distribute:", distError);
              setIsSaving(false);
              // Still show email dialog if distribution failed
              setSubmittedReportId(reportId);
              setShowEmailDialog(true);
              toast({
                title: "Distribution Failed",
                description: "PDF generated but email failed. Please try again.",
                variant: "destructive",
              });
            }
          } else {
            // No default emails - show dialog for user to enter recipients
            setIsSaving(false);
            setSubmittedReportId(reportId);
            setShowEmailDialog(true);
            toast({
              title: "PDF Generated",
              description: "Enter email addresses to distribute the report.",
            });
          }
        } catch (pdfError) {
          console.error("Failed to generate PDF:", pdfError);
          setIsSaving(false);
          toast({
            title: "Report Submitted",
            description: "Report submitted but PDF generation failed. You can generate it later.",
            variant: "destructive",
          });
          navigate(`/reports/${reportId}`);
        }
      } else {
        setIsSaving(false);
        if (reportId) {
          toast({
            title: "Report Saved",
            description: "Your report has been saved as a draft",
          });
          navigate(`/reports/${reportId}`);
        }
      }
    },
    onError: (error) => {
      setIsSaving(false);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save report",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (status: "draft" | "submitted") => {
    // Project is now optional - users can create personal/unassigned reports

    if (status === "submitted" && !signature) {
      toast({
        title: "Signature Required",
        description: "Please sign the report before submitting",
        variant: "destructive",
      });
      return;
    }

    saveMutation.mutate(status);
  };

  const isLoading = loadingProjects || (isEditing && loadingReport);

  if (isLoading) {
    return (
      <PageLayout title={isEditing ? "Edit Report" : "New Report"}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={isEditing ? "Edit Report" : "New Report"} showNav={false}>
      <PageHeader
        icon={ClipboardEdit}
        title={isEditing ? "Edit Report" : "New Daily Report"}
        subtitle={isEditing ? "Update your daily field report" : "Record today's site activities"}
      >
        <Button 
          variant="outline"
          className="border-white/30 text-white hover:bg-white/10"
          onClick={() => window.history.back()}
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </PageHeader>

      <div className="max-w-2xl mx-auto space-y-6 pb-32">

        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="text-lg">Report Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="project">Project (optional)</Label>
                <Select 
                  value={formData.projectId || "personal"} 
                  onValueChange={(value) => setFormData(prev => ({ 
                    ...prev, 
                    projectId: value === "personal" ? "" : value,
                    customProjectName: value === "personal" ? prev.customProjectName : "" 
                  }))}
                >
                  <SelectTrigger id="project" className="h-12" data-testid="select-project">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Unassigned Report</SelectItem>
                    {projects?.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name} ({project.projectNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!formData.projectId && (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="customProjectName">Project Name</Label>
                  <Input
                    id="customProjectName"
                    value={formData.customProjectName}
                    onChange={(e) => setFormData(prev => ({ ...prev, customProjectName: e.target.value }))}
                    placeholder="Enter project name for this report"
                    className="h-12"
                    data-testid="input-custom-project-name"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  className="h-12"
                  data-testid="input-date"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="weather">Weather Type</Label>
                <Select 
                  value={formData.weatherType} 
                  onValueChange={(value: any) => setFormData(prev => ({ ...prev, weatherType: value }))}
                >
                  <SelectTrigger id="weather" className="h-12" data-testid="select-weather">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEATHER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="weatherNotes">General Weather Notes</Label>
                <Input
                  id="weatherNotes"
                  value={formData.weatherNotes}
                  onChange={(e) => setFormData(prev => ({ ...prev, weatherNotes: e.target.value }))}
                  placeholder="Temperature, conditions..."
                  className="h-12"
                  data-testid="input-weather-notes"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="weatherAM">Morning (AM) Conditions</Label>
                <Input
                  id="weatherAM"
                  value={formData.weatherAM}
                  onChange={(e) => setFormData(prev => ({ ...prev, weatherAM: e.target.value }))}
                  placeholder="e.g., Clear, 58°F, Wind: calm"
                  className="h-12"
                  data-testid="input-weather-am"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weatherPM">Afternoon (PM) Conditions</Label>
                <Input
                  id="weatherPM"
                  value={formData.weatherPM}
                  onChange={(e) => setFormData(prev => ({ ...prev, weatherPM: e.target.value }))}
                  placeholder="e.g., Sunny, 72°F, Wind: SW 5mph"
                  className="h-12"
                  data-testid="input-weather-pm"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="precipitation">Precipitation</Label>
                <Input
                  id="precipitation"
                  value={formData.precipitation}
                  onChange={(e) => setFormData(prev => ({ ...prev, precipitation: e.target.value }))}
                  placeholder="e.g., None, 0.2 inches"
                  className="h-12"
                  data-testid="input-precipitation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="siteConditions">Site Conditions</Label>
                <Input
                  id="siteConditions"
                  value={formData.siteConditions}
                  onChange={(e) => setFormData(prev => ({ ...prev, siteConditions: e.target.value }))}
                  placeholder="e.g., Dry, firm ground"
                  className="h-12"
                  data-testid="input-site-conditions"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Type of Work</Label>
              <div className="flex flex-wrap gap-4" data-testid="section-type-of-work">
                {TYPE_OF_WORK_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`work-type-${option.value}`}
                      checked={formData.typeOfWork.includes(option.value)}
                      onCheckedChange={(checked) => {
                        setFormData(prev => ({
                          ...prev,
                          typeOfWork: checked
                            ? [...prev.typeOfWork, option.value]
                            : prev.typeOfWork.filter(v => v !== option.value)
                        }));
                      }}
                      data-testid={`checkbox-work-type-${option.value}`}
                    />
                    <Label 
                      htmlFor={`work-type-${option.value}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inspector">Inspector</Label>
              <Input
                id="inspector"
                value={(() => {
                  const firstName = profile?.firstName || user?.firstName;
                  const lastName = profile?.lastName || user?.lastName;
                  if (firstName && lastName) return `${firstName} ${lastName}`;
                  if (firstName) return firstName;
                  if (lastName) return lastName;
                  return user?.email || "";
                })()}
                disabled
                className="h-12 bg-muted"
                data-testid="input-inspector"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="text-lg">Time Tracking</CardTitle>
            <p className="text-sm text-muted-foreground">Record your work hours for invoicing</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="timeIn">Time In</Label>
                <Input
                  id="timeIn"
                  type="time"
                  value={formData.timeIn}
                  onChange={(e) => setFormData(prev => ({ ...prev, timeIn: e.target.value }))}
                  className="h-12"
                  data-testid="input-time-in"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeOut">Time Out</Label>
                <Input
                  id="timeOut"
                  type="time"
                  value={formData.timeOut}
                  onChange={(e) => setFormData(prev => ({ ...prev, timeOut: e.target.value }))}
                  className="h-12"
                  data-testid="input-time-out"
                />
              </div>
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="regularHours">Regular Hours</Label>
                <Input
                  id="regularHours"
                  type="text"
                  value={formData.regularHours}
                  disabled
                  className="h-12 bg-muted font-medium"
                  placeholder="Auto-calculated"
                  data-testid="input-regular-hours"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="otHours">OT Hours</Label>
                <Input
                  id="otHours"
                  type="number"
                  step="0.25"
                  min="0"
                  value={formData.otHours}
                  onChange={(e) => setFormData(prev => ({ ...prev, otHours: e.target.value }))}
                  className="h-12"
                  placeholder="0.00"
                  data-testid="input-ot-hours"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between gap-2 flex-wrap">
              <span>Work Activities</span>
              <VoiceInput
                targetField="workActivities"
                onTranscript={() => {}}
                onParsedData={(data) => {
                  if (Array.isArray(data)) {
                    const newActivities = data
                      .filter((item: any) => item && typeof item === "object")
                      .map((item: any) => ({
                        trade: String(item.trade || "").trim(),
                        contractor: String(item.contractor || "").trim(),
                        headcount: Math.max(0, parseInt(String(item.headcount)) || 0),
                        workDescription: String(item.workDescription || item.description || "").trim(),
                      }))
                      .filter(a => a.contractor || a.workDescription);
                    if (newActivities.length > 0) {
                      setFormData(prev => ({
                        ...prev,
                        workActivities: [...prev.workActivities, ...newActivities]
                      }));
                    }
                  }
                }}
              />
            </CardTitle>
            <p className="text-sm text-primary-foreground/80">
              Add each work activity with the contractor/trade and their headcount. Use voice to dictate multiple activities at once.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {formData.workActivities.map((activity, index) => (
              <WorkActivityRowInput
                key={index}
                index={index}
                trade={activity.trade}
                contractor={activity.contractor}
                headcount={activity.headcount}
                workDescription={activity.workDescription}
                onChange={(trade, c, h, w) => {
                  const newActivities = [...formData.workActivities];
                  newActivities[index] = { trade, contractor: c, headcount: h, workDescription: w };
                  setFormData(prev => ({ ...prev, workActivities: newActivities }));
                }}
                onRemove={() => {
                  const newActivities = formData.workActivities.filter((_, i) => i !== index);
                  setFormData(prev => ({ ...prev, workActivities: newActivities }));
                }}
              />
            ))}
            <AddRowButton
              onClick={() => setFormData(prev => ({ 
                ...prev, 
                workActivities: [...prev.workActivities, { trade: "", contractor: "", headcount: 0, workDescription: "" }] 
              }))}
              label="Add Work Activity"
              testId="button-add-work-activity"
            />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between gap-2 flex-wrap">
              <span>Inspections</span>
              <VoiceInput
                onTranscript={(text) => {
                  setFormData(prev => ({
                    ...prev,
                    inspections: prev.inspections ? `${prev.inspections} ${text}` : text
                  }));
                }}
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.inspections}
              onChange={(e) => setFormData(prev => ({ ...prev, inspections: e.target.value }))}
              placeholder="Describe inspections performed today... (or use voice input)"
              rows={3}
              className="resize-y"
              data-testid="textarea-inspections"
            />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between gap-2 flex-wrap">
              <span>Additional Notes</span>
              <VoiceInput
                onTranscript={(text) => {
                  setFormData(prev => ({
                    ...prev,
                    workPerformed: prev.workPerformed ? `${prev.workPerformed} ${text}` : text
                  }));
                }}
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.workPerformed}
              onChange={(e) => setFormData(prev => ({ ...prev, workPerformed: e.target.value }))}
              placeholder="Additional work notes or general observations... (or use voice input)"
              rows={4}
              className="resize-y"
              data-testid="textarea-work-performed"
            />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between gap-2 flex-wrap">
              <span>Visitors</span>
              <VoiceInput
                targetField="visitors"
                onTranscript={() => {}}
                onParsedData={(data) => {
                  if (Array.isArray(data)) {
                    const newVisitors = data
                      .filter((item: any) => item && typeof item === "object")
                      .map((item: any) => ({
                        name: String(item.name || "").trim(),
                        company: String(item.company || "").trim(),
                        notes: String(item.purpose || item.notes || "").trim(),
                      }))
                      .filter(v => v.name || v.company);
                    if (newVisitors.length > 0) {
                      setFormData(prev => ({
                        ...prev,
                        visitors: [...prev.visitors, ...newVisitors]
                      }));
                    }
                  }
                }}
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {formData.visitors.map((visitor, index) => (
              <VisitorRowInput
                key={index}
                index={index}
                name={visitor.name}
                company={visitor.company}
                notes={visitor.notes}
                onChange={(n, c, notes) => {
                  const newVisitors = [...formData.visitors];
                  newVisitors[index] = { name: n, company: c, notes };
                  setFormData(prev => ({ ...prev, visitors: newVisitors }));
                }}
                onRemove={() => {
                  const newVisitors = formData.visitors.filter((_, i) => i !== index);
                  setFormData(prev => ({ ...prev, visitors: newVisitors }));
                }}
              />
            ))}
            <AddRowButton
              onClick={() => setFormData(prev => ({ 
                ...prev, 
                visitors: [...prev.visitors, { name: "", company: "", notes: "" }] 
              }))}
              label="Add Visitor"
              testId="button-add-visitor"
            />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="text-lg">Superintendent Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional notes from the superintendent or general field observations..."
              rows={3}
              className="resize-y"
              data-testid="textarea-superintendent-notes"
            />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="text-lg">Safety</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="safetyIncidents">Incidents</Label>
                <Input
                  id="safetyIncidents"
                  type="number"
                  min="0"
                  value={formData.safetyIncidents}
                  onChange={(e) => setFormData(prev => ({ ...prev, safetyIncidents: parseInt(e.target.value) || 0 }))}
                  className="h-12"
                  data-testid="input-safety-incidents"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="safetyNearMisses">Near Misses</Label>
                <Input
                  id="safetyNearMisses"
                  type="number"
                  min="0"
                  value={formData.safetyNearMisses}
                  onChange={(e) => setFormData(prev => ({ ...prev, safetyNearMisses: parseInt(e.target.value) || 0 }))}
                  className="h-12"
                  data-testid="input-safety-near-misses"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="safetyAttendees">Safety Meeting Attendees</Label>
                <Input
                  id="safetyAttendees"
                  type="number"
                  min="0"
                  value={formData.safetyAttendees}
                  onChange={(e) => setFormData(prev => ({ ...prev, safetyAttendees: e.target.value }))}
                  className="h-12"
                  placeholder="0"
                  data-testid="input-safety-attendees"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="toolboxTalkTopic">Toolbox Talk Topic</Label>
              <Input
                id="toolboxTalkTopic"
                value={formData.toolboxTalkTopic}
                onChange={(e) => setFormData(prev => ({ ...prev, toolboxTalkTopic: e.target.value }))}
                placeholder="e.g., Fall Protection — Ladder Safety & Scaffold Tie-Off"
                className="h-12"
                data-testid="input-toolbox-talk"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="safetySiteConditions">Site Safety Conditions</Label>
              <Textarea
                id="safetySiteConditions"
                value={formData.safetySiteConditions}
                onChange={(e) => setFormData(prev => ({ ...prev, safetySiteConditions: e.target.value }))}
                placeholder="e.g., All barricades in place. Excavation properly shored. SWPPP BMPs inspected — compliant."
                rows={2}
                data-testid="textarea-safety-site-conditions"
              />
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="issuesFlag" className="flex-1">
                  Any delays or issues today?
                </Label>
                <Switch
                  id="issuesFlag"
                  checked={formData.issuesFlag}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, issuesFlag: checked }))}
                  data-testid="switch-issues"
                />
              </div>
              {formData.issuesFlag && (
                <div className="space-y-2">
                  <Textarea
                    value={formData.issuesDetails}
                    onChange={(e) => setFormData(prev => ({ ...prev, issuesDetails: e.target.value }))}
                    placeholder="Describe the issues... (or use voice input)"
                    rows={3}
                    data-testid="textarea-issues-details"
                  />
                  <VoiceInput
                    onTranscript={(text) => {
                      setFormData(prev => ({
                        ...prev,
                        issuesDetails: prev.issuesDetails ? `${prev.issuesDetails} ${text}` : text
                      }));
                    }}
                  />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="safetyFlag" className="flex-1">
                  Any recordable safety incidents?
                </Label>
                <Switch
                  id="safetyFlag"
                  checked={formData.safetyFlag}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, safetyFlag: checked }))}
                  data-testid="switch-safety"
                />
              </div>
              {formData.safetyFlag && (
                <div className="space-y-2">
                  <Textarea
                    value={formData.safetyDetails}
                    onChange={(e) => setFormData(prev => ({ ...prev, safetyDetails: e.target.value }))}
                    placeholder="Describe the safety incident... (or use voice input)"
                    rows={3}
                    data-testid="textarea-safety-details"
                  />
                  <VoiceInput
                    onTranscript={(text) => {
                      setFormData(prev => ({
                        ...prev,
                        safetyDetails: prev.safetyDetails ? `${prev.safetyDetails} ${text}` : text
                      }));
                    }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="text-lg">Equipment on Site</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {formData.equipmentRows.map((row, index) => (
              <EquipmentRowInput
                key={index}
                index={index}
                equipment={row.equipment}
                hours={row.hours}
                status={row.status}
                usage={row.usage}
                onChange={(equipment, hours, status, usage) => {
                  const newRows = [...formData.equipmentRows];
                  newRows[index] = { equipment, hours, status, usage };
                  setFormData(prev => ({ ...prev, equipmentRows: newRows }));
                }}
                onRemove={() => {
                  setFormData(prev => ({ ...prev, equipmentRows: prev.equipmentRows.filter((_, i) => i !== index) }));
                }}
              />
            ))}
            <AddRowButton
              onClick={() => setFormData(prev => ({
                ...prev,
                equipmentRows: [...prev.equipmentRows, { equipment: "", hours: "", status: "", usage: "" }]
              }))}
              label="Add Equipment"
              testId="button-add-equipment"
            />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="text-lg">Material Deliveries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {formData.materialRows.map((row, index) => (
              <MaterialRowInput
                key={index}
                index={index}
                material={row.material}
                quantity={row.quantity}
                status={row.status}
                supplierNotes={row.supplierNotes}
                onChange={(material, quantity, status, supplierNotes) => {
                  const newRows = [...formData.materialRows];
                  newRows[index] = { material, quantity, status, supplierNotes };
                  setFormData(prev => ({ ...prev, materialRows: newRows }));
                }}
                onRemove={() => {
                  setFormData(prev => ({ ...prev, materialRows: prev.materialRows.filter((_, i) => i !== index) }));
                }}
              />
            ))}
            <AddRowButton
              onClick={() => setFormData(prev => ({
                ...prev,
                materialRows: [...prev.materialRows, { material: "", quantity: "", status: "", supplierNotes: "" }]
              }))}
              label="Add Material Delivery"
              testId="button-add-material"
            />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="text-lg">Photos</CardTitle>
          </CardHeader>
          <CardContent>
            <PhotoUpload
              photos={photos}
              onPhotosChange={(newPhotos) => {
                const currentIds = new Set(newPhotos.filter(p => p.id).map(p => p.id));
                const removed = photos.filter(p => p.id && !currentIds.has(p.id)).map(p => p.id!);
                if (removed.length > 0) {
                  setRemovedPhotoIds(prev => [...prev, ...removed]);
                }
                setPhotos(newPhotos);
              }}
            />
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="text-lg">Signature *</CardTitle>
          </CardHeader>
          <CardContent>
            <SignaturePad
              initialSignature={signature}
              onSave={setSignature}
            />
          </CardContent>
        </Card>

        <div className="fixed bottom-0 left-0 right-0 bg-[hsl(216,32%,15%)] border-t-2 border-[hsl(36,90%,50%)] p-4 flex gap-3 z-50">
          <Button
            variant="outline"
            className="flex-1 h-12 border-white/30 text-white hover:bg-white/10"
            onClick={() => handleSubmit("draft")}
            disabled={isSaving}
            data-testid="button-save-draft"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Draft
          </Button>
          <Button
            className="flex-1 h-12 bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] hover:bg-[hsl(36,90%,45%)] font-semibold"
            onClick={() => handleSubmit("submitted")}
            disabled={isSaving}
            data-testid="button-submit-report"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Submit Report
          </Button>
        </div>
      </div>
      {/* No Projects Dialog - shown when user has no projects assigned */}
      <Dialog open={showNoProjectsDialog} onOpenChange={setShowNoProjectsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>No Projects Assigned</DialogTitle>
            <DialogDescription>
              You don't have any projects yet. Would you like to create a new project or continue with an unassigned report?
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <Button
              variant="default"
              className="h-14 justify-start gap-3"
              onClick={() => {
                setShowNoProjectsDialog(false);
                navigate("/my-projects");
              }}
              data-testid="button-create-project"
            >
              <FolderPlus className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Create New Project</div>
                <div className="text-xs text-primary-foreground/70">Set up a project for organizing reports</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-14 justify-start gap-3"
              onClick={() => setShowNoProjectsDialog(false)}
              data-testid="button-continue-unassigned"
            >
              <FileText className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Continue Unassigned</div>
                <div className="text-xs text-muted-foreground">Create a report without a project</div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Distribution Dialog */}
      {submittedReportId && (
        <EmailDistributionDialog
          open={showEmailDialog}
          onOpenChange={(open) => {
            setShowEmailDialog(open);
            if (!open) {
              // Navigate to report after closing dialog
              navigate(`/reports/${submittedReportId}`);
            }
          }}
          reportId={submittedReportId}
          projectName={projects?.find(p => p.id === formData.projectId)?.name || formData.customProjectName || undefined}
          defaultEmails={projects?.find(p => p.id === formData.projectId)?.distributionEmails || []}
        />
      )}

    </PageLayout>
  );
}

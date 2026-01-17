import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Loader2, Save, Send, ArrowLeft, FolderPlus, FileText, Crown } from "lucide-react";
import { format } from "date-fns";
import type { Project, DailyReport, VisitorRow, WorkActivityRow } from "@shared/schema";
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

export default function ReportFormPage() {
  const { id } = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const isEditing = !!id;

  const [formData, setFormData] = useState({
    projectId: "",
    customProjectName: "",
    date: format(new Date(), "yyyy-MM-dd"),
    weatherType: "clear" as const,
    weatherNotes: "",
    workPerformed: "",
    workActivities: [] as WorkActivityRow[],
    visitors: [] as VisitorRow[],
    equipment: "",
    inspections: "",
    materialsDelivered: "",
    issuesFlag: false,
    issuesDetails: "",
    safetyFlag: false,
    safetyDetails: "",
    // Time tracking
    timeIn: "",
    lunchStart: "",
    lunchEnd: "",
    timeOut: "",
    regularHours: "",
    otHours: "",
  });

  // Calculate regular hours when time fields change
  useEffect(() => {
    const { timeIn, lunchStart, lunchEnd, timeOut } = formData;
    
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
    
    let totalMinutes = outMins - inMins;
    
    // Subtract lunch if both times provided and valid
    if (lunchStart && lunchEnd) {
      const lunchStartMins = parseTime(lunchStart);
      const lunchEndMins = parseTime(lunchEnd);
      if (lunchStartMins !== null && lunchEndMins !== null && lunchEndMins > lunchStartMins) {
        totalMinutes -= (lunchEndMins - lunchStartMins);
      }
    }
    
    const hours = Math.max(0, totalMinutes / 60);
    const regularHrs = Math.min(hours, 8).toFixed(2);
    setFormData(prev => ({ ...prev, regularHours: regularHrs }));
  }, [formData.timeIn, formData.lunchStart, formData.lunchEnd, formData.timeOut]);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [signature, setSignature] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null);
  const [showNoProjectsDialog, setShowNoProjectsDialog] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [reportLimitInfo, setReportLimitInfo] = useState<{ currentCount: number; limit: number } | null>(null);
  const [hasShownNoProjectsDialog, setHasShownNoProjectsDialog] = useState(false);

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

  useEffect(() => {
    if (existingReport) {
      setFormData({
        projectId: existingReport.projectId || "",
        customProjectName: existingReport.customProjectName || "",
        date: format(new Date(existingReport.date), "yyyy-MM-dd"),
        weatherType: (existingReport.weatherType || "clear") as typeof formData.weatherType,
        weatherNotes: existingReport.weatherNotes || "",
        workPerformed: existingReport.workPerformed || "",
        workActivities: (existingReport.workActivities as WorkActivityRow[]) || [],
        visitors: (existingReport.visitors as VisitorRow[]) || [],
        equipment: existingReport.equipment || "",
        inspections: existingReport.inspections || "",
        materialsDelivered: existingReport.materialsDelivered || "",
        issuesFlag: existingReport.issuesFlag || false,
        issuesDetails: existingReport.issuesDetails || "",
        safetyFlag: existingReport.safetyFlag || false,
        safetyDetails: existingReport.safetyDetails || "",
        timeIn: existingReport.timeIn || "",
        lunchStart: existingReport.lunchStart || "",
        lunchEnd: existingReport.lunchEnd || "",
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
        date: new Date(formData.date).toISOString(),
        status,
        inspectorId: user?.id,
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
          if (errorData.error === "REPORT_LIMIT_EXCEEDED") {
            setReportLimitInfo({ currentCount: errorData.currentCount, limit: errorData.limit });
            setShowUpgradeDialog(true);
            throw new Error("Free tier limit reached");
          }
          throw new Error(errorData.message || "Failed to create report");
        }
        const result = await response.json();
        reportId = result.id;
      }

      // Only save signature if it's new (base64 data, not an existing file path)
      if (signature && reportId && signature.startsWith("data:")) {
        await apiRequest("POST", `/api/reports/${reportId}/signature`, { signature });
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
    onSuccess: (reportId, status) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      
      if (status === "submitted" && reportId) {
        // Store the report ID and show email dialog
        setSubmittedReportId(reportId);
        setShowEmailDialog(true);
        toast({
          title: "Report Submitted",
          description: "Your report has been submitted. Would you like to email it?",
        });
      } else if (reportId) {
        toast({
          title: "Report Saved",
          description: "Your report has been saved as a draft",
        });
        navigate(`/reports/${reportId}`);
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save report",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSaving(false);
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
      <div className="container px-4 py-6 mx-auto max-w-2xl space-y-6 pb-32">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold">
            {isEditing ? "Edit Report" : "New Daily Report"}
          </h1>
        </div>

        <Card>
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
                <Label htmlFor="weather">Weather</Label>
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
                <Label htmlFor="weatherNotes">Weather Notes</Label>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Time Tracking</CardTitle>
            <p className="text-sm text-muted-foreground">Record your work hours for invoicing</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
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
                <Label htmlFor="lunchStart">Lunch Start</Label>
                <Input
                  id="lunchStart"
                  type="time"
                  value={formData.lunchStart}
                  onChange={(e) => setFormData(prev => ({ ...prev, lunchStart: e.target.value }))}
                  className="h-12"
                  data-testid="input-lunch-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lunchEnd">Lunch End</Label>
                <Input
                  id="lunchEnd"
                  type="time"
                  value={formData.lunchEnd}
                  onChange={(e) => setFormData(prev => ({ ...prev, lunchEnd: e.target.value }))}
                  className="h-12"
                  data-testid="input-lunch-end"
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

        <Card>
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
                contractor={activity.contractor}
                headcount={activity.headcount}
                workDescription={activity.workDescription}
                onChange={(c, h, w) => {
                  const newActivities = [...formData.workActivities];
                  newActivities[index] = { contractor: c, headcount: h, workDescription: w };
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
                workActivities: [...prev.workActivities, { contractor: "", headcount: 0, workDescription: "" }] 
              }))}
              label="Add Work Activity"
              testId="button-add-work-activity"
            />
          </CardContent>
        </Card>

        <Card>
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

        <Card>
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

        <Card>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Issues & Safety</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
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
                  Any safety incidents?
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

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between gap-2 flex-wrap">
              <span>Equipment</span>
              <VoiceInput
                onTranscript={(text) => {
                  setFormData(prev => ({
                    ...prev,
                    equipment: prev.equipment ? `${prev.equipment} ${text}` : text
                  }));
                }}
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.equipment}
              onChange={(e) => setFormData(prev => ({ ...prev, equipment: e.target.value }))}
              placeholder="List equipment used on site today... (or use voice input)"
              rows={3}
              className="resize-y"
              data-testid="textarea-equipment"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between gap-2 flex-wrap">
              <span>Materials Delivered</span>
              <VoiceInput
                onTranscript={(text) => {
                  setFormData(prev => ({
                    ...prev,
                    materialsDelivered: prev.materialsDelivered ? `${prev.materialsDelivered} ${text}` : text
                  }));
                }}
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.materialsDelivered}
              onChange={(e) => setFormData(prev => ({ ...prev, materialsDelivered: e.target.value }))}
              placeholder="List materials delivered to site today... (or use voice input)"
              rows={3}
              className="resize-y"
              data-testid="textarea-materials"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Photos</CardTitle>
          </CardHeader>
          <CardContent>
            <PhotoUpload
              photos={photos}
              onPhotosChange={setPhotos}
            />
          </CardContent>
        </Card>

        <Card>
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

        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-4 flex gap-3">
          <Button
            variant="outline"
            className="flex-1 h-12"
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
            className="flex-1 h-12"
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

      {/* Upgrade Dialog - Free Tier Limit Reached */}
      <Dialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <DialogContent data-testid="dialog-upgrade">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-500" />
              Free Tier Limit Reached
            </DialogTitle>
            <DialogDescription>
              You've used all {reportLimitInfo?.limit || 5} of your free monthly reports. 
              Upgrade to Independent Pro for unlimited reports.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-4 bg-muted/50 rounded-lg mb-4">
              <p className="text-sm text-muted-foreground">
                Reports used this month: <strong>{reportLimitInfo?.currentCount || 0}</strong> / {reportLimitInfo?.limit || 5}
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              With Independent Pro ($49/month), you get:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Unlimited daily reports</li>
                <li>PDF generation & email distribution</li>
                <li>Voice-to-text transcription</li>
                <li>Invoice generation</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowUpgradeDialog(false)}
              data-testid="button-cancel-upgrade"
            >
              Maybe Later
            </Button>
            <Button 
              onClick={() => navigate("/billing")}
              data-testid="button-upgrade"
            >
              <Crown className="w-4 h-4 mr-2" />
              Upgrade Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

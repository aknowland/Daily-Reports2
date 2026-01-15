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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Save, Send, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import type { Project, DailyReport, VisitorRow, WorkActivityRow } from "@shared/schema";

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
  });

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [signature, setSignature] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const { data: projects, isLoading: loadingProjects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

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
        projectId: existingReport.projectId,
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
        date: new Date(formData.date).toISOString(),
        status,
        inspectorId: user?.id,
      };

      let reportId = id;

      if (isEditing) {
        await apiRequest("PATCH", `/api/reports/${id}`, reportData);
      } else {
        const response = await apiRequest("POST", "/api/reports", reportData);
        const result = await response.json();
        reportId = result.id;
      }

      if (signature && reportId) {
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
      toast({
        title: status === "submitted" ? "Report Submitted" : "Report Saved",
        description: status === "submitted" 
          ? "Your report has been submitted successfully" 
          : "Your report has been saved as a draft",
      });
      navigate(`/reports/${reportId}`);
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
    if (!formData.projectId) {
      toast({
        title: "Validation Error",
        description: "Please select a project",
        variant: "destructive",
      });
      return;
    }

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
            onClick={() => window.history.back()}
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
                <Label htmlFor="project">Project *</Label>
                <Select 
                  value={formData.projectId} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, projectId: value }))}
                >
                  <SelectTrigger id="project" className="h-12" data-testid="select-project">
                    <SelectValue placeholder="Select project" />
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
            <CardTitle className="text-lg">Work Activities</CardTitle>
            <p className="text-sm text-muted-foreground">
              Add each work activity with the contractor/trade and their headcount
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
            <CardTitle className="text-lg">Inspections</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.inspections}
              onChange={(e) => setFormData(prev => ({ ...prev, inspections: e.target.value }))}
              placeholder="Describe inspections performed today..."
              rows={3}
              className="resize-y"
              data-testid="textarea-inspections"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Additional Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.workPerformed}
              onChange={(e) => setFormData(prev => ({ ...prev, workPerformed: e.target.value }))}
              placeholder="Additional work notes or general observations..."
              rows={4}
              className="resize-y"
              data-testid="textarea-work-performed"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Visitors</CardTitle>
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
                <Textarea
                  value={formData.issuesDetails}
                  onChange={(e) => setFormData(prev => ({ ...prev, issuesDetails: e.target.value }))}
                  placeholder="Describe the issues..."
                  rows={3}
                  data-testid="textarea-issues-details"
                />
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
                <Textarea
                  value={formData.safetyDetails}
                  onChange={(e) => setFormData(prev => ({ ...prev, safetyDetails: e.target.value }))}
                  placeholder="Describe the safety incident..."
                  rows={3}
                  data-testid="textarea-safety-details"
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Equipment</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.equipment}
              onChange={(e) => setFormData(prev => ({ ...prev, equipment: e.target.value }))}
              placeholder="List equipment used on site today..."
              rows={3}
              className="resize-y"
              data-testid="textarea-equipment"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Materials Delivered</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.materialsDelivered}
              onChange={(e) => setFormData(prev => ({ ...prev, materialsDelivered: e.target.value }))}
              placeholder="List materials delivered to site today..."
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
    </PageLayout>
  );
}

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { getTodayPacific } from "@/lib/timezone";
import { Button } from "@/components/ui/button";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Save, Send, ChevronDown, ChevronUp } from "lucide-react";
import type { VisitorRow, WorkActivityRow, EquipmentRow, MaterialRow } from "@shared/schema";
import { VoiceInput } from "@/components/ui/voice-input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PhotoItem {
  id?: string;
  file?: File;
  preview: string;
  caption: string;
}

interface DialogProject {
  id: string;
  name: string;
  distributionEmails?: string[] | null;
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

interface DailyReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: DialogProject;
  onSuccess?: () => void;
}

export function DailyReportDialog({ open, onOpenChange, project, onSuccess }: DailyReportDialogProps) {
  const { toast } = useToast();
  const { user, profile } = useAuth();

  const [formData, setFormData] = useState({
    projectId: project.id,
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
    issuesFlag: false,
    issuesDetails: "",
    safetyFlag: false,
    safetyDetails: "",
    safetyIncidents: 0,
    safetyNearMisses: 0,
    safetyAttendees: "" as string | number,
    safetySiteConditions: "",
    toolboxTalkTopic: "",
    notes: "",
    timeIn: "07:00",
    timeOut: "15:00",
    regularHours: "",
    otHours: "",
  });

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [signature, setSignature] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null);
  const [hasFetchedDefaults, setHasFetchedDefaults] = useState(false);

  const [sectionsOpen, setSectionsOpen] = useState({
    workActivities: false,
    inspections: false,
    additionalNotes: false,
    visitors: false,
    issues: false,
    safety: false,
    equipment: false,
    materials: false,
    photos: false,
  });

  useEffect(() => {
    if (open) {
      setFormData(prev => ({
        ...prev,
        projectId: project.id,
        date: getTodayPacific(),
      }));
      setHasFetchedDefaults(false);
    }
  }, [open, project.id]);

  useEffect(() => {
    const { timeIn, timeOut } = formData;
    const parseTime = (t: string): number | null => {
      if (!t) return null;
      const [h, m] = t.split(":").map(Number);
      if (isNaN(h) || isNaN(m)) return null;
      return h * 60 + m;
    };
    if (!timeIn || !timeOut) {
      if (formData.regularHours !== "") setFormData(prev => ({ ...prev, regularHours: "" }));
      return;
    }
    const inMins = parseTime(timeIn);
    const outMins = parseTime(timeOut);
    if (inMins === null || outMins === null || outMins <= inMins) {
      if (formData.regularHours !== "") setFormData(prev => ({ ...prev, regularHours: "" }));
      return;
    }
    const hours = Math.max(0, (outMins - inMins) / 60);
    setFormData(prev => ({ ...prev, regularHours: Math.min(hours, 8).toFixed(2) }));
  }, [formData.timeIn, formData.timeOut]);

  useEffect(() => {
    const fetchPreviousReportDefaults = async () => {
      if (!open || hasFetchedDefaults || !project.id) return;
      setHasFetchedDefaults(true);
      try {
        const response = await fetch(`/api/projects/${project.id}/latest-report`, { credentials: 'include' });
        if (!response.ok) return;
        const prev = await response.json();
        setFormData(p => ({
          ...p,
          projectId: project.id,
          date: p.date,
          weatherType: (prev.weatherType || "clear") as typeof p.weatherType,
          weatherNotes: prev.weatherNotes || "",
          weatherAM: prev.weatherAM || "",
          weatherPM: prev.weatherPM || "",
          precipitation: prev.precipitation || "",
          siteConditions: prev.siteConditions || "",
          typeOfWork: (prev.typeOfWork as string[]) || [],
          workPerformed: prev.workPerformed || "",
          workActivities: (prev.workActivities as WorkActivityRow[]) || [],
          visitors: (prev.visitors as VisitorRow[]) || [],
          equipment: prev.equipment || "",
          equipmentRows: (prev.equipmentRows as EquipmentRow[]) || [],
          inspections: prev.inspections || "",
          materialsDelivered: prev.materialsDelivered || "",
          materialRows: (prev.materialRows as MaterialRow[]) || [],
          issuesFlag: prev.issuesFlag || false,
          issuesDetails: prev.issuesDetails || "",
          safetyFlag: prev.safetyFlag || false,
          safetyDetails: prev.safetyDetails || "",
          safetyIncidents: prev.safetyIncidents || 0,
          safetyNearMisses: prev.safetyNearMisses || 0,
          safetyAttendees: prev.safetyAttendees || "",
          safetySiteConditions: prev.safetySiteConditions || "",
          toolboxTalkTopic: prev.toolboxTalkTopic || "",
          notes: prev.notes || "",
          timeIn: prev.timeIn || "07:00",
          timeOut: prev.timeOut || "15:00",
          regularHours: prev.regularHours || "",
          otHours: prev.otHours || "",
        }));
        toast({ title: "Previous report loaded", description: "Form pre-filled with values from the last report" });
      } catch (error) {
        console.error("Error fetching previous report defaults:", error);
      }
    };
    fetchPreviousReportDefaults();
  }, [open, hasFetchedDefaults, project.id, toast]);

  const saveMutation = useMutation({
    mutationFn: async (status: "draft" | "submitted") => {
      setIsSaving(true);
      const reportData = {
        ...formData,
        projectId: formData.projectId || null,
        customProjectName: formData.projectId ? null : (formData.customProjectName || null),
        date: formData.date,
        status,
        inspectorId: user?.id,
        safetyAttendees: formData.safetyAttendees !== "" ? Number(formData.safetyAttendees) : null,
      };

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
      const reportId: string = result.id;

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

      return { reportId, status };
    },
    onSuccess: async ({ reportId, status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "dashboard"] });

      if (status === "submitted" && reportId) {
        const defaultEmails = project?.distributionEmails || [];
        try {
          toast({ title: "Report Submitted", description: "Generating PDF and sending..." });
          await apiRequest("POST", `/api/reports/${reportId}/pdf`);
          if (defaultEmails.length > 0) {
            try {
              await apiRequest("POST", `/api/reports/${reportId}/distribute`, {
                recipients: defaultEmails,
                message: "",
              });
              setIsSaving(false);
              toast({ title: "Report Sent", description: `PDF generated and emailed to ${defaultEmails.length} recipient(s).` });
              onOpenChange(false);
              onSuccess?.();
            } catch (distError) {
              setIsSaving(false);
              setSubmittedReportId(reportId);
              setShowEmailDialog(true);
              toast({ title: "Distribution Failed", description: "PDF generated but email failed. Please try again.", variant: "destructive" });
            }
          } else {
            setIsSaving(false);
            setSubmittedReportId(reportId);
            setShowEmailDialog(true);
            toast({ title: "PDF Generated", description: "Enter email addresses to distribute the report." });
          }
        } catch (pdfError) {
          setIsSaving(false);
          toast({ title: "Report Submitted", description: "Report submitted but PDF generation failed.", variant: "destructive" });
          onOpenChange(false);
          onSuccess?.();
        }
      } else {
        setIsSaving(false);
        toast({ title: "Report Saved", description: "Your report has been saved as a draft" });
        onOpenChange(false);
        onSuccess?.();
      }
    },
    onError: (error) => {
      setIsSaving(false);
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to save report", variant: "destructive" });
    },
  });

  const handleSubmit = (status: "draft" | "submitted") => {
    if (status === "submitted" && !signature) {
      toast({ title: "Signature Required", description: "Please sign the report before submitting", variant: "destructive" });
      return;
    }
    saveMutation.mutate(status);
  };

  const inspectorName = (() => {
    const firstName = profile?.firstName || user?.firstName;
    const lastName = profile?.lastName || user?.lastName;
    if (firstName && lastName) return `${firstName} ${lastName}`;
    if (firstName) return firstName;
    if (lastName) return lastName;
    return user?.email || "";
  })();

  const toggleSection = (section: keyof typeof sectionsOpen) => {
    setSectionsOpen(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0">
          <DialogHeader className="p-4 pb-2 border-b">
            <DialogTitle>New Daily Report - {project.name}</DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-140px)]">
            <div className="p-4 space-y-4">
              {/* Basic Details */}
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                <h3 className="font-medium text-sm">Report Details</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="dialog-date">Date</Label>
                    <Input
                      id="dialog-date"
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                      data-testid="dialog-input-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dialog-inspector">Inspector</Label>
                    <Input
                      id="dialog-inspector"
                      value={inspectorName}
                      disabled
                      className="bg-muted"
                      data-testid="dialog-input-inspector"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="dialog-weather">Weather Type</Label>
                    <Select
                      value={formData.weatherType}
                      onValueChange={(value: any) => setFormData(prev => ({ ...prev, weatherType: value }))}
                    >
                      <SelectTrigger id="dialog-weather" data-testid="dialog-select-weather">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEATHER_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dialog-weather-notes">General Weather Notes</Label>
                    <Input
                      id="dialog-weather-notes"
                      value={formData.weatherNotes}
                      onChange={(e) => setFormData(prev => ({ ...prev, weatherNotes: e.target.value }))}
                      placeholder="Temperature, conditions..."
                      data-testid="dialog-input-weather-notes"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="dialog-weather-am">Morning (AM) Conditions</Label>
                    <Input
                      id="dialog-weather-am"
                      value={formData.weatherAM}
                      onChange={(e) => setFormData(prev => ({ ...prev, weatherAM: e.target.value }))}
                      placeholder="e.g., Clear, 58°F, Wind: calm"
                      data-testid="dialog-input-weather-am"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dialog-weather-pm">Afternoon (PM) Conditions</Label>
                    <Input
                      id="dialog-weather-pm"
                      value={formData.weatherPM}
                      onChange={(e) => setFormData(prev => ({ ...prev, weatherPM: e.target.value }))}
                      placeholder="e.g., Sunny, 72°F, Wind: SW 5mph"
                      data-testid="dialog-input-weather-pm"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="dialog-precipitation">Precipitation</Label>
                    <Input
                      id="dialog-precipitation"
                      value={formData.precipitation}
                      onChange={(e) => setFormData(prev => ({ ...prev, precipitation: e.target.value }))}
                      placeholder="e.g., None, 0.2 inches"
                      data-testid="dialog-input-precipitation"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dialog-site-conditions">Site Conditions</Label>
                    <Input
                      id="dialog-site-conditions"
                      value={formData.siteConditions}
                      onChange={(e) => setFormData(prev => ({ ...prev, siteConditions: e.target.value }))}
                      placeholder="e.g., Dry, firm ground"
                      data-testid="dialog-input-site-conditions"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Type of Work</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2" data-testid="dialog-section-type-of-work">
                    {TYPE_OF_WORK_OPTIONS.map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`dialog-work-type-${option.value}`}
                          checked={formData.typeOfWork.includes(option.value)}
                          onCheckedChange={(checked) => {
                            setFormData(prev => ({
                              ...prev,
                              typeOfWork: checked
                                ? [...prev.typeOfWork, option.value]
                                : prev.typeOfWork.filter(v => v !== option.value)
                            }));
                          }}
                          data-testid={`dialog-checkbox-work-type-${option.value}`}
                        />
                        <Label htmlFor={`dialog-work-type-${option.value}`} className="text-sm font-normal cursor-pointer">
                          {option.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Time Tracking */}
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                <h3 className="font-medium text-sm">Time Tracking</h3>
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="dialog-time-in">Time In</Label>
                    <Input
                      id="dialog-time-in"
                      type="time"
                      value={formData.timeIn}
                      onChange={(e) => setFormData(prev => ({ ...prev, timeIn: e.target.value }))}
                      data-testid="dialog-input-time-in"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dialog-time-out">Time Out</Label>
                    <Input
                      id="dialog-time-out"
                      type="time"
                      value={formData.timeOut}
                      onChange={(e) => setFormData(prev => ({ ...prev, timeOut: e.target.value }))}
                      data-testid="dialog-input-time-out"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dialog-regular-hours">Regular Hrs</Label>
                    <Input
                      id="dialog-regular-hours"
                      value={formData.regularHours}
                      disabled
                      className="bg-muted font-medium"
                      placeholder="Auto"
                      data-testid="dialog-input-regular-hours"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dialog-ot-hours">OT Hours</Label>
                    <Input
                      id="dialog-ot-hours"
                      type="number"
                      step="0.25"
                      min="0"
                      value={formData.otHours}
                      onChange={(e) => setFormData(prev => ({ ...prev, otHours: e.target.value }))}
                      placeholder="0.00"
                      data-testid="dialog-input-ot-hours"
                    />
                  </div>
                </div>
              </div>

              {/* Work Activities */}
              <Collapsible open={sectionsOpen.workActivities} onOpenChange={() => toggleSection('workActivities')}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-4 h-auto bg-muted/30 hover:bg-muted/50" data-testid="dialog-toggle-work-activities">
                    <span className="font-medium text-sm">Workforce / Work Activities {formData.workActivities.length > 0 && `(${formData.workActivities.length})`}</span>
                    {sectionsOpen.workActivities ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-4 pt-2 space-y-3 border rounded-b-lg border-t-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Trade, contractor, headcount, and work description</p>
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
                            setFormData(prev => ({ ...prev, workActivities: [...prev.workActivities, ...newActivities] }));
                          }
                        }
                      }}
                    />
                  </div>
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
                        setFormData(prev => ({ ...prev, workActivities: prev.workActivities.filter((_, i) => i !== index) }));
                      }}
                    />
                  ))}
                  <AddRowButton
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      workActivities: [...prev.workActivities, { trade: "", contractor: "", headcount: 0, workDescription: "" }]
                    }))}
                    label="Add Work Activity"
                    testId="dialog-button-add-work-activity"
                  />
                </CollapsibleContent>
              </Collapsible>

              {/* Inspections */}
              <Collapsible open={sectionsOpen.inspections} onOpenChange={() => toggleSection('inspections')}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-4 h-auto bg-muted/30 hover:bg-muted/50" data-testid="dialog-toggle-inspections">
                    <span className="font-medium text-sm">Work Performed / Inspections {formData.inspections && "(filled)"}</span>
                    {sectionsOpen.inspections ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-4 pt-2 space-y-2 border rounded-b-lg border-t-0">
                  <div className="flex items-center justify-between">
                    <VoiceInput
                      onTranscript={(text) => {
                        setFormData(prev => ({ ...prev, inspections: prev.inspections ? `${prev.inspections} ${text}` : text }));
                      }}
                    />
                  </div>
                  <Textarea
                    value={formData.inspections}
                    onChange={(e) => setFormData(prev => ({ ...prev, inspections: e.target.value }))}
                    placeholder="Describe work performed and inspections today..."
                    rows={4}
                    data-testid="dialog-textarea-inspections"
                  />
                </CollapsibleContent>
              </Collapsible>

              {/* Additional Notes */}
              <Collapsible open={sectionsOpen.additionalNotes} onOpenChange={() => toggleSection('additionalNotes')}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-4 h-auto bg-muted/30 hover:bg-muted/50" data-testid="dialog-toggle-additional-notes">
                    <span className="font-medium text-sm">Superintendent Notes {formData.notes && "(filled)"}</span>
                    {sectionsOpen.additionalNotes ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-4 pt-2 space-y-2 border rounded-b-lg border-t-0">
                  <div className="flex items-center justify-between">
                    <VoiceInput
                      onTranscript={(text) => {
                        setFormData(prev => ({ ...prev, notes: prev.notes ? `${prev.notes} ${text}` : text }));
                      }}
                    />
                  </div>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Superintendent remarks, scheduling notes, observations..."
                    rows={3}
                    data-testid="dialog-textarea-notes"
                  />
                </CollapsibleContent>
              </Collapsible>

              {/* Visitors */}
              <Collapsible open={sectionsOpen.visitors} onOpenChange={() => toggleSection('visitors')}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-4 h-auto bg-muted/30 hover:bg-muted/50" data-testid="dialog-toggle-visitors">
                    <span className="font-medium text-sm">Visitors {formData.visitors.length > 0 && `(${formData.visitors.length})`}</span>
                    {sectionsOpen.visitors ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-4 pt-2 space-y-3 border rounded-b-lg border-t-0">
                  <div className="flex items-center justify-between">
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
                            setFormData(prev => ({ ...prev, visitors: [...prev.visitors, ...newVisitors] }));
                          }
                        }
                      }}
                    />
                  </div>
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
                        setFormData(prev => ({ ...prev, visitors: prev.visitors.filter((_, i) => i !== index) }));
                      }}
                    />
                  ))}
                  <AddRowButton
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      visitors: [...prev.visitors, { name: "", company: "", notes: "" }]
                    }))}
                    label="Add Visitor"
                    testId="dialog-button-add-visitor"
                  />
                </CollapsibleContent>
              </Collapsible>

              {/* Safety */}
              <Collapsible open={sectionsOpen.safety} onOpenChange={() => toggleSection('safety')}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-4 h-auto bg-muted/30 hover:bg-muted/50" data-testid="dialog-toggle-safety">
                    <span className="font-medium text-sm">Safety {(formData.safetyIncidents > 0 || formData.safetyNearMisses > 0) && "(incidents logged)"}</span>
                    {sectionsOpen.safety ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-4 pt-2 space-y-4 border rounded-b-lg border-t-0">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="dialog-safety-incidents">Incidents</Label>
                      <Input
                        id="dialog-safety-incidents"
                        type="number"
                        min="0"
                        value={formData.safetyIncidents}
                        onChange={(e) => setFormData(prev => ({ ...prev, safetyIncidents: parseInt(e.target.value) || 0 }))}
                        data-testid="dialog-input-safety-incidents"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dialog-safety-near-misses">Near Misses</Label>
                      <Input
                        id="dialog-safety-near-misses"
                        type="number"
                        min="0"
                        value={formData.safetyNearMisses}
                        onChange={(e) => setFormData(prev => ({ ...prev, safetyNearMisses: parseInt(e.target.value) || 0 }))}
                        data-testid="dialog-input-safety-near-misses"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dialog-safety-attendees">Safety Meeting Attendees</Label>
                      <Input
                        id="dialog-safety-attendees"
                        type="number"
                        min="0"
                        value={formData.safetyAttendees}
                        onChange={(e) => setFormData(prev => ({ ...prev, safetyAttendees: e.target.value }))}
                        placeholder="0"
                        data-testid="dialog-input-safety-attendees"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dialog-toolbox-talk">Toolbox Talk Topic</Label>
                    <Input
                      id="dialog-toolbox-talk"
                      value={formData.toolboxTalkTopic}
                      onChange={(e) => setFormData(prev => ({ ...prev, toolboxTalkTopic: e.target.value }))}
                      placeholder="e.g., Fall Protection — Ladder Safety & Scaffold Tie-Off"
                      data-testid="dialog-input-toolbox-talk"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dialog-safety-site-conditions">Site Safety Conditions</Label>
                    <Textarea
                      id="dialog-safety-site-conditions"
                      value={formData.safetySiteConditions}
                      onChange={(e) => setFormData(prev => ({ ...prev, safetySiteConditions: e.target.value }))}
                      placeholder="e.g., All barricades in place. Excavation properly shored. SWPPP BMPs inspected — compliant."
                      rows={2}
                      data-testid="dialog-textarea-safety-site-conditions"
                    />
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="dialog-issues-flag">Any delays or issues today?</Label>
                      <Switch
                        id="dialog-issues-flag"
                        checked={formData.issuesFlag}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, issuesFlag: checked }))}
                        data-testid="dialog-switch-issues"
                      />
                    </div>
                    {formData.issuesFlag && (
                      <Textarea
                        value={formData.issuesDetails}
                        onChange={(e) => setFormData(prev => ({ ...prev, issuesDetails: e.target.value }))}
                        placeholder="Describe the issues..."
                        rows={2}
                        data-testid="dialog-textarea-issues-details"
                      />
                    )}
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="dialog-safety-flag">Any recordable safety incidents?</Label>
                      <Switch
                        id="dialog-safety-flag"
                        checked={formData.safetyFlag}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, safetyFlag: checked }))}
                        data-testid="dialog-switch-safety"
                      />
                    </div>
                    {formData.safetyFlag && (
                      <Textarea
                        value={formData.safetyDetails}
                        onChange={(e) => setFormData(prev => ({ ...prev, safetyDetails: e.target.value }))}
                        placeholder="Describe the safety incident..."
                        rows={2}
                        data-testid="dialog-textarea-safety-details"
                      />
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Equipment */}
              <Collapsible open={sectionsOpen.equipment} onOpenChange={() => toggleSection('equipment')}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-4 h-auto bg-muted/30 hover:bg-muted/50" data-testid="dialog-toggle-equipment">
                    <span className="font-medium text-sm">Equipment on Site {formData.equipmentRows.length > 0 && `(${formData.equipmentRows.length})`}</span>
                    {sectionsOpen.equipment ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-4 pt-2 space-y-3 border rounded-b-lg border-t-0">
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
                    testId="dialog-button-add-equipment"
                  />
                </CollapsibleContent>
              </Collapsible>

              {/* Materials */}
              <Collapsible open={sectionsOpen.materials} onOpenChange={() => toggleSection('materials')}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-4 h-auto bg-muted/30 hover:bg-muted/50" data-testid="dialog-toggle-materials">
                    <span className="font-medium text-sm">Material Deliveries {formData.materialRows.length > 0 && `(${formData.materialRows.length})`}</span>
                    {sectionsOpen.materials ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-4 pt-2 space-y-3 border rounded-b-lg border-t-0">
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
                    testId="dialog-button-add-material"
                  />
                </CollapsibleContent>
              </Collapsible>

              {/* Photos */}
              <Collapsible open={sectionsOpen.photos} onOpenChange={() => toggleSection('photos')}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-4 h-auto bg-muted/30 hover:bg-muted/50" data-testid="dialog-toggle-photos">
                    <span className="font-medium text-sm">Photos {photos.length > 0 && `(${photos.length})`}</span>
                    {sectionsOpen.photos ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-4 pt-2 border rounded-b-lg border-t-0">
                  <PhotoUpload photos={photos} onPhotosChange={setPhotos} />
                </CollapsibleContent>
              </Collapsible>

              {/* Signature */}
              <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                <h3 className="font-medium text-sm">Signature *</h3>
                <SignaturePad initialSignature={signature} onSave={setSignature} />
              </div>
            </div>
          </ScrollArea>

          <div className="flex gap-3 p-4 border-t bg-background">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleSubmit("draft")}
              disabled={isSaving}
              data-testid="dialog-button-save-draft"
            >
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Draft
            </Button>
            <Button
              className="flex-1"
              onClick={() => handleSubmit("submitted")}
              disabled={isSaving}
              data-testid="dialog-button-submit-report"
            >
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Submit Report
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {submittedReportId && (
        <EmailDistributionDialog
          open={showEmailDialog}
          onOpenChange={(open) => {
            setShowEmailDialog(open);
            if (!open) {
              onOpenChange(false);
              onSuccess?.();
            }
          }}
          reportId={submittedReportId}
          projectName={project.name}
          defaultEmails={project.distributionEmails || []}
        />
      )}
    </>
  );
}

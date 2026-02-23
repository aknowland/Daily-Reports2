import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarCheck,
  Plus,
  Trash2,
  Edit,
  FileText,
  Upload,
  Download,
  Search,
  ArrowLeft,
  Clock,
  MapPin,
  Users,
  Mic,
  Loader2,
  Eye,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import { useState, useRef } from "react";
import type { Meeting, Project } from "@shared/schema";
import { format } from "date-fns";

const MEETING_TYPE_LABELS: Record<string, string> = {
  progress: "Progress",
  safety: "Safety",
  coordination: "Coordination",
  oac: "OAC",
  pre_construction: "Pre-Construction",
  other: "Other",
};

const MEETING_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
  distributed: "Distributed",
};

const MEETING_TYPE_COLORS: Record<string, string> = {
  progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  safety: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  coordination: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  oac: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  pre_construction: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const MEETING_STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  distributed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

type MeetingFormData = {
  meetingType: string;
  projectId: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  location: string;
  attendees: string;
  absentees: string;
  agenda: string;
  discussionItems: string;
  decisions: string;
  notes: string;
  preparedBy: string;
  nextMeetingDate: string;
  meetingStatus: string;
};

const defaultFormData: MeetingFormData = {
  meetingType: "progress",
  projectId: "",
  meetingDate: format(new Date(), "yyyy-MM-dd"),
  startTime: "",
  endTime: "",
  location: "",
  attendees: "",
  absentees: "",
  agenda: "",
  discussionItems: "",
  decisions: "",
  notes: "",
  preparedBy: "",
  nextMeetingDate: "",
  meetingStatus: "draft",
};

export default function CompanyMeetingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [deletingMeeting, setDeletingMeeting] = useState<Meeting | null>(null);
  const [viewingMeeting, setViewingMeeting] = useState<Meeting | null>(null);
  const [formData, setFormData] = useState<MeetingFormData>({ ...defaultFormData });

  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const audioInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);

  const { data: meetings = [], isLoading: meetingsLoading } = useQuery<Meeting[]>({
    queryKey: ["/api/meetings"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: MeetingFormData) => {
      const res = await apiRequest("POST", "/api/meetings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      setShowCreateDialog(false);
      setFormData({ ...defaultFormData });
      toast({ title: "Meeting created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create meeting", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<MeetingFormData> }) => {
      const res = await apiRequest("PATCH", `/api/meetings/${id}`, data);
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      setEditingMeeting(null);
      if (viewingMeeting) {
        setViewingMeeting(updated);
      }
      toast({ title: "Meeting updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update meeting", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/meetings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      setDeletingMeeting(null);
      setViewingMeeting(null);
      toast({ title: "Meeting deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete meeting", description: error.message, variant: "destructive" });
    },
  });

  const generatePdfMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/meetings/${id}/pdf`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Meeting-Minutes.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      toast({ title: "PDF generated and downloaded" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to generate PDF", description: error.message, variant: "destructive" });
    },
  });

  const handleAudioUpload = async (meetingId: string, file: File) => {
    setUploadingAudio(true);
    try {
      const formData = new FormData();
      formData.append("audio", file);
      const res = await fetch(`/api/meetings/${meetingId}/audio`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      toast({ title: "Audio uploaded", description: "AI processing has started. Refresh in a moment to see results." });
    } catch (error: any) {
      toast({ title: "Failed to upload audio", description: error.message, variant: "destructive" });
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleCreateSubmit = () => {
    createMutation.mutate(formData);
  };

  const handleEditSubmit = () => {
    if (!editingMeeting) return;
    updateMutation.mutate({ id: editingMeeting.id, data: formData });
  };

  const openEditDialog = (meeting: Meeting) => {
    setFormData({
      meetingType: meeting.meetingType,
      projectId: meeting.projectId,
      meetingDate: meeting.meetingDate,
      startTime: meeting.startTime || "",
      endTime: meeting.endTime || "",
      location: meeting.location || "",
      attendees: meeting.attendees || "",
      absentees: meeting.absentees || "",
      agenda: meeting.agenda || "",
      discussionItems: meeting.discussionItems || "",
      decisions: meeting.decisions || "",
      notes: meeting.notes || "",
      preparedBy: meeting.preparedBy || "",
      nextMeetingDate: meeting.nextMeetingDate || "",
      meetingStatus: meeting.meetingStatus,
    });
    setEditingMeeting(meeting);
  };

  const filteredMeetings = meetings.filter((m) => {
    if (filterType !== "all" && m.meetingType !== filterType) return false;
    if (filterStatus !== "all" && m.meetingStatus !== filterStatus) return false;
    if (filterProject !== "all" && m.projectId !== filterProject) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        m.meetingNumber.toLowerCase().includes(q) ||
        (m.location || "").toLowerCase().includes(q) ||
        (m.attendees || "").toLowerCase().includes(q) ||
        (m.agenda || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getProjectName = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    return project?.name || "Unknown Project";
  };

  if (viewingMeeting) {
    return <MeetingDetailView
      meeting={viewingMeeting}
      projectName={getProjectName(viewingMeeting.projectId)}
      onBack={() => setViewingMeeting(null)}
      onEdit={() => openEditDialog(viewingMeeting)}
      onDelete={() => setDeletingMeeting(viewingMeeting)}
      onGeneratePdf={() => generatePdfMutation.mutate(viewingMeeting.id)}
      onAudioUpload={(file) => handleAudioUpload(viewingMeeting.id, file)}
      isGeneratingPdf={generatePdfMutation.isPending}
      isUploadingAudio={uploadingAudio}
      audioInputRef={audioInputRef}
    />;
  }

  return (
    <PageLayout title="Meetings" description="Manage meeting minutes and agendas">
      <div className="space-y-4">
        <PageHeader icon={CalendarCheck} title="Meetings" subtitle="Manage meeting minutes and agendas">
          <Button className="bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] hover:bg-[hsl(36,90%,45%)] font-semibold" onClick={() => { setFormData({ ...defaultFormData }); setShowCreateDialog(true); }} data-testid="button-create-meeting">
            <Plus className="mr-2 h-4 w-4" />
            New Meeting
          </Button>
        </PageHeader>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search meetings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-[200px]"
                data-testid="input-search-meetings"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(MEETING_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(MEETING_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter-project">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {meetingsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : filteredMeetings.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CalendarCheck className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-lg">No meetings found</p>
              <p className="text-muted-foreground text-sm mt-1">Create your first meeting to get started</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredMeetings.map((meeting) => (
              <Card
                key={meeting.id}
                className="hover-elevate cursor-pointer"
                onClick={() => setViewingMeeting(meeting)}
                data-testid={`card-meeting-${meeting.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm" data-testid={`text-meeting-number-${meeting.id}`}>{meeting.meetingNumber}</span>
                        <Badge className={`text-xs ${MEETING_TYPE_COLORS[meeting.meetingType] || ""}`}>
                          {MEETING_TYPE_LABELS[meeting.meetingType] || meeting.meetingType}
                        </Badge>
                        <Badge className={`text-xs ${MEETING_STATUS_COLORS[meeting.meetingStatus] || ""}`}>
                          {MEETING_STATUS_LABELS[meeting.meetingStatus] || meeting.meetingStatus}
                        </Badge>
                        {meeting.aiGenerationStatus === "completed" && (
                          <Badge className="text-xs bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200">
                            <Sparkles className="h-3 w-3 mr-1" /> AI Summary
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{getProjectName(meeting.projectId)}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {meeting.meetingDate}
                          {meeting.startTime && ` ${meeting.startTime}`}
                        </span>
                        {meeting.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {meeting.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); openEditDialog(meeting); }}
                        data-testid={`button-edit-meeting-${meeting.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); generatePdfMutation.mutate(meeting.id); }}
                        data-testid={`button-pdf-meeting-${meeting.id}`}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); setDeletingMeeting(meeting); }}
                        data-testid={`button-delete-meeting-${meeting.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <MeetingFormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        title="Create Meeting"
        description="Create a new meeting record"
        formData={formData}
        setFormData={setFormData}
        projects={projects}
        onSubmit={handleCreateSubmit}
        isPending={createMutation.isPending}
        submitLabel="Create Meeting"
      />

      <MeetingFormDialog
        open={!!editingMeeting}
        onOpenChange={(open) => { if (!open) setEditingMeeting(null); }}
        title="Edit Meeting"
        description="Update meeting details"
        formData={formData}
        setFormData={setFormData}
        projects={projects}
        onSubmit={handleEditSubmit}
        isPending={updateMutation.isPending}
        submitLabel="Save Changes"
      />

      <AlertDialog open={!!deletingMeeting} onOpenChange={(open) => { if (!open) setDeletingMeeting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete meeting {deletingMeeting?.meetingNumber}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingMeeting && deleteMutation.mutate(deletingMeeting.id)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-meeting"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}

function MeetingFormDialog({
  open,
  onOpenChange,
  title,
  description,
  formData,
  setFormData,
  projects,
  onSubmit,
  isPending,
  submitLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  formData: MeetingFormData;
  setFormData: (data: MeetingFormData) => void;
  projects: Project[];
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Meeting Type</Label>
              <Select
                value={formData.meetingType}
                onValueChange={(v) => setFormData({ ...formData, meetingType: v })}
              >
                <SelectTrigger data-testid="select-meeting-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MEETING_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={formData.projectId}
                onValueChange={(v) => setFormData({ ...formData, projectId: v })}
              >
                <SelectTrigger data-testid="select-meeting-project">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={formData.meetingDate}
                onChange={(e) => setFormData({ ...formData, meetingDate: e.target.value })}
                data-testid="input-meeting-date"
              />
            </div>
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                data-testid="input-meeting-start-time"
              />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                data-testid="input-meeting-end-time"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Location</Label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Meeting location"
                data-testid="input-meeting-location"
              />
            </div>
            <div className="space-y-2">
              <Label>Prepared By</Label>
              <Input
                value={formData.preparedBy}
                onChange={(e) => setFormData({ ...formData, preparedBy: e.target.value })}
                placeholder="Name of person preparing minutes"
                data-testid="input-meeting-prepared-by"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Attendees</Label>
            <Textarea
              value={formData.attendees}
              onChange={(e) => setFormData({ ...formData, attendees: e.target.value })}
              placeholder="List attendees, one per line"
              rows={3}
              data-testid="input-meeting-attendees"
            />
          </div>

          <div className="space-y-2">
            <Label>Absentees</Label>
            <Textarea
              value={formData.absentees}
              onChange={(e) => setFormData({ ...formData, absentees: e.target.value })}
              placeholder="List absent members"
              rows={2}
              data-testid="input-meeting-absentees"
            />
          </div>

          <div className="space-y-2">
            <Label>Agenda</Label>
            <Textarea
              value={formData.agenda}
              onChange={(e) => setFormData({ ...formData, agenda: e.target.value })}
              placeholder="Meeting agenda items"
              rows={4}
              data-testid="input-meeting-agenda"
            />
          </div>

          <div className="space-y-2">
            <Label>Discussion Items</Label>
            <Textarea
              value={formData.discussionItems}
              onChange={(e) => setFormData({ ...formData, discussionItems: e.target.value })}
              placeholder="Discussion points and details"
              rows={4}
              data-testid="input-meeting-discussion"
            />
          </div>

          <div className="space-y-2">
            <Label>Decisions</Label>
            <Textarea
              value={formData.decisions}
              onChange={(e) => setFormData({ ...formData, decisions: e.target.value })}
              placeholder="Key decisions made"
              rows={3}
              data-testid="input-meeting-decisions"
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes"
              rows={3}
              data-testid="input-meeting-notes"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Next Meeting Date</Label>
              <Input
                type="date"
                value={formData.nextMeetingDate}
                onChange={(e) => setFormData({ ...formData, nextMeetingDate: e.target.value })}
                data-testid="input-meeting-next-date"
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.meetingStatus}
                onValueChange={(v) => setFormData({ ...formData, meetingStatus: v })}
              >
                <SelectTrigger data-testid="select-meeting-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MEETING_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={isPending || !formData.projectId} data-testid="button-submit-meeting">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MeetingDetailView({
  meeting,
  projectName,
  onBack,
  onEdit,
  onDelete,
  onGeneratePdf,
  onAudioUpload,
  isGeneratingPdf,
  isUploadingAudio,
  audioInputRef,
}: {
  meeting: Meeting;
  projectName: string;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onGeneratePdf: () => void;
  onAudioUpload: (file: File) => void;
  isGeneratingPdf: boolean;
  isUploadingAudio: boolean;
  audioInputRef: React.RefObject<HTMLInputElement>;
}) {
  const { data: freshMeeting } = useQuery<Meeting>({
    queryKey: ["/api/meetings", meeting.id],
    refetchInterval: meeting.aiGenerationStatus === "processing" ? 3000 : false,
  });

  const displayMeeting = freshMeeting || meeting;

  return (
    <PageLayout title={`Meeting ${displayMeeting.meetingNumber}`} description={projectName}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button variant="ghost" onClick={onBack} data-testid="button-back-meetings">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Meetings
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onAudioUpload(file);
              }}
              data-testid="input-audio-upload"
            />
            <Button
              variant="outline"
              onClick={() => audioInputRef.current?.click()}
              disabled={isUploadingAudio}
              data-testid="button-upload-audio"
            >
              {isUploadingAudio ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mic className="mr-2 h-4 w-4" />}
              Upload Audio
            </Button>
            <Button
              variant="outline"
              onClick={onGeneratePdf}
              disabled={isGeneratingPdf}
              data-testid="button-generate-pdf"
            >
              {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="mr-2 h-4 w-4" />}
              Generate PDF
            </Button>
            <Button variant="outline" onClick={onEdit} data-testid="button-edit-meeting-detail">
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="destructive" onClick={onDelete} data-testid="button-delete-meeting-detail">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 flex-wrap">
                  <CalendarCheck className="h-5 w-5" />
                  Meeting Details
                  <Badge className={`text-xs ${MEETING_TYPE_COLORS[displayMeeting.meetingType] || ""}`}>
                    {MEETING_TYPE_LABELS[displayMeeting.meetingType] || displayMeeting.meetingType}
                  </Badge>
                  <Badge className={`text-xs ${MEETING_STATUS_COLORS[displayMeeting.meetingStatus] || ""}`}>
                    {MEETING_STATUS_LABELS[displayMeeting.meetingStatus] || displayMeeting.meetingStatus}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <DetailField label="Date" value={displayMeeting.meetingDate} />
                  <DetailField label="Time" value={
                    displayMeeting.startTime
                      ? `${displayMeeting.startTime}${displayMeeting.endTime ? ` - ${displayMeeting.endTime}` : ""}`
                      : null
                  } />
                  <DetailField label="Location" value={displayMeeting.location} icon={<MapPin className="h-4 w-4" />} />
                  <DetailField label="Prepared By" value={displayMeeting.preparedBy} />
                </div>
              </CardContent>
            </Card>

            {displayMeeting.attendees && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Attendees
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-meeting-attendees">{displayMeeting.attendees}</p>
                  {displayMeeting.absentees && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Absent</p>
                      <p className="text-sm whitespace-pre-wrap">{displayMeeting.absentees}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {displayMeeting.agenda && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Agenda</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-meeting-agenda">{displayMeeting.agenda}</p>
                </CardContent>
              </Card>
            )}

            {displayMeeting.discussionItems && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Discussion</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-meeting-discussion">{displayMeeting.discussionItems}</p>
                </CardContent>
              </Card>
            )}

            {displayMeeting.decisions && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Decisions</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-meeting-decisions">{displayMeeting.decisions}</p>
                </CardContent>
              </Card>
            )}

            {displayMeeting.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-meeting-notes">{displayMeeting.notes}</p>
                </CardContent>
              </Card>
            )}

            {displayMeeting.nextMeetingDate && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    Next meeting scheduled for: <span className="font-medium text-foreground">{displayMeeting.nextMeetingDate}</span>
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            {displayMeeting.aiGenerationStatus === "processing" && (
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div>
                    <p className="text-sm font-medium">AI Processing</p>
                    <p className="text-xs text-muted-foreground">Transcribing audio and generating summary...</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {displayMeeting.aiGenerationStatus === "completed" && (
              <>
                {displayMeeting.aiSummary && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-violet-500" />
                        AI Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap" data-testid="text-ai-summary">{displayMeeting.aiSummary}</p>
                    </CardContent>
                  </Card>
                )}

                {displayMeeting.aiActionItems && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-violet-500" />
                        Action Items
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap" data-testid="text-ai-action-items">{displayMeeting.aiActionItems}</p>
                    </CardContent>
                  </Card>
                )}

                {displayMeeting.aiDecisions && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-violet-500" />
                        Key Decisions
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap" data-testid="text-ai-decisions">{displayMeeting.aiDecisions}</p>
                    </CardContent>
                  </Card>
                )}

                {displayMeeting.aiKeyPoints && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-violet-500" />
                        Key Points
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap" data-testid="text-ai-key-points">{displayMeeting.aiKeyPoints}</p>
                    </CardContent>
                  </Card>
                )}

                {displayMeeting.transcription && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Mic className="h-4 w-4" />
                        Transcription
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto" data-testid="text-transcription">{displayMeeting.transcription}</p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {displayMeeting.aiGenerationStatus === "failed" && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-destructive font-medium">AI processing failed</p>
                  <p className="text-xs text-muted-foreground mt-1">Try uploading the audio again</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

function DetailField({ label, value, icon }: { label: string; value: string | null | undefined; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm flex items-center gap-1">
        {icon}
        {value}
      </p>
    </div>
  );
}

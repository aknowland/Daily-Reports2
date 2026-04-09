import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Megaphone,
  Send,
  Users,
  Mail,
  FolderOpen,
  GraduationCap,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import type { InspectorAnnouncement } from "@shared/schema";

type AnnouncementWithSender = InspectorAnnouncement & { senderName?: string };

type Project = {
  id: string;
  name: string;
  projectNumber?: string | null;
};

export default function CompanyAnnouncementsPage() {
  const { toast } = useToast();
  const { isEffectiveCompanyAdmin } = useAuth();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [filterType, setFilterType] = useState<"all" | "project" | "dsa_class">("all");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterDsaClass, setFilterDsaClass] = useState<"1" | "2" | "3">("1");
  const [sendEmailOption, setSendEmailOption] = useState(false);

  const { data: announcements = [], isLoading } = useQuery<AnnouncementWithSender[]>({
    queryKey: ["/api/announcements"],
    staleTime: 30000,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    staleTime: 60000,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const recipientFilter =
        filterType === "all"
          ? { type: "all" as const }
          : filterType === "project"
          ? { type: "project" as const, projectId: filterProjectId }
          : { type: "dsa_class" as const, dsaClass: parseInt(filterDsaClass) as 1 | 2 | 3 };

      return apiRequest("POST", "/api/announcements", {
        title,
        body,
        recipientFilter,
        sendEmail: sendEmailOption,
      });
    },
    onSuccess: () => {
      toast({ title: "Announcement sent", description: `Delivered to inspectors.` });
      setTitle("");
      setBody("");
      setFilterType("all");
      setFilterProjectId("");
      setSendEmailOption(false);
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
    },
    onError: () => {
      toast({ title: "Failed to send", variant: "destructive" });
    },
  });

  const canSend =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (filterType !== "project" || filterProjectId.length > 0);

  const formatFilter = (a: AnnouncementWithSender) => {
    const f = a.recipientFilter as any;
    if (!f || f.type === "all") return "All Inspectors";
    if (f.type === "project") return `Project: ${f.projectId}`;
    if (f.type === "dsa_class") return `DSA Class ${f.dsaClass}`;
    return "Unknown";
  };

  return (
    <PageLayout>
      <PageHeader title="Announcements">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-amber-500" />
          <span className="text-sm text-muted-foreground">
            Broadcast messages to your inspector team
          </span>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Compose panel */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="w-4 h-4" />
                New Announcement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ann-title">Title</Label>
                <Input
                  id="ann-title"
                  placeholder="e.g. Safety Reminder — Fall Protection"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  data-testid="input-announcement-title"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ann-body">Message</Label>
                <Textarea
                  id="ann-body"
                  placeholder="Write your announcement here..."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  data-testid="input-announcement-body"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Recipients</Label>
                <Select
                  value={filterType}
                  onValueChange={(v) => setFilterType(v as any)}
                >
                  <SelectTrigger data-testid="select-recipient-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <span className="flex items-center gap-2">
                        <Users className="w-3 h-3" /> All Inspectors
                      </span>
                    </SelectItem>
                    <SelectItem value="project">
                      <span className="flex items-center gap-2">
                        <FolderOpen className="w-3 h-3" /> Specific Project
                      </span>
                    </SelectItem>
                    <SelectItem value="dsa_class">
                      <span className="flex items-center gap-2">
                        <GraduationCap className="w-3 h-3" /> DSA Class
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {filterType === "project" && (
                <div className="space-y-1.5">
                  <Label>Project</Label>
                  <Select value={filterProjectId} onValueChange={setFilterProjectId}>
                    <SelectTrigger data-testid="select-filter-project">
                      <SelectValue placeholder="Select project..." />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.projectNumber ? `${p.projectNumber} — ` : ""}{p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {filterType === "dsa_class" && (
                <div className="space-y-1.5">
                  <Label>DSA Class</Label>
                  <Select value={filterDsaClass} onValueChange={(v) => setFilterDsaClass(v as any)}>
                    <SelectTrigger data-testid="select-filter-class">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Class 1</SelectItem>
                      <SelectItem value="2">Class 2</SelectItem>
                      <SelectItem value="3">Class 3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="send-email"
                  checked={sendEmailOption}
                  onCheckedChange={(v) => setSendEmailOption(v === true)}
                  data-testid="checkbox-send-email"
                />
                <Label htmlFor="send-email" className="flex items-center gap-1.5 cursor-pointer font-normal">
                  <Mail className="w-3.5 h-3.5" />
                  Also send via email
                </Label>
              </div>

              <Button
                className="w-full"
                onClick={() => sendMutation.mutate()}
                disabled={!canSend || sendMutation.isPending}
                data-testid="button-send-announcement"
              >
                <Send className="w-4 h-4 mr-2" />
                {sendMutation.isPending ? "Sending..." : "Send Announcement"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Sent log */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Sent Announcements
            </h2>
            <Badge variant="secondary">{announcements.length} total</Badge>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Megaphone className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No announcements yet</p>
                <p className="text-sm text-muted-foreground">
                  Send your first announcement to the team.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {announcements.map((a) => (
                <Card key={a.id} data-testid={`card-announcement-${a.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold truncate" title={a.title}>{a.title}</h3>
                          {a.emailSent && (
                            <Badge variant="outline" className="text-xs flex items-center gap-1 no-default-hover-elevate no-default-active-elevate">
                              <Mail className="w-2.5 h-2.5" /> Emailed
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.body}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {a.recipientCount} recipient{a.recipientCount !== 1 ? "s" : ""}
                            {" · "}
                            {formatFilter(a)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {a.sentAt
                              ? new Date(a.sentAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                  timeZone: "America/Los_Angeles",
                                })
                              : "—"}
                          </span>
                          {a.senderName && (
                            <span>By {a.senderName}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

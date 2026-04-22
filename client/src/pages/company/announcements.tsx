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
  UserCheck,
  Search,
} from "lucide-react";
import type { InspectorAnnouncement, AnnouncementRecipientFilter } from "@shared/schema";

type AnnouncementWithSender = InspectorAnnouncement & { senderName?: string };

type Project = {
  id: string;
  name: string;
  projectNumber?: string | null;
};

type CompanyMemberWithUser = {
  id: string;
  userId: string;
  role: string;
  user?: {
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
};

export default function CompanyAnnouncementsPage() {
  const { toast } = useToast();
  const { activeCompany } = useAuth();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [filterType, setFilterType] = useState<"all" | "project" | "dsa_class" | "specific_users">("all");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterDsaClass, setFilterDsaClass] = useState<1 | 2 | 3>(1);
  const [filterSpecificUserIds, setFilterSpecificUserIds] = useState<string[]>([]);
  const [inspectorSearch, setInspectorSearch] = useState("");
  const [sendEmailOption, setSendEmailOption] = useState(false);

  const { data: announcements = [], isLoading } = useQuery<AnnouncementWithSender[]>({
    queryKey: ["/api/announcements"],
    staleTime: 30000,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    staleTime: 60000,
  });

  const { data: companyMembers = [] } = useQuery<CompanyMemberWithUser[]>({
    queryKey: ["/api/companies", activeCompany?.id, "members"],
    enabled: !!activeCompany?.id,
    staleTime: 60000,
  });

  const inspectorMembers = companyMembers.filter(m => m.role === "inspector");

  const filteredInspectors = inspectorSearch.trim()
    ? inspectorMembers.filter(m => {
        const name = `${m.user?.firstName || ""} ${m.user?.lastName || ""}`.toLowerCase();
        const email = (m.user?.email || "").toLowerCase();
        const q = inspectorSearch.toLowerCase();
        return name.includes(q) || email.includes(q);
      })
    : inspectorMembers;

  const sendMutation = useMutation({
    mutationFn: async () => {
      let recipientFilter: AnnouncementRecipientFilter;
      if (filterType === "all") {
        recipientFilter = { type: "all" };
      } else if (filterType === "project") {
        recipientFilter = { type: "project", projectId: filterProjectId };
      } else if (filterType === "dsa_class") {
        recipientFilter = { type: "dsa_class", dsaClass: filterDsaClass };
      } else {
        recipientFilter = { type: "specific_users", userIds: filterSpecificUserIds };
      }

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
      setFilterSpecificUserIds([]);
      setInspectorSearch("");
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
    (filterType !== "project" || filterProjectId.length > 0) &&
    (filterType !== "specific_users" || filterSpecificUserIds.length > 0);

  const getInspectorDisplayName = (m: CompanyMemberWithUser) => {
    const name = `${m.user?.firstName || ""} ${m.user?.lastName || ""}`.trim();
    return name || m.user?.email || m.userId;
  };

  const formatFilter = (a: AnnouncementWithSender) => {
    const f = a.recipientFilter as AnnouncementRecipientFilter | null;
    if (!f || f.type === "all") return "All Inspectors";
    if (f.type === "project") {
      const proj = projects.find(p => p.id === f.projectId);
      return `Project: ${proj ? proj.name : f.projectId}`;
    }
    if (f.type === "dsa_class") return `DSA Class ${f.dsaClass}`;
    if (f.type === "specific_users") return `${f.userIds.length} specific inspector${f.userIds.length !== 1 ? "s" : ""}`;
    return "Unknown";
  };

  const toggleSpecificUser = (userId: string) => {
    setFilterSpecificUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
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
                  onValueChange={(v) => {
                    if (v === "all" || v === "project" || v === "dsa_class" || v === "specific_users") {
                      setFilterType(v);
                      setFilterSpecificUserIds([]);
                      setInspectorSearch("");
                    }
                  }}
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
                    <SelectItem value="specific_users">
                      <span className="flex items-center gap-2">
                        <UserCheck className="w-3 h-3" /> Specific Inspectors
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
                  <Select
                    value={String(filterDsaClass)}
                    onValueChange={(v) => {
                      const n = parseInt(v, 10);
                      if (n === 1 || n === 2 || n === 3) setFilterDsaClass(n);
                    }}
                  >
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

              {filterType === "specific_users" && (
                <div className="space-y-1.5">
                  <Label>
                    Select Inspectors
                    {filterSpecificUserIds.length > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        {filterSpecificUserIds.length} selected
                      </span>
                    )}
                  </Label>
                  <div className="relative mb-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search inspectors..."
                      value={inspectorSearch}
                      onChange={(e) => setInspectorSearch(e.target.value)}
                      className="pl-8 h-8 text-sm"
                      data-testid="input-inspector-search"
                    />
                  </div>
                  <div className="border rounded-none max-h-52 overflow-y-auto">
                    {filteredInspectors.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {inspectorSearch ? "No matching inspectors" : "No inspectors in company"}
                      </p>
                    ) : (
                      <>
                        {filterSpecificUserIds.length > 0 && (
                          <div className="p-1.5 border-b">
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => setFilterSpecificUserIds([])}
                              data-testid="button-clear-inspector-selection"
                            >
                              Clear selection
                            </button>
                          </div>
                        )}
                        {filteredInspectors.map((m) => {
                          const displayName = getInspectorDisplayName(m);
                          const email = m.user?.email;
                          const isSelected = filterSpecificUserIds.includes(m.userId);
                          return (
                            <label
                              key={m.userId}
                              className={`flex items-start gap-2.5 p-2.5 cursor-pointer hover:bg-muted/50 transition-colors ${isSelected ? "bg-muted/30" : ""}`}
                              data-testid={`label-inspector-${m.userId}`}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSpecificUser(m.userId)}
                                className="mt-0.5"
                                data-testid={`checkbox-inspector-${m.userId}`}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium leading-tight truncate">{displayName}</p>
                                {email && (
                                  <p className="text-xs text-muted-foreground truncate">{email}</p>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </>
                    )}
                  </div>
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

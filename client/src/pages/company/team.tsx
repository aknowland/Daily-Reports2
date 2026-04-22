import { useQuery, useMutation, useQueries } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { IorAgreementDialog } from "@/components/ior-agreement-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  ArrowLeft,
  AlertCircle,
  AlertTriangle,
  Mail,
  Shield,
  Trash2,
  UserPlus,
  HardHat,
  Loader2,
  FolderOpen,
  ClipboardList,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
  MoreVertical,
  Download,
  Search,
  FileDown,
  Upload,
  Pencil,
  BarChart2,
  ArrowUpDown,
  ShieldAlert,
  Columns2,
  Calendar,
  Briefcase,
  Clock,
  DollarSign,
  Award,
} from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CompanyMember, User, Project, Invite, JoinRequest, IorAgreement, IorAgreementWithDetails, TeamInspector, CertEntry, InspectorDocument } from "@shared/schema";
import { normalizeCerts, INSPECTOR_DOCUMENT_TYPES } from "@shared/schema";

const KNOWLAND_COMPANY_NAME = "Knowland Construction Services";

type MemberWithUser = CompanyMember & { user?: User };

type InviteWithDetails = Invite & { projects?: Project[] };

type JoinRequestWithUser = JoinRequest & { 
  user?: User;
  proposedProjectName?: string | null;
  proposedProjectNumber?: string | null;
  proposedProjectAddress?: string | null;
  proposedProjectClient?: string | null;
};

type ProjectMember = { projectId: string; userId: string; assignedAt: string };

export default function CompanyTeamPage() {
  const { toast } = useToast();
  const { activeCompany, isCompanyAdmin, isEffectiveCompanyAdmin, isCompaniesLoading, profile } = useAuth();
  const [memberToRemove, setMemberToRemove] = useState<MemberWithUser | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [memberToAssignProjects, setMemberToAssignProjects] = useState<MemberWithUser | null>(null);
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());
  const [showIorDialog, setShowIorDialog] = useState(false);
  const [editingIorAgreement, setEditingIorAgreement] = useState<IorAgreementWithDetails | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTeamInspectorDialog, setShowTeamInspectorDialog] = useState(false);
  const [editingTeamInspector, setEditingTeamInspector] = useState<TeamInspector | null>(null);
  const [teamInspectorToDelete, setTeamInspectorToDelete] = useState<TeamInspector | null>(null);
  const [teamInspectorSearchQuery, setTeamInspectorSearchQuery] = useState("");
  const [resumeTarget, setResumeTarget] = useState<{type: 'member' | 'team-inspector', id: string, name: string} | null>(null);
  const [resumeData, setResumeData] = useState<any>(null);
  const [showResumePreview, setShowResumePreview] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const [editingMemberName, setEditingMemberName] = useState<{userId: string; firstName: string; lastName: string} | null>(null);
  const [recruitingPrefill, setRecruitingPrefill] = useState<TeamInspector | null>(null);
  const [compareSelected, setCompareSelected] = useState<Set<string>>(new Set());
  const [showCompareModal, setShowCompareModal] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("addInspector") === "true") {
      const county = params.get("county") || "";
      const certNumber = params.get("certNumber") || "";
      const prefillData = {
        id: "",
        companyId: "",
        firstName: params.get("firstName") || "",
        lastName: params.get("lastName") || "",
        phone: params.get("phone") || "",
        county: county,
        licenseNumber: certNumber,
        licenseState: "CA",
        email: "",
        title: "DSA Certified Inspector",
        certifications: [{ name: "DSA Certified", expiresAt: null }] as CertEntry[],
        notes: "Recruited from DSA registry.",
        bio: "",
        profilePhotoUrl: "",
        yearsExperience: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as TeamInspector;
      setRecruitingPrefill(prefillData);
      setEditingTeamInspector(prefillData);
      setShowTeamInspectorDialog(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const [inviteForm, setInviteForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "inspector" as "inspector" | "admin",
    projectIds: [] as string[],
  });

  const { data: members = [], isLoading, error } = useQuery<MemberWithUser[]>({
    queryKey: ["/api/companies", activeCompany?.id, "members"],
    enabled: !!activeCompany?.id && isEffectiveCompanyAdmin,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/companies", activeCompany?.id, "projects"],
    enabled: !!activeCompany?.id && isEffectiveCompanyAdmin,
  });

  const { data: pendingInvites = [] } = useQuery<InviteWithDetails[]>({
    queryKey: ["/api/admin/invites"],
    enabled: isEffectiveCompanyAdmin,
    select: (data) => data.filter(inv => inv.companyId === activeCompany?.id && inv.status === "pending"),
  });

  const { data: joinRequests = [] } = useQuery<JoinRequestWithUser[]>({
    queryKey: ["/api/companies", activeCompany?.id, "join-requests"],
    enabled: !!activeCompany?.id && isEffectiveCompanyAdmin,
  });

  const { data: iorAgreements = [], isLoading: isIorLoading } = useQuery<IorAgreementWithDetails[]>({
    queryKey: ["/api/ior-agreements"],
    enabled: !!activeCompany?.id && isEffectiveCompanyAdmin,
  });

  const { data: teamInspectors = [], isLoading: isTeamInspectorsLoading } = useQuery<TeamInspector[]>({
    queryKey: ["/api/companies", activeCompany?.id, "team-inspectors"],
    enabled: !!activeCompany?.id && isEffectiveCompanyAdmin,
  });

  // Inspector workload data (current month hours + project breakdown)
  const { data: workloadData = [], isLoading: isWorkloadLoading } = useQuery<Array<{
    inspectorId: string;
    name: string;
    title: string | null;
    email: string | null;
    role: string;
    availabilityDate: string | null;
    activeProjectCount: number;
    totalHoursThisMonth: number;
    utilizationPct: number;
    projects: Array<{ projectId: string; projectName: string; hoursThisMonth: number }>;
  }>>({
    queryKey: ["/api/company/inspector-workload", activeCompany?.id],
    queryFn: async () => {
      const res = await fetch("/api/company/inspector-workload", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load workload data");
      return res.json();
    },
    enabled: !!activeCompany?.id && isEffectiveCompanyAdmin,
  });

  const [expandedInspectorIds, setExpandedInspectorIds] = useState<Set<string>>(new Set());
  const [workloadSearchQuery, setWorkloadSearchQuery] = useState("");

  // Performance scorecard state
  const [performanceDays, setPerformanceDays] = useState(90);
  const [performanceSortKey, setPerformanceSortKey] = useState<"totalReports" | "submissionRate" | "avgDailyHours" | "safetyIncidents" | "distinctProjects">("totalReports");
  const [performanceSortDir, setPerformanceSortDir] = useState<"asc" | "desc">("desc");
  const [expandedPerformanceIds, setExpandedPerformanceIds] = useState<Set<string>>(new Set());
  const [performanceSearchQuery, setPerformanceSearchQuery] = useState("");

  type PerformanceRow = {
    inspectorId: string;
    name: string;
    title: string | null;
    email: string | null;
    totalReports: number;
    totalHours: number;
    avgDailyHours: number;
    safetyIncidents: number;
    safetyNearMisses: number;
    safetyFlagCount: number;
    distinctProjects: number;
    submissionRate: number;
    reportsByMonth: Array<{ month: string; reportCount: number }>;
  };

  const { data: performanceData = [], isLoading: isPerformanceLoading } = useQuery<PerformanceRow[]>({
    queryKey: ["/api/company/inspector-performance", activeCompany?.id, performanceDays],
    queryFn: async () => {
      const res = await fetch(`/api/company/inspector-performance?days=${performanceDays}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load performance data");
      return res.json();
    },
    enabled: !!activeCompany?.id && isEffectiveCompanyAdmin,
  });

  const filteredPerformance = useMemo(() => {
    let data = [...performanceData];
    if (performanceSearchQuery.trim()) {
      const q = performanceSearchQuery.toLowerCase();
      data = data.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.title || "").toLowerCase().includes(q) ||
        (i.email || "").toLowerCase().includes(q)
      );
    }
    data.sort((a, b) => {
      const aVal = a[performanceSortKey];
      const bVal = b[performanceSortKey];
      return performanceSortDir === "desc" ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
    });
    return data;
  }, [performanceData, performanceSearchQuery, performanceSortKey, performanceSortDir]);

  function togglePerformanceSort(key: typeof performanceSortKey) {
    if (performanceSortKey === key) {
      setPerformanceSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setPerformanceSortKey(key);
      setPerformanceSortDir("desc");
    }
  }

  const filteredWorkload = useMemo(() => {
    if (!workloadSearchQuery.trim()) return workloadData;
    const q = workloadSearchQuery.toLowerCase();
    return workloadData.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.title || "").toLowerCase().includes(q) ||
      (i.email || "").toLowerCase().includes(q)
    );
  }, [workloadData, workloadSearchQuery]);

  // Cert expiry data covers BOTH user inspectors and team inspectors
  const { data: certExpiryData = [] } = useQuery<Array<{
    id: string; name: string; type: "user" | "team";
    certifications: Array<{ name: string; expiresAt: string | null; certNumber?: string; daysUntilExpiry: number | null }>;
  }>>({
    queryKey: ["/api/cert-expiry"],
    enabled: !!activeCompany?.id && isEffectiveCompanyAdmin,
  });

  const pendingJoinRequests = joinRequests.filter(r => r.status === "pending");
  
  // Filter team inspectors based on search query
  const filteredTeamInspectors = useMemo(() => {
    if (!teamInspectorSearchQuery.trim()) return teamInspectors;
    const query = teamInspectorSearchQuery.toLowerCase();
    return teamInspectors.filter((inspector) => {
      const displayName = `${inspector.firstName} ${inspector.lastName}`.toLowerCase();
      const email = inspector.email?.toLowerCase() || "";
      const title = inspector.title?.toLowerCase() || "";
      return displayName.includes(query) || email.includes(query) || title.includes(query);
    });
  }, [teamInspectors, teamInspectorSearchQuery]);
  
  // Filter members based on search query
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const query = searchQuery.toLowerCase();
    return members.filter((member) => {
      // Build display name with fallbacks for partial names
      const firstName = member.user?.firstName || "";
      const lastName = member.user?.lastName || "";
      const displayName = [firstName, lastName].filter(Boolean).join(" ");
      const email = member.user?.email || "";
      const role = member.role || "";
      
      return (
        displayName.toLowerCase().includes(query) ||
        firstName.toLowerCase().includes(query) ||
        lastName.toLowerCase().includes(query) ||
        email.toLowerCase().includes(query) ||
        role.toLowerCase().includes(query)
      );
    });
  }, [members, searchQuery]);
  
  const generateIorPdfMutation = useMutation({
    mutationFn: async (agreementId: string) => {
      const response = await fetch(`/api/ior-agreements/${agreementId}/pdf`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to generate PDF');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IOR-Agreement-${agreementId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ior-agreements"] });
      toast({ title: "PDF generated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to generate PDF", variant: "destructive" });
    },
  });

  const deleteIorMutation = useMutation({
    mutationFn: async (agreementId: string) => {
      return apiRequest("DELETE", `/api/ior-agreements/${agreementId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ior-agreements"] });
      toast({ title: "IOR Agreement deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete IOR Agreement", variant: "destructive" });
    },
  });

  const approveJoinMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return apiRequest("POST", `/api/join-requests/${requestId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "join-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "members"] });
      toast({
        title: "Request Approved",
        description: "User has been added to the company.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve request.",
        variant: "destructive",
      });
    },
  });

  const rejectJoinMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return apiRequest("POST", `/api/join-requests/${requestId}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "join-requests"] });
      toast({
        title: "Request Rejected",
        description: "Join request has been rejected.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject request.",
        variant: "destructive",
      });
    },
  });

  const isKnowlandCompany = activeCompany?.name?.includes("Knowland Construction");

  const createInviteMutation = useMutation({
    mutationFn: async (data: typeof inviteForm & { companyId: string }) => {
      return apiRequest("POST", "/api/admin/invites", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      setShowInviteDialog(false);
      setInviteForm({ email: "", firstName: "", lastName: "", role: "inspector", projectIds: [] });
      toast({
        title: "Invitation Sent",
        description: "The invitation has been sent successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send invitation",
        variant: "destructive",
      });
    },
  });

  const deleteInviteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/invites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({
        title: "Invitation Cancelled",
        description: "The invitation has been cancelled.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to cancel invitation.",
        variant: "destructive",
      });
    },
  });

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany?.id) return;
    createInviteMutation.mutate({
      ...inviteForm,
      companyId: activeCompany.id,
    });
  };

  const toggleProject = (projectId: string) => {
    setInviteForm(prev => ({
      ...prev,
      projectIds: prev.projectIds.includes(projectId)
        ? prev.projectIds.filter(id => id !== projectId)
        : [...prev.projectIds, projectId],
    }));
  };

  const toggleMemberExpanded = (memberId: string) => {
    setExpandedMembers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(memberId)) {
        newSet.delete(memberId);
      } else {
        newSet.add(memberId);
      }
      return newSet;
    });
  };

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest("PATCH", `/api/companies/${activeCompany?.id}/members/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-companies"] });
      toast({
        title: "Role Updated",
        description: "Member role has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update member role.",
        variant: "destructive",
      });
    },
  });

  const updateMemberNameMutation = useMutation({
    mutationFn: async ({ userId, firstName, lastName }: { userId: string; firstName: string; lastName: string }) => {
      return apiRequest("PATCH", `/api/companies/${activeCompany?.id}/members/${userId}/name`, { firstName, lastName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "members"] });
      setEditingMemberName(null);
      toast({
        title: "Name Updated",
        description: "Team member name has been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update name.",
        variant: "destructive",
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/companies/${activeCompany?.id}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "members"] });
      setMemberToRemove(null);
      toast({
        title: "Member Removed",
        description: "Member has been removed from the company.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove member.",
        variant: "destructive",
      });
    },
  });

  const addToProjectMutation = useMutation({
    mutationFn: async ({ projectId, userId }: { projectId: string; userId: string }) => {
      return apiRequest("POST", `/api/projects/${projectId}/members`, { userId });
    },
    onSuccess: () => {
      // Invalidate all project member queries for this company's projects
      projects.forEach(p => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", p.id, "members"] });
      });
      queryClient.invalidateQueries({ queryKey: ["/api/my-projects"] });
      toast({
        title: "Project Assigned",
        description: "Member has been assigned to the project.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to assign member to project.",
        variant: "destructive",
      });
    },
  });

  const removeFromProjectMutation = useMutation({
    mutationFn: async ({ projectId, userId }: { projectId: string; userId: string }) => {
      return apiRequest("DELETE", `/api/projects/${projectId}/members/${userId}`);
    },
    onSuccess: () => {
      // Invalidate all project member queries for this company's projects
      projects.forEach(p => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", p.id, "members"] });
      });
      queryClient.invalidateQueries({ queryKey: ["/api/my-projects"] });
      toast({
        title: "Project Unassigned",
        description: "Member has been removed from the project.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove member from project.",
        variant: "destructive",
      });
    },
  });

  // Team Inspector mutations
  const createTeamInspectorMutation = useMutation({
    mutationFn: async (data: {
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      title?: string;
      licenseNumber?: string;
      licenseState?: string;
      certifications?: CertEntry[];
      notes?: string;
    }) => {
      return apiRequest("POST", `/api/companies/${activeCompany?.id}/team-inspectors`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "team-inspectors"] });
      setShowTeamInspectorDialog(false);
      setEditingTeamInspector(null);
      toast({ title: "Team inspector created successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create team inspector",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const updateTeamInspectorMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TeamInspector> }) => {
      return apiRequest("PATCH", `/api/team-inspectors/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "team-inspectors"] });
      setShowTeamInspectorDialog(false);
      setEditingTeamInspector(null);
      toast({ title: "Team inspector updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update team inspector",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const deleteTeamInspectorMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/team-inspectors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "team-inspectors"] });
      setTeamInspectorToDelete(null);
      toast({ title: "Team inspector deleted" });
    },
    onError: () => {
      toast({
        title: "Failed to delete team inspector",
        variant: "destructive",
      });
    },
  });

  const resumeParseMutation = useMutation({
    mutationFn: async ({ file, target }: { file: File, target: {type: string, id: string} }) => {
      const formData = new FormData();
      formData.append("resume", file);
      const url = target.type === 'member' 
        ? `/api/admin/users/${target.id}/parse-resume`
        : `/api/team-inspectors/${target.id}/parse-resume`;
      const res = await fetch(url, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message || "Failed to parse resume");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResumeData(data);
      setShowResumePreview(true);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to parse resume",
        variant: "destructive",
      });
    },
  });

  const applyResumeMutation = useMutation({
    mutationFn: async ({ target, data }: { target: {type: string, id: string}, data: any }) => {
      const url = target.type === 'member'
        ? `/api/admin/users/${target.id}/apply-resume`
        : `/api/team-inspectors/${target.id}/apply-resume`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to apply resume data");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "team-inspectors"] });
      setShowResumePreview(false);
      setResumeData(null);
      setResumeTarget(null);
      toast({ title: "Resume Applied", description: "Profile has been updated with resume data." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to apply resume data", variant: "destructive" });
    },
  });

  // Wait for companies data to load before checking permissions
  if (isCompaniesLoading) {
    return (
      <PageLayout title="Team Members">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-12 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!isEffectiveCompanyAdmin || !activeCompany) {
    const isInspectorModeOn = isCompanyAdmin && profile?.preferAdminMode === false;
    return (
      <PageLayout title="Team Members">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Access Denied</p>
              <p className="text-muted-foreground text-center">
                {isInspectorModeOn
                  ? "You are viewing as an inspector. Toggle off inspector mode in the header to manage team members."
                  : "You must be a company admin to view this page"}
              </p>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  if (isLoading) {
    return (
      <PageLayout title="Team Members">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-12 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout title="Team Members">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg">
          <div className="flex items-center gap-2 mb-6">
            <Button variant="ghost" size="sm" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="w-12 h-12 text-destructive mb-4" />
              <p className="text-lg font-medium">Failed to load team members</p>
              <p className="text-muted-foreground">Please try again later</p>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Team Members">
      <div className="container px-4 py-6 mx-auto max-w-screen-lg space-y-6">
        <input
          ref={resumeInputRef}
          type="file"
          accept=".pdf,.docx,.doc,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && resumeTarget) {
              resumeParseMutation.mutate({ file, target: resumeTarget });
              e.target.value = "";
            }
          }}
          data-testid="input-admin-resume-upload"
        />
        <PageHeader icon={Users} title="Team" subtitle={`Manage team for ${activeCompany.name}`}>
          <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
            <DialogTrigger asChild>
              <Button className="bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] hover:bg-[hsl(36,90%,45%)] font-semibold" data-testid="button-invite-user">
                <UserPlus className="w-4 h-4 mr-2" />
                Invite User
              </Button>
            </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Invite Team Member</DialogTitle>
                  <DialogDescription>
                    Send an invitation to join {activeCompany.name}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleInviteSubmit}>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">Email Address</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        placeholder="user@example.com"
                        value={inviteForm.email}
                        onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                        required
                        data-testid="input-invite-email"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="invite-first-name">First Name</Label>
                        <Input
                          id="invite-first-name"
                          placeholder="First name"
                          value={inviteForm.firstName}
                          onChange={(e) => setInviteForm({ ...inviteForm, firstName: e.target.value })}
                          data-testid="input-invite-first-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="invite-last-name">Last Name</Label>
                        <Input
                          id="invite-last-name"
                          placeholder="Last name"
                          value={inviteForm.lastName}
                          onChange={(e) => setInviteForm({ ...inviteForm, lastName: e.target.value })}
                          data-testid="input-invite-last-name"
                        />
                      </div>
                    </div>

                    {!isKnowlandCompany && (
                      <div className="rounded-md border bg-muted/50 p-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <AlertCircle className="w-4 h-4 text-primary" />
                          Subscription Information
                        </div>
                        <p className="text-xs text-muted-foreground">
                          New users will need an active subscription to create unlimited reports:
                        </p>
                        <div className="text-xs space-y-1 pl-2">
                          <p><strong>Free:</strong> 5 reports/month (no payment required)</p>
                          <p><strong>Independent Pro:</strong> $49/month (unlimited reports)</p>
                          <p><strong>Company User:</strong> $79/month per user</p>
                          <p><strong>Company Account:</strong> $499/month (unlimited users)</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Users can start with Free and upgrade later.
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="invite-role">Role</Label>
                      <Select
                        value={inviteForm.role}
                        onValueChange={(role: "inspector" | "admin") => 
                          setInviteForm({ ...inviteForm, role })
                        }
                      >
                        <SelectTrigger data-testid="select-invite-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inspector">
                            <div className="flex items-center gap-2">
                              <HardHat className="w-4 h-4" />
                              Inspector
                            </div>
                          </SelectItem>
                          <SelectItem value="admin">
                            <div className="flex items-center gap-2">
                              <Shield className="w-4 h-4" />
                              Company Admin
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {projects.length > 0 && (
                      <div className="space-y-2">
                        <Label>Assign to Projects (optional)</Label>
                        <div className="border rounded-md max-h-32 overflow-y-auto p-2 space-y-1">
                          {projects.map((project) => (
                            <label
                              key={project.id}
                              className="flex items-center gap-2 p-2 rounded hover-elevate cursor-pointer"
                            >
                              <Checkbox
                                checked={inviteForm.projectIds.includes(project.id)}
                                onCheckedChange={() => toggleProject(project.id)}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{project.name}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowInviteDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createInviteMutation.isPending || !inviteForm.email}
                      data-testid="button-send-invite"
                    >
                      {createInviteMutation.isPending && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      Send Invite
                    </Button>
                  </DialogFooter>
                </form>
            </DialogContent>
          </Dialog>
        </PageHeader>

        {/* Compare bar — shown above tabs when any inspectors selected */}
        {isEffectiveCompanyAdmin && compareSelected.size >= 2 && (
          <div className="flex items-center justify-between gap-3 p-3 mb-4 border rounded bg-muted/40" data-testid="compare-bar">
            <span className="text-sm font-medium">{compareSelected.size} inspector{compareSelected.size > 1 ? "s" : ""} selected for comparison</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCompareSelected(new Set())}
                data-testid="button-clear-compare"
              >
                <X className="w-3 h-3 mr-1" /> Clear
              </Button>
              <Button
                size="sm"
                onClick={() => setShowCompareModal(true)}
                data-testid="button-open-compare-modal"
              >
                <Columns2 className="w-4 h-4 mr-1" /> Compare Selected
              </Button>
            </div>
          </div>
        )}

        <Tabs defaultValue="members" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="members" className="flex items-center gap-2" data-testid="tab-members">
              <Users className="w-4 h-4" />
              Members
              <Badge variant="secondary" className="ml-1 no-default-hover-elevate no-default-active-elevate">
                {members.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="requests" className="flex items-center gap-2" data-testid="tab-requests">
              <ClipboardList className="w-4 h-4" />
              Join Requests
              {pendingJoinRequests.length > 0 && (
                <Badge variant="default" className="ml-1 no-default-hover-elevate no-default-active-elevate">
                  {pendingJoinRequests.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="ior" className="flex items-center gap-2" data-testid="tab-ior-agreements">
              <FileText className="w-4 h-4" />
              IOR Agreements
              <Badge variant="secondary" className="ml-1 no-default-hover-elevate no-default-active-elevate">
                {iorAgreements.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="team-inspectors" className="flex items-center gap-2" data-testid="tab-team-inspectors">
              <HardHat className="w-4 h-4" />
              Team Inspectors
              <Badge variant="secondary" className="ml-1 no-default-hover-elevate no-default-active-elevate">
                {teamInspectors.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="workload" className="flex items-center gap-2" data-testid="tab-workload">
              <ClipboardList className="w-4 h-4" />
              Workload
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-2" data-testid="tab-performance">
              <BarChart2 className="w-4 h-4" />
              Performance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="space-y-4">
            {members.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search team members by name, email, or role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-members"
                />
              </div>
            )}
            
            {members.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No team members</p>
                  <p className="text-muted-foreground">
                    Invite team members to your company
                  </p>
                </CardContent>
              </Card>
            ) : filteredMembers.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No members found</p>
                  <p className="text-muted-foreground mb-4">
                    No team members match "{searchQuery}"
                  </p>
                  <Button variant="outline" onClick={() => setSearchQuery("")} data-testid="button-clear-search">
                    Clear Search
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredMembers.map((member) => {
                  const isCurrentUser = member.userId === profile?.userId;
                  const displayName = member.user?.firstName && member.user?.lastName
                    ? `${member.user.firstName} ${member.user.lastName}`
                    : member.user?.email || "Unknown User";
                  const isExpanded = expandedMembers.has(member.id);

                  const isInspectorRole = member.role === "inspector";
                  const isCompareChecked = compareSelected.has(member.userId);
                  const canAddToCompare = isCompareChecked || compareSelected.size < 3;

                  return (
                    <Card key={member.id} data-testid={`card-member-${member.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isEffectiveCompanyAdmin && isInspectorRole && (
                              <Checkbox
                                checked={isCompareChecked}
                                onCheckedChange={(checked) => {
                                  const next = new Set(compareSelected);
                                  if (checked && canAddToCompare) {
                                    next.add(member.userId);
                                  } else {
                                    next.delete(member.userId);
                                  }
                                  setCompareSelected(next);
                                }}
                                disabled={!canAddToCompare}
                                className="shrink-0"
                                data-testid={`checkbox-compare-${member.userId}`}
                                title={!canAddToCompare ? "Max 3 inspectors" : "Select for comparison"}
                              />
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0"
                              onClick={() => toggleMemberExpanded(member.id)}
                              data-testid={`button-expand-${member.id}`}
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </Button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate" data-testid={`text-member-name-${member.id}`}>
                                  {displayName}
                                </p>
                                {isEffectiveCompanyAdmin && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingMemberName({
                                        userId: member.userId,
                                        firstName: member.user?.firstName || "",
                                        lastName: member.user?.lastName || "",
                                      });
                                    }}
                                    data-testid={`button-edit-name-${member.id}`}
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                )}
                                {isCurrentUser && (
                                  <Badge variant="secondary" className="text-xs">You</Badge>
                                )}
                              </div>
                              {member.user?.email && (
                                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                                  <Mail className="w-3 h-3" />
                                  <span className="truncate">{member.user.email}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(`/api/resume/generate/${member.userId}`, '_blank')}
                              data-testid={`button-generate-resume-${member.userId}`}
                            >
                              <FileDown className="w-4 h-4 mr-1" />
                              Resume
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const name = [member.user?.firstName, member.user?.lastName].filter(Boolean).join(" ") || member.user?.email || "User";
                                setResumeTarget({ type: 'member', id: member.userId, name });
                                resumeInputRef.current?.click();
                              }}
                              disabled={resumeParseMutation.isPending}
                              data-testid={`button-import-resume-${member.userId}`}
                            >
                              {resumeParseMutation.isPending && resumeTarget?.id === member.userId ? (
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              ) : (
                                <Upload className="w-4 h-4 mr-1" />
                              )}
                              Import
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setMemberToAssignProjects(member)}
                              data-testid={`button-manage-projects-${member.id}`}
                            >
                              <FolderOpen className="w-4 h-4 mr-1" />
                              Manage
                            </Button>
                            <Select
                              value={member.role}
                              onValueChange={(value) => updateRoleMutation.mutate({ userId: member.userId, role: value })}
                              disabled={isCurrentUser || updateRoleMutation.isPending}
                            >
                              <SelectTrigger className="w-32" data-testid={`select-role-${member.id}`}>
                                <Shield className="w-3 h-3 mr-1" />
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="inspector">Inspector</SelectItem>
                                <SelectItem value="admin">Company Admin</SelectItem>
                              </SelectContent>
                            </Select>
                            {!isCurrentUser && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setMemberToRemove(member)}
                                data-testid={`button-remove-${member.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {isExpanded && (
                          <>
                            <MemberProjectsList 
                              member={member} 
                              projects={projects} 
                            />
                            {isEffectiveCompanyAdmin && (
                              <MemberDocumentVault member={member} />
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Pending Invitations Section */}
            {pendingInvites.length > 0 && (
              <div className="space-y-4 mt-8">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">Pending Invitations</h2>
                  <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">
                    {pendingInvites.length}
                  </Badge>
                </div>
                {pendingInvites.map((invite) => (
                  <Card key={invite.id} className="border-dashed" data-testid={`card-pending-invite-${invite.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            <p className="font-medium truncate">
                              {invite.firstName || invite.lastName
                                ? `${invite.firstName || ''} ${invite.lastName || ''}`.trim()
                                : invite.email}
                            </p>
                            {(invite.firstName || invite.lastName) && (
                              <span className="text-sm text-muted-foreground truncate">{invite.email}</span>
                            )}
                            <Badge variant="outline" className="text-xs no-default-hover-elevate no-default-active-elevate">
                              {invite.role === "admin" ? (
                                <><Shield className="w-3 h-3 mr-1" />Company Admin</>
                              ) : (
                                <><HardHat className="w-3 h-3 mr-1" />Inspector</>
                              )}
                            </Badge>
                          </div>
                          {invite.projects && invite.projects.length > 0 && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                              <FolderOpen className="w-3 h-3" />
                              <span>{invite.projects.length} project{invite.projects.length > 1 ? "s" : ""} assigned</span>
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteInviteMutation.mutate(invite.id)}
                          disabled={deleteInviteMutation.isPending}
                          data-testid={`button-cancel-invite-${invite.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="requests" className="space-y-4">
            {pendingJoinRequests.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <UserPlus className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No pending requests</p>
                  <p className="text-muted-foreground">
                    Join requests from users will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {pendingJoinRequests.map((request) => {
                  const displayName = request.user?.firstName && request.user?.lastName
                    ? `${request.user.firstName} ${request.user.lastName}`
                    : request.user?.email || "Unknown User";
                  
                  const hasProposedProject = !!request.proposedProjectName;

                  return (
                    <Card key={request.id} data-testid={`card-request-${request.id}`}>
                      <CardContent className="p-4">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium" data-testid={`text-request-name-${request.id}`}>
                                {displayName}
                              </p>
                              {request.user?.email && (
                                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                                  <Mail className="w-3 h-3" />
                                  <span className="truncate">{request.user.email}</span>
                                </div>
                              )}
                              {request.message && (
                                <p className="text-sm mt-2 text-muted-foreground italic">
                                  "{request.message}"
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-2">
                                Requested {new Date(request.createdAt || Date.now()).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => rejectJoinMutation.mutate(request.id)}
                                disabled={rejectJoinMutation.isPending || approveJoinMutation.isPending}
                                data-testid={`button-reject-${request.id}`}
                              >
                                <X className="w-4 h-4 mr-1" />
                                Reject
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => approveJoinMutation.mutate(request.id)}
                                disabled={approveJoinMutation.isPending || rejectJoinMutation.isPending}
                                data-testid={`button-approve-${request.id}`}
                              >
                                <Check className="w-4 h-4 mr-1" />
                                {hasProposedProject ? "Approve All" : "Approve"}
                              </Button>
                            </div>
                          </div>

                          {hasProposedProject && (
                            <div className="border-t pt-3">
                              <div className="flex items-center gap-2 mb-2">
                                <FolderOpen className="w-4 h-4 text-primary" />
                                <span className="text-sm font-medium">Proposed Project Assignment</span>
                              </div>
                              <div className="bg-muted/50 rounded-md p-3 space-y-1 text-sm">
                                <div className="flex gap-2">
                                  <span className="text-muted-foreground w-24">Name:</span>
                                  <span className="font-medium" data-testid={`text-proposed-name-${request.id}`}>
                                    {request.proposedProjectName}
                                  </span>
                                </div>
                                {request.proposedProjectNumber && (
                                  <div className="flex gap-2">
                                    <span className="text-muted-foreground w-24">Number:</span>
                                    <span data-testid={`text-proposed-number-${request.id}`}>
                                      {request.proposedProjectNumber}
                                    </span>
                                  </div>
                                )}
                                {request.proposedProjectClient && (
                                  <div className="flex gap-2">
                                    <span className="text-muted-foreground w-24">Client:</span>
                                    <span>{request.proposedProjectClient}</span>
                                  </div>
                                )}
                                {request.proposedProjectAddress && (
                                  <div className="flex gap-2">
                                    <span className="text-muted-foreground w-24">Address:</span>
                                    <span>{request.proposedProjectAddress}</span>
                                  </div>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-2">
                                Approving will create this project and assign the inspector to it.
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="ior" className="space-y-4">
            <div className="flex justify-end mb-4">
              <Button onClick={() => { setEditingIorAgreement(null); setShowIorDialog(true); }} data-testid="button-create-ior">
                <Plus className="w-4 h-4 mr-2" />
                Generate IOR Agreement
              </Button>
            </div>

            {isIorLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-12 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : iorAgreements.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No IOR Agreements</p>
                  <p className="text-muted-foreground text-center">
                    Create IOR agreements to set inspector pay terms for projects
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {iorAgreements.map((agreement) => (
                  <Card key={agreement.id} data-testid={`card-ior-${agreement.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{agreement.consultantName || "Unknown Consultant"}</p>
                            {agreement.rate && (
                              <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">
                                ${agreement.rate}/hr
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            {agreement.contract && (
                              <span className="font-medium">{agreement.contract.contractNumber}</span>
                            )}
                            <span>{agreement.project?.name || "Unknown Project"}</span>
                            <span>{agreement.clientName}</span>
                          </div>
                          {agreement.agreementDate && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Agreement Date: {new Date(agreement.agreementDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateIorPdfMutation.mutate(agreement.id)}
                            disabled={generateIorPdfMutation.isPending}
                            data-testid={`button-download-ior-${agreement.id}`}
                          >
                            <Download className="w-4 h-4 mr-1" />
                            PDF
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-ior-menu-${agreement.id}`}>
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => { setEditingIorAgreement(agreement); setShowIorDialog(true); }}
                                data-testid={`button-edit-ior-${agreement.id}`}
                              >
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => deleteIorMutation.mutate(agreement.id)}
                                data-testid={`button-delete-ior-${agreement.id}`}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="team-inspectors" className="space-y-4">
            {/* Certifications expiring soon — inline summary (both user inspectors and team inspectors) */}
            {(() => {
              const expiring: Array<{ inspectorName: string; certName: string; daysUntil: number; expiresAt: string }> = [];
              for (const insp of certExpiryData) {
                for (const cert of insp.certifications) {
                  if (!cert.expiresAt || cert.daysUntilExpiry === null) continue;
                  if (cert.daysUntilExpiry <= 60) expiring.push({ inspectorName: insp.name, certName: cert.name, daysUntil: cert.daysUntilExpiry, expiresAt: cert.expiresAt });
                }
              }
              if (expiring.length === 0) return null;
              expiring.sort((a, b) => a.daysUntil - b.daysUntil);
              return (
                <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3" data-testid="cert-expiry-summary">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="w-4 h-4" />
                      {expiring.length} certification{expiring.length !== 1 ? "s" : ""} expiring within 60 days
                    </div>
                    <Link href="/company/cert-expiry" className="text-xs text-amber-700 dark:text-amber-400 underline underline-offset-2" data-testid="link-cert-tracker">
                      View all →
                    </Link>
                  </div>
                  <div className="space-y-1">
                    {expiring.slice(0, 5).map((e, i) => (
                      <div key={i} className="flex items-center justify-between text-xs text-amber-800 dark:text-amber-300" data-testid={`cert-expiry-item-${i}`}>
                        <span><strong>{e.inspectorName}</strong> — {e.certName}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${e.daysUntil <= 0 ? "border-red-500 text-red-600" : e.daysUntil <= 7 ? "border-red-400 text-red-600" : "border-amber-500 text-amber-700 dark:text-amber-400"}`}
                        >
                          {e.daysUntil <= 0 ? "EXPIRED" : `${e.daysUntil}d`}
                        </Badge>
                      </div>
                    ))}
                    {expiring.length > 5 && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">+ {expiring.length - 5} more</p>
                    )}
                  </div>
                </div>
              );
            })()}
            <div className="flex justify-between items-center gap-4 mb-4">
              {teamInspectors.length > 0 && (
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search team inspectors by name, email, or title..."
                    value={teamInspectorSearchQuery}
                    onChange={(e) => setTeamInspectorSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-team-inspectors"
                  />
                </div>
              )}
              <Button onClick={() => { setEditingTeamInspector(null); setShowTeamInspectorDialog(true); }} data-testid="button-add-team-inspector">
                <Plus className="w-4 h-4 mr-2" />
                Add Team Inspector
              </Button>
            </div>

            {isTeamInspectorsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : teamInspectors.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <HardHat className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium">No team inspectors</p>
                  <p className="text-muted-foreground text-center">
                    Add inspector profiles for people who haven't joined the system yet.
                    <br />
                    You can merge their profiles when they create accounts.
                  </p>
                </CardContent>
              </Card>
            ) : filteredTeamInspectors.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <Search className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No team inspectors match your search</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {filteredTeamInspectors.map((inspector) => {
                  const tiKey = `ti:${inspector.id}`;
                  const tiChecked = compareSelected.has(tiKey);
                  const tiCanAdd = tiChecked || compareSelected.size < 3;
                  return (
                  <Card key={inspector.id} className="hover-elevate" data-testid={`card-team-inspector-${inspector.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <Checkbox
                            checked={tiChecked}
                            onCheckedChange={(checked) => {
                              const next = new Set(compareSelected);
                              if (checked && tiCanAdd) { next.add(tiKey); } else { next.delete(tiKey); }
                              setCompareSelected(next);
                            }}
                            disabled={!tiCanAdd}
                            className="mt-1 shrink-0"
                            data-testid={`checkbox-compare-ti-${inspector.id}`}
                            title={!tiCanAdd ? "Max 3 inspectors" : "Select for comparison"}
                          />
                          <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium">
                              {inspector.firstName} {inspector.lastName}
                            </h3>
                            <Badge 
                              variant={inspector.status === "active" ? "default" : "secondary"}
                              className="no-default-hover-elevate no-default-active-elevate"
                            >
                              {inspector.status === "active" ? "Merged" : "Pending"}
                            </Badge>
                          </div>
                          {inspector.title && (
                            <p className="text-sm text-muted-foreground mt-1">{inspector.title}</p>
                          )}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                            {inspector.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {inspector.email}
                              </span>
                            )}
                            {inspector.licenseNumber && (
                              <span>
                                License: {inspector.licenseNumber} ({inspector.licenseState || "N/A"})
                              </span>
                            )}
                          </div>
                          {inspector.certifications && inspector.certifications.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {normalizeCerts(inspector.certifications).map((cert, idx) => {
                                const daysUntil = cert.expiresAt
                                  ? Math.ceil((new Date(cert.expiresAt).getTime() - Date.now()) / 86400000)
                                  : null;
                                const isExpired = daysUntil !== null && daysUntil <= 0;
                                const isExpiringSoon = daysUntil !== null && daysUntil > 0 && daysUntil <= 60;
                                const isValid = daysUntil !== null && daysUntil > 60;
                                return (
                                  <Badge
                                    key={idx}
                                    variant={isExpired ? "destructive" : "outline"}
                                    className={`text-xs no-default-hover-elevate no-default-active-elevate ${
                                      isExpiringSoon ? "border-amber-500 text-amber-700 dark:text-amber-400" :
                                      isValid ? "border-green-500 text-green-700 dark:text-green-400" : ""
                                    }`}
                                  >
                                    {cert.name}
                                    {cert.expiresAt && ` · ${isExpired ? "EXP" : isExpiringSoon ? "⚠" : ""} ${cert.expiresAt}`}
                                  </Badge>
                                );
                              })}
                            </div>
                          )}
                          {inspector.notes && (
                            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{inspector.notes}</p>
                          )}
                        </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/api/resume/generate/team/${inspector.id}`, '_blank')}
                            data-testid={`button-generate-resume-${inspector.id}`}
                          >
                            <FileDown className="w-4 h-4 mr-1" />
                            Resume
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-team-inspector-menu-${inspector.id}`}>
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => { setEditingTeamInspector(inspector); setShowTeamInspectorDialog(true); }}
                                data-testid={`button-edit-team-inspector-${inspector.id}`}
                              >
                                Edit Profile
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  const name = `${inspector.firstName} ${inspector.lastName}`.trim();
                                  setResumeTarget({ type: 'team-inspector', id: inspector.id, name });
                                  setTimeout(() => resumeInputRef.current?.click(), 100);
                                }}
                                data-testid={`button-import-resume-team-${inspector.id}`}
                              >
                                Import Resume
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setTeamInspectorToDelete(inspector)}
                                data-testid={`button-delete-team-inspector-${inspector.id}`}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ─── Workload Tab ─────────────────────────────────────────────────────── */}
          <TabsContent value="workload" className="space-y-4">
            <div className="flex items-center justify-between gap-4 mb-2">
              <p className="text-sm text-muted-foreground">
                Current month hours for all team members. Standard month = 160 hrs.
              </p>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search inspectors..."
                  value={workloadSearchQuery}
                  onChange={e => setWorkloadSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-workload-search"
                />
              </div>
            </div>

            {isWorkloadLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : filteredWorkload.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm" data-testid="workload-empty">
                No inspectors found.
              </div>
            ) : (
              <div className="border rounded overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-[2fr_1fr_1fr_2fr_1fr] gap-2 px-4 py-2 bg-muted/50 border-b text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Inspector</span>
                  <span className="text-center">Projects</span>
                  <span className="text-center">Hrs / Mo</span>
                  <span>Utilization</span>
                  <span className="text-center">Available</span>
                </div>
                {filteredWorkload.map(inspector => {
                  const isExpanded = expandedInspectorIds.has(inspector.inspectorId);
                  const pct = inspector.utilizationPct;
                  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-500";
                  return (
                    <div key={inspector.inspectorId} data-testid={`workload-row-${inspector.inspectorId}`}>
                      <button
                        type="button"
                        className="w-full grid grid-cols-[2fr_1fr_1fr_2fr_1fr] gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors border-b last:border-b-0 items-center"
                        onClick={() => {
                          const next = new Set(expandedInspectorIds);
                          if (next.has(inspector.inspectorId)) next.delete(inspector.inspectorId);
                          else next.add(inspector.inspectorId);
                          setExpandedInspectorIds(next);
                        }}
                        data-testid={`button-expand-workload-${inspector.inspectorId}`}
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                          <div>
                            <p className="font-medium text-sm" data-testid={`workload-name-${inspector.inspectorId}`}>{inspector.name}</p>
                            {inspector.title && <p className="text-xs text-muted-foreground">{inspector.title}</p>}
                          </div>
                        </div>
                        <div className="text-center">
                          <span className="text-sm font-medium" data-testid={`workload-projects-${inspector.inspectorId}`}>{inspector.activeProjectCount}</span>
                        </div>
                        <div className="text-center">
                          <span className="text-sm font-semibold" data-testid={`workload-hours-${inspector.inspectorId}`}>{inspector.totalHoursThisMonth.toFixed(1)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${barColor}`}
                              style={{ width: `${pct}%` }}
                              data-testid={`workload-bar-${inspector.inspectorId}`}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                        </div>
                        <div className="text-center">
                          <span className="text-xs text-muted-foreground" data-testid={`workload-availability-${inspector.inspectorId}`}>
                            {inspector.availabilityDate || "—"}
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-6 py-3 bg-muted/20 border-b space-y-2" data-testid={`workload-detail-${inspector.inspectorId}`}>
                          {inspector.projects.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No project activity this month.</p>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Project Breakdown — This Month</p>
                              {inspector.projects.map(proj => (
                                <div key={proj.projectId} className="flex items-center justify-between text-sm" data-testid={`workload-project-${inspector.inspectorId}-${proj.projectId}`}>
                                  <span className="text-muted-foreground">{proj.projectName}</span>
                                  <span className="font-medium">{proj.hoursThisMonth.toFixed(1)} hrs</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ─── Performance Tab ──────────────────────────────────────────────────── */}
          <TabsContent value="performance" className="space-y-4">
            <div className="flex items-center justify-between gap-4 mb-2 flex-wrap">
              <div className="flex items-center gap-3">
                <p className="text-sm text-muted-foreground">Inspector performance scorecard — read-only.</p>
                <Select value={String(performanceDays)} onValueChange={v => setPerformanceDays(Number(v))}>
                  <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-performance-days">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="180">Last 180 days</SelectItem>
                    <SelectItem value="365">Last 365 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search inspectors..."
                  value={performanceSearchQuery}
                  onChange={e => setPerformanceSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-performance-search"
                />
              </div>
            </div>

            {isPerformanceLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : filteredPerformance.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm" data-testid="performance-empty">
                No inspectors found.
              </div>
            ) : (
              <div className="border rounded overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 bg-muted/50 border-b text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Inspector</span>
                  <button type="button" className="flex items-center gap-1 hover:text-foreground transition-colors text-left" onClick={() => togglePerformanceSort("totalReports")} data-testid="sort-total-reports">
                    Reports <ArrowUpDown className="w-3 h-3" />
                  </button>
                  <button type="button" className="flex items-center gap-1 hover:text-foreground transition-colors text-left" onClick={() => togglePerformanceSort("avgDailyHours")} data-testid="sort-avg-hours">
                    Avg Hrs/Day <ArrowUpDown className="w-3 h-3" />
                  </button>
                  <button type="button" className="flex items-center gap-1 hover:text-foreground transition-colors text-left" onClick={() => togglePerformanceSort("safetyIncidents")} data-testid="sort-safety">
                    Safety <ArrowUpDown className="w-3 h-3" />
                  </button>
                  <button type="button" className="flex items-center gap-1 hover:text-foreground transition-colors text-left" onClick={() => togglePerformanceSort("distinctProjects")} data-testid="sort-projects">
                    Projects <ArrowUpDown className="w-3 h-3" />
                  </button>
                  <button type="button" className="flex items-center gap-1 hover:text-foreground transition-colors text-left" onClick={() => togglePerformanceSort("submissionRate")} data-testid="sort-submission-rate">
                    Submit% <ArrowUpDown className="w-3 h-3" />
                  </button>
                </div>
                {filteredPerformance.map(inspector => {
                  const isExpanded = expandedPerformanceIds.has(inspector.inspectorId);
                  const maxMonthly = Math.max(1, ...inspector.reportsByMonth.map(m => m.reportCount));
                  const safetyTotal = inspector.safetyIncidents + inspector.safetyNearMisses;
                  const submissionColor = inspector.submissionRate >= 80 ? "text-green-600 dark:text-green-400" : inspector.submissionRate >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                  return (
                    <div key={inspector.inspectorId} data-testid={`performance-row-${inspector.inspectorId}`}>
                      <button
                        type="button"
                        className="w-full grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors border-b last:border-b-0 items-center"
                        onClick={() => {
                          const next = new Set(expandedPerformanceIds);
                          if (next.has(inspector.inspectorId)) next.delete(inspector.inspectorId);
                          else next.add(inspector.inspectorId);
                          setExpandedPerformanceIds(next);
                        }}
                        data-testid={`btn-performance-expand-${inspector.inspectorId}`}
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate" data-testid={`text-performance-name-${inspector.inspectorId}`}>{inspector.name}</p>
                            {inspector.title && <p className="text-xs text-muted-foreground truncate">{inspector.title}</p>}
                          </div>
                        </div>
                        <span className="text-sm font-medium" data-testid={`text-performance-reports-${inspector.inspectorId}`}>{inspector.totalReports}</span>
                        <span className="text-sm" data-testid={`text-performance-avghours-${inspector.inspectorId}`}>{inspector.avgDailyHours.toFixed(1)} hrs</span>
                        <div className="flex items-center gap-1" data-testid={`text-performance-safety-${inspector.inspectorId}`}>
                          {safetyTotal > 0 && <ShieldAlert className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                          <span className={`text-sm ${safetyTotal > 0 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>
                            {safetyTotal > 0 ? `${inspector.safetyIncidents}I / ${inspector.safetyNearMisses}NM` : "—"}
                          </span>
                        </div>
                        <span className="text-sm" data-testid={`text-performance-projects-${inspector.inspectorId}`}>{inspector.distinctProjects}</span>
                        <span className={`text-sm font-medium ${submissionColor}`} data-testid={`text-performance-submission-${inspector.inspectorId}`}>
                          {inspector.submissionRate.toFixed(0)}%
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-2 bg-muted/20 border-b space-y-4">
                          {/* Monthly trend */}
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Monthly Report Trend (Last 6 Months)</p>
                            {inspector.reportsByMonth.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No reports in this period.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {inspector.reportsByMonth.map(m => (
                                  <div key={m.month} className="flex items-center gap-3" data-testid={`text-performance-month-${inspector.inspectorId}-${m.month}`}>
                                    <span className="text-xs text-muted-foreground w-16 flex-shrink-0">{m.month}</span>
                                    <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                                      <div
                                        className="h-2 bg-blue-500 rounded-full transition-all"
                                        style={{ width: `${Math.round((m.reportCount / maxMonthly) * 100)}%` }}
                                      />
                                    </div>
                                    <span className="text-xs font-medium w-6 text-right">{m.reportCount}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Safety breakdown */}
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Safety Breakdown</p>
                            <div className="grid grid-cols-3 gap-4">
                              <div className="text-center" data-testid={`text-performance-safety-incidents-${inspector.inspectorId}`}>
                                <p className="text-lg font-bold text-red-600 dark:text-red-400">{inspector.safetyIncidents}</p>
                                <p className="text-xs text-muted-foreground">Incidents</p>
                              </div>
                              <div className="text-center" data-testid={`text-performance-safety-nearmisses-${inspector.inspectorId}`}>
                                <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{inspector.safetyNearMisses}</p>
                                <p className="text-xs text-muted-foreground">Near Misses</p>
                              </div>
                              <div className="text-center" data-testid={`text-performance-safety-flags-${inspector.inspectorId}`}>
                                <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{inspector.safetyFlagCount}</p>
                                <p className="text-xs text-muted-foreground">Flagged Reports</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!editingMemberName} onOpenChange={() => setEditingMemberName(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Member Name</DialogTitle>
            <DialogDescription>
              Update the name for this team member.
            </DialogDescription>
          </DialogHeader>
          {editingMemberName && (
            <form onSubmit={(e) => {
              e.preventDefault();
              updateMemberNameMutation.mutate(editingMemberName);
            }}>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="edit-first-name">First Name</Label>
                    <Input
                      id="edit-first-name"
                      placeholder="First name"
                      value={editingMemberName.firstName}
                      onChange={(e) => setEditingMemberName({ ...editingMemberName, firstName: e.target.value })}
                      data-testid="input-edit-first-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-last-name">Last Name</Label>
                    <Input
                      id="edit-last-name"
                      placeholder="Last name"
                      value={editingMemberName.lastName}
                      onChange={(e) => setEditingMemberName({ ...editingMemberName, lastName: e.target.value })}
                      data-testid="input-edit-last-name"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingMemberName(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateMemberNameMutation.isPending || (!editingMemberName.firstName.trim() && !editingMemberName.lastName.trim())}
                  data-testid="button-save-name"
                >
                  {updateMemberNameMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Save Name
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {memberToRemove?.user?.firstName || memberToRemove?.user?.email || "this member"} from {activeCompany.name}? They will lose access to all company projects.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => memberToRemove && removeMemberMutation.mutate(memberToRemove.userId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-remove"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Project Assignment Dialog */}
      {memberToAssignProjects && (
        <ProjectAssignmentDialog
          member={memberToAssignProjects}
          projects={projects}
          onClose={() => setMemberToAssignProjects(null)}
          onAddToProject={(projectId) => addToProjectMutation.mutate({ projectId, userId: memberToAssignProjects.userId })}
          onRemoveFromProject={(projectId) => removeFromProjectMutation.mutate({ projectId, userId: memberToAssignProjects.userId })}
          isLoading={addToProjectMutation.isPending || removeFromProjectMutation.isPending}
        />
      )}

      {/* IOR Agreement Dialog */}
      <IorAgreementDialog
        open={showIorDialog}
        onOpenChange={(open) => {
          setShowIorDialog(open);
          if (!open) setEditingIorAgreement(null);
        }}
        agreement={editingIorAgreement}
        companyId={activeCompany?.id || ""}
        companyName={activeCompany?.name || ""}
      />

      {/* Team Inspector Create/Edit Dialog */}
      <TeamInspectorDialog
        open={showTeamInspectorDialog}
        onOpenChange={(open) => {
          setShowTeamInspectorDialog(open);
          if (!open) {
            setEditingTeamInspector(null);
            setRecruitingPrefill(null);
          }
        }}
        inspector={editingTeamInspector}
        onSave={(data) => {
          if (editingTeamInspector && editingTeamInspector.id && !recruitingPrefill) {
            updateTeamInspectorMutation.mutate({ id: editingTeamInspector.id, data });
          } else {
            createTeamInspectorMutation.mutate(data);
          }
        }}
        isLoading={createTeamInspectorMutation.isPending || updateTeamInspectorMutation.isPending}
      />

      {/* Team Inspector Delete Confirmation */}
      <AlertDialog open={!!teamInspectorToDelete} onOpenChange={() => setTeamInspectorToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team Inspector?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the profile for {teamInspectorToDelete?.firstName} {teamInspectorToDelete?.lastName}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-inspector">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => teamInspectorToDelete && deleteTeamInspectorMutation.mutate(teamInspectorToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-inspector"
            >
              {deleteTeamInspectorMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showResumePreview} onOpenChange={setShowResumePreview}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Resume Data Preview
            </DialogTitle>
            <DialogDescription>
              Extracted data for {resumeTarget?.name}. Click "Apply" to update their profile.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            {resumeData && (
              <div className="space-y-4 text-sm">
                {(resumeData.firstName || resumeData.lastName) && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Name</p>
                    <p>{[resumeData.firstName, resumeData.lastName].filter(Boolean).join(" ")}</p>
                  </div>
                )}
                {resumeData.title && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Title</p>
                    <p>{resumeData.title}</p>
                  </div>
                )}
                {resumeData.bio && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Professional Summary</p>
                    <p className="whitespace-pre-wrap">{resumeData.bio}</p>
                  </div>
                )}
                {(resumeData.phone || resumeData.email) && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Contact</p>
                    {resumeData.phone && <p>Phone: {resumeData.phone}</p>}
                    {resumeData.email && <p>Email: {resumeData.email}</p>}
                  </div>
                )}
                {(resumeData.licenseNumber || resumeData.licenseState) && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">License</p>
                    <p>{[resumeData.licenseNumber, resumeData.licenseState].filter(Boolean).join(" - ")}</p>
                  </div>
                )}
                {resumeData.certifications?.length > 0 && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Certifications ({resumeData.certifications.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {normalizeCerts(resumeData.certifications).map((cert, i) => (
                        <Badge key={i} variant="secondary">{cert.name}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {resumeData.education?.length > 0 && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Education ({resumeData.education.length})</p>
                    <div className="space-y-1">
                      {resumeData.education.map((edu: any, i: number) => (
                        <p key={i}>{edu.degree} - {edu.school}{edu.status ? ` (${edu.status})` : ""}</p>
                      ))}
                    </div>
                  </div>
                )}
                {resumeData.jobHistory?.length > 0 && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Work History ({resumeData.jobHistory.length})</p>
                    <div className="space-y-2">
                      {resumeData.jobHistory.map((job: any, i: number) => (
                        <div key={i} className="border-l-2 border-border pl-3">
                          <p className="font-medium">{job.title}</p>
                          <p className="text-muted-foreground">{job.company}{job.startDate ? ` (${job.startDate} - ${job.endDate || "Present"})` : ""}</p>
                          {job.description && <p className="mt-1">{job.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {resumeData.references?.length > 0 && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">References ({resumeData.references.length})</p>
                    <div className="space-y-1">
                      {resumeData.references.map((ref: any, i: number) => (
                        <p key={i}>{ref.name} - {ref.title}, {ref.organization}</p>
                      ))}
                    </div>
                  </div>
                )}
                {resumeData.contractorCompanyName && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Company</p>
                    <p>{resumeData.contractorCompanyName}</p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowResumePreview(false); setResumeData(null); setResumeTarget(null); }} data-testid="button-cancel-admin-resume">
              Cancel
            </Button>
            <Button 
              onClick={() => resumeTarget && applyResumeMutation.mutate({ target: resumeTarget, data: resumeData })}
              disabled={applyResumeMutation.isPending}
              data-testid="button-apply-admin-resume"
            >
              {applyResumeMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-1" />
              )}
              Apply to Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inspector Comparison Modal */}
      {showCompareModal && (
        <InspectorCompareModal
          inspectorIds={Array.from(compareSelected)}
          onClose={() => setShowCompareModal(false)}
          onAssignToProject={(inspectorId) => {
            setShowCompareModal(false);
            if (inspectorId.startsWith("ti:")) {
              // Team inspector — navigate to Team Inspectors tab so admin can invite
              const el = document.querySelector('[data-testid="tab-team-inspectors"]') as HTMLElement | null;
              if (el) el.click();
            } else {
              const found = members.find(m => m.userId === inspectorId);
              if (found) setMemberToAssignProjects(found);
            }
          }}
        />
      )}
    </PageLayout>
  );
}

// Member Document Vault Component - Admin-only document upload/download per inspector
function MemberDocumentVault({ member }: { member: MemberWithUser }) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState<string>(INSPECTOR_DOCUMENT_TYPES[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const docsQuery = useQuery<InspectorDocument[]>({
    queryKey: ["/api/inspector-documents", member.userId],
    queryFn: async () => {
      const res = await fetch(`/api/inspector-documents/${member.userId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load documents");
      return res.json();
    },
    staleTime: 30000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/inspector-documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspector-documents", member.userId] });
      toast({ title: "Document removed" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("inspectorId", member.userId);
      formData.append("documentType", docType);
      const res = await fetch("/api/inspector-documents", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/inspector-documents", member.userId] });
      toast({ title: "Document uploaded" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      toast({ title: err.message || "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const docs = docsQuery.data ?? [];

  const docsByType: Record<string, InspectorDocument[]> = {};
  docs.forEach(d => {
    if (!docsByType[d.documentType]) docsByType[d.documentType] = [];
    docsByType[d.documentType].push(d);
  });

  return (
    <div className="mt-4 pt-4 border-t">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium uppercase tracking-wide">Document Vault</span>
        {docs.length > 0 && (
          <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">
            {docs.length}
          </Badge>
        )}
      </div>

      {/* Upload Controls */}
      <div className="flex gap-2 flex-wrap mb-3">
        <Select value={docType} onValueChange={setDocType}>
          <SelectTrigger className="w-48 h-8 text-xs" data-testid={`select-doc-type-${member.userId}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INSPECTOR_DOCUMENT_TYPES.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          data-testid={`button-upload-doc-${member.userId}`}
        >
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
          data-testid={`input-doc-file-${member.userId}`}
        />
      </div>

      {/* Documents List */}
      {docsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading documents...
        </div>
      ) : docs.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">No documents uploaded yet.</p>
      ) : (
        <div className="space-y-1">
          {Object.entries(docsByType).map(([type, typeDocs]) => (
            <div key={type}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-2 mb-1">{type}</p>
              {typeDocs.map(doc => (
                <div key={doc.id} className="flex items-center justify-between gap-2 py-1 border-b last:border-0" data-testid={`row-doc-${doc.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs truncate" title={doc.fileName}>{doc.fileName}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/inspector-documents/${doc.id}/download`, { credentials: "include" });
                          if (!res.ok) throw new Error("Failed to get download link");
                          const { url } = await res.json();
                          window.open(url, "_blank");
                        } catch {
                          toast({ title: "Download failed", variant: "destructive" });
                        }
                      }}
                      title="Download"
                      data-testid={`button-download-doc-${doc.id}`}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(doc.id)}
                      disabled={deleteMutation.isPending}
                      title="Delete"
                      data-testid={`button-delete-doc-${doc.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Member Projects List Component - Shows assigned projects with links to reports
function MemberProjectsList({
  member,
  projects,
}: {
  member: MemberWithUser;
  projects: Project[];
}) {
  // Use useQueries to fetch all project members
  const projectMemberResults = useQueries({
    queries: projects.map(project => ({
      queryKey: ["/api/projects", project.id, "members"],
      staleTime: 30000,
    })),
  });

  // Find projects the member is assigned to
  const assignedProjects = projects.filter((project, index) => {
    const result = projectMemberResults[index];
    const members = (result.data as ProjectMember[] | undefined) || [];
    return members.some(m => m.userId === member.userId);
  });

  const anyLoading = projectMemberResults.some(r => r.isLoading);

  if (anyLoading) {
    return (
      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading projects...
        </div>
      </div>
    );
  }

  if (assignedProjects.length === 0) {
    return (
      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="w-4 h-4" />
          No projects assigned
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t">
      <div className="flex items-center gap-2 mb-3">
        <FolderOpen className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Assigned Projects ({assignedProjects.length})</span>
      </div>
      <div className="space-y-2">
        {assignedProjects.map((project) => (
          <Link
            key={project.id}
            href={`/reports?project=${project.id}`}
            className="flex items-center justify-between gap-3 p-3 rounded-md border hover-elevate cursor-pointer"
            data-testid={`link-project-reports-${project.id}`}
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{project.name}</p>
              {project.projectNumber && (
                <p className="text-sm text-muted-foreground">{project.projectNumber}</p>
              )}
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <FileText className="w-4 h-4" />
              <span>View Reports</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// Project Assignment Dialog Component
function ProjectAssignmentDialog({
  member,
  projects,
  onClose,
  onAddToProject,
  onRemoveFromProject,
  isLoading,
}: {
  member: MemberWithUser;
  projects: Project[];
  onClose: () => void;
  onAddToProject: (projectId: string) => void;
  onRemoveFromProject: (projectId: string) => void;
  isLoading: boolean;
}) {
  const displayName = member.user?.firstName && member.user?.lastName
    ? `${member.user.firstName} ${member.user.lastName}`
    : member.user?.email || "Unknown User";

  // Use useQueries to fetch all project members in a hook-safe way
  const projectMemberResults = useQueries({
    queries: projects.map(project => ({
      queryKey: ["/api/projects", project.id, "members"],
      staleTime: 30000,
    })),
  });

  // Build a map of project ID to assignment status
  const projectAssignments = new Map<string, { isAssigned: boolean; isLoading: boolean }>();
  projects.forEach((project, index) => {
    const result = projectMemberResults[index];
    const members = (result.data as ProjectMember[] | undefined) || [];
    projectAssignments.set(project.id, {
      isAssigned: members.some(m => m.userId === member.userId),
      isLoading: result.isLoading,
    });
  });

  const isAssignedToProject = (projectId: string): boolean => {
    return projectAssignments.get(projectId)?.isAssigned || false;
  };

  const isProjectLoading = (projectId: string): boolean => {
    return projectAssignments.get(projectId)?.isLoading || false;
  };

  const toggleProjectAssignment = (projectId: string) => {
    if (isAssignedToProject(projectId)) {
      onRemoveFromProject(projectId);
    } else {
      onAddToProject(projectId);
    }
  };

  const assignedCount = Array.from(projectAssignments.values()).filter(v => v.isAssigned).length;
  const anyLoading = projectMemberResults.some(r => r.isLoading);

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            Manage Project Assignments
          </DialogTitle>
          <DialogDescription>
            Assign {displayName} to company projects. They will only see reports for assigned projects.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          {projects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No projects available</p>
              <p className="text-sm">Create projects first to assign team members</p>
            </div>
          ) : anyLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {projects.map((project) => {
                const isAssigned = isAssignedToProject(project.id);
                const queryLoading = isProjectLoading(project.id);

                return (
                  <label
                    key={project.id}
                    className="flex items-center gap-3 p-3 rounded-md border hover-elevate cursor-pointer"
                    data-testid={`project-assignment-${project.id}`}
                  >
                    <Checkbox
                      checked={isAssigned}
                      onCheckedChange={() => toggleProjectAssignment(project.id)}
                      disabled={isLoading || queryLoading}
                      data-testid={`checkbox-project-${project.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{project.name}</p>
                      {project.projectNumber && (
                        <p className="text-sm text-muted-foreground">{project.projectNumber}</p>
                      )}
                    </div>
                    {queryLoading && (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                  </label>
                );
              })}
            </div>
          )}
          <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
            <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">
              {assignedCount} of {projects.length} projects assigned
            </Badge>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} data-testid="button-close-project-dialog">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Team Inspector Dialog Component
function TeamInspectorDialog({
  open,
  onOpenChange,
  inspector,
  onSave,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspector: TeamInspector | null;
  onSave: (data: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    title?: string;
    county?: string;
    licenseNumber?: string;
    licenseState?: string;
    certifications?: CertEntry[];
    notes?: string;
  }) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    title: "",
    county: "",
    licenseNumber: "",
    licenseState: "",
    notes: "",
  });
  const [certsList, setCertsList] = useState<CertEntry[]>([]);
  const [newCertName, setNewCertName] = useState("");
  const [newCertNumber, setNewCertNumber] = useState("");
  const [newCertExpiry, setNewCertExpiry] = useState("");

  // Reset form when dialog opens or inspector changes
  useEffect(() => {
    if (open) {
      if (inspector) {
        setFormData({
          firstName: inspector.firstName || "",
          lastName: inspector.lastName || "",
          email: inspector.email || "",
          phone: inspector.phone || "",
          title: inspector.title || "",
          county: inspector.county || "",
          licenseNumber: inspector.licenseNumber || "",
          licenseState: inspector.licenseState || "",
          notes: inspector.notes || "",
        });
        setCertsList(normalizeCerts(inspector.certifications));
      } else {
        setFormData({
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          title: "",
          county: "",
          licenseNumber: "",
          licenseState: "",
          notes: "",
        });
        setCertsList([]);
      }
      setNewCertName("");
      setNewCertNumber("");
      setNewCertExpiry("");
    }
  }, [open, inspector]);

  const handleAddCert = () => {
    const name = newCertName.trim();
    if (name && !certsList.some(c => c.name === name)) {
      setCertsList([...certsList, { name, expiresAt: newCertExpiry || null, certNumber: newCertNumber.trim() || undefined }]);
      setNewCertName("");
      setNewCertNumber("");
      setNewCertExpiry("");
    }
  };

  // Pass through onOpenChange - useEffect handles form data now
  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      title: formData.title || undefined,
      county: formData.county || undefined,
      licenseNumber: formData.licenseNumber || undefined,
      licenseState: formData.licenseState || undefined,
      certifications: certsList,
      notes: formData.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardHat className="w-5 h-5" />
            {inspector ? "Edit Team Inspector" : "Add Team Inspector"}
          </DialogTitle>
          <DialogDescription>
            {inspector
              ? "Update the inspector's profile information."
              : "Create a profile for an inspector who hasn't joined the system yet. You can merge their account when they sign up."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                placeholder="John"
                required
                data-testid="input-inspector-first-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                placeholder="Smith"
                required
                data-testid="input-inspector-last-name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="john.smith@example.com"
              data-testid="input-inspector-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="(555) 123-4567"
              data-testid="input-inspector-phone"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title / Position</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Project Inspector"
              data-testid="input-inspector-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="county">County</Label>
            <Input
              id="county"
              value={formData.county}
              onChange={(e) => setFormData({ ...formData, county: e.target.value })}
              placeholder="Los Angeles"
              data-testid="input-inspector-county"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="licenseNumber">License Number</Label>
              <Input
                id="licenseNumber"
                value={formData.licenseNumber}
                onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                placeholder="B-123456"
                data-testid="input-inspector-license"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="licenseState">License State</Label>
              <Input
                id="licenseState"
                value={formData.licenseState}
                onChange={(e) => setFormData({ ...formData, licenseState: e.target.value })}
                placeholder="CA"
                maxLength={2}
                data-testid="input-inspector-license-state"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Certifications &amp; Licenses</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input
                placeholder="Name (e.g., DSA Cert)"
                value={newCertName}
                onChange={(e) => setNewCertName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddCert(); } }}
                data-testid="input-inspector-cert-name"
              />
              <Input
                placeholder="Cert # (opt.)"
                value={newCertNumber}
                onChange={(e) => setNewCertNumber(e.target.value)}
                data-testid="input-inspector-cert-number"
              />
              <div className="flex gap-1">
                <Input
                  type="date"
                  title="Expiry date"
                  value={newCertExpiry}
                  onChange={(e) => setNewCertExpiry(e.target.value)}
                  data-testid="input-inspector-cert-expiry"
                />
                <Button type="button" size="icon" variant="secondary" onClick={handleAddCert} disabled={!newCertName.trim()} data-testid="button-add-inspector-cert">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {certsList.length > 0 && (
              <div className="space-y-1 mt-2">
                {certsList.map((cert, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm border rounded px-2 py-1">
                    <span className="font-medium">{cert.name}</span>
                    <div className="flex items-center gap-2">
                      {cert.certNumber && <span className="text-muted-foreground text-xs">#{cert.certNumber}</span>}
                      {cert.expiresAt && <span className="text-muted-foreground text-xs">{cert.expiresAt}</span>}
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => setCertsList(certsList.filter((_, i) => i !== idx))}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-input bg-background"
              placeholder="Additional notes about this inspector..."
              data-testid="input-inspector-notes"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !formData.firstName || !formData.lastName}
              data-testid="button-save-inspector"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {inspector ? "Update" : "Add Inspector"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Inspector Comparison Modal ────────────────────────────────────────────────

type InspectorCompareData = {
  inspectorId: string;
  name: string;
  title: string | null;
  licenseNumber: string | null;
  licenseState: string | null;
  certifications: CertEntry[];
  availabilityDate: string | null;
  activeProjectCount: number | null;
  totalHoursThisMonth: number | null;
  regularRate: string | null;
  overtimeRate: string | null;
  premiumRate: string | null;
  role: string | null;
  isTeamInspector?: boolean;
};

function InspectorCompareModal({
  inspectorIds,
  onClose,
  onAssignToProject,
}: {
  inspectorIds: string[];
  onClose: () => void;
  onAssignToProject: (inspectorId: string) => void;
}) {
  const idsKey = inspectorIds.join(",");

  const { data: inspectors = [], isLoading, error } = useQuery<InspectorCompareData[]>({
    queryKey: ["/api/company/inspector-compare", idsKey],
    queryFn: async () => {
      const res = await fetch(`/api/company/inspector-compare?ids=${encodeURIComponent(idsKey)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load comparison data");
      return res.json();
    },
    enabled: inspectorIds.length >= 1,
    staleTime: 60000,
  });

  // Helper: determine if a field "differs" across columns (highlight it)
  const differs = (values: (string | number | null | undefined)[]): boolean => {
    const unique = new Set(values.map(v => v ?? null));
    return unique.size > 1;
  };

  const projectCounts = inspectors.map(i => i.activeProjectCount);
  const hourValues = inspectors.map(i => i.totalHoursThisMonth);
  const regularRates = inspectors.map(i => i.regularRate ? parseFloat(i.regularRate) : null);

  const nonNullProjects = projectCounts.filter((v): v is number => v !== null);
  const nonNullHours = hourValues.filter((v): v is number => v !== null);
  const maxProjects = nonNullProjects.length > 0 ? Math.max(...nonNullProjects) : 0;
  const maxHours = nonNullHours.length > 0 ? Math.max(...nonNullHours) : 0;
  const maxRate = Math.max(...regularRates.filter((r): r is number => r !== null), 0);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-5xl w-full overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Columns2 className="w-5 h-5" />
            Inspector Comparison
          </DialogTitle>
          <DialogDescription>
            Side-by-side comparison of {inspectorIds.length} inspector{inspectorIds.length > 1 ? "s" : ""}. Highlighted fields differ between inspectors.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading comparison data...
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-destructive py-8">
            <AlertCircle className="w-5 h-5" />
            Failed to load comparison data
          </div>
        ) : (
          <ScrollArea className="max-h-[70vh]">
            <div className="grid gap-4" style={{ gridTemplateColumns: `180px repeat(${inspectors.length}, 1fr)` }}>
              
              {/* Header row */}
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Field</div>
              {inspectors.map(ins => (
                <div key={ins.inspectorId} className="border rounded p-3 bg-muted/20" data-testid={`compare-col-${ins.inspectorId}`}>
                  <p className="font-semibold truncate" title={ins.name}>{ins.name}</p>
                  {ins.isTeamInspector && (
                    <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium uppercase tracking-wide">Roster Only</span>
                  )}
                  {ins.title && <p className="text-sm text-muted-foreground truncate mt-0.5">{ins.title}</p>}
                  {ins.isTeamInspector ? (
                    <button
                      className="text-xs text-primary underline-offset-2 hover:underline mt-1 block"
                      onClick={() => onAssignToProject(ins.inspectorId)}
                      data-testid={`button-invite-inspector-${ins.inspectorId}`}
                    >
                      Invite to Join →
                    </button>
                  ) : (
                    <button
                      className="text-xs text-primary underline-offset-2 hover:underline mt-1 block"
                      onClick={() => onAssignToProject(ins.inspectorId)}
                      data-testid={`button-assign-inspector-${ins.inspectorId}`}
                    >
                      Assign to Project →
                    </button>
                  )}
                </div>
              ))}

              {/* License Row */}
              <CompareFieldLabel icon={<Shield className="w-3 h-3" />} label="License" />
              {inspectors.map(ins => {
                const val = ins.licenseNumber ? `${ins.licenseState || ""} ${ins.licenseNumber}`.trim() : "—";
                const diff = differs(inspectors.map(i => i.licenseNumber));
                return (
                  <CompareCell key={ins.inspectorId} highlight={diff && !!ins.licenseNumber}>
                    {val}
                  </CompareCell>
                );
              })}

              {/* Certifications */}
              <CompareFieldLabel icon={<Award className="w-3 h-3" />} label="Certifications" />
              {inspectors.map(ins => {
                const now = new Date();
                const certs = ins.certifications || [];
                return (
                  <CompareCell key={ins.inspectorId}>
                    {certs.length === 0 ? (
                      <span className="text-muted-foreground text-xs">None on file</span>
                    ) : (
                      <div className="space-y-1">
                        {certs.map((c, ci) => {
                          const isExpired = c.expiresAt ? new Date(c.expiresAt) < now : false;
                          const expiringSoon = c.expiresAt
                            ? new Date(c.expiresAt) < new Date(now.getTime() + 30 * 86400000)
                            : false;
                          return (
                            <div key={ci} className="flex items-center gap-1 flex-wrap">
                              <span className="text-xs">{c.name}</span>
                              {c.expiresAt && (
                                <Badge
                                  variant={isExpired ? "destructive" : expiringSoon ? "outline" : "secondary"}
                                  className="text-[10px] px-1 py-0 no-default-hover-elevate no-default-active-elevate"
                                >
                                  {isExpired ? "Expired" : expiringSoon ? "Soon" : ""}
                                  {!isExpired && !expiringSoon ? new Date(c.expiresAt).toLocaleDateString() : ""}
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CompareCell>
                );
              })}

              {/* Availability Date */}
              <CompareFieldLabel icon={<Calendar className="w-3 h-3" />} label="Available" />
              {inspectors.map(ins => {
                const diff = differs(inspectors.map(i => i.availabilityDate));
                return (
                  <CompareCell key={ins.inspectorId} highlight={diff && !!ins.availabilityDate}>
                    {ins.availabilityDate
                      ? new Date(ins.availabilityDate + "T00:00:00").toLocaleDateString()
                      : <span className="text-muted-foreground text-xs">Not set</span>}
                  </CompareCell>
                );
              })}

              {/* Active Project Count */}
              <CompareFieldLabel icon={<Briefcase className="w-3 h-3" />} label="Active Projects" />
              {inspectors.map(ins => {
                const diff = differs(nonNullProjects);
                const isMax = ins.activeProjectCount === maxProjects && maxProjects > 0;
                return (
                  <CompareCell key={ins.inspectorId} highlight={diff && isMax}>
                    {ins.activeProjectCount === null ? (
                      <span className="text-muted-foreground text-xs">N/A</span>
                    ) : (
                      <>
                        <span className={diff && isMax ? "font-semibold text-amber-600" : ""}>{ins.activeProjectCount}</span>
                        {diff && ins.activeProjectCount === Math.min(...nonNullProjects) && ins.activeProjectCount < maxProjects && (
                          <span className="text-xs text-muted-foreground ml-1">(fewest)</span>
                        )}
                      </>
                    )}
                  </CompareCell>
                );
              })}

              {/* Hours This Month */}
              <CompareFieldLabel icon={<Clock className="w-3 h-3" />} label="Hours (this month)" />
              {inspectors.map(ins => {
                const diff = differs(nonNullHours);
                const isTop = ins.totalHoursThisMonth !== null && ins.totalHoursThisMonth === maxHours && maxHours > 0;
                return (
                  <CompareCell key={ins.inspectorId} highlight={diff && isTop}>
                    {ins.totalHoursThisMonth === null ? (
                      <span className="text-muted-foreground text-xs">N/A</span>
                    ) : (
                      <span className={diff && isTop ? "font-semibold text-amber-600" : ""}>{ins.totalHoursThisMonth}h</span>
                    )}
                  </CompareCell>
                );
              })}

              {/* Regular Rate */}
              <CompareFieldLabel icon={<DollarSign className="w-3 h-3" />} label="Regular Rate" />
              {inspectors.map(ins => {
                const rateNum = ins.regularRate ? parseFloat(ins.regularRate) : null;
                const diff = differs(regularRates);
                const isTop = rateNum !== null && rateNum === maxRate && maxRate > 0;
                return (
                  <CompareCell key={ins.inspectorId} highlight={diff && isTop}>
                    {ins.isTeamInspector ? (
                      <span className="text-muted-foreground text-xs">N/A</span>
                    ) : ins.regularRate ? (
                      <span className={diff && isTop ? "font-semibold text-amber-600" : ""}>${ins.regularRate}/hr</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">Not set</span>
                    )}
                  </CompareCell>
                );
              })}

              {/* Overtime Rate */}
              <CompareFieldLabel icon={<DollarSign className="w-3 h-3" />} label="OT Rate" />
              {inspectors.map(ins => {
                const diff = differs(inspectors.filter(i => !i.isTeamInspector).map(i => i.overtimeRate));
                return (
                  <CompareCell key={ins.inspectorId} highlight={!ins.isTeamInspector && diff && !!ins.overtimeRate}>
                    {ins.isTeamInspector ? (
                      <span className="text-muted-foreground text-xs">N/A</span>
                    ) : ins.overtimeRate ? (
                      `$${ins.overtimeRate}/hr`
                    ) : (
                      <span className="text-muted-foreground text-xs">Not set</span>
                    )}
                  </CompareCell>
                );
              })}

              {/* Premium / Weekend Rate */}
              <CompareFieldLabel icon={<DollarSign className="w-3 h-3" />} label="Premium Rate" />
              {inspectors.map(ins => {
                const diff = differs(inspectors.filter(i => !i.isTeamInspector).map(i => i.premiumRate));
                return (
                  <CompareCell key={ins.inspectorId} highlight={!ins.isTeamInspector && diff && !!ins.premiumRate}>
                    {ins.isTeamInspector ? (
                      <span className="text-muted-foreground text-xs">N/A</span>
                    ) : ins.premiumRate ? (
                      `$${ins.premiumRate}/hr`
                    ) : (
                      <span className="text-muted-foreground text-xs">Not set</span>
                    )}
                  </CompareCell>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-close-compare">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompareFieldLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wide pt-3 border-t">
      {icon} {label}
    </div>
  );
}

function CompareCell({ children, highlight = false }: { children: ReactNode; highlight?: boolean }) {
  return (
    <div className={`text-sm pt-3 border-t px-1 ${highlight ? "bg-amber-50 dark:bg-amber-950/20 rounded" : ""}`}>
      {children}
    </div>
  );
}

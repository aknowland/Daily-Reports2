import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus,
  Search,
  Mail,
  Trash2,
  Loader2,
  AlertCircle,
  UserPlus,
  Shield,
  HardHat,
  Clock,
  CheckCircle,
  XCircle,
  Copy,
  FolderOpen,
  ArrowLeft,
} from "lucide-react";
import { Link } from "wouter";
import type { Project, Invite, Company, CompanyMember } from "@shared/schema";
import type { User } from "@shared/models/auth";
import { format } from "date-fns";
import { Building2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

type InviteWithDetails = Invite & { 
  invitedByUser?: User; 
  projects?: Project[];
  company?: Company;
};

type CompanyMemberWithCompany = CompanyMember & { company?: Company };

export default function AdminInvitesPage() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    role: "inspector" as "inspector" | "admin" | "company_admin",
    companyId: "" as string,
    projectIds: [] as string[],
  });
  
  // Inline project creation state
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectData, setNewProjectData] = useState({
    name: "",
    projectNumber: "",
    client: "",
    address: "",
  });

  const isSystemAdmin = (profile?.role === "admin" || profile?.role === "owner" || profile?.role === "system_owner") && profile?.preferAdminMode !== false;

  const { data: invites, isLoading, error } = useQuery<InviteWithDetails[]>({
    queryKey: ["/api/admin/invites"],
  });

  // For system admins, fetch all companies; for company admins, fetch their memberships
  const { data: allCompanies } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
    enabled: isSystemAdmin,
  });

  const { data: myCompanyMemberships } = useQuery<CompanyMemberWithCompany[]>({
    queryKey: ["/api/my-companies"],
    enabled: !isSystemAdmin,
  });

  // Companies user can invite to (system admin sees all, company admin sees their admin companies)
  const companies = isSystemAdmin 
    ? allCompanies 
    : myCompanyMemberships
        ?.filter(m => m.role === "admin")
        ?.map(m => m.company)
        ?.filter((c): c is Company => !!c);

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/admin/invites", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      setShowDialog(false);
      resetForm();
      toast({
        title: "Invite Sent",
        description: "The invitation has been created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create invite",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/invites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({
        title: "Invite Deleted",
        description: "The invitation has been removed",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete invite",
        variant: "destructive",
      });
    },
  });

  // Inline project creation mutation
  const createProjectMutation = useMutation({
    mutationFn: async (data: typeof newProjectData & { companyId: string }) => {
      const response = await apiRequest("POST", "/api/projects", data);
      return response.json();
    },
    onSuccess: (newProject: Project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      // Auto-select the newly created project
      setFormData(prev => ({
        ...prev,
        projectIds: [...prev.projectIds, newProject.id],
      }));
      // Reset and hide the project form
      setNewProjectData({ name: "", projectNumber: "", client: "", address: "" });
      setShowCreateProject(false);
      toast({
        title: "Project Created",
        description: `${newProject.name} has been created and selected`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create project",
        variant: "destructive",
      });
    },
  });

  // Check if current user can invite System Admins (System Owner or System Admin)
  const canInviteSystemAdmin = (profile?.role === "owner" || profile?.role === "admin") && profile?.preferAdminMode !== false;
  
  const resetForm = () => {
    setFormData({
      email: "",
      role: "inspector",
      companyId: "",
      projectIds: [],
    });
    setShowCreateProject(false);
    setNewProjectData({ name: "", projectNumber: "", client: "", address: "" });
  };
  
  // Filter projects based on selected company
  const filteredProjects = formData.companyId 
    ? projects?.filter(p => p.companyId === formData.companyId)
    : projects;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate company_admin requires a company
    if (formData.role === "company_admin" && !formData.companyId) {
      toast({
        title: "Organization Required",
        description: "Company Administrator invites require an organization to be selected.",
        variant: "destructive",
      });
      return;
    }
    
    createMutation.mutate(formData);
  };

  const toggleProject = (projectId: string) => {
    setFormData(prev => ({
      ...prev,
      projectIds: prev.projectIds.includes(projectId)
        ? prev.projectIds.filter(id => id !== projectId)
        : [...prev.projectIds, projectId],
    }));
  };

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(link);
    toast({
      title: "Link Copied",
      description: "The invite link has been copied to clipboard",
    });
  };

  const filteredInvites = invites?.filter(
    (invite) =>
      invite.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (invite: InviteWithDetails) => {
    if (invite.status === "accepted") {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 no-default-hover-elevate no-default-active-elevate">
          <CheckCircle className="w-3 h-3 mr-1" />
          Accepted
        </Badge>
      );
    }
    if (invite.status === "expired" || new Date(invite.expiresAt) < new Date()) {
      return (
        <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 no-default-hover-elevate no-default-active-elevate">
          <XCircle className="w-3 h-3 mr-1" />
          Expired
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 no-default-hover-elevate no-default-active-elevate">
        <Clock className="w-3 h-3 mr-1" />
        Pending
      </Badge>
    );
  };

  return (
    <PageLayout title="Invites" isAdmin>
      <div className="container px-4 py-6 mx-auto max-w-screen-xl space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild data-testid="button-back">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Invitations</h1>
            <p className="text-muted-foreground">
              {invites?.length || 0} total invites
            </p>
          </div>

          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-invite">
                <Plus className="w-4 h-4 mr-2" />
                New Invite
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Invitation</DialogTitle>
                <DialogDescription>
                  Send an invitation to a new team member
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      data-testid="input-invite-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="company">Organization</Label>
                    <Select
                      value={formData.companyId}
                      onValueChange={(companyId) => 
                        setFormData({ ...formData, companyId, projectIds: [] })
                      }
                    >
                      <SelectTrigger data-testid="select-invite-company">
                        <SelectValue placeholder="Select an organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies?.map((company) => (
                          <SelectItem key={company.id} value={company.id}>
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4" />
                              {company.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      The organization name will appear in the invitation email
                    </p>
                  </div>

                  {formData.companyId && !companies?.find(c => c.id === formData.companyId)?.name?.includes("Knowland Construction") && (
                    <div className="rounded-md border bg-muted/50 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <AlertCircle className="w-4 h-4 text-primary" />
                        Subscription Information
                      </div>
                      <p className="text-xs text-muted-foreground">
                        New users will need an active subscription to create unlimited reports. Here are the available options:
                      </p>
                      <div className="text-xs space-y-1 pl-2">
                        <p><strong>Free:</strong> 5 reports/month (no payment required)</p>
                        <p><strong>Independent Pro:</strong> $49/month (unlimited reports)</p>
                        <p><strong>Company User:</strong> $79/month per user</p>
                        <p><strong>Company Account:</strong> $499/month (unlimited users)</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The invited user can start with the Free option and upgrade later from their Billing page.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select
                      value={formData.role}
                      onValueChange={(role: "inspector" | "admin" | "company_admin") => 
                        setFormData({ ...formData, role, projectIds: (role === "admin" || role === "company_admin") ? [] : formData.projectIds })
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
                        <SelectItem value="company_admin">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            Company Administrator
                          </div>
                        </SelectItem>
                        {canInviteSystemAdmin && (
                          <SelectItem value="admin">
                            <div className="flex items-center gap-2">
                              <Shield className="w-4 h-4" />
                              System Administrator
                            </div>
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {formData.role === "admin" && (
                      <div className="rounded-md border bg-blue-50 dark:bg-blue-900/20 p-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-blue-800 dark:text-blue-300">
                          <Shield className="w-4 h-4" />
                          System Administrator Privileges
                        </div>
                        <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1 pl-2">
                          <li>Access to all projects across all organizations</li>
                          <li>Can view and manage all reports from all inspectors</li>
                          <li>Can manage users, settings, and invites</li>
                          <li>Has an Inspector/Admin toggle to switch between viewing modes</li>
                        </ul>
                        <p className="text-xs text-muted-foreground">
                          No project assignment needed - System Administrators have full access.
                        </p>
                      </div>
                    )}
                    {formData.role === "company_admin" && (
                      <div className="rounded-md border bg-purple-50 dark:bg-purple-900/20 p-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-purple-800 dark:text-purple-300">
                          <Building2 className="w-4 h-4" />
                          Company Administrator Privileges
                        </div>
                        <ul className="text-xs text-purple-700 dark:text-purple-400 space-y-1 pl-2">
                          <li>Access to all projects within their organization</li>
                          <li>Can view and manage reports for their organization's projects</li>
                          <li>Can invite inspectors to their organization</li>
                          <li>Has an Inspector/Admin toggle to switch between viewing modes</li>
                        </ul>
                        {!formData.companyId && (
                          <p className="text-xs text-destructive font-medium">
                            An organization must be selected for Company Administrator invites.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {formData.role === "inspector" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Assign to Projects</Label>
                      {formData.companyId && !showCreateProject && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowCreateProject(true)}
                          data-testid="button-create-project-inline"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          New Project
                        </Button>
                      )}
                    </div>
                    
                    {showCreateProject && formData.companyId && (
                      <div className="border rounded-md p-3 space-y-3 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">Create New Project</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowCreateProject(false);
                              setNewProjectData({ name: "", projectNumber: "", client: "", address: "" });
                            }}
                            data-testid="button-cancel-create-project"
                          >
                            Cancel
                          </Button>
                        </div>
                        <div className="grid gap-2">
                          <Input
                            placeholder="Project Name *"
                            value={newProjectData.name}
                            onChange={(e) => setNewProjectData(prev => ({ ...prev, name: e.target.value }))}
                            data-testid="input-new-project-name"
                          />
                          <Input
                            placeholder="Project Number *"
                            value={newProjectData.projectNumber}
                            onChange={(e) => setNewProjectData(prev => ({ ...prev, projectNumber: e.target.value }))}
                            data-testid="input-new-project-number"
                          />
                          <Input
                            placeholder="Client (optional)"
                            value={newProjectData.client}
                            onChange={(e) => setNewProjectData(prev => ({ ...prev, client: e.target.value }))}
                            data-testid="input-new-project-client"
                          />
                          <Input
                            placeholder="Address (optional)"
                            value={newProjectData.address}
                            onChange={(e) => setNewProjectData(prev => ({ ...prev, address: e.target.value }))}
                            data-testid="input-new-project-address"
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="w-full"
                          disabled={!newProjectData.name || !newProjectData.projectNumber || createProjectMutation.isPending}
                          onClick={() => {
                            createProjectMutation.mutate({
                              ...newProjectData,
                              companyId: formData.companyId,
                            });
                          }}
                          data-testid="button-save-new-project"
                        >
                          {createProjectMutation.isPending ? (
                            <>
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            <>
                              <FolderOpen className="w-3 h-3 mr-1" />
                              Create & Select Project
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                    
                    <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-2">
                      {!formData.companyId ? (
                        <p className="text-sm text-muted-foreground p-2">
                          Select an organization first to see projects
                        </p>
                      ) : filteredProjects?.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-2">
                          No projects yet. Click "New Project" above to create one.
                        </p>
                      ) : (
                        filteredProjects?.map((project) => (
                          <div
                            key={project.id}
                            className="flex items-center gap-2 p-2 rounded hover-elevate cursor-pointer"
                            onClick={() => toggleProject(project.id)}
                          >
                            <Checkbox
                              checked={formData.projectIds.includes(project.id)}
                              onCheckedChange={() => toggleProject(project.id)}
                              data-testid={`checkbox-project-${project.id}`}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{project.name}</p>
                              <p className="text-xs text-muted-foreground">#{project.projectNumber}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || (formData.role === "company_admin" && !formData.companyId)}
                    data-testid="button-submit-invite"
                  >
                    {createMutation.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Send Invite
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-10"
            data-testid="input-search-invites"
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
              <p className="text-lg font-medium">Failed to load invites</p>
              <p className="text-sm text-muted-foreground mt-1">
                Please try again later
              </p>
            </CardContent>
          </Card>
        ) : filteredInvites?.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <UserPlus className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              {searchTerm ? (
                <>
                  <p className="text-lg font-medium">No matching invites</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Try adjusting your search
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium">No invites yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Create an invitation to add new team members
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredInvites?.map((invite) => (
              <Card key={invite.id} data-testid={`card-invite-${invite.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Mail className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{invite.email}</p>
                          {getStatusBadge(invite)}
                          <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">
                            {invite.role === "admin" ? (
                              <><Shield className="w-3 h-3 mr-1" />Sys Admin</>
                            ) : invite.isCompanyAdmin ? (
                              <><Building2 className="w-3 h-3 mr-1" />Company Admin</>
                            ) : (
                              <><HardHat className="w-3 h-3 mr-1" />Inspector</>
                            )}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap">
                          {invite.company && (
                            <>
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {invite.company.name}
                              </span>
                              <span>|</span>
                            </>
                          )}
                          <span>Expires: {format(new Date(invite.expiresAt), "MMM d, yyyy")}</span>
                          {invite.projects && invite.projects.length > 0 && (
                            <>
                              <span>|</span>
                              <span className="flex items-center gap-1">
                                <FolderOpen className="w-3 h-3" />
                                {invite.projects.length} project{invite.projects.length > 1 ? "s" : ""}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 justify-end">
                      {invite.status === "pending" && new Date(invite.expiresAt) > new Date() && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyInviteLink(invite.token)}
                          data-testid={`button-copy-link-${invite.id}`}
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          Copy Link
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(invite.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-invite-${invite.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

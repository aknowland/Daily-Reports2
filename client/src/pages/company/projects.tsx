import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  FolderOpen,
  ArrowLeft,
  AlertCircle,
  MapPin,
  Plus,
  Trash2,
  Edit,
  Hash,
  Building2,
  FileText,
  Search,
} from "lucide-react";
import { Link, useSearch } from "wouter";
import { useState, useMemo } from "react";
import type { Project, Contract, Client, ContractWithProjects, ContractOption } from "@shared/schema";
import { ClientSelect } from "@/components/client-select";

export default function CompanyProjectsPage() {
  const { toast } = useToast();
  const { activeCompany, isCompanyAdmin, isEffectiveCompanyAdmin, isCompaniesLoading } = useAuth();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const clientIdFilter = searchParams.get("clientId");
  const projectIdFilter = searchParams.get("projectId");
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    projectNumber: "",
    client: "",
    clientId: "",
    address: "",
    distributionEmails: "",
    contractId: "",
    contractOptionId: "",
    startDate: "",
    substantialCompletionDate: "",
    finalCloseoutDate: "",
    budgetAmount: "",
    baseBudget: "",
  });

  const { data: projects = [], isLoading, error } = useQuery<Project[]>({
    queryKey: ["/api/companies", activeCompany?.id, "projects"],
    enabled: !!activeCompany?.id && isEffectiveCompanyAdmin,
  });

  const { data: contracts = [] } = useQuery<ContractWithProjects[]>({
    queryKey: ["/api/contracts"],
    enabled: !!activeCompany?.id && isEffectiveCompanyAdmin,
  });

  // Get awarded options for the selected contract
  const selectedContract = useMemo(() => {
    if (!formData.contractId) return null;
    return contracts.find((c) => c.id === formData.contractId) || null;
  }, [formData.contractId, contracts]);

  const awardedOptions = useMemo(() => {
    if (!selectedContract?.options) return [];
    return selectedContract.options.filter((opt) => opt.awardStatus === "awarded");
  }, [selectedContract]);

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients", activeCompany?.id],
    queryFn: async () => {
      const response = await fetch("/api/clients", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch clients");
      return response.json();
    },
    enabled: !!activeCompany?.id && isEffectiveCompanyAdmin,
  });

  const selectedClient = useMemo(() => {
    if (!clientIdFilter) return null;
    return clients.find((c) => c.id === clientIdFilter) || null;
  }, [clientIdFilter, clients]);

  const selectedProject = useMemo(() => {
    if (!projectIdFilter) return null;
    return projects.find((p) => p.id === projectIdFilter) || null;
  }, [projectIdFilter, projects]);

  const filteredProjects = useMemo(() => {
    // Get project status priority based on dates (lower = shows first)
    const getProjectStatusPriority = (project: Project): number => {
      const now = new Date();
      const startDate = project.startDate ? new Date(project.startDate) : null;
      const completionDate = project.substantialCompletionDate ? new Date(project.substantialCompletionDate) : null;
      const closeoutDate = project.finalCloseoutDate ? new Date(project.finalCloseoutDate) : null;
      
      // Completed projects (past closeout or completion date)
      if (closeoutDate && closeoutDate < now) return 3;
      if (completionDate && completionDate < now) return 3;
      
      // Upcoming projects (future start date or no start date)
      if (!startDate || startDate > now) return 1;
      
      // In progress projects (started but not completed)
      return 2;
    };

    let result = projects;
    
    // Filter by specific project ID if provided
    if (projectIdFilter) {
      result = projects.filter((p) => p.id === projectIdFilter);
    }
    // Filter by client if provided
    else if (selectedClient) {
      result = projects.filter((p) => 
        (p as any).clientId === selectedClient.id || p.client?.toLowerCase() === selectedClient.name.toLowerCase()
      );
    }
    
    // Apply text search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((p) => {
        // Get client name from clientId if available, falling back to project.client
        const projectClientId = (p as any).clientId;
        let clientName = p.client || "";
        if (projectClientId) {
          const client = clients.find(c => c.id === projectClientId);
          clientName = client?.name || p.client || "";
        }
        
        return (
          p.name.toLowerCase().includes(query) ||
          p.projectNumber?.toLowerCase().includes(query) ||
          clientName.toLowerCase().includes(query) ||
          p.address?.toLowerCase().includes(query)
        );
      });
    }
    
    // Sort by status priority (upcoming first, then in progress, then completed)
    return result.sort((a, b) => getProjectStatusPriority(a) - getProjectStatusPriority(b));
  }, [projects, selectedClient, projectIdFilter, searchQuery, clients]);

  // Helper to get client name from clientId
  const getClientName = (project: Project): string | null => {
    const projectClientId = (project as any).clientId;
    if (projectClientId) {
      const client = clients.find(c => c.id === projectClientId);
      return client?.name || project.client || null;
    }
    return project.client || null;
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/projects", {
        ...data,
        companyId: activeCompany?.id,
        contractId: data.contractId || null,
        contractOptionId: data.contractOptionId || null,
        clientId: data.clientId || null,
        distributionEmails: data.distributionEmails
          ? data.distributionEmails.split(",").map((e) => e.trim()).filter(Boolean)
          : [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setShowCreateDialog(false);
      setFormData({ name: "", projectNumber: "", client: "", clientId: "", address: "", distributionEmails: "", contractId: "", contractOptionId: "", startDate: "", substantialCompletionDate: "", finalCloseoutDate: "", budgetAmount: "", baseBudget: "" });
      toast({
        title: "Project Created",
        description: "New project has been created.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create project.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: string }) => {
      return apiRequest("PATCH", `/api/projects/${data.id}`, {
        ...data,
        contractId: data.contractId || null,
        contractOptionId: data.contractOptionId || null,
        clientId: data.clientId || null,
        distributionEmails: data.distributionEmails
          ? data.distributionEmails.split(",").map((e) => e.trim()).filter(Boolean)
          : [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setEditingProject(null);
      setFormData({ name: "", projectNumber: "", client: "", clientId: "", address: "", distributionEmails: "", contractId: "", contractOptionId: "", startDate: "", substantialCompletionDate: "", finalCloseoutDate: "", budgetAmount: "", baseBudget: "" });
      toast({
        title: "Project Updated",
        description: "Project has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update project.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setProjectToDelete(null);
      toast({
        title: "Project Deleted",
        description: "Project has been deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete project.",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (project: Project) => {
    setFormData({
      name: project.name,
      projectNumber: project.projectNumber,
      client: project.client || "",
      clientId: (project as any).clientId || "",
      address: project.address || "",
      distributionEmails: (project.distributionEmails as string[])?.join(", ") || "",
      contractId: project.contractId || "",
      contractOptionId: (project as any).contractOptionId || "",
      startDate: (project as any).startDate ? new Date((project as any).startDate).toISOString().split('T')[0] : "",
      substantialCompletionDate: (project as any).substantialCompletionDate ? new Date((project as any).substantialCompletionDate).toISOString().split('T')[0] : "",
      finalCloseoutDate: (project as any).finalCloseoutDate ? new Date((project as any).finalCloseoutDate).toISOString().split('T')[0] : "",
      budgetAmount: (project as any).budgetAmount || "",
      baseBudget: (project as any).baseBudget || "",
    });
    setEditingProject(project);
  };

  // Wait for companies data to load before checking permissions
  if (isCompaniesLoading) {
    return (
      <PageLayout title="Company Projects">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!isEffectiveCompanyAdmin || !activeCompany) {
    return (
      <PageLayout title="Company Projects">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="w-12 h-12 text-destructive mb-4" />
              <p className="text-lg font-medium">Access Denied</p>
              <p className="text-muted-foreground">You must be a company admin to view this page</p>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  if (isLoading) {
    return (
      <PageLayout title="Company Projects">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
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
      <PageLayout title="Company Projects">
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
              <p className="text-lg font-medium">Failed to load projects</p>
              <p className="text-muted-foreground">Please try again later</p>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Company Projects">
      <div className="container px-4 py-6 mx-auto max-w-screen-lg space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" asChild data-testid="button-back">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Dashboard
            </Link>
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="title-projects">
              {selectedProject ? selectedProject.name : selectedClient ? `Projects for ${selectedClient.name}` : "Company Projects"}
            </h1>
            <p className="text-muted-foreground">
              {selectedProject ? (
                <span className="flex items-center gap-2">
                  Project #{selectedProject.projectNumber || 'N/A'}
                  <Link href="/company/projects" className="text-primary hover:underline">
                    View all projects
                  </Link>
                </span>
              ) : selectedClient ? (
                <span className="flex items-center gap-2">
                  Showing {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""} for this client
                  <Link href="/company/projects" className="text-primary hover:underline">
                    View all
                  </Link>
                </span>
              ) : (
                `Manage projects for ${activeCompany.name}`
              )}
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-project">
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>

        {projects.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search projects by name, number, client, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-projects"
            />
          </div>
        )}

        {projects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderOpen className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No projects</p>
              <p className="text-muted-foreground mb-4">
                Create your first project to get started
              </p>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first">
                <Plus className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            </CardContent>
          </Card>
        ) : filteredProjects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderOpen className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No projects found</p>
              <p className="text-muted-foreground mb-4">
                No projects match "{searchQuery}"
              </p>
              <Button variant="outline" onClick={() => setSearchQuery("")} data-testid="button-clear-search">
                Clear Search
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredProjects.map((project) => {
              // Navigate to contract dashboard if linked, otherwise to reports
              const projectLink = project.contractId 
                ? `/company/contracts/${project.contractId}/dashboard`
                : `/reports?project=${project.id}`;
              
              return (
              <Card key={project.id} className="hover-elevate" data-testid={`card-project-${project.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <Link 
                      href={projectLink}
                      className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                    >
                      <FolderOpen className="w-5 h-5 text-muted-foreground" />
                      <CardTitle className="text-lg hover:text-primary transition-colors" data-testid={`text-project-name-${project.id}`}>
                        {project.name}
                      </CardTitle>
                    </Link>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(project)}
                        data-testid={`button-edit-${project.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setProjectToDelete(project)}
                        data-testid={`button-delete-${project.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Link 
                    href={projectLink}
                    className="block cursor-pointer"
                  >
                    <CardDescription className="flex items-center gap-2">
                      <Hash className="w-3 h-3" />
                      {project.projectNumber}
                    </CardDescription>
                  </Link>
                </CardHeader>
                <Link 
                  href={projectLink}
                  className="block cursor-pointer"
                >
                  <CardContent className="space-y-2">
                    {getClientName(project) && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building2 className="w-4 h-4" />
                        <span>{getClientName(project)}</span>
                      </div>
                    )}
                    {project.address && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-4 h-4" />
                        <span>{project.address}</span>
                      </div>
                    )}
                    {project.contractId && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FileText className="w-4 h-4" />
                        <span>
                          {contracts.find(c => c.id === project.contractId)?.contractNumber || "Linked Contract"}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Link>
              </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showCreateDialog || !!editingProject} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setEditingProject(null);
          setFormData({ name: "", projectNumber: "", client: "", clientId: "", address: "", distributionEmails: "", contractId: "", contractOptionId: "", startDate: "", substantialCompletionDate: "", finalCloseoutDate: "", budgetAmount: "", baseBudget: "" });
        }
      }}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingProject ? "Edit Project" : "Create Project"}</DialogTitle>
            <DialogDescription>
              {editingProject ? "Update project details" : "Add a new project to your company"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4 overflow-y-auto flex-1 pr-2">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter project name"
                data-testid="input-project-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectNumber">Project Number *</Label>
              <Input
                id="projectNumber"
                value={formData.projectNumber}
                onChange={(e) => setFormData({ ...formData, projectNumber: e.target.value })}
                placeholder="e.g., PRJ-001"
                data-testid="input-project-number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client">Client</Label>
              {activeCompany?.id && (
                <ClientSelect
                  value={formData.clientId}
                  onValueChange={(value, clientName) => setFormData({ ...formData, clientId: value, client: clientName || "" })}
                  companyId={activeCompany.id}
                  placeholder="Select a client"
                  data-testid="select-project-client"
                />
              )}
              <p className="text-xs text-muted-foreground">
                Select an existing client or create a new one
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Project address"
                data-testid="input-project-address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="distributionEmails">Distribution Emails</Label>
              <Input
                id="distributionEmails"
                value={formData.distributionEmails}
                onChange={(e) => setFormData({ ...formData, distributionEmails: e.target.value })}
                placeholder="email1@example.com, email2@example.com"
                data-testid="input-distribution-emails"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of emails to receive daily reports
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contractId">Link to Contract</Label>
              <Select 
                value={formData.contractId || "none"} 
                onValueChange={(value) => setFormData({ 
                  ...formData, 
                  contractId: value === "none" ? "" : value,
                  contractOptionId: "" 
                })}
              >
                <SelectTrigger data-testid="select-contract">
                  <SelectValue placeholder="Select a contract (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Contract</SelectItem>
                  {contracts.map(contract => (
                    <SelectItem key={contract.id} value={contract.id}>
                      <div className="flex items-center gap-2">
                        <FileText className="w-3 h-3" />
                        {contract.contractNumber} - {contract.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Link this project to a contract for billing rates
              </p>
            </div>
            {formData.contractId && awardedOptions.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="contractOptionId">Awarded Option</Label>
                <Select 
                  value={formData.contractOptionId || "none"} 
                  onValueChange={(value) => setFormData({ ...formData, contractOptionId: value === "none" ? "" : value })}
                >
                  <SelectTrigger data-testid="select-contract-option">
                    <SelectValue placeholder="Select an awarded option (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Specific Option</SelectItem>
                    {awardedOptions.map(option => (
                      <SelectItem key={option.id} value={option.id}>
                        Option {option.optionNumber}{option.name ? `: ${option.name}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Link to a specific awarded option for rate and budget tracking
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  data-testid="input-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="substantialCompletionDate">Substantial Completion</Label>
                <Input
                  id="substantialCompletionDate"
                  type="date"
                  value={formData.substantialCompletionDate}
                  onChange={(e) => setFormData({ ...formData, substantialCompletionDate: e.target.value })}
                  data-testid="input-substantial-completion-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="finalCloseoutDate">Final Closeout</Label>
                <Input
                  id="finalCloseoutDate"
                  type="date"
                  value={formData.finalCloseoutDate}
                  onChange={(e) => setFormData({ ...formData, finalCloseoutDate: e.target.value })}
                  data-testid="input-final-closeout-date"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <h3 className="font-medium text-sm text-muted-foreground">Budget Tracking</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budgetAmount">Project Budget ($)</Label>
                <Input
                  id="budgetAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.budgetAmount}
                  onChange={(e) => setFormData({ ...formData, budgetAmount: e.target.value })}
                  data-testid="input-budget-amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="baseBudget">Base Budget ($)</Label>
                <Input
                  id="baseBudget"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={formData.baseBudget}
                  onChange={(e) => setFormData({ ...formData, baseBudget: e.target.value })}
                  data-testid="input-base-budget"
                />
                <p className="text-xs text-muted-foreground">
                  Work done before tracking started (stacks with reports)
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setEditingProject(null);
                setFormData({ name: "", projectNumber: "", client: "", clientId: "", address: "", distributionEmails: "", contractId: "", contractOptionId: "", startDate: "", substantialCompletionDate: "", finalCloseoutDate: "", budgetAmount: "", baseBudget: "" });
              }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingProject) {
                  updateMutation.mutate({ ...formData, id: editingProject.id });
                } else {
                  createMutation.mutate(formData);
                }
              }}
              disabled={!formData.name.trim() || !formData.projectNumber.trim() || createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit"
            >
              {editingProject 
                ? (updateMutation.isPending ? "Saving..." : "Save Changes")
                : (createMutation.isPending ? "Creating..." : "Create Project")
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!projectToDelete} onOpenChange={() => setProjectToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{projectToDelete?.name}"? This will also delete all associated reports and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => projectToDelete && deleteMutation.mutate(projectToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}

import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useState, useMemo, useEffect } from "react";
import type { Project, Contract, Client, ContractWithProjects, ContractOption, ProjectBillingRate, ContractOptionInspector, Proposal, ProposalWithDetails } from "@shared/schema";
import { ClientSelect } from "@/components/client-select";
import { Switch } from "@/components/ui/switch";
import { InspectorSelector } from "@/components/inspector-selector";
import { DollarSign, Users } from "lucide-react";
import { parseDateSafe, toDateInputValue } from "@/lib/timezone";

type BillingRateEntry = {
  title: string;
  inspectorName: string;
  rate: string;
  hours: string;
  scheduleType: "fullTime" | "partTime";
};

const emptyBillingRate: BillingRateEntry = {
  title: "",
  inspectorName: "",
  rate: "",
  hours: "",
  scheduleType: "fullTime",
};

type BaseHoursEntry = {
  inspectorName: string;
  regularHours: string;
  overtimeHours: string;
  billedAmount: string;
  notes: string;
};

const emptyBaseHoursEntry: BaseHoursEntry = {
  inspectorName: "",
  regularHours: "",
  overtimeHours: "",
  billedAmount: "",
  notes: "",
};

export default function CompanyProjectsPage() {
  const { toast } = useToast();
  const { activeCompany, isCompanyAdmin, isEffectiveCompanyAdmin, isCompaniesLoading } = useAuth();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const clientIdFilter = searchParams.get("clientId");
  const projectIdFilter = searchParams.get("projectId");
  const editMode = searchParams.get("edit") === "true";
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [linkedProposal, setLinkedProposal] = useState<ProposalWithDetails | null>(null);
  const [autoEditHandled, setAutoEditHandled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    projectNumber: "",
    dsaFileNo: "",
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
    budgetedHours: "",
    baseBudget: "",
    budgetTrackingMode: "" as "" | "daily_reports" | "scheduled" | "hybrid", // empty = inherit from contract
    inheritBillingRates: true, // true = inherit from contract option
    scopeOfWork: "",
    projectValue: "",
  });
  const [billingRates, setBillingRates] = useState<BillingRateEntry[]>([{ ...emptyBillingRate }]);
  const [baseHours, setBaseHours] = useState<BaseHoursEntry[]>([]);

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

  // Get inherited billing rates from the selected contract option
  const inheritedRates = useMemo(() => {
    if (!formData.contractOptionId || !selectedContract?.options) return [];
    const selectedOption = selectedContract.options.find(opt => opt.id === formData.contractOptionId);
    if (!selectedOption?.inspectors) return [];
    return selectedOption.inspectors.map((ins: ContractOptionInspector) => ({
      title: ins.title,
      inspectorName: ins.inspectorName || "",
      rate: ins.rate,
      hours: ins.hours,
      scheduleType: (ins.scheduleType as "fullTime" | "partTime") || "fullTime",
    }));
  }, [formData.contractOptionId, selectedContract]);

  // Billing rate helper functions
  const addBillingRate = () => {
    setBillingRates([...billingRates, { ...emptyBillingRate }]);
  };

  const removeBillingRate = (index: number) => {
    if (billingRates.length <= 1) return;
    setBillingRates(billingRates.filter((_, i) => i !== index));
  };

  const updateBillingRate = (index: number, field: keyof BillingRateEntry, value: string) => {
    setBillingRates(billingRates.map((rate, i) => 
      i === index ? { ...rate, [field]: value } : rate
    ));
  };

  // Base hours helper functions
  const addBaseHoursEntry = () => {
    setBaseHours([...baseHours, { ...emptyBaseHoursEntry }]);
  };

  const removeBaseHoursEntry = (index: number) => {
    setBaseHours(baseHours.filter((_, i) => i !== index));
  };

  const updateBaseHoursEntry = (index: number, field: keyof BaseHoursEntry, value: string) => {
    setBaseHours(baseHours.map((entry, i) => 
      i === index ? { ...entry, [field]: value } : entry
    ));
  };

  const calculateBaseHoursTotal = () => {
    let totalRegular = 0;
    let totalOvertime = 0;
    let totalBilled = 0;
    for (const entry of baseHours) {
      totalRegular += parseFloat(entry.regularHours) || 0;
      totalOvertime += parseFloat(entry.overtimeHours) || 0;
      totalBilled += parseFloat(entry.billedAmount) || 0;
    }
    return { totalRegular, totalOvertime, totalBilled };
  };

  const calculateBillingRateTotal = (rate: BillingRateEntry) => {
    const hourlyRate = parseFloat(rate.rate) || 0;
    const hours = parseFloat(rate.hours) || 0;
    return hourlyRate * hours;
  };

  const calculateTotalBillingAmount = (rates: BillingRateEntry[]) => {
    return rates.reduce((sum, rate) => sum + calculateBillingRateTotal(rate), 0);
  };

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
      const startDate = project.startDate ? parseDateSafe(project.startDate) : null;
      const completionDate = project.substantialCompletionDate ? parseDateSafe(project.substantialCompletionDate) : null;
      const closeoutDate = project.finalCloseoutDate ? parseDateSafe(project.finalCloseoutDate) : null;
      
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

  // Helper to derive a project status badge based on dates
  const getProjectStatus = (project: Project): { label: string; variant: "info" | "success" | "muted" } => {
    const now = new Date();
    const startDate = project.startDate ? parseDateSafe(project.startDate) : null;
    const completionDate = project.substantialCompletionDate ? parseDateSafe(project.substantialCompletionDate) : null;
    const closeoutDate = project.finalCloseoutDate ? parseDateSafe(project.finalCloseoutDate) : null;

    if ((closeoutDate && closeoutDate < now) || (completionDate && completionDate < now)) {
      return { label: "Completed", variant: "muted" };
    }
    if (!startDate || startDate > now) {
      return { label: "Upcoming", variant: "info" };
    }
    return { label: "Active", variant: "success" };
  };

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
    mutationFn: async (data: typeof formData & { billingRates?: BillingRateEntry[]; baseHours?: BaseHoursEntry[] }) => {
      const response = await apiRequest("POST", "/api/projects", {
        ...data,
        companyId: activeCompany?.id,
        contractId: data.contractId || null,
        contractOptionId: data.contractOptionId || null,
        clientId: data.clientId || null,
        distributionEmails: data.distributionEmails
          ? data.distributionEmails.split(",").map((e) => e.trim()).filter(Boolean)
          : [],
      });
      const project = await response.json();
      
      // Save billing rates if not inheriting and rates have valid data
      if (!data.inheritBillingRates && data.billingRates && data.billingRates.length > 0) {
        const validRates = data.billingRates.filter(r => r.title && r.rate && r.hours);
        if (validRates.length > 0) {
          await apiRequest("PUT", `/api/projects/${project.id}/billing-rates`, { rates: validRates });
        }
      }
      
      // Save base hours if any entries have valid data
      if (data.baseHours && data.baseHours.length > 0) {
        const validEntries = data.baseHours.filter(e => e.inspectorName && (parseFloat(e.regularHours) > 0 || parseFloat(e.overtimeHours) > 0));
        if (validEntries.length > 0) {
          await apiRequest("PUT", `/api/projects/${project.id}/base-hours`, { entries: validEntries });
        }
      }
      
      return project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setShowCreateDialog(false);
      setFormData({ name: "", projectNumber: "", dsaFileNo: "", client: "", clientId: "", address: "", distributionEmails: "", contractId: "", contractOptionId: "", startDate: "", substantialCompletionDate: "", finalCloseoutDate: "", budgetAmount: "", budgetedHours: "", baseBudget: "", budgetTrackingMode: "", inheritBillingRates: true, scopeOfWork: "", projectValue: "" });
      setBillingRates([{ ...emptyBillingRate }]);
      setBaseHours([]);
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
    mutationFn: async (data: typeof formData & { id: string; billingRates?: BillingRateEntry[]; baseHours?: BaseHoursEntry[] }) => {
      const project = await apiRequest("PATCH", `/api/projects/${data.id}`, {
        ...data,
        contractId: data.contractId || null,
        contractOptionId: data.contractOptionId || null,
        clientId: data.clientId || null,
        distributionEmails: data.distributionEmails
          ? data.distributionEmails.split(",").map((e) => e.trim()).filter(Boolean)
          : [],
      });
      
      // Save billing rates - either custom rates or clear them if inheriting
      if (!data.inheritBillingRates && data.billingRates && data.billingRates.length > 0) {
        const validRates = data.billingRates.filter(r => r.title && r.rate && r.hours);
        await apiRequest("PUT", `/api/projects/${data.id}/billing-rates`, { rates: validRates });
      } else if (data.inheritBillingRates) {
        // Clear any existing custom rates when switching to inherit
        await apiRequest("PUT", `/api/projects/${data.id}/billing-rates`, { rates: [] });
      }
      
      // Save base hours entries
      if (data.baseHours) {
        const validEntries = data.baseHours.filter(e => e.inspectorName && (parseFloat(e.regularHours) > 0 || parseFloat(e.overtimeHours) > 0));
        await apiRequest("PUT", `/api/projects/${data.id}/base-hours`, { entries: validEntries });
      }
      
      return project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setEditingProject(null);
      setLinkedProposal(null);
      setFormData({ name: "", projectNumber: "", dsaFileNo: "", client: "", clientId: "", address: "", distributionEmails: "", contractId: "", contractOptionId: "", startDate: "", substantialCompletionDate: "", finalCloseoutDate: "", budgetAmount: "", budgetedHours: "", baseBudget: "", budgetTrackingMode: "", inheritBillingRates: true, scopeOfWork: "", projectValue: "" });
      setBillingRates([{ ...emptyBillingRate }]);
      setBaseHours([]);
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

  const handleEdit = async (project: Project) => {
    const inheritRates = (project as any).inheritBillingRates !== false; // default true
    
    // Fetch the linked proposal to get contract linkage if project doesn't have it directly
    let proposalContractId = "";
    let proposal: ProposalWithDetails | null = null;
    try {
      const proposalResponse = await fetch(`/api/projects/${project.id}/linked-proposal`, { credentials: "include" });
      if (proposalResponse.ok) {
        const proposalData = await proposalResponse.json();
        if (proposalData) {
          proposal = proposalData;
          // If project doesn't have contractId but proposal does, use proposal's contractId
          if (!project.contractId && proposalData.contractId) {
            proposalContractId = proposalData.contractId;
          }
        }
      }
    } catch (e) {
      console.error("Failed to load linked proposal", e);
    }
    setLinkedProposal(proposal);
    
    // Use project's contractId first, fall back to proposal's contractId
    const effectiveContractId = project.contractId || proposalContractId;
    
    // Derive contractOptionId: if project has a contractId (direct or from proposal) but no contractOptionId,
    // find the first awarded option on the contract
    let effectiveContractOptionId = (project as any).contractOptionId || "";
    if (effectiveContractId && !effectiveContractOptionId) {
      const linkedContract = contracts.find(c => c.id === effectiveContractId);
      if (linkedContract?.options) {
        const awardedOption = linkedContract.options.find(opt => opt.awardStatus === "awarded");
        if (awardedOption) {
          effectiveContractOptionId = awardedOption.id;
        }
      }
    }
    
    setFormData({
      name: project.name,
      projectNumber: project.projectNumber,
      dsaFileNo: project.dsaFileNo || "",
      client: project.client || "",
      clientId: project.clientId || "",
      address: project.address || "",
      distributionEmails: (project.distributionEmails as string[])?.join(", ") || "",
      contractId: effectiveContractId,
      contractOptionId: effectiveContractOptionId,
      startDate: project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : "",
      substantialCompletionDate: project.substantialCompletionDate ? new Date(project.substantialCompletionDate).toISOString().split('T')[0] : "",
      finalCloseoutDate: project.finalCloseoutDate ? new Date(project.finalCloseoutDate).toISOString().split('T')[0] : "",
      budgetAmount: project.budgetAmount || "",
      budgetedHours: project.budgetedHours || "",
      baseBudget: project.baseBudget || "",
      budgetTrackingMode: project.budgetTrackingMode || "",
      inheritBillingRates: inheritRates,
      scopeOfWork: project.scopeOfWork || "",
      projectValue: project.projectValue || "",
    });
    
    // Load existing billing rates if not inheriting
    if (!inheritRates) {
      try {
        const response = await fetch(`/api/projects/${project.id}/billing-rates`, { credentials: "include" });
        if (response.ok) {
          const rates: ProjectBillingRate[] = await response.json();
          if (rates.length > 0) {
            setBillingRates(rates.map(r => ({
              title: r.title,
              inspectorName: r.inspectorName || "",
              rate: r.rate,
              hours: r.hours,
              scheduleType: (r.scheduleType as "fullTime" | "partTime") || "fullTime",
            })));
          } else {
            setBillingRates([{ ...emptyBillingRate }]);
          }
        }
      } catch (e) {
        console.error("Failed to load billing rates", e);
        setBillingRates([{ ...emptyBillingRate }]);
      }
    } else {
      setBillingRates([{ ...emptyBillingRate }]);
    }
    
    // Load existing base hours
    try {
      const baseHoursResponse = await fetch(`/api/projects/${project.id}/base-hours`, { credentials: "include" });
      if (baseHoursResponse.ok) {
        const entries = await baseHoursResponse.json();
        if (entries.length > 0) {
          setBaseHours(entries.map((e: any) => ({
            inspectorName: e.inspectorName || "",
            regularHours: e.regularHours || "",
            overtimeHours: e.overtimeHours || "",
            billedAmount: e.billedAmount || "",
            notes: e.notes || "",
          })));
        } else {
          setBaseHours([]);
        }
      }
    } catch (e) {
      console.error("Failed to load base hours", e);
      setBaseHours([]);
    }
    
    setEditingProject(project);
  };

  // Auto-open edit dialog when edit=true is in URL
  useEffect(() => {
    if (editMode && selectedProject && !autoEditHandled) {
      setAutoEditHandled(true);
      handleEdit(selectedProject);
    }
  }, [editMode, selectedProject, autoEditHandled]);

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
        <PageHeader
          icon={FolderOpen}
          title={selectedProject ? selectedProject.name : selectedClient ? `Projects for ${selectedClient.name}` : "Projects"}
          subtitle={selectedProject ? `Project #${selectedProject.projectNumber || 'N/A'}` : selectedClient ? `Showing ${filteredProjects.length} project${filteredProjects.length !== 1 ? "s" : ""} for this client` : `Manage projects for ${activeCompany.name}`}
        >
          <Button
            className="bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] hover:bg-[hsl(36,90%,45%)] font-semibold"
            onClick={() => setShowCreateDialog(true)}
            data-testid="button-create-project"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </PageHeader>

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
              // Navigate to project dashboard
              const projectLink = `/project/${project.id}/dashboard`;
              
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
                    {(() => {
                      const status = getProjectStatus(project);
                      return (
                        <div>
                          <Badge variant={status.variant} className="text-xs" data-testid={`badge-status-${project.id}`}>
                            {status.label}
                          </Badge>
                        </div>
                      );
                    })()}
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
          setLinkedProposal(null);
          setFormData({ name: "", projectNumber: "", dsaFileNo: "", client: "", clientId: "", address: "", distributionEmails: "", contractId: "", contractOptionId: "", startDate: "", substantialCompletionDate: "", finalCloseoutDate: "", budgetAmount: "", budgetedHours: "", baseBudget: "", budgetTrackingMode: "", inheritBillingRates: true, scopeOfWork: "", projectValue: "" });
          setBillingRates([{ ...emptyBillingRate }]);
          setBaseHours([]);
        }
      }}>
        <DialogContent className="max-h-[90vh] max-w-2xl p-0">
          <div className="flex flex-col max-h-[90vh]">
          <DialogHeader className="flex-shrink-0 p-6 pb-0">
            <DialogTitle>{editingProject ? "Edit Project" : "Create Project"}</DialogTitle>
            <DialogDescription>
              {editingProject ? "Update project details" : "Add a new project to your company"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 pt-4">
            <div className="space-y-4">
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
              <Label htmlFor="dsaFileNo">DSA File No.</Label>
              <Input
                id="dsaFileNo"
                value={formData.dsaFileNo}
                onChange={(e) => setFormData({ ...formData, dsaFileNo: e.target.value })}
                placeholder="e.g., 01-118234"
                data-testid="input-dsa-file-no"
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
              <Label htmlFor="projectValue">Project Value</Label>
              <Input
                id="projectValue"
                value={formData.projectValue}
                onChange={(e) => setFormData({ ...formData, projectValue: e.target.value })}
                placeholder="e.g. $20 Million"
                data-testid="input-project-value"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scopeOfWork">Scope of Work</Label>
              <Textarea
                id="scopeOfWork"
                value={formData.scopeOfWork}
                onChange={(e) => setFormData({ ...formData, scopeOfWork: e.target.value })}
                placeholder="Describe the scope of work for this project"
                rows={3}
                data-testid="input-scope-of-work"
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
              {linkedProposal && formData.contractId && !editingProject?.contractId && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Contract linked via Proposal #{linkedProposal.proposalNumber}
                </p>
              )}
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
                {linkedProposal && formData.contractOptionId && !(editingProject as any)?.contractOptionId && (
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    Option auto-selected from contract (first awarded option)
                  </p>
                )}
              </div>
            )}
            <div className="pt-2 border-t space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-sm font-medium">Schedule Dates</Label>
                {linkedProposal && (linkedProposal.startDate || linkedProposal.endDate) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const startDate = linkedProposal.startDate 
                        ? toDateInputValue(linkedProposal.startDate) 
                        : "";
                      const endDate = linkedProposal.endDate 
                        ? toDateInputValue(linkedProposal.endDate) 
                        : "";
                      setFormData({ 
                        ...formData, 
                        startDate: startDate || formData.startDate,
                        finalCloseoutDate: endDate || formData.finalCloseoutDate,
                      });
                      toast({
                        title: "Schedule Copied",
                        description: `Copied dates from Proposal #${linkedProposal.proposalNumber}`,
                      });
                    }}
                    data-testid="button-copy-schedule-from-proposal"
                  >
                    <FileText className="w-3 h-3 mr-1" />
                    Copy Schedule from Proposal
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

            {/* Budget Tracking */}
            <div className="space-y-4 pt-2 border-t">
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
                <Label htmlFor="budgetedHours">Budgeted Hours</Label>
                <Input
                  id="budgetedHours"
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="0"
                  value={formData.budgetedHours}
                  onChange={(e) => setFormData({ ...formData, budgetedHours: e.target.value })}
                  data-testid="input-budgeted-hours"
                />
                <p className="text-xs text-muted-foreground">Total hours allocated for this project</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budgetTrackingMode">Budget Tracking Mode</Label>
              <Select 
                value={formData.budgetTrackingMode || "inherit"} 
                onValueChange={(value) => setFormData({ ...formData, budgetTrackingMode: value === "inherit" ? "" : value as "" | "daily_reports" | "scheduled" | "hybrid" })}
              >
                <SelectTrigger data-testid="select-budget-tracking-mode">
                  <SelectValue placeholder="Inherit from contract" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">Inherit from Contract</SelectItem>
                  <SelectItem value="daily_reports">Daily Reports</SelectItem>
                  <SelectItem value="scheduled">Scheduled Hours</SelectItem>
                  <SelectItem value="hybrid">Hybrid (Both)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {!formData.budgetTrackingMode
                  ? "Uses the tracking mode set on the linked contract"
                  : formData.budgetTrackingMode === "daily_reports"
                  ? "Track based on actual logged daily report hours"
                  : formData.budgetTrackingMode === "scheduled"
                  ? "Track based on scheduled hours (FT/PT × working days)"
                  : "Show both scheduled and actual side-by-side"}
              </p>
            </div>
            </div>

            {/* Billing Rates Section */}
            <div className="space-y-4 pt-2 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-medium text-sm">Billing Rates</h3>
              </div>
              {formData.contractOptionId && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="inheritBillingRates" className="text-sm text-muted-foreground">
                    Inherit from contract
                  </Label>
                  <Switch
                    id="inheritBillingRates"
                    checked={formData.inheritBillingRates}
                    onCheckedChange={(checked) => {
                      setFormData({ ...formData, inheritBillingRates: checked });
                      if (checked) {
                        setBillingRates([{ ...emptyBillingRate }]);
                      }
                    }}
                    data-testid="switch-inherit-billing-rates"
                  />
                </div>
              )}
            </div>

            {formData.inheritBillingRates && formData.contractOptionId ? (
              // Show inherited rates (read-only)
              inheritedRates.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Rates inherited from linked contract option:</p>
                  <div className="space-y-2">
                    {inheritedRates.map((rate, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 bg-muted/50 rounded-md text-sm">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{rate.title}</span>
                        {rate.inspectorName && <span className="text-muted-foreground">({rate.inspectorName})</span>}
                        <span className="ml-auto text-green-600 dark:text-green-400 font-medium">
                          ${parseFloat(rate.rate).toLocaleString('en-US', { minimumFractionDigits: 2 })}/hr
                        </span>
                        <span className="text-muted-foreground">{rate.hours}hrs</span>
                        <Badge variant="secondary" className="text-xs">{rate.scheduleType === "fullTime" ? "FT" : "PT"}</Badge>
                      </div>
                    ))}
                    <div className="text-right text-sm font-medium text-green-600 dark:text-green-400">
                      Total: ${calculateTotalBillingAmount(inheritedRates).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No billing rates found on linked contract option
                </p>
              )
            ) : (
              // Custom billing rates editor
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs text-muted-foreground">Define custom billing rates for this project:</p>
                  <div className="flex gap-2">
                    {linkedProposal && linkedProposal.options && linkedProposal.options.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Copy rates from the first proposal option that has inspectors
                          const optionWithRates = linkedProposal.options?.find(opt => 
                            opt.inspectors && opt.inspectors.length > 0
                          );
                          if (optionWithRates?.inspectors) {
                            setBillingRates(optionWithRates.inspectors.map((ins: any) => ({
                              title: ins.title || "",
                              inspectorName: ins.inspectorName || "",
                              rate: ins.rate || "",
                              hours: ins.hours || "",
                              scheduleType: (ins.scheduleType as "fullTime" | "partTime") || "fullTime",
                            })));
                            toast({
                              title: "Rates Copied",
                              description: `Copied ${optionWithRates.inspectors.length} rates from Proposal #${linkedProposal.proposalNumber}`,
                            });
                          }
                        }}
                        data-testid="button-copy-from-proposal"
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        Copy from Proposal
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addBillingRate}
                      data-testid="button-add-billing-rate"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Rate
                    </Button>
                  </div>
                </div>
                
                {billingRates.map((rate, idx) => (
                  <Card key={idx} className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">Rate #{idx + 1}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                          ${calculateBillingRateTotal(rate).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                        {billingRates.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removeBillingRate(idx)}
                            data-testid={`button-remove-billing-rate-${idx}`}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Title/Role</Label>
                        <Input
                          className="h-9"
                          value={rate.title}
                          onChange={(e) => updateBillingRate(idx, "title", e.target.value)}
                          placeholder="e.g., DSA Class 1 Inspector"
                          data-testid={`input-billing-rate-title-${idx}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Inspector Name</Label>
                        <InspectorSelector
                          value=""
                          onValueChange={(_, option) => {
                            if (option) {
                              updateBillingRate(idx, "inspectorName", option.displayName);
                            }
                          }}
                          placeholder={rate.inspectorName || "Select or type..."}
                          allowEmpty
                          allowCreate
                          className="h-9"
                          data-testid={`select-billing-rate-inspector-${idx}`}
                        />
                        <Input
                          className="h-9 mt-1"
                          value={rate.inspectorName}
                          onChange={(e) => updateBillingRate(idx, "inspectorName", e.target.value)}
                          placeholder="Or type a name..."
                          data-testid={`input-billing-rate-inspector-${idx}`}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Schedule</Label>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant={rate.scheduleType === "fullTime" ? "default" : "outline"}
                            size="sm"
                            className="flex-1 h-9 text-xs px-2"
                            onClick={() => updateBillingRate(idx, "scheduleType", "fullTime")}
                            data-testid={`button-billing-rate-full-${idx}`}
                          >
                            FT (8hr)
                          </Button>
                          <Button
                            type="button"
                            variant={rate.scheduleType === "partTime" ? "default" : "outline"}
                            size="sm"
                            className="flex-1 h-9 text-xs px-2"
                            onClick={() => updateBillingRate(idx, "scheduleType", "partTime")}
                            data-testid={`button-billing-rate-part-${idx}`}
                          >
                            PT (4hr)
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Rate ($/hr)</Label>
                        <Input
                          className="h-9"
                          type="number"
                          step="0.01"
                          min="0"
                          value={rate.rate}
                          onChange={(e) => updateBillingRate(idx, "rate", e.target.value)}
                          placeholder="0.00"
                          data-testid={`input-billing-rate-rate-${idx}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Hours</Label>
                        <Input
                          className="h-9"
                          type="number"
                          step="0.5"
                          min="0"
                          value={rate.hours}
                          onChange={(e) => updateBillingRate(idx, "hours", e.target.value)}
                          placeholder="0"
                          data-testid={`input-billing-rate-hours-${idx}`}
                        />
                      </div>
                    </div>
                  </Card>
                ))}
                
                {billingRates.some(r => r.title && r.rate && r.hours) && (
                  <div className="text-right text-sm font-medium text-green-600 dark:text-green-400">
                    Total: ${calculateTotalBillingAmount(billingRates).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                )}
              </div>
            )}
            </div>

            {/* Pre-Onboarding Data Section - For mid-project onboarding */}
            <div className="space-y-4 pt-2 border-t">
            <div>
              <Label className="text-sm font-medium">Pre-Onboarding Data</Label>
              <p className="text-xs text-muted-foreground">Track hours and amounts from before this project was onboarded</p>
            </div>
            
            {/* Pre-Billed Amount */}
            <div className="space-y-2">
              <Label htmlFor="baseBudget" className="text-xs">Pre-Billed Amount ($)</Label>
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
              <p className="text-xs text-muted-foreground">Dollar amount already billed before onboarding</p>
            </div>
            
            {/* Base Hours Per Inspector */}
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-xs font-medium">Base Hours by Inspector</Label>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addBaseHoursEntry}
                data-testid="button-add-base-hours"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Entry
              </Button>
            </div>

            {baseHours.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No base hours entries. Add entries for inspectors who had hours before onboarding.</p>
            ) : (
              <div className="space-y-3">
                {baseHours.map((entry, idx) => (
                  <Card key={idx} className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">Entry #{idx + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeBaseHoursEntry(idx)}
                        data-testid={`button-remove-base-hours-${idx}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Inspector Name</Label>
                        <Input
                          className="h-9"
                          value={entry.inspectorName}
                          onChange={(e) => updateBaseHoursEntry(idx, "inspectorName", e.target.value)}
                          placeholder="Inspector name"
                          data-testid={`input-base-hours-inspector-${idx}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Notes</Label>
                        <Input
                          className="h-9"
                          value={entry.notes}
                          onChange={(e) => updateBaseHoursEntry(idx, "notes", e.target.value)}
                          placeholder="Optional notes"
                          data-testid={`input-base-hours-notes-${idx}`}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Regular Hours</Label>
                        <Input
                          className="h-9"
                          type="number"
                          step="0.5"
                          min="0"
                          value={entry.regularHours}
                          onChange={(e) => updateBaseHoursEntry(idx, "regularHours", e.target.value)}
                          placeholder="0"
                          data-testid={`input-base-hours-regular-${idx}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Overtime Hours</Label>
                        <Input
                          className="h-9"
                          type="number"
                          step="0.5"
                          min="0"
                          value={entry.overtimeHours}
                          onChange={(e) => updateBaseHoursEntry(idx, "overtimeHours", e.target.value)}
                          placeholder="0"
                          data-testid={`input-base-hours-overtime-${idx}`}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Billed Amount ($)</Label>
                        <Input
                          className="h-9"
                          type="number"
                          step="0.01"
                          min="0"
                          value={entry.billedAmount}
                          onChange={(e) => updateBaseHoursEntry(idx, "billedAmount", e.target.value)}
                          placeholder="0.00"
                          data-testid={`input-base-hours-billed-${idx}`}
                        />
                      </div>
                    </div>
                  </Card>
                ))}
                
                {baseHours.some(e => e.inspectorName && (parseFloat(e.regularHours) > 0 || parseFloat(e.overtimeHours) > 0)) && (
                  <div className="text-right text-sm font-medium">
                    {(() => {
                      const totals = calculateBaseHoursTotal();
                      return (
                        <span>
                          Total: {totals.totalRegular + totals.totalOvertime} hrs 
                          ({totals.totalRegular} regular, {totals.totalOvertime} OT)
                          {totals.totalBilled > 0 && (
                            <span className="text-green-600 dark:text-green-400 ml-2">
                              ${totals.totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
            </div>
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 p-6 pt-4 border-t gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setEditingProject(null);
                setLinkedProposal(null);
                setFormData({ name: "", projectNumber: "", dsaFileNo: "", client: "", clientId: "", address: "", distributionEmails: "", contractId: "", contractOptionId: "", startDate: "", substantialCompletionDate: "", finalCloseoutDate: "", budgetAmount: "", budgetedHours: "", baseBudget: "", budgetTrackingMode: "", inheritBillingRates: true, scopeOfWork: "", projectValue: "" });
                setBillingRates([{ ...emptyBillingRate }]);
                setBaseHours([]);
              }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingProject) {
                  updateMutation.mutate({ ...formData, id: editingProject.id, billingRates, baseHours });
                } else {
                  createMutation.mutate({ ...formData, billingRates, baseHours });
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
          </div>
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

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
  Check,
  ArrowLeft,
  MapPin,
  AlertCircle,
  Building2,
  Hash,
  Plus,
  Link as LinkIcon,
  FileText,
  Loader2,
  Calendar,
  Download,
  Trash2,
  Clock,
  FileStack,
  Receipt,
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { formatPacificDate } from "@/lib/timezone";
import { PageHeader } from "@/components/layout/page-header";
import type { Project, Company } from "@shared/schema";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface InvoiceData {
  project: {
    id: string;
    name: string;
    projectNumber: string;
    client: string | null;
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
  totals: {
    regularHours: number;
    otHours: number;
    totalHours: number;
    reportCount: number;
  };
  reports: Array<{
    id: string;
    date: string;
    inspectorName: string;
    timeIn: string | null;
    timeOut: string | null;
    regularHours: number;
    otHours: number;
  }>;
}

export default function MyProjectsPage() {
  const { toast } = useToast();
  const { companies, isCompanyAdmin, isEffectiveSystemAdmin } = useAuth();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [formData, setFormData] = useState({
    name: "",
    projectNumber: "",
    client: "",
    address: "",
    companyId: "",
  });
  
  // Delete state
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  
  // Invoice dialog state
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [invoiceProject, setInvoiceProject] = useState<Project | null>(null);
  const [invoiceStartDate, setInvoiceStartDate] = useState<Date | undefined>(startOfMonth(new Date()));
  const [invoiceEndDate, setInvoiceEndDate] = useState<Date | undefined>(endOfMonth(new Date()));
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isGeneratingTimesheet, setIsGeneratingTimesheet] = useState(false);
  const [isGeneratingCombined, setIsGeneratingCombined] = useState(false);
  const [isGeneratingInspectorInvoice, setIsGeneratingInspectorInvoice] = useState(false);

  const [showMultiProjectDialog, setShowMultiProjectDialog] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [multiProjectMonth, setMultiProjectMonth] = useState<Date | undefined>(startOfMonth(new Date()));
  const [isGeneratingMultiTimesheet, setIsGeneratingMultiTimesheet] = useState(false);
  const [isGeneratingMultiCombined, setIsGeneratingMultiCombined] = useState(false);
  const [isGeneratingMultiInvoice, setIsGeneratingMultiInvoice] = useState(false);

  const { data: projects = [], isLoading, error } = useQuery<Project[]>({
    queryKey: ["/api/my-projects"],
  });

  const { data: profile } = useQuery<{ activeProjectId?: string; activeCompanyId?: string }>({
    queryKey: ["/api/profile"],
  });

  // Fetch all companies for system admins
  const { data: allCompanies = [] } = useQuery<Company[]>({
    queryKey: ["/api/admin/companies"],
    enabled: isEffectiveSystemAdmin,
  });

  const switchMutation = useMutation({
    mutationFn: async (projectId: string) => {
      return apiRequest("POST", "/api/switch-project", { projectId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Project Switched",
        description: "You are now viewing the selected project.",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      // Only include companyId if one is selected
      const payload = {
        name: data.name,
        projectNumber: data.projectNumber,
        client: data.client,
        address: data.address,
        ...(data.companyId ? { companyId: data.companyId } : {}),
      };
      return apiRequest("POST", "/api/projects", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowCreateDialog(false);
      setFormData({ name: "", projectNumber: "", client: "", address: "", companyId: "" });
      toast({
        title: "Project Created",
        description: "Your new project has been created.",
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

  const assignMutation = useMutation({
    mutationFn: async ({ projectId, companyId }: { projectId: string; companyId: string }) => {
      return apiRequest("PATCH", `/api/projects/${projectId}`, { companyId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowAssignDialog(false);
      setSelectedProject(null);
      setSelectedCompanyId("");
      toast({
        title: "Project Assigned",
        description: "Project has been assigned to the company.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign project.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-projects"] });
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
        description: error.message || "Failed to delete project. Projects with reports cannot be deleted.",
        variant: "destructive",
      });
    },
  });

  const handleAssignToCompany = (project: Project) => {
    setSelectedProject(project);
    setSelectedCompanyId("");
    setShowAssignDialog(true);
  };

  const handleOpenInvoice = (project: Project) => {
    setInvoiceProject(project);
    setInvoiceData(null);
    // Default to current month
    setInvoiceStartDate(startOfMonth(new Date()));
    setInvoiceEndDate(endOfMonth(new Date()));
    setShowInvoiceDialog(true);
  };

  const fetchInvoiceData = async () => {
    if (!invoiceProject || !invoiceStartDate || !invoiceEndDate) return;
    
    setIsLoadingInvoice(true);
    try {
      const startStr = format(invoiceStartDate, "yyyy-MM-dd");
      const endStr = format(invoiceEndDate, "yyyy-MM-dd");
      const response = await fetch(
        `/api/projects/${invoiceProject.id}/invoice-hours?startDate=${startStr}&endDate=${endStr}`,
        { credentials: "include" }
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch invoice data");
      }
      
      const data = await response.json();
      setInvoiceData(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to calculate invoice hours",
        variant: "destructive",
      });
    } finally {
      setIsLoadingInvoice(false);
    }
  };

  const exportInvoicePdf = async () => {
    if (!invoiceProject || !invoiceStartDate || !invoiceEndDate) return;
    
    setIsExportingPdf(true);
    try {
      const startStr = format(invoiceStartDate, "yyyy-MM-dd");
      const endStr = format(invoiceEndDate, "yyyy-MM-dd");
      const response = await fetch(
        `/api/projects/${invoiceProject.id}/invoice-pdf?startDate=${startStr}&endDate=${endStr}`,
        { credentials: "include" }
      );
      
      if (!response.ok) {
        throw new Error("Failed to generate invoice PDF");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice_${invoiceProject.projectNumber || invoiceProject.name}_${startStr}_to_${endStr}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "PDF Exported",
        description: "Invoice PDF has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export invoice PDF",
        variant: "destructive",
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const generateTimesheet = async () => {
    if (!invoiceProject || !invoiceStartDate) return;
    
    setIsGeneratingTimesheet(true);
    try {
      const month = invoiceStartDate.getMonth() + 1;
      const year = invoiceStartDate.getFullYear();
      
      const response = await fetch("/api/billing/timesheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: invoiceProject.id,
          month,
          year,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to generate timesheet");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Timesheet_${invoiceProject.projectNumber || invoiceProject.name}_${format(invoiceStartDate, "MMMM-yyyy")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Timesheet Generated",
        description: "Timesheet PDF has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate timesheet",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingTimesheet(false);
    }
  };

  const generateCombinedReports = async () => {
    if (!invoiceProject || !invoiceStartDate) return;
    
    setIsGeneratingCombined(true);
    try {
      const month = invoiceStartDate.getMonth() + 1;
      const year = invoiceStartDate.getFullYear();
      
      const response = await fetch("/api/billing/combined-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: invoiceProject.id,
          month,
          year,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to generate combined reports");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Combined_Reports_${invoiceProject.projectNumber || invoiceProject.name}_${format(invoiceStartDate, "MMMM-yyyy")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Combined Reports Generated",
        description: "Combined reports PDF has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate combined reports",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingCombined(false);
    }
  };

  const generateInspectorInvoice = async () => {
    if (!invoiceProject || !invoiceStartDate) return;
    
    setIsGeneratingInspectorInvoice(true);
    try {
      const month = invoiceStartDate.getMonth() + 1;
      const year = invoiceStartDate.getFullYear();
      
      const response = await fetch("/api/billing/inspector-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: invoiceProject.id,
          month,
          year,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to generate inspector invoice");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Inspector_Invoice_${invoiceProject.projectNumber || invoiceProject.name}_${format(invoiceStartDate, "MMMM-yyyy")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Inspector Invoice Generated",
        description: "Your invoice PDF has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate inspector invoice",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingInspectorInvoice(false);
    }
  };

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds(prev => {
      if (prev.includes(projectId)) return prev.filter(id => id !== projectId);
      if (prev.length >= 5) return prev;
      return [...prev, projectId];
    });
  };

  const multiProjectDownload = async (endpoint: string, filenamePrefix: string, setLoading: (v: boolean) => void) => {
    if (selectedProjectIds.length === 0 || !multiProjectMonth) return;
    setLoading(true);
    try {
      const month = multiProjectMonth.getMonth() + 1;
      const year = multiProjectMonth.getFullYear();
      const response = await fetch(`/api/billing/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectIds: selectedProjectIds, month, year }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to generate PDF");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filenamePrefix}_${format(multiProjectMonth, "MMMM-yyyy")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: "PDF Generated", description: "Your PDF has been downloaded." });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate PDF",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Get companies where user is admin
  const adminCompanies = companies.filter(c => c.role === "admin");
  
  // For system admins, use all companies; for company admins, use their admin companies
  // Convert allCompanies to same format as adminCompanies for consistency
  const assignableCompanies = isEffectiveSystemAdmin 
    ? allCompanies.map(c => ({ companyId: c.id, company: c, role: "admin" as const }))
    : adminCompanies;

  if (isLoading) {
    return (
      <PageLayout title="My Projects">
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
      <PageLayout title="My Projects">
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
    <PageLayout title="My Projects">
      <PageHeader
        icon={FolderOpen}
        title="My Projects"
        subtitle="Projects you are assigned to"
      >
        {projects.length >= 2 && (
          <Button
            variant="outline"
            className="border-white/30 text-white hover:bg-white/10"
            onClick={() => {
              setSelectedProjectIds([]);
              setMultiProjectMonth(startOfMonth(new Date()));
              setShowMultiProjectDialog(true);
            }}
            data-testid="button-multi-project-billing"
          >
            <FileStack className="w-4 h-4 mr-2" />
            Multi-Project Billing
          </Button>
        )}
        <Button className="bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] hover:bg-[hsl(36,90%,45%)] font-semibold" onClick={() => setShowCreateDialog(true)} data-testid="button-create-project">
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Button>
      </PageHeader>

      <div className="space-y-6">

        {projects.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded bg-primary/10 flex items-center justify-center mb-4">
                <FolderOpen className="w-8 h-8 text-primary" />
              </div>
              <p className="text-lg font-semibold">No projects yet</p>
              <p className="text-muted-foreground mb-5">
                Create your first project to get started
              </p>
              <Button className="bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] hover:bg-[hsl(36,90%,45%)] font-semibold" onClick={() => setShowCreateDialog(true)} data-testid="button-create-first">
                <Plus className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((project) => {
              const isActive = project.id === profile?.activeProjectId;
              const isPersonal = !project.companyId;

              return (
                <Card 
                  key={project.id} 
                  className={`hover-elevate border-l-4 ${isActive ? "border-l-[hsl(36,90%,50%)] ring-2 ring-[hsl(36,90%,50%)]/30" : "border-l-primary"}`}
                  data-testid={`card-project-${project.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <Link 
                        href={`/project/${project.id}/dashboard`}
                        className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                        data-testid={`link-project-dashboard-${project.id}`}
                      >
                        <FolderOpen className="w-5 h-5 text-muted-foreground" />
                        <CardTitle className="text-lg hover:text-primary transition-colors" data-testid={`text-project-name-${project.id}`}>
                          {project.name}
                        </CardTitle>
                      </Link>
                      <div className="flex items-center gap-1">
                        {isPersonal && (
                          <Badge variant="secondary" data-testid={`badge-personal-${project.id}`}>
                            Personal
                          </Badge>
                        )}
                        {isActive && (
                          <Badge variant="default" data-testid={`badge-active-${project.id}`}>
                            <Check className="w-3 h-3 mr-1" />
                            Active
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Link 
                      href={`/project/${project.id}/dashboard`}
                      className="block cursor-pointer"
                    >
                      <CardDescription className="flex items-center gap-2">
                        <Hash className="w-3 h-3" />
                        {project.projectNumber}
                      </CardDescription>
                    </Link>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Link 
                      href={`/project/${project.id}/dashboard`}
                      className="block cursor-pointer"
                    >
                      {project.client && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Building2 className="w-4 h-4" />
                          <span>{project.client}</span>
                        </div>
                      )}
                      {project.address && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                          <MapPin className="w-4 h-4" />
                          <span>{project.address}</span>
                        </div>
                      )}
                    </Link>
                    <div className="flex flex-col gap-2 mt-2">
                      {/* Show assign button for system admins (any project) or company admins (their company's projects) */}
                      {(isEffectiveSystemAdmin || (adminCompanies.length > 0 && (isPersonal || adminCompanies.some(c => c.companyId === project.companyId)))) && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => handleAssignToCompany(project)}
                          data-testid={`button-assign-${project.id}`}
                        >
                          <LinkIcon className="w-4 h-4 mr-2" />
                          {isPersonal ? "Assign to Company" : "Change Company Assignment"}
                        </Button>
                      )}
                      {!isActive && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => switchMutation.mutate(project.id)}
                          disabled={switchMutation.isPending}
                          data-testid={`button-switch-${project.id}`}
                        >
                          Switch to this Project
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => handleOpenInvoice(project)}
                        data-testid={`button-invoice-${project.id}`}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Generate Invoice
                      </Button>
                      {(isEffectiveSystemAdmin || isPersonal || adminCompanies.some(c => c.companyId === project.companyId)) && (
                        <Button
                          variant="outline"
                          className="w-full text-destructive"
                          onClick={() => setProjectToDelete(project)}
                          data-testid={`button-delete-${project.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Project
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>
              Create a new project. Optionally affiliate it with one of your companies.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
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
              <Input
                id="client"
                value={formData.client}
                onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                placeholder="Client name"
                data-testid="input-project-client"
              />
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
            {companies.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="companyId">Affiliate with Company (Optional)</Label>
                <Select 
                  value={formData.companyId || "__none__"} 
                  onValueChange={(value) => setFormData({ ...formData, companyId: value === "__none__" ? "" : value })}
                >
                  <SelectTrigger data-testid="select-create-company">
                    <SelectValue placeholder="No company (personal project)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No company (personal project)</SelectItem>
                    {companies.map((membership) => (
                      <SelectItem key={membership.companyId} value={membership.companyId}>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4" />
                          {membership.company?.name || "Unknown Company"}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Affiliating with a company makes the project visible to company admins.
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setFormData({ name: "", projectNumber: "", client: "", address: "", companyId: "" });
              }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(formData)}
              disabled={!formData.name.trim() || !formData.projectNumber.trim() || createMutation.isPending}
              data-testid="button-submit"
            >
              {createMutation.isPending ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAssignDialog} onOpenChange={(open) => {
        setShowAssignDialog(open);
        if (!open) {
          setSelectedProject(null);
          setSelectedCompanyId("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedProject?.companyId ? "Change Company Assignment" : "Assign to Company"}</DialogTitle>
            <DialogDescription>
              {selectedProject?.companyId 
                ? `Reassign "${selectedProject?.name}" to a different company.`
                : `Assign "${selectedProject?.name}" to a company you manage.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {/* Show current assignment status */}
            {selectedProject?.companyId && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-muted border">
                <Building2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">
                  Currently assigned to: <strong>{assignableCompanies.find(c => c.companyId === selectedProject.companyId)?.company?.name || "Another Company"}</strong>
                </span>
              </div>
            )}
            
            {/* Check if there are alternative companies available */}
            {assignableCompanies.filter(m => m.companyId !== selectedProject?.companyId).length === 0 ? (
              <div className="p-4 text-center text-muted-foreground border rounded-md bg-muted/50">
                <p className="text-sm">
                  {selectedProject?.companyId 
                    ? "No other companies available to reassign to. You need to be an admin of another company to transfer this project."
                    : "No companies available. You need to be an admin of a company to assign projects."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="company">Select Company</Label>
                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                  <SelectTrigger data-testid="select-company">
                    <SelectValue placeholder="Choose a company" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableCompanies
                      .filter(membership => membership.companyId !== selectedProject?.companyId)
                      .map((membership) => (
                        <SelectItem key={membership.companyId} value={membership.companyId}>
                          {membership.company?.name || "Unknown Company"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {isEffectiveSystemAdmin ? "All companies are shown (System Admin)." : "Only companies where you are an admin are shown."}
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowAssignDialog(false);
                setSelectedProject(null);
                setSelectedCompanyId("");
              }}
              data-testid="button-cancel-assign"
            >
              {assignableCompanies.filter(m => m.companyId !== selectedProject?.companyId).length === 0 ? "Close" : "Cancel"}
            </Button>
            {assignableCompanies.filter(m => m.companyId !== selectedProject?.companyId).length > 0 && (
              <Button
                onClick={() => selectedProject && assignMutation.mutate({ 
                  projectId: selectedProject.id, 
                  companyId: selectedCompanyId 
                })}
                disabled={!selectedCompanyId || assignMutation.isPending}
                data-testid="button-confirm-assign"
              >
                {assignMutation.isPending ? "Assigning..." : "Assign Project"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInvoiceDialog} onOpenChange={(open) => {
        setShowInvoiceDialog(open);
        if (!open) {
          setInvoiceProject(null);
          setInvoiceData(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Invoice</DialogTitle>
            <DialogDescription>
              Calculate hours worked for {invoiceProject?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-invoice-start-date"
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {invoiceStartDate ? format(invoiceStartDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={invoiceStartDate}
                      onSelect={setInvoiceStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-invoice-end-date"
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {invoiceEndDate ? format(invoiceEndDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={invoiceEndDate}
                      onSelect={setInvoiceEndDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            
            <Button
              onClick={fetchInvoiceData}
              disabled={!invoiceStartDate || !invoiceEndDate || isLoadingInvoice}
              className="w-full"
              data-testid="button-calculate-hours"
            >
              {isLoadingInvoice ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Calculating...
                </>
              ) : (
                "Calculate Hours"
              )}
            </Button>
            
            {invoiceData && (
              <div className="space-y-4 border-t pt-4">
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold" data-testid="text-total-reports">
                        {invoiceData.totals.reportCount}
                      </div>
                      <div className="text-sm text-muted-foreground">Reports</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold" data-testid="text-regular-hours">
                        {invoiceData.totals.regularHours.toFixed(2)}
                      </div>
                      <div className="text-sm text-muted-foreground">Regular Hours</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold" data-testid="text-ot-hours">
                        {invoiceData.totals.otHours.toFixed(2)}
                      </div>
                      <div className="text-sm text-muted-foreground">OT Hours</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold text-primary" data-testid="text-total-hours">
                        {invoiceData.totals.totalHours.toFixed(2)}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Hours</div>
                    </CardContent>
                  </Card>
                </div>
                
                {invoiceData.reports.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Daily Breakdown</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left p-2">Date</th>
                            <th className="text-left p-2 hidden sm:table-cell">Inspector</th>
                            <th className="text-right p-2">Reg Hrs</th>
                            <th className="text-right p-2">OT Hrs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoiceData.reports.map((report) => (
                            <tr key={report.id} className="border-t">
                              <td className="p-2">{formatPacificDate(report.date, "MMM d, yyyy")}</td>
                              <td className="p-2 hidden sm:table-cell">{report.inspectorName}</td>
                              <td className="p-2 text-right">{report.regularHours.toFixed(2)}</td>
                              <td className="p-2 text-right">{report.otHours.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-muted font-medium">
                          <tr>
                            <td className="p-2" colSpan={2}>Total</td>
                            <td className="p-2 text-right">{invoiceData.totals.regularHours.toFixed(2)}</td>
                            <td className="p-2 text-right">{invoiceData.totals.otHours.toFixed(2)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
                
                {invoiceData.reports.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    No reports found for the selected date range.
                  </div>
                )}
              </div>
            )}
          </div>
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowInvoiceDialog(false);
                setInvoiceProject(null);
                setInvoiceData(null);
              }}
              data-testid="button-close-invoice"
            >
              Close
            </Button>
            {invoiceData && invoiceData.reports.length > 0 && (
              <Button
                onClick={exportInvoicePdf}
                disabled={isExportingPdf}
                data-testid="button-export-invoice-pdf"
              >
                {isExportingPdf ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Export PDF
                  </>
                )}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={generateTimesheet}
              disabled={isGeneratingTimesheet || !invoiceStartDate}
              data-testid="button-generate-timesheet"
            >
              {isGeneratingTimesheet ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4 mr-2" />
                  Timesheet
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={generateCombinedReports}
              disabled={isGeneratingCombined || !invoiceStartDate}
              data-testid="button-generate-combined"
            >
              {isGeneratingCombined ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileStack className="w-4 h-4 mr-2" />
                  Combined Reports
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={generateInspectorInvoice}
              disabled={isGeneratingInspectorInvoice || !invoiceStartDate}
              data-testid="button-generate-inspector-invoice"
            >
              {isGeneratingInspectorInvoice ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Receipt className="w-4 h-4 mr-2" />
                  My Invoice
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMultiProjectDialog} onOpenChange={setShowMultiProjectDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Multi-Project Billing</DialogTitle>
            <DialogDescription>
              Select up to 5 projects to generate a combined timesheet, reports, or invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Month</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2" data-testid="button-multi-month-picker">
                    <Calendar className="w-4 h-4" />
                    {multiProjectMonth ? format(multiProjectMonth, "MMMM yyyy") : "Select month"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={multiProjectMonth}
                    onSelect={(date) => { if (date) setMultiProjectMonth(startOfMonth(date)); }}
                    data-testid="calendar-multi-month"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Projects ({selectedProjectIds.length}/5 selected)</Label>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {projects.map((project) => {
                  const isSelected = selectedProjectIds.includes(project.id);
                  const isDisabled = !isSelected && selectedProjectIds.length >= 5;
                  return (
                    <div
                      key={project.id}
                      className={`flex items-center gap-3 p-3 rounded-md cursor-pointer border ${isSelected ? "border-primary bg-primary/5" : "border-border"} ${isDisabled ? "opacity-50 cursor-not-allowed" : "hover-elevate"}`}
                      onClick={() => !isDisabled && toggleProjectSelection(project.id)}
                      data-testid={`multi-select-project-${project.id}`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isSelected ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                        {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{project.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          {project.projectNumber && <span>#{project.projectNumber}</span>}
                          {project.client && <span>{project.client}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setShowMultiProjectDialog(false)}
              data-testid="button-multi-close"
            >
              Close
            </Button>
            <Button
              variant="outline"
              disabled={selectedProjectIds.length === 0 || !multiProjectMonth || isGeneratingMultiTimesheet}
              onClick={() => multiProjectDownload("multi-project-timesheet", "Timesheet_MultiProject", setIsGeneratingMultiTimesheet)}
              data-testid="button-multi-timesheet"
            >
              {isGeneratingMultiTimesheet ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</>
              ) : (
                <><Clock className="w-4 h-4 mr-2" />Timesheet</>
              )}
            </Button>
            <Button
              variant="outline"
              disabled={selectedProjectIds.length === 0 || !multiProjectMonth || isGeneratingMultiCombined}
              onClick={() => multiProjectDownload("multi-project-combined-reports", "Combined_Reports_MultiProject", setIsGeneratingMultiCombined)}
              data-testid="button-multi-combined"
            >
              {isGeneratingMultiCombined ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</>
              ) : (
                <><FileStack className="w-4 h-4 mr-2" />Combined Reports</>
              )}
            </Button>
            <Button
              variant="outline"
              disabled={selectedProjectIds.length === 0 || !multiProjectMonth || isGeneratingMultiInvoice}
              onClick={() => multiProjectDownload("multi-project-inspector-invoice", "Inspector_Invoice_MultiProject", setIsGeneratingMultiInvoice)}
              data-testid="button-multi-invoice"
            >
              {isGeneratingMultiInvoice ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</>
              ) : (
                <><Receipt className="w-4 h-4 mr-2" />My Invoice</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!projectToDelete} onOpenChange={() => setProjectToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{projectToDelete?.name}"? Projects with existing reports cannot be deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => projectToDelete && deleteMutation.mutate(projectToDelete.id)}
              className="bg-destructive text-destructive-foreground"
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

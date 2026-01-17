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
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
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
  const { companies, isCompanyAdmin } = useAuth();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [formData, setFormData] = useState({
    name: "",
    projectNumber: "",
    client: "",
    address: "",
  });
  
  // Invoice dialog state
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [invoiceProject, setInvoiceProject] = useState<Project | null>(null);
  const [invoiceStartDate, setInvoiceStartDate] = useState<Date | undefined>(startOfMonth(subMonths(new Date(), 1)));
  const [invoiceEndDate, setInvoiceEndDate] = useState<Date | undefined>(endOfMonth(subMonths(new Date(), 1)));
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState(false);

  const { data: projects = [], isLoading, error } = useQuery<Project[]>({
    queryKey: ["/api/my-projects"],
  });

  const { data: profile } = useQuery<{ activeProjectId?: string; activeCompanyId?: string }>({
    queryKey: ["/api/profile"],
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
      return apiRequest("POST", "/api/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowCreateDialog(false);
      setFormData({ name: "", projectNumber: "", client: "", address: "" });
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

  const handleAssignToCompany = (project: Project) => {
    setSelectedProject(project);
    setSelectedCompanyId("");
    setShowAssignDialog(true);
  };

  const handleOpenInvoice = (project: Project) => {
    setInvoiceProject(project);
    setInvoiceData(null);
    // Default to previous month
    setInvoiceStartDate(startOfMonth(subMonths(new Date(), 1)));
    setInvoiceEndDate(endOfMonth(subMonths(new Date(), 1)));
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

  // Get companies where user is admin
  const adminCompanies = companies.filter(c => c.role === "admin");

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
            <h1 className="text-2xl font-bold" data-testid="title-my-projects">My Projects</h1>
            <p className="text-muted-foreground">
              Projects you are assigned to
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-project">
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderOpen className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No projects yet</p>
              <p className="text-muted-foreground mb-4">
                Create your first project to get started
              </p>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first">
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
                  className={`hover-elevate ${isActive ? "ring-2 ring-primary" : ""}`}
                  data-testid={`card-project-${project.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <Link 
                        href={`/reports?project=${project.id}`}
                        className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
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
                      href={`/reports?project=${project.id}`}
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
                      href={`/reports?project=${project.id}`}
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
                      {isPersonal && adminCompanies.length > 0 && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => handleAssignToCompany(project)}
                          data-testid={`button-assign-${project.id}`}
                        >
                          <LinkIcon className="w-4 h-4 mr-2" />
                          Assign to Company
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
              Create a personal project. You can assign it to a company later.
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
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setFormData({ name: "", projectNumber: "", client: "", address: "" });
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
            <DialogTitle>Assign to Company</DialogTitle>
            <DialogDescription>
              Assign "{selectedProject?.name}" to a company you manage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="company">Select Company</Label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger data-testid="select-company">
                  <SelectValue placeholder="Choose a company" />
                </SelectTrigger>
                <SelectContent>
                  {adminCompanies.map((membership) => (
                    <SelectItem key={membership.companyId} value={membership.companyId}>
                      {membership.company?.name || "Unknown Company"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              Cancel
            </Button>
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
                              <td className="p-2">{format(new Date(report.date), "MMM d, yyyy")}</td>
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
          
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

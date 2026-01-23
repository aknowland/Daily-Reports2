import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  Clock,
  DollarSign,
  Building2,
  Download,
  FileStack,
  Loader2,
  MoreHorizontal,
  Send,
  Eye,
  CheckCircle,
  XCircle,
  AlertCircle,
  Plus,
} from "lucide-react";
import { useState } from "react";
import type { Project, ContractWithProjects, InvoiceWithDetails } from "@shared/schema";
import { format } from "date-fns";
import { queryClient } from "@/lib/queryClient";

const MONTH_OPTIONS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => {
  const year = new Date().getFullYear() - 2 + i;
  return { value: year.toString(), label: year.toString() };
});

const STATUS_CONFIG = {
  draft: { label: "Draft", variant: "secondary" as const, icon: FileText },
  sent: { label: "Sent", variant: "default" as const, icon: Send },
  paid: { label: "Paid", variant: "default" as const, icon: CheckCircle },
  overdue: { label: "Overdue", variant: "destructive" as const, icon: AlertCircle },
  cancelled: { label: "Cancelled", variant: "outline" as const, icon: XCircle },
};

export default function BillingManagementPage() {
  const { toast } = useToast();
  const { activeCompany, isCompanyAdmin, isAdmin } = useAuth();
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(
    (new Date().getMonth() + 1).toString()
  );
  const [selectedYear, setSelectedYear] = useState<string>(
    new Date().getFullYear().toString()
  );
  const [isGeneratingTimesheet, setIsGeneratingTimesheet] = useState(false);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [isGeneratingCombined, setIsGeneratingCombined] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: contracts, isLoading: contractsLoading } = useQuery<ContractWithProjects[]>({
    queryKey: ["/api/contracts"],
    enabled: !!activeCompany?.id,
  });

  const { data: invoices, isLoading: invoicesLoading } = useQuery<InvoiceWithDetails[]>({
    queryKey: ["/api/invoices", activeCompany?.id],
    queryFn: async () => {
      const response = await fetch("/api/invoices", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch invoices");
      return response.json();
    },
    enabled: !!activeCompany?.id,
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await fetch(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to update invoice");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice updated" });
    },
    onError: () => {
      toast({ title: "Failed to update invoice", variant: "destructive" });
    },
  });

  const filteredProjects = projects?.filter(
    (p) => p.companyId === activeCompany?.id
  );

  const selectedProjectData = filteredProjects?.find(p => p.id === selectedProject);
  const projectContract = selectedProjectData?.contractId 
    ? contracts?.find(c => c.id === selectedProjectData.contractId)
    : undefined;

  const filteredInvoices = invoices?.filter(inv => 
    statusFilter === "all" || inv.status === statusFilter
  );

  const invoiceSummary = {
    draft: invoices?.filter(inv => inv.status === "draft") || [],
    sent: invoices?.filter(inv => inv.status === "sent") || [],
    paid: invoices?.filter(inv => inv.status === "paid") || [],
    overdue: invoices?.filter(inv => inv.status === "overdue") || [],
  };

  const calculateTotal = (invList: InvoiceWithDetails[]) => {
    return invList.reduce((sum, inv) => sum + parseFloat(inv.totalAmount || "0"), 0);
  };

  const generateTimesheet = async () => {
    if (!selectedProject) {
      toast({
        title: "Error",
        description: "Please select a project",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingTimesheet(true);
    try {
      const response = await fetch("/api/billing/timesheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: selectedProject,
          month: parseInt(selectedMonth),
          year: parseInt(selectedYear),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to generate timesheet");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `timesheet-${selectedYear}-${selectedMonth}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Timesheet generated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate timesheet",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingTimesheet(false);
    }
  };

  const generateInvoice = async () => {
    if (!selectedProject) {
      toast({
        title: "Error",
        description: "Please select a project",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingInvoice(true);
    try {
      const response = await fetch("/api/billing/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: selectedProject,
          month: parseInt(selectedMonth),
          year: parseInt(selectedYear),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to generate invoice");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${selectedYear}-${selectedMonth}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });

      toast({
        title: "Success",
        description: "Invoice generated and saved successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate invoice",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingInvoice(false);
    }
  };

  const generateCombinedReports = async () => {
    if (!selectedProject) {
      toast({
        title: "Error",
        description: "Please select a project",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingCombined(true);
    try {
      const response = await fetch("/api/billing/combined-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: selectedProject,
          month: parseInt(selectedMonth),
          year: parseInt(selectedYear),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to generate combined reports");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `combined-reports-${selectedYear}-${selectedMonth}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Combined reports generated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to generate combined reports",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingCombined(false);
    }
  };

  const handleViewPdf = (invoice: InvoiceWithDetails) => {
    if (invoice.pdfPath) {
      window.open(invoice.pdfPath, "_blank");
    } else {
      toast({
        title: "No PDF available",
        description: "This invoice does not have a PDF generated yet.",
        variant: "destructive",
      });
    }
  };

  const handleMarkAsPaid = (invoice: InvoiceWithDetails) => {
    updateInvoiceMutation.mutate({
      id: invoice.id,
      data: { status: "paid", paidDate: new Date().toISOString() },
    });
  };

  const handleMarkAsSent = (invoice: InvoiceWithDetails) => {
    updateInvoiceMutation.mutate({
      id: invoice.id,
      data: { status: "sent" },
    });
  };

  if (projectsLoading || contractsLoading) {
    return (
      <PageLayout title="Billing">
        <div className="space-y-4 p-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageLayout>
    );
  }

  if (!activeCompany) {
    return (
      <PageLayout title="Billing">
        <div className="p-4">
          <Card>
            <CardContent className="py-10">
              <p className="text-center text-muted-foreground">
                Please select a company to manage billing.
              </p>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  if (!isCompanyAdmin && !isAdmin) {
    return (
      <PageLayout title="Billing">
        <div className="p-4">
          <Card>
            <CardContent className="py-10">
              <p className="text-center text-muted-foreground">
                Only company admins can access billing features.
              </p>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Billing">
      <div className="p-4 space-y-6">
        <Tabs defaultValue="invoices" className="space-y-4">
          <TabsList>
            <TabsTrigger value="invoices" className="gap-2" data-testid="tab-invoices">
              <DollarSign className="h-4 w-4" />
              Invoices
            </TabsTrigger>
            <TabsTrigger value="timesheets" className="gap-2" data-testid="tab-timesheets">
              <Clock className="h-4 w-4" />
              Timesheets
            </TabsTrigger>
            <TabsTrigger value="combined" className="gap-2" data-testid="tab-combined">
              <FileStack className="h-4 w-4" />
              Combined Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="invoices" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Draft</p>
                      <p className="text-2xl font-bold">{invoiceSummary.draft.length}</p>
                      <p className="text-xs text-muted-foreground">
                        ${calculateTotal(invoiceSummary.draft).toLocaleString()}
                      </p>
                    </div>
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Sent</p>
                      <p className="text-2xl font-bold text-blue-600">{invoiceSummary.sent.length}</p>
                      <p className="text-xs text-muted-foreground">
                        ${calculateTotal(invoiceSummary.sent).toLocaleString()}
                      </p>
                    </div>
                    <Send className="h-8 w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Paid</p>
                      <p className="text-2xl font-bold text-green-600">{invoiceSummary.paid.length}</p>
                      <p className="text-xs text-muted-foreground">
                        ${calculateTotal(invoiceSummary.paid).toLocaleString()}
                      </p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Overdue</p>
                      <p className="text-2xl font-bold text-red-600">{invoiceSummary.overdue.length}</p>
                      <p className="text-xs text-muted-foreground">
                        ${calculateTotal(invoiceSummary.overdue).toLocaleString()}
                      </p>
                    </div>
                    <AlertCircle className="h-8 w-8 text-red-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Invoice Tracking
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {invoicesLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : filteredInvoices && filteredInvoices.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>PO #</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInvoices.map((invoice) => {
                        const statusConfig = STATUS_CONFIG[invoice.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.draft;
                        const StatusIcon = statusConfig.icon;
                        return (
                          <TableRow key={invoice.id} data-testid={`invoice-row-${invoice.id}`}>
                            <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                            <TableCell>
                              {invoice.purchaseOrder?.poNumber || (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>{invoice.project?.name || "-"}</TableCell>
                            <TableCell>{invoice.client?.name || "-"}</TableCell>
                            <TableCell>
                              {MONTH_OPTIONS.find(m => m.value === String(invoice.month))?.label} {invoice.year}
                            </TableCell>
                            <TableCell className="font-medium">
                              ${parseFloat(invoice.totalAmount || "0").toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {invoice.dueDate ? format(new Date(invoice.dueDate), "MMM d, yyyy") : "-"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusConfig.variant} className="gap-1">
                                <StatusIcon className="h-3 w-3" />
                                {statusConfig.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" data-testid={`invoice-actions-${invoice.id}`}>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {invoice.pdfPath && (
                                    <DropdownMenuItem onClick={() => handleViewPdf(invoice)}>
                                      <Eye className="h-4 w-4 mr-2" />
                                      View PDF
                                    </DropdownMenuItem>
                                  )}
                                  {invoice.status === "draft" && (
                                    <DropdownMenuItem onClick={() => handleMarkAsSent(invoice)}>
                                      <Send className="h-4 w-4 mr-2" />
                                      Mark as Sent
                                    </DropdownMenuItem>
                                  )}
                                  {(invoice.status === "sent" || invoice.status === "overdue") && (
                                    <DropdownMenuItem onClick={() => handleMarkAsPaid(invoice)}>
                                      <CheckCircle className="h-4 w-4 mr-2" />
                                      Mark as Paid
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-10 text-muted-foreground">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No invoices found</p>
                    <p className="text-sm">Generate invoices using the form below</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Generate New Invoice
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Project</label>
                    <Select value={selectedProject} onValueChange={setSelectedProject}>
                      <SelectTrigger data-testid="select-project">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredProjects?.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Month</label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger data-testid="select-month">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_OPTIONS.map((month) => (
                          <SelectItem key={month.value} value={month.value}>
                            {month.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Year</label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger data-testid="select-year">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {YEAR_OPTIONS.map((year) => (
                          <SelectItem key={year.value} value={year.value}>
                            {year.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {projectContract && (
                  <div className="rounded-md border p-4 bg-muted/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="h-4 w-4" />
                      <h4 className="font-medium">Contract Rates ({projectContract.contractNumber})</h4>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Regular:</span>{" "}
                        ${projectContract.regularRate || "0"}/hr
                      </div>
                      <div>
                        <span className="text-muted-foreground">Overtime:</span>{" "}
                        ${projectContract.overtimeRate || "0"}/hr
                      </div>
                      <div>
                        <span className="text-muted-foreground">Premium:</span>{" "}
                        ${projectContract.premiumRate || "0"}/hr
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  onClick={generateInvoice}
                  disabled={!selectedProject || isGeneratingInvoice}
                  data-testid="button-generate-invoice"
                >
                  {isGeneratingInvoice ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Generate Invoice PDF
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timesheets">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Generate Timesheet
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Generate a timesheet PDF for the selected project and month. The timesheet
                  will show daily hours worked organized by pay period, matching the standard
                  contractor timesheet format.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Project</label>
                    <Select value={selectedProject} onValueChange={setSelectedProject}>
                      <SelectTrigger data-testid="select-timesheet-project">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredProjects?.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Month</label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_OPTIONS.map((month) => (
                          <SelectItem key={month.value} value={month.value}>
                            {month.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Year</label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {YEAR_OPTIONS.map((year) => (
                          <SelectItem key={year.value} value={year.value}>
                            {year.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={generateTimesheet}
                  disabled={!selectedProject || isGeneratingTimesheet}
                  data-testid="button-generate-timesheet"
                >
                  {isGeneratingTimesheet ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Generate Timesheet PDF
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="combined">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileStack className="h-5 w-5" />
                  Combined Monthly Reports
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Combine all daily report PDFs for the selected project and month into a
                  single PDF document. Individual report PDFs must be generated first for
                  each report.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Project</label>
                    <Select value={selectedProject} onValueChange={setSelectedProject}>
                      <SelectTrigger data-testid="select-combined-project">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredProjects?.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Month</label>
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_OPTIONS.map((month) => (
                          <SelectItem key={month.value} value={month.value}>
                            {month.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Year</label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {YEAR_OPTIONS.map((year) => (
                          <SelectItem key={year.value} value={year.value}>
                            {year.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={generateCombinedReports}
                  disabled={!selectedProject || isGeneratingCombined}
                  data-testid="button-generate-combined"
                >
                  {isGeneratingCombined ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Generate Combined PDF
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}

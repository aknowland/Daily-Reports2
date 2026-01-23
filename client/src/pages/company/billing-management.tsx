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
  ArrowLeft,
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import type { Project, ContractWithProjects, InvoiceWithDetails, PurchaseOrder, Client } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Receipt, Trash2, Edit, Calendar } from "lucide-react";
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
  const [showPODialog, setShowPODialog] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [poFormData, setPOFormData] = useState({
    poNumber: "",
    clientId: "",
    amount: "",
    description: "",
    issueDate: "",
    expirationDate: "",
    status: "active",
  });
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailInvoice, setEmailInvoice] = useState<InvoiceWithDetails | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<InvoiceWithDetails | null>(null);
  const [emailFormData, setEmailFormData] = useState({
    recipientEmail: "",
    subject: "",
    message: "",
  });
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients", activeCompany?.id],
    queryFn: async () => {
      const response = await fetch("/api/clients", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch clients");
      return response.json();
    },
    enabled: !!activeCompany?.id,
  });

  const { data: purchaseOrders = [], isLoading: purchaseOrdersLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders", activeCompany?.id],
    queryFn: async () => {
      const response = await fetch("/api/purchase-orders", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch purchase orders");
      return response.json();
    },
    enabled: !!activeCompany?.id,
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

  const createPOMutation = useMutation({
    mutationFn: async (data: typeof poFormData) => {
      const response = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          poNumber: data.poNumber,
          clientId: data.clientId || null,
          totalAmount: data.amount,
          description: data.description,
          status: data.status,
          issueDate: data.issueDate ? new Date(data.issueDate) : null,
          expirationDate: data.expirationDate ? new Date(data.expirationDate) : null,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create purchase order");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setShowPODialog(false);
      resetPOForm();
      toast({ title: "Purchase order created" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create purchase order", description: error.message, variant: "destructive" });
    },
  });

  const updatePOMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof poFormData }) => {
      const response = await fetch(`/api/purchase-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          poNumber: data.poNumber,
          clientId: data.clientId || null,
          totalAmount: data.amount,
          description: data.description,
          status: data.status,
          issueDate: data.issueDate ? new Date(data.issueDate) : null,
          expirationDate: data.expirationDate ? new Date(data.expirationDate) : null,
        }),
      });
      if (!response.ok) throw new Error("Failed to update purchase order");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setShowPODialog(false);
      setEditingPO(null);
      resetPOForm();
      toast({ title: "Purchase order updated" });
    },
    onError: () => {
      toast({ title: "Failed to update purchase order", variant: "destructive" });
    },
  });

  const deletePOMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/purchase-orders/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to delete purchase order");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "Purchase order deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete purchase order", variant: "destructive" });
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/invoices/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to delete invoice");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice deleted successfully" });
      setInvoiceToDelete(null);
    },
    onError: () => {
      toast({ title: "Failed to delete invoice", variant: "destructive" });
    },
  });

  const resetPOForm = () => {
    setPOFormData({
      poNumber: "",
      clientId: "",
      amount: "",
      description: "",
      issueDate: "",
      expirationDate: "",
      status: "active",
    });
  };

  const handleEditPO = (po: PurchaseOrder) => {
    setEditingPO(po);
    setPOFormData({
      poNumber: po.poNumber,
      clientId: po.clientId || "",
      amount: po.totalAmount || "",
      description: po.description || "",
      issueDate: po.issueDate ? format(new Date(po.issueDate), "yyyy-MM-dd") : "",
      expirationDate: po.expirationDate ? format(new Date(po.expirationDate), "yyyy-MM-dd") : "",
      status: po.status,
    });
    setShowPODialog(true);
  };

  const handlePOSubmit = () => {
    if (editingPO) {
      updatePOMutation.mutate({ id: editingPO.id, data: poFormData });
    } else {
      createPOMutation.mutate(poFormData);
    }
  };

  const getClientName = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    return client?.name || "Unknown Client";
  };

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

  const handleOpenEmailDialog = (invoice: InvoiceWithDetails) => {
    setEmailInvoice(invoice);
    setEmailFormData({
      recipientEmail: invoice.client?.email || "",
      subject: `Invoice INV-${invoice.invoiceNumber}`,
      message: "",
    });
    setShowEmailDialog(true);
  };

  const handleSendEmail = async () => {
    if (!emailInvoice || !emailFormData.recipientEmail) {
      toast({ title: "Recipient email is required", variant: "destructive" });
      return;
    }
    
    setIsSendingEmail(true);
    try {
      const response = await fetch(`/api/invoices/${emailInvoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          recipientEmail: emailFormData.recipientEmail,
          subject: emailFormData.subject || undefined,
          message: emailFormData.message || undefined,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to send invoice");
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setShowEmailDialog(false);
      setEmailInvoice(null);
      toast({ title: "Invoice sent successfully" });
    } catch (error: any) {
      toast({ 
        title: "Failed to send invoice", 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setIsSendingEmail(false);
    }
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
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" asChild data-testid="button-back">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
        <Tabs defaultValue="invoices" className="space-y-4">
          <TabsList>
            <TabsTrigger value="invoices" className="gap-2" data-testid="tab-invoices">
              <DollarSign className="h-4 w-4" />
              Invoices
            </TabsTrigger>
            <TabsTrigger value="purchase-orders" className="gap-2" data-testid="tab-purchase-orders">
              <Receipt className="h-4 w-4" />
              Purchase Orders
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
                                  <DropdownMenuItem onClick={() => handleOpenEmailDialog(invoice)}>
                                    <Send className="h-4 w-4 mr-2" />
                                    Send via Email
                                  </DropdownMenuItem>
                                  {invoice.status === "draft" && (
                                    <DropdownMenuItem onClick={() => handleMarkAsSent(invoice)}>
                                      <CheckCircle className="h-4 w-4 mr-2" />
                                      Mark as Sent
                                    </DropdownMenuItem>
                                  )}
                                  {(invoice.status === "sent" || invoice.status === "overdue") && (
                                    <DropdownMenuItem onClick={() => handleMarkAsPaid(invoice)}>
                                      <CheckCircle className="h-4 w-4 mr-2" />
                                      Mark as Paid
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem 
                                    onClick={() => setInvoiceToDelete(invoice)}
                                    className="text-destructive focus:text-destructive"
                                    data-testid={`invoice-delete-${invoice.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Invoice
                                  </DropdownMenuItem>
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

          <TabsContent value="purchase-orders" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">Purchase Orders</h3>
                <p className="text-sm text-muted-foreground">
                  Manage purchase orders from your clients. Link contracts to POs for billing.
                </p>
              </div>
              <Button
                onClick={() => {
                  setEditingPO(null);
                  resetPOForm();
                  setShowPODialog(true);
                }}
                data-testid="button-new-po"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Purchase Order
              </Button>
            </div>

            {purchaseOrdersLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : purchaseOrders.length === 0 ? (
              <Card>
                <CardContent className="py-10">
                  <div className="text-center">
                    <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No purchase orders yet.</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Create a purchase order to start tracking client POs.
                    </p>
                    <Button
                      onClick={() => {
                        setEditingPO(null);
                        resetPOForm();
                        setShowPODialog(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create First PO
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>Expiration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[70px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseOrders.map((po) => (
                      <TableRow key={po.id}>
                        <TableCell className="font-medium">{po.poNumber}</TableCell>
                        <TableCell>{getClientName(po.clientId || "")}</TableCell>
                        <TableCell>
                          {po.totalAmount ? `$${parseFloat(po.totalAmount).toLocaleString()}` : "-"}
                        </TableCell>
                        <TableCell>
                          {po.issueDate ? format(new Date(po.issueDate), "MMM d, yyyy") : "-"}
                        </TableCell>
                        <TableCell>
                          {po.expirationDate ? format(new Date(po.expirationDate), "MMM d, yyyy") : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              po.status === "active" ? "default" :
                              po.status === "closed" ? "secondary" : "outline"
                            }
                          >
                            {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditPO(po)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm("Are you sure you want to delete this purchase order?")) {
                                    deletePOMutation.mutate(po.id);
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
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

      <Dialog open={showPODialog} onOpenChange={(open) => {
        setShowPODialog(open);
        if (!open) {
          setEditingPO(null);
          resetPOForm();
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingPO ? "Edit Purchase Order" : "New Purchase Order"}
            </DialogTitle>
            <DialogDescription>
              {editingPO ? "Update the purchase order details." : "Create a new purchase order from a client."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="poNumber">PO Number *</Label>
              <Input
                id="poNumber"
                value={poFormData.poNumber}
                onChange={(e) => setPOFormData({ ...poFormData, poNumber: e.target.value })}
                placeholder="e.g., PO-2024-001"
                data-testid="input-po-number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientId">Client *</Label>
              <Select
                value={poFormData.clientId}
                onValueChange={(value) => setPOFormData({ ...poFormData, clientId: value })}
              >
                <SelectTrigger data-testid="select-po-client">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Total Amount</Label>
              <Input
                id="amount"
                type="text"
                value={poFormData.amount}
                onChange={(e) => setPOFormData({ ...poFormData, amount: e.target.value })}
                placeholder="e.g., 50000"
                data-testid="input-po-amount"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={poFormData.description}
                onChange={(e) => setPOFormData({ ...poFormData, description: e.target.value })}
                placeholder="Optional description"
                data-testid="input-po-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="issueDate">Issue Date</Label>
                <Input
                  id="issueDate"
                  type="date"
                  value={poFormData.issueDate}
                  onChange={(e) => setPOFormData({ ...poFormData, issueDate: e.target.value })}
                  data-testid="input-po-issue-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expirationDate">Expiration Date</Label>
                <Input
                  id="expirationDate"
                  type="date"
                  value={poFormData.expirationDate}
                  onChange={(e) => setPOFormData({ ...poFormData, expirationDate: e.target.value })}
                  data-testid="input-po-expiration-date"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={poFormData.status}
                onValueChange={(value) => setPOFormData({ ...poFormData, status: value })}
              >
                <SelectTrigger data-testid="select-po-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPODialog(false);
                setEditingPO(null);
                resetPOForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePOSubmit}
              disabled={!poFormData.poNumber || !poFormData.clientId || createPOMutation.isPending || updatePOMutation.isPending}
              data-testid="button-save-po"
            >
              {(createPOMutation.isPending || updatePOMutation.isPending) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : editingPO ? (
                "Update"
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Invoice via Email</DialogTitle>
            <DialogDescription>
              Send invoice INV-{emailInvoice?.invoiceNumber} to the client
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recipientEmail">Recipient Email *</Label>
              <Input
                id="recipientEmail"
                type="email"
                value={emailFormData.recipientEmail}
                onChange={(e) => setEmailFormData({ ...emailFormData, recipientEmail: e.target.value })}
                placeholder="client@example.com"
                data-testid="input-recipient-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailSubject">Subject</Label>
              <Input
                id="emailSubject"
                value={emailFormData.subject}
                onChange={(e) => setEmailFormData({ ...emailFormData, subject: e.target.value })}
                placeholder="Invoice subject"
                data-testid="input-email-subject"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emailMessage">Message (optional)</Label>
              <textarea
                id="emailMessage"
                className="w-full min-h-[100px] p-3 border rounded-md resize-none"
                value={emailFormData.message}
                onChange={(e) => setEmailFormData({ ...emailFormData, message: e.target.value })}
                placeholder="Add a personal message to the email..."
                data-testid="input-email-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEmailDialog(false);
                setEmailInvoice(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={!emailFormData.recipientEmail || isSendingEmail}
              data-testid="button-send-invoice-email"
            >
              {isSendingEmail ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!invoiceToDelete} onOpenChange={(open) => !open && setInvoiceToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Invoice</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete invoice INV-{invoiceToDelete?.invoiceNumber}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInvoiceToDelete(null)}
              data-testid="button-cancel-delete-invoice"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => invoiceToDelete && deleteInvoiceMutation.mutate(invoiceToDelete.id)}
              disabled={deleteInvoiceMutation.isPending}
              data-testid="button-confirm-delete-invoice"
            >
              {deleteInvoiceMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

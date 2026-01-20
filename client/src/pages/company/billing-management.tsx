import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Clock,
  DollarSign,
  Building2,
  Download,
  FileStack,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import type { Project, ContractWithProject } from "@shared/schema";
import { format } from "date-fns";

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

export default function BillingManagementPage() {
  const { toast } = useToast();
  const { activeCompany, isCompanyAdmin, isAdmin } = useAuth();
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedContract, setSelectedContract] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(
    (new Date().getMonth() + 1).toString()
  );
  const [selectedYear, setSelectedYear] = useState<string>(
    new Date().getFullYear().toString()
  );
  const [isGeneratingTimesheet, setIsGeneratingTimesheet] = useState(false);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);
  const [isGeneratingCombined, setIsGeneratingCombined] = useState(false);

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: contracts, isLoading: contractsLoading } = useQuery<ContractWithProject[]>({
    queryKey: ["/api/contracts", activeCompany?.id],
    enabled: !!activeCompany?.id,
  });

  const filteredProjects = projects?.filter(
    (p) => p.companyId === activeCompany?.id
  );

  const projectContracts = contracts?.filter(
    (c) => c.projectId === selectedProject
  );

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
        const error = await response.json();
        throw new Error(error.message || "Failed to generate timesheet");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const project = filteredProjects?.find((p) => p.id === selectedProject);
      const monthName = MONTH_OPTIONS.find(m => m.value === selectedMonth)?.label || selectedMonth;
      a.download = `Timesheet_${project?.name || "Project"}_${monthName}_${selectedYear}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Timesheet PDF generated successfully",
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
          contractId: selectedContract || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to generate invoice");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const project = filteredProjects?.find((p) => p.id === selectedProject);
      const monthName = MONTH_OPTIONS.find(m => m.value === selectedMonth)?.label || selectedMonth;
      a.download = `Invoice_${project?.name || "Project"}_${monthName}_${selectedYear}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Invoice PDF generated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate invoice",
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
        const error = await response.json();
        throw new Error(error.message || "Failed to generate combined reports");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const project = filteredProjects?.find((p) => p.id === selectedProject);
      const monthName = MONTH_OPTIONS.find(m => m.value === selectedMonth)?.label || selectedMonth;
      a.download = `Combined_Reports_${project?.name || "Project"}_${monthName}_${selectedYear}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Combined reports PDF generated successfully",
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

  if (!isCompanyAdmin && !isAdmin) {
    return (
      <PageLayout title="Billing Management">
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              You don't have permission to access this page.
            </div>
          </CardContent>
        </Card>
      </PageLayout>
    );
  }

  if (!activeCompany) {
    return (
      <PageLayout title="Billing Management">
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              Please select a company to manage billing.
            </div>
          </CardContent>
        </Card>
      </PageLayout>
    );
  }

  const isLoading = projectsLoading || contractsLoading;

  return (
    <PageLayout title="Billing Management">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {activeCompany.name} - Billing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Project</label>
                {isLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select
                    value={selectedProject}
                    onValueChange={(val) => {
                      setSelectedProject(val);
                      setSelectedContract("");
                    }}
                  >
                    <SelectTrigger data-testid="select-project">
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredProjects?.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name} {project.projectNumber ? `(${project.projectNumber})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
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

              <div className="space-y-2">
                <label className="text-sm font-medium">Contract (for rates)</label>
                <Select
                  value={selectedContract}
                  onValueChange={setSelectedContract}
                  disabled={!selectedProject}
                >
                  <SelectTrigger data-testid="select-contract">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {projectContracts?.map((contract) => (
                      <SelectItem key={contract.id} value={contract.id}>
                        {contract.name || contract.contractNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="timesheets" className="space-y-4">
          <TabsList>
            <TabsTrigger value="timesheets" className="gap-2">
              <Clock className="h-4 w-4" />
              Timesheets
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-2">
              <DollarSign className="h-4 w-4" />
              Invoices
            </TabsTrigger>
            <TabsTrigger value="combined" className="gap-2">
              <FileStack className="h-4 w-4" />
              Combined Reports
            </TabsTrigger>
          </TabsList>

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
                <div className="flex items-center gap-4">
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
                </div>
                {!selectedProject && (
                  <p className="text-sm text-muted-foreground">
                    Select a project above to generate a timesheet.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Generate Invoice
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Generate an invoice PDF for the selected project and month. Hours will be
                  pulled from submitted daily reports. If a contract is selected, hourly rates
                  will be applied from the contract settings.
                </p>
                {selectedContract && projectContracts?.find(c => c.id === selectedContract) && (
                  <div className="rounded-md border p-4 bg-muted/50">
                    <h4 className="font-medium mb-2">Contract Rates</h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Regular:</span>{" "}
                        ${projectContracts.find(c => c.id === selectedContract)?.regularRate || "0"}/hr
                      </div>
                      <div>
                        <span className="text-muted-foreground">Overtime:</span>{" "}
                        ${projectContracts.find(c => c.id === selectedContract)?.overtimeRate || "0"}/hr
                      </div>
                      <div>
                        <span className="text-muted-foreground">Premium:</span>{" "}
                        ${projectContracts.find(c => c.id === selectedContract)?.premiumRate || "0"}/hr
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-4">
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
                </div>
                {!selectedProject && (
                  <p className="text-sm text-muted-foreground">
                    Select a project above to generate an invoice.
                  </p>
                )}
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
                <div className="flex items-center gap-4">
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
                </div>
                {!selectedProject && (
                  <p className="text-sm text-muted-foreground">
                    Select a project above to generate combined reports.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}

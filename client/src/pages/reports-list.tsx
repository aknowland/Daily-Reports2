import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch, useLocation } from "wouter";
import { format } from "date-fns";
import { formatPacificDate } from "@/lib/timezone";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { ReportCard } from "@/components/reports/report-card";
import { ReportDetailPanel } from "@/components/reports/report-detail-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Plus, 
  Search, 
  FileText,
  AlertCircle,
  Filter,
  FolderOpen,
  X,
  CalendarIcon,
  Download,
  Mail,
  Loader2
} from "lucide-react";
import type { DailyReportWithDetails, Project } from "@shared/schema";
import type { DateRange } from "react-day-picker";

export default function ReportsListPage() {
  const { user, isAdmin, isEffectiveCompanyAdmin } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const projectIdFromUrl = urlParams.get("project");
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>(projectIdFromUrl || "all");
  const [selectedReport, setSelectedReport] = useState<DailyReportWithDetails | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportEmail, setExportEmail] = useState("");
  
  const exportMutation = useMutation({
    mutationFn: async (data: { reportIds: string[]; email: string }) => {
      return apiRequest("POST", "/api/reports/export", data);
    },
    onSuccess: () => {
      toast({
        title: "Reports sent",
        description: `Reports have been emailed to ${exportEmail}`,
      });
      setExportModalOpen(false);
      setExportEmail("");
      setDateRange(undefined);
    },
    onError: () => {
      toast({
        title: "Export failed",
        description: "Failed to send reports. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  useEffect(() => {
    if (projectIdFromUrl) {
      setProjectFilter(projectIdFromUrl);
    }
  }, [projectIdFromUrl]);
  
  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: reportsData, isLoading, error } = useQuery<{
    reports: DailyReportWithDetails[];
    stats: {
      total: number;
      drafts: number;
      submitted: number;
    };
  }>({
    queryKey: ["/api/reports"],
  });

  const reports = reportsData?.reports || [];

  // Sync selectedReport with fresh data when reports update
  useEffect(() => {
    if (selectedReport && reports.length > 0) {
      const updatedReport = reports.find(r => r.id === selectedReport.id);
      if (updatedReport) {
        setSelectedReport(updatedReport);
      }
    }
  }, [reports, selectedReport?.id]);

  const selectedProject = projects?.find(p => p.id === projectFilter);
  
  const filteredReports = reports.filter((report) => {
    const matchesSearch = 
      report.project?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.project?.projectNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.customProjectName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.workPerformed?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || report.status === statusFilter;
    const matchesProject = projectFilter === "all" || report.projectId === projectFilter;
    
    return matchesSearch && matchesStatus && matchesProject;
  });
  
  // Reports to export: submitted reports filtered by export date range
  const reportsToExport = reports.filter(r => {
    if (r.status !== "submitted") return false;
    if (!dateRange?.from) return false;
    
    const reportDate = new Date(r.date);
    if (reportDate < dateRange.from) return false;
    if (dateRange.to && reportDate > dateRange.to) return false;
    return true;
  });
  
  const handleOpenExportModal = () => {
    setExportModalOpen(true);
  };
  
  const handleExport = () => {
    if (!exportEmail.trim()) {
      toast({
        title: "Email required",
        description: "Please enter an email address.",
        variant: "destructive",
      });
      return;
    }
    exportMutation.mutate({
      reportIds: reportsToExport.map(r => r.id),
      email: exportEmail.trim(),
    });
  };
  
  const clearProjectFilter = () => {
    setProjectFilter("all");
    setLocation("/reports");
  };

  const handleReportClick = (report: DailyReportWithDetails) => {
    setSelectedReport(report);
    setPanelOpen(true);
  };

  return (
    <PageLayout title="Reports">
      <div className="container px-4 py-6 mx-auto max-w-screen-xl space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Daily Reports</h1>
            <p className="text-muted-foreground">
              {filteredReports.length} {projectFilter !== "all" ? "reports for this project" : "total reports"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleOpenExportModal}
              data-testid="button-export-reports"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button asChild data-testid="button-new-report">
              <Link href="/reports/new">
                <Plus className="w-4 h-4 mr-2" />
                New Report
              </Link>
            </Button>
          </div>
        </div>

        {selectedProject && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{selectedProject.name}</p>
                  <p className="text-sm text-muted-foreground">
                    #{selectedProject.projectNumber}
                    {selectedProject.client && ` • ${selectedProject.client}`}
                  </p>
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={clearProjectFilter}
                data-testid="button-clear-project-filter"
              >
                <X className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by project name or number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-10"
              data-testid="input-search-reports"
            />
          </div>
          {!selectedProject && projects && projects.length > 1 && (
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-full sm:w-48 h-10" data-testid="select-project-filter">
                <FolderOpen className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40 h-10" data-testid="select-status-filter">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
              <p className="text-lg font-medium">Failed to load reports</p>
              <p className="text-sm text-muted-foreground mt-1">
                Please try again later
              </p>
            </CardContent>
          </Card>
        ) : filteredReports.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              {searchTerm || statusFilter !== "all" || projectFilter !== "all" ? (
                <>
                  <p className="text-lg font-medium">No matching reports</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Try adjusting your search or filter
                  </p>
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => {
                      setSearchTerm("");
                      setStatusFilter("all");
                      setProjectFilter("all");
                      setLocation("/reports");
                    }}
                    data-testid="button-clear-filters"
                  >
                    Clear Filters
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium">No reports yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Create your first daily report to get started
                  </p>
                  <Button asChild className="mt-4" data-testid="button-create-first-report">
                    <Link href="/reports/new">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Report
                    </Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredReports.map((report) => (
              <ReportCard 
                key={report.id} 
                report={report} 
                onClick={() => handleReportClick(report)}
              />
            ))}
          </div>
        )}
      </div>

      <ReportDetailPanel
        report={selectedReport}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        currentUserId={user?.id}
        isAdmin={isAdmin}
        isCompanyAdmin={isEffectiveCompanyAdmin}
      />

      <Dialog open={exportModalOpen} onOpenChange={(open) => {
        setExportModalOpen(open);
        if (!open) {
          setDateRange(undefined);
          setExportEmail("");
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Export Reports</DialogTitle>
            <DialogDescription>
              Select a date range and email address to export submitted reports.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Date Range</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    data-testid="button-export-date-range"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}
                        </>
                      ) : (
                        format(dateRange.from, "MMM d, yyyy")
                      )
                    ) : (
                      <span className="text-muted-foreground">Select date range...</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                  {dateRange && (
                    <div className="p-2 border-t">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full"
                        onClick={() => setDateRange(undefined)}
                      >
                        Clear dates
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="export-email">Email Address</Label>
              <Input
                id="export-email"
                type="email"
                placeholder="recipient@example.com"
                value={exportEmail}
                onChange={(e) => setExportEmail(e.target.value)}
                data-testid="input-export-email"
              />
            </div>
            
            {dateRange?.from && (
              <div className="text-sm">
                <p className="font-medium mb-2">
                  {reportsToExport.length} report{reportsToExport.length !== 1 ? 's' : ''} found:
                </p>
                {reportsToExport.length > 0 ? (
                  <ul className="max-h-32 overflow-y-auto space-y-1 text-muted-foreground">
                    {reportsToExport.slice(0, 5).map((report) => (
                      <li key={report.id} className="flex items-center gap-2">
                        <FileText className="w-3 h-3" />
                        {report.project?.name || report.customProjectName || "Unassigned"} - {formatPacificDate(report.date, "MMM d, yyyy")}
                      </li>
                    ))}
                    {reportsToExport.length > 5 && (
                      <li className="text-muted-foreground">
                        ...and {reportsToExport.length - 5} more
                      </li>
                    )}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No submitted reports in this date range.</p>
                )}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleExport} 
              disabled={exportMutation.isPending || reportsToExport.length === 0 || !exportEmail.trim()}
              data-testid="button-send-export"
            >
              {exportMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Send {reportsToExport.length} Report{reportsToExport.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

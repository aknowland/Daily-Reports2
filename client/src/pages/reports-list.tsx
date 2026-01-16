import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch, useLocation } from "wouter";
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
import { ReportCard } from "@/components/reports/report-card";
import { ReportDetailPanel } from "@/components/reports/report-detail-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { 
  Plus, 
  Search, 
  FileText,
  AlertCircle,
  Filter,
  FolderOpen,
  X
} from "lucide-react";
import type { DailyReportWithDetails, Project } from "@shared/schema";

export default function ReportsListPage() {
  const { user, isAdmin, isCompanyAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const projectIdFromUrl = urlParams.get("project");
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>(projectIdFromUrl || "all");
  const [selectedReport, setSelectedReport] = useState<DailyReportWithDetails | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  
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
      report.workPerformed?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || report.status === statusFilter;
    const matchesProject = projectFilter === "all" || report.projectId === projectFilter;

    return matchesSearch && matchesStatus && matchesProject;
  });
  
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
          <Button asChild data-testid="button-new-report">
            <Link href="/reports/new">
              <Plus className="w-4 h-4 mr-2" />
              New Report
            </Link>
          </Button>
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
        isCompanyAdmin={isCompanyAdmin}
      />
    </PageLayout>
  );
}

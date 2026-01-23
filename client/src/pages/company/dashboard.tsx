import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { PageLayout } from "@/components/layout/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  FileText, 
  Users, 
  FolderKanban, 
  ClipboardList, 
  AlertCircle,
  ChevronRight
} from "lucide-react";
import { Link } from "wouter";
import { ProjectStatusChart, StatusSummaryCards } from "@/components/project-status-chart";

type ContractDashboardSummary = {
  id: string;
  name: string;
  contractNumber: string;
  status: string;
  schedule: {
    progress: number;
    status: 'not_started' | 'on_track' | 'warning' | 'overdue' | 'complete' | 'upcoming';
    daysRemaining: number | null;
    daysOverdue: number | null;
    startDate: string | null;
    endDate: string | null;
  };
  budget: {
    totalBudget: number;
    spent: number;
    remaining: number;
    progress: number;
    status: 'under' | 'on_track' | 'warning' | 'over';
  };
};

export default function CompanyDashboard() {
  const { activeCompany } = useAuth();

  const { data: reportStats, isLoading: statsLoading } = useQuery<{
    total: number;
    thisMonth: number;
    pending: number;
    submitted: number;
  }>({
    queryKey: ["/api/reports/stats"],
  });

  const { data: projects, isLoading: projectsLoading } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const { data: contractsSummary, isLoading: contractsLoading } = useQuery<ContractDashboardSummary[]>({
    queryKey: ["/api/contracts/dashboard-summary"],
  });

  return (
    <PageLayout title="Company Dashboard">
      <div className="space-y-6 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="title-company-dashboard">
              {activeCompany?.name || "Company"} Dashboard
            </h1>
            <p className="text-muted-foreground">
              Overview of your company's activity
            </p>
          </div>
        </div>

        {/* Project Status Chart */}
        <ProjectStatusChart 
          contracts={contractsSummary || []} 
          isLoading={contractsLoading} 
        />

        {/* Project Status Summary Cards */}
        <StatusSummaryCards 
          contracts={contractsSummary || []} 
          isLoading={contractsLoading} 
        />

        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card data-testid="card-stat-reports">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{reportStats?.total || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-stat-this-month">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{reportStats?.thisMonth || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-stat-projects">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {projectsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">
                  {projects?.filter((p: any) => p.status === "active").length || 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-stat-pending">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Reports</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{reportStats?.pending || 0}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/reports">
            <Card className="cursor-pointer hover-elevate" data-testid="card-quick-reports">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-primary/10 p-3">
                  <ClipboardList className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">View Reports</h3>
                  <p className="text-sm text-muted-foreground">Manage daily field reports</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/company/team">
            <Card className="cursor-pointer hover-elevate" data-testid="card-quick-team">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-blue-500/10 p-3">
                  <Users className="h-6 w-6 text-blue-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Team Members</h3>
                  <p className="text-sm text-muted-foreground">Manage your team</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/company/projects">
            <Card className="cursor-pointer hover-elevate" data-testid="card-quick-projects">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-amber-500/10 p-3">
                  <FolderKanban className="h-6 w-6 text-amber-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Projects</h3>
                  <p className="text-sm text-muted-foreground">View company projects</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </PageLayout>
  );
}

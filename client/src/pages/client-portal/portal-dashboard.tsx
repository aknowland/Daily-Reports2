import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  MapPin,
  Calendar,
  FileText,
  LogOut,
  FolderOpen,
} from "lucide-react";

interface ClientProject {
  id: string;
  name: string;
  projectNumber: string | null;
  address: string | null;
  status: string;
  scheduleProgress: number;
  totalReports: number;
  latestReportDate: string | null;
  startDate: string | null;
  substantialCompletionDate: string | null;
}

interface PortalStatus {
  isClientPortalUser: boolean;
  portals: Array<{
    id: string;
    companyId: string;
    companyName: string;
    isActive: boolean;
  }>;
}

interface ProjectsResponse {
  companyName: string;
  companyLogo: string | null;
  projects: ClientProject[];
}

function getStatusBadgeClasses(status: string) {
  switch (status) {
    case "active":
      return "bg-green-600/15 text-green-700 border-green-600/30";
    case "completed":
      return "bg-blue-600/15 text-blue-700 border-blue-600/30";
    case "on-hold":
      return "bg-amber-600/15 text-amber-700 border-amber-600/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "No reports yet";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PortalDashboard() {
  const { user } = useAuth();

  const { data: status, isLoading: isStatusLoading } = useQuery<PortalStatus>({
    queryKey: ["/api/client-portal/status"],
  });

  const { data: projectsData, isLoading: isProjectsLoading } = useQuery<ProjectsResponse>({
    queryKey: ["/api/client-portal/projects"],
    enabled: status?.isClientPortalUser === true,
  });

  const projects = projectsData?.projects || [];
  const companyName = projectsData?.companyName || status?.portals?.[0]?.companyName || "";
  const isLoading = isStatusLoading || isProjectsLoading;

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  if (!isStatusLoading && status && !status.isClientPortalUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" data-testid="portal-unauthorized">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-sm">
              You do not have access to the client portal. Please contact your project administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="portal-dashboard">
      <PageHeader
        icon={Building2}
        title="Client Portal"
        subtitle={`Welcome back, ${user?.firstName || "Client"}`}
      >
        <Button
          variant="outline"
          className="border-white/30 text-white"
          onClick={handleLogout}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </PageHeader>

      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold" data-testid="text-projects-heading">Your Projects</h2>
          <p className="text-sm text-muted-foreground">
            View reports and progress for your construction projects
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="loading-skeleton">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="rounded-none shadow-sm">
                <CardContent className="p-5">
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card className="rounded-none shadow-sm border-dashed border-2" data-testid="empty-state">
            <CardContent className="p-10 text-center">
              <div className="w-16 h-16 rounded bg-muted flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-lg font-semibold">No Projects Available</p>
              <p className="text-sm text-muted-foreground mt-1">
                You don't have any projects assigned yet. Please contact your project administrator.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/client-portal/project/${project.id}`}
                data-testid={`link-project-${project.id}`}
              >
                <Card
                  className="bg-card border rounded-none shadow-sm hover-elevate cursor-pointer h-full"
                  data-testid={`card-project-${project.id}`}
                >
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3
                          className="font-semibold text-base truncate"
                          data-testid={`text-project-name-${project.id}`}
                        >
                          {project.name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                          <span
                            className="truncate"
                            data-testid={`text-project-location-${project.id}`}
                          >
                            {project.address || "N/A"}
                          </span>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`${getStatusBadgeClasses(project.status)} capitalize flex-shrink-0 no-default-hover-elevate no-default-active-elevate`}
                        data-testid={`badge-status-${project.id}`}
                      >
                        {project.status.replace("-", " ")}
                      </Badge>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Schedule Progress</span>
                        <span
                          className="font-medium"
                          data-testid={`text-progress-${project.id}`}
                        >
                          {project.scheduleProgress}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[hsl(36,90%,50%)] rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, project.scheduleProgress))}%` }}
                          data-testid={`progress-bar-${project.id}`}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm pt-1 border-t">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5" />
                        <span data-testid={`text-last-report-${project.id}`}>
                          {formatDate(project.latestReportDate)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <FileText className="w-3.5 h-3.5" />
                        <span data-testid={`text-report-count-${project.id}`}>
                          {project.totalReports} {project.totalReports === 1 ? "report" : "reports"}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

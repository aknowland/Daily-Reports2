import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
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
  HardHat,
} from "lucide-react";
import { useEffect } from "react";

interface ClientProject {
  id: string;
  name: string;
  projectNumber: string | null;
  address: string | null;
  totalReports: number;
  latestReportDate: string | null;
  startDate: string | null;
  substantialCompletionDate: string | null;
}

function computeScheduleProgress(startDate: string | null, endDate: string | null): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const now = Date.now();
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
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

function formatDate(dateStr: string | null) {
  if (!dateStr) return "No reports yet";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PortalHeader({ companyName, companyLogo, clientName }: { companyName: string; companyLogo: string | null; clientName: string }) {
  return (
    <header className="sticky top-0 z-40 w-full bg-[hsl(220,55%,16%)] text-white border-b-4 border-[hsl(38,92%,50%)]">
      <div className="flex h-14 items-center justify-between gap-4 px-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          {companyLogo ? (
            <img src={companyLogo} alt={companyName} className="h-8 w-8 object-contain" />
          ) : (
            <div className="w-8 h-8 bg-[hsl(38,92%,50%)] flex items-center justify-center flex-shrink-0">
              <HardHat className="w-5 h-5 text-[hsl(220,55%,10%)]" />
            </div>
          )}
          <div>
            <span className="font-bold text-sm tracking-widest uppercase hidden sm:inline">{companyName}</span>
            <span className="font-bold text-sm tracking-widest uppercase sm:hidden">Client Portal</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {clientName && (
            <span className="text-sm text-white/70 hidden md:inline">Welcome, {clientName}</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-white/80 hover:text-white hover:bg-white/10"
            onClick={() => { window.location.href = "/api/logout"; }}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}

export default function PortalDashboard() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [, setLocation] = useLocation();

  const { data: status, isLoading: isStatusLoading } = useQuery<PortalStatus>({
    queryKey: ["/api/client-portal/status"],
    enabled: !!user,
  });

  const { data: projectsData, isLoading: isProjectsLoading } = useQuery<ProjectsResponse>({
    queryKey: ["/api/client-portal/projects"],
    enabled: status?.isClientPortalUser === true,
  });

  // Redirect any authenticated user who is NOT a client portal user away from this page
  useEffect(() => {
    if (!isAuthLoading && !isStatusLoading && user && status) {
      if (!status.isClientPortalUser) {
        setLocation("/");
      }
    }
  }, [isAuthLoading, isStatusLoading, user, status, setLocation]);

  const projects = projectsData?.projects || [];
  const companyName = projectsData?.companyName || status?.portals?.[0]?.companyName || "Client Portal";
  const companyLogo = projectsData?.companyLogo || null;
  const clientName = user?.firstName || user?.email?.split("@")[0] || "";
  const isLoading = isAuthLoading || isStatusLoading || isProjectsLoading;

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
      <PortalHeader companyName={companyName} companyLogo={companyLogo} clientName={clientName} />

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
                      {project.projectNumber && (
                        <Badge
                          variant="outline"
                          className="bg-muted text-muted-foreground flex-shrink-0 no-default-hover-elevate no-default-active-elevate"
                          data-testid={`badge-project-number-${project.id}`}
                        >
                          {project.projectNumber}
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Schedule Progress</span>
                        <span
                          className="font-medium"
                          data-testid={`text-progress-${project.id}`}
                        >
                          {computeScheduleProgress(project.startDate, project.substantialCompletionDate)}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[hsl(36,90%,50%)] rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, computeScheduleProgress(project.startDate, project.substantialCompletionDate)))}%` }}
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

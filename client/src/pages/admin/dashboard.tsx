import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PageLayout } from "@/components/layout/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FolderOpen,
  Users,
  FileText,
  Settings,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Download,
  Network,
} from "lucide-react";
import architectureDiagram from "@assets/field-daily-reports-architecture-diagram.png";
import type { DailyReportWithDetails, Project } from "@shared/schema";
import type { User } from "@shared/models/auth";

export default function AdminDashboardPage() {
  const { data: reportsData, isLoading: loadingReports } = useQuery<{
    reports: DailyReportWithDetails[];
    stats: { total: number; drafts: number; submitted: number };
  }>({
    queryKey: ["/api/reports"],
  });

  const { data: projects, isLoading: loadingProjects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: users, isLoading: loadingUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const stats = reportsData?.stats || { total: 0, drafts: 0, submitted: 0 };
  const isLoading = loadingReports || loadingProjects || loadingUsers;

  const quickLinks = [
    {
      title: "Projects",
      description: "Manage construction projects",
      href: "/admin/projects",
      icon: <FolderOpen className="w-6 h-6" />,
      count: projects?.length || 0,
    },
    {
      title: "Users",
      description: "Manage inspectors and admins",
      href: "/admin/users",
      icon: <Users className="w-6 h-6" />,
      count: users?.length || 0,
    },
    {
      title: "All Reports",
      description: "View all daily reports",
      href: "/reports",
      icon: <FileText className="w-6 h-6" />,
      count: stats.total,
    },
  ];

  return (
    <PageLayout title="Admin Dashboard" isAdmin>
      <div className="container px-4 py-6 mx-auto max-w-screen-xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Manage projects, users, and system settings
          </p>
        </div>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card data-testid="card-stat-projects">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  {loadingProjects ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <p className="text-2xl font-bold">{projects?.length || 0}</p>
                  )}
                  <p className="text-sm text-muted-foreground">Projects</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-users">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  {loadingUsers ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <p className="text-2xl font-bold">{users?.length || 0}</p>
                  )}
                  <p className="text-sm text-muted-foreground">Users</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-total-reports">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  {loadingReports ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <p className="text-2xl font-bold">{stats.total}</p>
                  )}
                  <p className="text-sm text-muted-foreground">Reports</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-pending">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  {loadingReports ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <p className="text-2xl font-bold">{stats.drafts}</p>
                  )}
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card 
                className="h-full hover-elevate cursor-pointer transition-all"
                data-testid={`card-quick-link-${link.title.toLowerCase()}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
                      {link.icon}
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">{link.title}</h3>
                  <p className="text-sm text-muted-foreground">{link.description}</p>
                  {link.count !== undefined && (
                    <p className="text-sm font-medium text-primary mt-2">
                      {link.count} total
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingReports ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : reportsData?.reports.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No recent activity</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {reportsData?.reports.slice(0, 10).map((report) => (
                  <Link key={report.id} href={`/reports/${report.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          report.status === "submitted" ? "bg-green-500" : "bg-orange-500"
                        }`} />
                        <div>
                          <p className="font-medium text-sm">{report.project?.name || report.customProjectName || "Unassigned Report"}</p>
                          <p className="text-xs text-muted-foreground">
                            {report.inspectorName} - {new Date(report.date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Network className="w-5 h-5" />
              System Architecture
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Visual diagram showing user roles, entity relationships, and workflow connections
            </p>
            <div className="border rounded-lg overflow-hidden bg-slate-800 dark:bg-slate-900">
              <img
                src={architectureDiagram}
                alt="Field Daily Reports System Architecture Diagram"
                className="w-full h-auto"
                data-testid="img-architecture-diagram"
              />
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                asChild
              >
                <a href={architectureDiagram} download="field-daily-reports-architecture.png" data-testid="button-download-diagram">
                  <Download className="w-4 h-4 mr-2" />
                  Download Diagram
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}

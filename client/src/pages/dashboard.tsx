import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReportCard } from "@/components/reports/report-card";
import { ReportDetailPanel } from "@/components/reports/report-detail-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { OnboardingModal } from "@/components/onboarding-modal";
import { useAuth } from "@/hooks/use-auth";
import { 
  Plus, 
  FileText, 
  Clock, 
  CheckCircle, 
  ChevronRight,
  AlertCircle
} from "lucide-react";
import type { DailyReportWithDetails, UserProfile } from "@shared/schema";

export default function DashboardPage() {
  const { user, isAdmin, isCompanyAdmin } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedReport, setSelectedReport] = useState<DailyReportWithDetails | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
  });

  useEffect(() => {
    if (profile && profile.hasSeenOnboarding === false) {
      setShowOnboarding(true);
    }
  }, [profile]);

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
  const stats = reportsData?.stats || { total: 0, drafts: 0, submitted: 0 };
  const recentReports = reports.slice(0, 5);

  // Sync selectedReport with fresh data when reports update
  useEffect(() => {
    if (selectedReport && reports.length > 0) {
      const updatedReport = reports.find(r => r.id === selectedReport.id);
      if (updatedReport) {
        setSelectedReport(updatedReport);
      }
    }
  }, [reports, selectedReport?.id]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const handleReportClick = (report: DailyReportWithDetails) => {
    setSelectedReport(report);
    setPanelOpen(true);
  };

  return (
    <PageLayout>
      <div className="container px-4 py-6 mx-auto max-w-screen-xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold" data-testid="text-greeting">
            {getGreeting()}, {user?.firstName || "Inspector"}
          </h1>
          <p className="text-muted-foreground">
            Here's an overview of your daily reports
          </p>
        </div>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card data-testid="card-stat-total">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-sm text-muted-foreground">Total Reports</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-drafts">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.drafts}</p>
                  <p className="text-sm text-muted-foreground">Drafts</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-stat-submitted">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.submitted}</p>
                  <p className="text-sm text-muted-foreground">Submitted</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Link href="/reports/new">
            <Card className="h-full hover-elevate cursor-pointer border-dashed border-2 border-primary/30" data-testid="card-create-report">
              <CardContent className="p-4 h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-primary">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Plus className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-sm">New Report</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Reports</h2>
            <Button variant="ghost" size="sm" asChild data-testid="link-view-all-reports">
              <Link href="/reports">
                View All
                <ChevronRight className="w-4 h-4 ml-1" />
              </Link>
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
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
          ) : recentReports.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
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
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {recentReports.map((report) => (
                <ReportCard 
                  key={report.id} 
                  report={report} 
                  onClick={() => handleReportClick(report)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ReportDetailPanel
        report={selectedReport}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        currentUserId={user?.id}
        isAdmin={isAdmin}
        isCompanyAdmin={isCompanyAdmin}
      />

      <OnboardingModal 
        open={showOnboarding} 
        onComplete={() => setShowOnboarding(false)} 
      />
    </PageLayout>
  );
}

import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import DashboardPage from "@/pages/dashboard";
import ReportsListPage from "@/pages/reports-list";
import ReportFormPage from "@/pages/report-form";
import ReportDetailPage from "@/pages/report-detail";
import AdminDashboardPage from "@/pages/admin/dashboard";
import AdminCompaniesPage from "@/pages/admin/companies";
import AdminProjectsPage from "@/pages/admin/projects";
import AdminUsersPage from "@/pages/admin/users";
import AdminSettingsPage from "@/pages/admin/settings";
import AdminInvitesPage from "@/pages/admin/invites";
import InviteAcceptPage from "@/pages/invite-accept";

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function AuthenticatedRoutes() {
  return (
    <Switch>
      <Route path="/" component={DashboardPage} />
      <Route path="/reports" component={ReportsListPage} />
      <Route path="/reports/new" component={ReportFormPage} />
      <Route path="/reports/:id" component={ReportDetailPage} />
      <Route path="/reports/:id/edit" component={ReportFormPage} />
      <Route path="/settings" component={AdminSettingsPage} />
      <Route path="/admin" component={AdminDashboardPage} />
      <Route path="/admin/companies" component={AdminCompaniesPage} />
      <Route path="/admin/projects" component={AdminProjectsPage} />
      <Route path="/admin/users" component={AdminUsersPage} />
      <Route path="/admin/invites" component={AdminInvitesPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <Switch>
      <Route path="/invite/:token" component={InviteAcceptPage} />
      {!isAuthenticated ? (
        <Route component={LandingPage} />
      ) : (
        <AuthenticatedRoutes />
      )}
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

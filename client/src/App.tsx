import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { AdminModeProvider } from "@/hooks/use-admin-mode";
import { ThemeProvider } from "@/hooks/use-theme";
import { AdminRoute } from "@/components/layout/admin-route";
import { AIChatBubble } from "@/components/chat/ai-chat-bubble";
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
import JoinPage from "@/pages/join";
import ProfilePage from "@/pages/profile";
import MyCompaniesPage from "@/pages/my-companies";
import MyProjectsPage from "@/pages/my-projects";
import CompanyTeamPage from "@/pages/company/team";
import CompanyProjectsPage from "@/pages/company/projects";
import CompanySettingsPage from "@/pages/company/settings";
import CompanyDashboardPage from "@/pages/company/dashboard";
import CompanyContractsPage from "@/pages/company/contracts";
import CompanyClientsPage from "@/pages/company/clients";
import CompanyBillingManagementPage from "@/pages/company/billing-management";
import ContractDashboardPage from "@/pages/company/contract-dashboard";
import AIChatPage from "@/pages/company/ai-chat";
import BillingPage from "@/pages/billing";
import LearnMorePage from "@/pages/learn-more";
import PricingPage from "@/pages/pricing";

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
      <Route path="/profile" component={ProfilePage} />
      <Route path="/billing" component={BillingPage} />
      <Route path="/learn-more" component={LearnMorePage} />
      <Route path="/companies" component={MyCompaniesPage} />
      <Route path="/my-projects" component={MyProjectsPage} />
      <Route path="/company/team" component={CompanyTeamPage} />
      <Route path="/company/projects" component={CompanyProjectsPage} />
      <Route path="/company/clients" component={CompanyClientsPage} />
      <Route path="/company/contracts" component={CompanyContractsPage} />
      <Route path="/company/contracts/:contractId/dashboard" component={ContractDashboardPage} />
      <Route path="/company/billing-management" component={CompanyBillingManagementPage} />
      <Route path="/company/settings" component={CompanySettingsPage} />
      <Route path="/company/dashboard" component={CompanyDashboardPage} />
      <Route path="/company/chat" component={AIChatPage} />
      <Route path="/settings">
        {() => <AdminRoute><AdminSettingsPage /></AdminRoute>}
      </Route>
      <Route path="/admin">
        {() => <AdminRoute><AdminDashboardPage /></AdminRoute>}
      </Route>
      <Route path="/admin/companies">
        {() => <AdminRoute><AdminCompaniesPage /></AdminRoute>}
      </Route>
      <Route path="/admin/projects">
        {() => <AdminRoute><AdminProjectsPage /></AdminRoute>}
      </Route>
      <Route path="/admin/users">
        {() => <AdminRoute><AdminUsersPage /></AdminRoute>}
      </Route>
      <Route path="/admin/invites">
        {() => <AdminRoute><AdminInvitesPage /></AdminRoute>}
      </Route>
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
      <Route path="/accept-invite/:token" component={InviteAcceptPage} />
      <Route path="/join" component={JoinPage} />
      <Route path="/learn-more" component={LearnMorePage} />
      <Route path="/pricing" component={PricingPage} />
      {!isAuthenticated ? (
        <Route component={LandingPage} />
      ) : (
        <>
          <AuthenticatedRoutes />
          <AIChatBubble />
        </>
      )}
    </Switch>
  );
}

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <AdminModeProvider>
              <Toaster />
              <AppContent />
            </AdminModeProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;

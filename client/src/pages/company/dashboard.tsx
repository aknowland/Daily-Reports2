import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PageLayout } from "@/components/layout/page-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SummaryReportDropdown, ReportType, ReportParams } from "@/components/summary-report-dropdown";
import { apiRequest } from "@/lib/queryClient";
import { 
  FileText, 
  Users, 
  FolderKanban, 
  ClipboardList, 
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Receipt,
  DollarSign,
  Clock,
  CheckCircle2,
  TrendingUp,
  Calendar,
  Bell,
  Activity,
  AlertTriangle,
  BarChart3,
  Briefcase,
  Timer,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  ChevronUp,
  Search,
  Filter,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { useState } from "react";
import { format, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, isSameMonth } from "date-fns";

type ContractDashboardSummary = {
  id: string;
  name: string;
  contractNumber: string;
  status: string;
  bidDueDate: string | null;
  clientName: string | null;
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

type CompanyDashboardData = {
  summary: {
    activeContracts: number;
    upcomingContracts: number;
    completedContracts: number;
    totalContracts: number;
    activeProjects: number;
    totalProjects: number;
    totalInspectors: number;
    totalReports: number;
    hoursThisMonth: number;
  };
  inspectorWorkload: {
    userId: string;
    name: string;
    regularHours: number;
    overtimeHours: number;
    totalHours: number;
    reportCount: number;
    projectCount: number;
  }[];
  contractTimeline: {
    id: string;
    name: string;
    contractNumber: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
    color: string;
  }[];
  alerts: {
    id: string;
    type: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    message: string;
    date: string;
    contractId?: string;
  }[];
  recentActivity: {
    id: string;
    type: string;
    date: string;
    title: string;
    status: string;
    inspectorId: string;
  }[];
  revenueAnalytics: {
    month: string;
    revenue: number;
    hours: number;
  }[];
  atRiskProjects?: {
    id: string;
    name: string;
    contractId?: string;
    contractName?: string;
    hoursRemaining: number;
    budgetedHours: number;
    percentRemaining: number;
    status: 'orange' | 'red';
    recommendation: string;
  }[];
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'in_execution': return 'bg-blue-500';
    case 'awarded': return 'bg-green-500';
    case 'substantial_completion': return 'bg-gray-400';
    case 'bid_release':
    case 'bid_received':
    case 'under_review': return 'bg-yellow-500';
    default: return 'bg-gray-300';
  }
};

const getBudgetStatusColor = (status: string) => {
  switch (status) {
    case 'under': return 'text-green-600 dark:text-green-400';
    case 'on_track': return 'text-blue-600 dark:text-blue-400';
    case 'warning': return 'text-amber-600 dark:text-amber-400';
    case 'over': return 'text-red-600 dark:text-red-400';
    default: return 'text-muted-foreground';
  }
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  try {
    return format(new Date(dateStr), 'MMM d');
  } catch {
    return '-';
  }
};

const CONTRACT_STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "bid_release", label: "Bid Release" },
  { value: "bid_received", label: "Bid Received" },
  { value: "under_review", label: "Under Review" },
  { value: "awarded", label: "Awarded" },
  { value: "in_execution", label: "In Execution" },
  { value: "substantial_completion", label: "Substantial Completion" },
  { value: "final_closeout", label: "Final Closeout" },
  { value: "cancelled", label: "Cancelled" },
  { value: "not_awarded", label: "Not Awarded" },
];

export default function CompanyDashboard() {
  const { activeCompany } = useAuth();
  const { toast } = useToast();
  const [contractsToShow, setContractsToShow] = useState(7);
  const [contractSearch, setContractSearch] = useState("");
  const [contractStatusFilter, setContractStatusFilter] = useState("all");
  const [isEmailPending, setIsEmailPending] = useState(false);

  const handleDownloadReport = (type: ReportType, params: ReportParams) => {
    let url = '';
    if (type === 'weekly') {
      url = `/api/company/weekly-summary?weekStart=${params.weekStart}&weekEnd=${params.weekEnd}`;
    } else if (type === 'monthly') {
      url = `/api/company/monthly-summary?month=${params.month}&year=${params.year}`;
    } else if (type === 'current') {
      url = `/api/company/current-status`;
    }
    window.open(url, '_blank');
  };

  const handleEmailReport = async (type: ReportType, params: ReportParams & { additionalEmails: string }) => {
    setIsEmailPending(true);
    try {
      const emailList = params.additionalEmails
        .split(',')
        .map(e => e.trim())
        .filter(e => e && e.includes('@'));
      
      let endpoint = '';
      let body: any = { additionalEmails: emailList };
      
      if (type === 'weekly') {
        endpoint = `/api/company/weekly-summary/email`;
        body.weekStart = params.weekStart;
        body.weekEnd = params.weekEnd;
      } else if (type === 'monthly') {
        endpoint = `/api/company/monthly-summary/email`;
        body.month = parseInt(params.month || '1');
        body.year = parseInt(params.year || new Date().getFullYear().toString());
      } else if (type === 'current') {
        endpoint = `/api/company/current-status/email`;
      }
      
      const response = await apiRequest('POST', endpoint, body);
      const result = await response.json();
      
      toast({
        title: "Report Sent",
        description: result.message || "Email sent successfully",
      });
    } catch (error: any) {
      toast({
        title: "Failed to send email",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsEmailPending(false);
    }
  };

  const { data: companyDashboard, isLoading: dashboardLoading } = useQuery<CompanyDashboardData>({
    queryKey: ["/api/company/dashboard"],
    queryFn: async () => {
      const response = await fetch("/api/company/dashboard", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch dashboard");
      return response.json();
    },
    enabled: !!activeCompany?.id,
  });

  const { data: reportStats, isLoading: statsLoading } = useQuery<{
    total: number;
    thisMonth: number;
    pending: number;
    submitted: number;
  }>({
    queryKey: ["/api/reports/stats"],
  });

  const { data: contractsSummary, isLoading: contractsLoading } = useQuery<ContractDashboardSummary[]>({
    queryKey: ["/api/contracts/dashboard-summary"],
  });

  const { data: invoiceStats, isLoading: invoiceStatsLoading } = useQuery<{
    total: number;
    draft: number;
    sent: number;
    paid: number;
    overdue: number;
    totalAmount: number;
    paidAmount: number;
    outstandingAmount: number;
  }>({
    queryKey: ["/api/invoices/stats"],
  });

  // Priority-based sorting for contracts
  // Order: 1) Earliest bid due dates, 2) Under review, 3) Awarded/pre-construction, 4) Active projects
  const sortContractsByPriority = (contracts: ContractDashboardSummary[]) => {
    return [...contracts].sort((a, b) => {
      // Calculate priority scores (lower = higher priority)
      const getPriority = (contract: ContractDashboardSummary) => {
        const bidDue = contract.bidDueDate ? new Date(contract.bidDueDate) : null;
        const hasBidDueDate = bidDue !== null;
        const isUnderReview = contract.status === 'under_review';
        const isAwarded = contract.status === 'awarded';
        const isPreConstruction = contract.status === 'pre_construction';
        const isInExecution = contract.status === 'in_execution';
        
        // Priority 1: Has bid due date (earliest first)
        if (hasBidDueDate) return 1;
        // Priority 2: Under review status
        if (isUnderReview) return 2;
        // Priority 3: Awarded / pre-construction
        if (isAwarded || isPreConstruction) return 3;
        // Priority 4: Active projects (in_execution)
        if (isInExecution) return 4;
        // Priority 5: Other statuses
        return 5;
      };
      
      const aPriority = getPriority(a);
      const bPriority = getPriority(b);
      
      if (aPriority !== bPriority) return aPriority - bPriority;
      
      // Within same priority, apply appropriate secondary sorting
      if (aPriority === 1) {
        // Bid due dates: sort by earliest due date first
        const aDue = a.bidDueDate ? new Date(a.bidDueDate).getTime() : Infinity;
        const bDue = b.bidDueDate ? new Date(b.bidDueDate).getTime() : Infinity;
        return aDue - bDue;
      }
      
      // Default: sort alphabetically
      return a.name.localeCompare(b.name);
    });
  };

  // Filter contracts by search and status
  const filteredContracts = contractsSummary?.filter(contract => {
    const matchesSearch = contractSearch === "" || 
      contract.name.toLowerCase().includes(contractSearch.toLowerCase()) ||
      contract.contractNumber.toLowerCase().includes(contractSearch.toLowerCase());
    const matchesStatus = contractStatusFilter === "all" || contract.status === contractStatusFilter;
    return matchesSearch && matchesStatus;
  });
  
  // Apply priority sorting and slice for display
  const sortedContracts = filteredContracts ? sortContractsByPriority(filteredContracts) : [];
  const displayedContracts = sortedContracts.slice(0, contractsToShow);
  
  // Calculate completion rates
  const completedContracts = contractsSummary?.filter(c => 
    c.status === 'substantial_completion' || c.status === 'final_closeout'
  ).length || 0;
  const totalContracts = contractsSummary?.length || 0;
  const completionRate = totalContracts > 0 ? Math.round((completedContracts / totalContracts) * 100) : 0;

  return (
    <PageLayout title="Company Dashboard">
      <div className="space-y-6 p-4 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="title-company-dashboard">
              {activeCompany?.name || "Company"} Dashboard
            </h1>
            <p className="text-muted-foreground">
              Overview of your company's activity
            </p>
          </div>
          <SummaryReportDropdown
            scope="company"
            entityId={activeCompany?.id || ''}
            onDownload={handleDownloadReport}
            onEmail={handleEmailReport}
            isEmailPending={isEmailPending}
          />
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card data-testid="card-kpi-hours">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hours This Month</CardTitle>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {dashboardLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-hours-this-month">
                    {companyDashboard?.summary.hoursThisMonth?.toFixed(1) || '0'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Across {companyDashboard?.summary.totalInspectors || 0} inspectors
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-kpi-reports">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reports Submitted</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-reports-submitted">
                    {reportStats?.thisMonth || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {reportStats?.total || 0} total reports
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-kpi-active-contracts">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Contracts</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {dashboardLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-active-contracts">
                    {companyDashboard?.summary.activeContracts || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {companyDashboard?.summary.upcomingContracts || 0} upcoming
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-kpi-revenue">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue Billed</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {invoiceStatsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-500" data-testid="text-revenue-billed">
                    {formatCurrency(invoiceStats?.paidAmount || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(invoiceStats?.outstandingAmount || 0)} outstanding
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-kpi-completion">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {contractsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-500" data-testid="text-completion-rate">
                    {completionRate}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {completedContracts} of {totalContracts} contracts
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Dashboard Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - 2/3 width */}
          <div className="lg:col-span-2 space-y-6 min-w-0">
            {/* Revenue Analytics */}
            <Card data-testid="card-revenue-analytics">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    <CardTitle>Revenue Trends</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs">Last 12 months</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {dashboardLoading ? (
                  <div className="h-48 flex items-center justify-center">
                    <Skeleton className="h-full w-full" />
                  </div>
                ) : companyDashboard?.revenueAnalytics && companyDashboard.revenueAnalytics.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex h-48 items-end gap-1">
                      {companyDashboard.revenueAnalytics.map((item, index) => {
                        const maxRevenue = Math.max(...companyDashboard.revenueAnalytics.map(r => r.revenue));
                        const height = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0;
                        return (
                          <div 
                            key={item.month} 
                            className="flex-1 flex flex-col items-center gap-1"
                            data-testid={`bar-revenue-${item.month}`}
                          >
                            <div 
                              className="w-full bg-primary/80 rounded-t"
                              style={{ height: `${Math.max(height, 4)}%` }}
                              title={`${formatCurrency(item.revenue)} - ${item.hours}h`}
                            />
                            <span className="text-[10px] text-muted-foreground rotate-45 origin-left whitespace-nowrap">
                              {format(new Date(item.month + '-01'), 'MMM')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Total: {formatCurrency(companyDashboard.revenueAnalytics.reduce((sum, r) => sum + r.revenue, 0))}</span>
                      <span>{companyDashboard.revenueAnalytics.reduce((sum, r) => sum + r.hours, 0).toFixed(0)} hours logged</span>
                    </div>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-muted-foreground">
                    No revenue data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Combined Contract Status Card */}
            <Card data-testid="card-contract-status">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    <CardTitle>Contract Status</CardTitle>
                  </div>
                  <Link href="/company/contracts">
                    <Button variant="ghost" size="sm" className="h-8 gap-1">
                      View All <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
                <CardDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                  <span>Schedule and budget progress</span>
                  {filteredContracts && (
                    <Badge variant="secondary" className="text-xs w-fit">
                      {displayedContracts?.length || 0} of {filteredContracts.length}
                      {contractSearch || contractStatusFilter !== "all" ? " filtered" : " total"}
                    </Badge>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search contracts..."
                      value={contractSearch}
                      onChange={(e) => {
                        setContractSearch(e.target.value);
                        setContractsToShow(7);
                      }}
                      className="pl-9 pr-8"
                      data-testid="input-contract-search"
                    />
                    {contractSearch && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-7 w-7"
                        onClick={() => setContractSearch("")}
                        data-testid="button-clear-search"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Select
                    value={contractStatusFilter}
                    onValueChange={(value) => {
                      setContractStatusFilter(value);
                      setContractsToShow(7);
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-contract-status">
                      <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTRACT_STATUS_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {contractsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                ) : displayedContracts && displayedContracts.length > 0 ? (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto overflow-x-hidden pr-1">
                    {displayedContracts.map((contract) => {
                      const now = new Date();
                      const start = contract.schedule.startDate ? new Date(contract.schedule.startDate) : null;
                      const end = contract.schedule.endDate ? new Date(contract.schedule.endDate) : null;
                      
                      // Check if contract is in bid phase (should never show as overdue)
                      const isInBidPhase = ['bid_release', 'bid_received', 'under_review'].includes(contract.status);
                      // Only show bid due badges for pre-review statuses (not under_review or later)
                      const showBidDueBadge = ['bid_release', 'bid_received'].includes(contract.status);
                      
                      let daysInfo = '';
                      let scheduleStatus: 'upcoming' | 'active' | 'ending_soon' | 'overdue' | 'completed' = 'active';
                      if (start && end) {
                        if (now < start) {
                          daysInfo = `Starts in ${differenceInDays(start, now)} days`;
                          scheduleStatus = 'upcoming';
                        } else if (now > end) {
                          // Don't show overdue for contracts in bid phase (including under_review)
                          if (isInBidPhase) {
                            daysInfo = '';
                            scheduleStatus = 'upcoming';
                          } else {
                            daysInfo = `Ended ${differenceInDays(now, end)} days ago`;
                            scheduleStatus = 'overdue';
                          }
                        } else {
                          const remaining = differenceInDays(end, now);
                          daysInfo = `${remaining} days remaining`;
                          scheduleStatus = remaining <= 7 ? 'ending_soon' : 'active';
                        }
                      }
                      const bidDue = contract.bidDueDate ? new Date(contract.bidDueDate) : null;
                      let bidDueInfo: { label: string; color: string } | null = null;
                      if (showBidDueBadge && bidDue) {
                        const daysUntilDue = differenceInDays(bidDue, now);
                        if (daysUntilDue < 0) {
                          bidDueInfo = { label: `Overdue ${Math.abs(daysUntilDue)} days`, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
                        } else if (daysUntilDue <= 3) {
                          bidDueInfo = { label: `Due in ${daysUntilDue} days`, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
                        } else if (daysUntilDue <= 7) {
                          bidDueInfo = { label: `Due in ${daysUntilDue} days`, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' };
                        } else if (daysUntilDue <= 14) {
                          bidDueInfo = { label: `Due in ${daysUntilDue} days`, color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' };
                        } else {
                          bidDueInfo = { label: `Due in ${daysUntilDue} days`, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
                        }
                      }
                      
                      const getScheduleStatusColor = (status: typeof scheduleStatus) => {
                        switch (status) {
                          case 'overdue': return 'text-red-600 dark:text-red-400';
                          case 'ending_soon': return 'text-amber-600 dark:text-amber-400';
                          case 'upcoming': return 'text-blue-600 dark:text-blue-400';
                          default: return 'text-muted-foreground';
                        }
                      };
                      
                      return (
                        <Link key={contract.id} href={`/company/contracts/${contract.id}/dashboard`}>
                          <div 
                            className="p-3 rounded-lg border hover-elevate cursor-pointer"
                            data-testid={`status-contract-${contract.id}`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-2 h-2 rounded-full ${getStatusColor(contract.status)}`} />
                                <span className="font-medium truncate">{contract.name}</span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Badge variant="outline" className="text-xs">
                                  {contract.status.replace(/_/g, ' ')}
                                </Badge>
                                {bidDueInfo && (
                                  <Badge className={`text-xs ${bidDueInfo.color}`} data-testid={`badge-bid-due-${contract.id}`}>
                                    {bidDueInfo.label}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {contract.clientName && (
                              <div className="text-xs text-muted-foreground ml-4 mb-2 truncate">
                                {contract.clientName}
                              </div>
                            )}
                            
                            {/* Dates Row */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground mb-3">
                              <div className="flex items-center gap-1 shrink-0">
                                <Calendar className="h-3 w-3" />
                                <span>{formatDate(contract.schedule.startDate)}</span>
                                <span>→</span>
                                <span>{formatDate(contract.schedule.endDate)}</span>
                              </div>
                              {daysInfo && (
                                <Badge variant="secondary" className={`text-xs shrink-0 ${getScheduleStatusColor(scheduleStatus)}`}>
                                  {daysInfo}
                                </Badge>
                              )}
                            </div>
                            
                            {/* Progress Bars */}
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground">Schedule</span>
                                  <span>{contract.schedule.progress.toFixed(0)}%</span>
                                </div>
                                <Progress value={contract.schedule.progress} className="h-1.5" />
                              </div>
                              <div>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground">Budget</span>
                                  <span className={getBudgetStatusColor(contract.budget.status)}>
                                    {contract.budget.progress.toFixed(0)}%
                                  </span>
                                </div>
                                <Progress 
                                  value={Math.min(contract.budget.progress, 100)} 
                                  className={`h-1.5 ${contract.budget.status === 'over' ? '[&>div]:bg-red-500' : ''}`}
                                />
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                    {filteredContracts && filteredContracts.length > contractsToShow && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full"
                        onClick={() => setContractsToShow(prev => prev + 7)}
                        data-testid="button-show-more-contracts"
                      >
                        Show {Math.min(7, filteredContracts.length - contractsToShow)} More <ChevronDown className="h-4 w-4 ml-1" />
                      </Button>
                    )}
                    {contractsToShow > 7 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full"
                        onClick={() => setContractsToShow(7)}
                        data-testid="button-collapse-contracts"
                      >
                        Show Less <ChevronUp className="h-4 w-4 ml-1" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    {contractSearch || contractStatusFilter !== "all" 
                      ? "No contracts match your search or filter"
                      : "No contracts found"}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - 1/3 width */}
          <div className="space-y-6 min-w-0">
            {/* Notifications Center / Alerts */}
            <Card data-testid="card-notifications">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" />
                  <CardTitle>Notifications</CardTitle>
                  {companyDashboard?.alerts && companyDashboard.alerts.length > 0 && (
                    <Badge variant="destructive" className="ml-auto">
                      {companyDashboard.alerts.length}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {dashboardLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : companyDashboard?.alerts && companyDashboard.alerts.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {companyDashboard.alerts.map((alert) => (
                      <Link 
                        key={alert.id} 
                        href={alert.contractId ? `/company/contracts/${alert.contractId}/dashboard` : '#'}
                      >
                        <div 
                          className={`p-3 rounded-lg border cursor-pointer hover-elevate ${
                            alert.severity === 'critical' ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950' :
                            alert.severity === 'warning' ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950' :
                            'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950'
                          }`}
                          data-testid={`alert-${alert.id}`}
                        >
                          <div className="flex items-start gap-2">
                            {alert.severity === 'critical' ? (
                              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                            ) : alert.severity === 'warning' ? (
                              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                            ) : (
                              <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{alert.title}</p>
                              <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p>No pending alerts</p>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* At-Risk Projects */}
            {companyDashboard?.atRiskProjects && companyDashboard.atRiskProjects.length > 0 && (
              <Card data-testid="card-at-risk-projects">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    <CardTitle>At-Risk Projects</CardTitle>
                    <Badge variant="destructive" className="ml-auto">
                      {companyDashboard.atRiskProjects.length}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Projects with less than 20% of budgeted hours remaining
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {companyDashboard.atRiskProjects.map((project) => (
                      <Link 
                        key={project.id} 
                        href={`/projects/${project.id}/dashboard`}
                      >
                        <div 
                          className={`p-3 rounded-lg border cursor-pointer hover-elevate ${
                            project.status === 'red' 
                              ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800' 
                              : 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800'
                          }`}
                          data-testid={`at-risk-project-${project.id}`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-medium text-sm truncate">{project.name}</span>
                            <Badge 
                              variant={project.status === 'red' ? 'destructive' : 'secondary'}
                              className="shrink-0"
                            >
                              {project.percentRemaining}% left
                            </Badge>
                          </div>
                          {project.contractName && (
                            <p className="text-xs text-muted-foreground mb-1">
                              Contract: {project.contractName}
                            </p>
                          )}
                          <p className={`text-xs ${
                            project.status === 'red' 
                              ? 'text-red-700 dark:text-red-400' 
                              : 'text-orange-700 dark:text-orange-400'
                          }`}>
                            {project.recommendation}
                          </p>
                          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                            <span>{project.hoursRemaining.toFixed(1)} hrs remaining</span>
                            <span>{project.budgetedHours.toFixed(1)} hrs budgeted</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Inspector Workload */}
            <Card data-testid="card-inspector-workload">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <CardTitle>Inspector Workload</CardTitle>
                  </div>
                  <Link href="/company/team">
                    <Button variant="ghost" size="sm" className="h-8 gap-1">
                      Manage <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {dashboardLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map(i => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : companyDashboard?.inspectorWorkload && companyDashboard.inspectorWorkload.length > 0 ? (
                  <div className="space-y-3">
                    {companyDashboard.inspectorWorkload.slice(0, 6).map((inspector) => (
                      <div 
                        key={inspector.userId} 
                        className="flex items-center justify-between gap-2"
                        data-testid={`inspector-${inspector.userId}`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{inspector.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {inspector.projectCount} project{inspector.projectCount !== 1 ? 's' : ''} · {inspector.reportCount} reports
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-medium">{inspector.totalHours}h</p>
                          <p className="text-xs text-muted-foreground">
                            {inspector.overtimeHours > 0 && (
                              <span className="text-amber-600 dark:text-amber-400">+{inspector.overtimeHours}h OT</span>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                    {companyDashboard.inspectorWorkload.length > 6 && (
                      <Link href="/company/team">
                        <Button variant="ghost" size="sm" className="w-full">
                          View All {companyDashboard.inspectorWorkload.length} Inspectors
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No inspector data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity Feed */}
            <Card data-testid="card-recent-activity">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    <CardTitle>Recent Activity</CardTitle>
                  </div>
                  <Link href="/reports">
                    <Button variant="ghost" size="sm" className="h-8 gap-1">
                      All Reports <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {dashboardLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : companyDashboard?.recentActivity && companyDashboard.recentActivity.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {companyDashboard.recentActivity.slice(0, 10).map((activity) => (
                      <div 
                        key={activity.id} 
                        className="flex items-start gap-2 py-2 border-b last:border-0"
                        data-testid={`activity-${activity.id}`}
                      >
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{activity.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(activity.date), 'MMM d, h:mm a')}
                          </p>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={`text-xs shrink-0 ${
                            activity.status === 'submitted' ? 'text-green-600' :
                            activity.status === 'draft' ? 'text-amber-600' : ''
                          }`}
                        >
                          {activity.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No recent activity
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Invoice Tracking Overview */}
        <Card data-testid="card-invoice-overview">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <CardTitle>Invoice Tracking</CardTitle>
            </div>
            <Link href="/company/billing">
              <Button variant="ghost" size="sm" className="h-8 gap-1" data-testid="link-view-all-invoices">
                View All <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-sm">Outstanding</span>
                </div>
                {invoiceStatsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-500" data-testid="text-outstanding-amount">
                    {formatCurrency(invoiceStats?.outstandingAmount || 0)}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {invoiceStats?.sent || 0} sent, {invoiceStats?.overdue || 0} overdue
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm">Paid</span>
                </div>
                {invoiceStatsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold text-green-600 dark:text-green-500" data-testid="text-paid-amount">
                    {formatCurrency(invoiceStats?.paidAmount || 0)}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {invoiceStats?.paid || 0} invoices paid
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Draft</span>
                </div>
                {invoiceStatsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-draft-count">
                    {invoiceStats?.draft || 0}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Pending review
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Receipt className="h-4 w-4" />
                  <span className="text-sm">Total Invoices</span>
                </div>
                {invoiceStatsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-total-invoices">
                    {invoiceStats?.total || 0}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(invoiceStats?.totalAmount || 0)} total
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

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

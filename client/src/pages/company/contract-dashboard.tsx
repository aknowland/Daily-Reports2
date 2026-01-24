import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, useParams, Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  FileText,
  Paperclip,
  ListChecks,
  Users,
  ClipboardList,
  Download,
  ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";

type BudgetTrackingMode = 'daily_reports' | 'scheduled' | 'hybrid';

type DashboardData = {
  contract: {
    id: string;
    name: string;
    contractNumber: string;
    status: string;
    startDate: string | null;
    substantialCompletionDate: string | null;
    originalValue: string | null;
    currentValue: string | null;
    budgetOverride: string | null;
    baseBudgetSpent: string | null;
    notes: string | null;
    budgetTrackingMode: BudgetTrackingMode;
  };
  schedule: {
    progress: number;
    status: 'not_started' | 'on_track' | 'warning' | 'overdue' | 'complete';
    daysRemaining: number | null;
    daysOverdue: number | null;
    startDate: string | null;
    endDate: string | null;
  };
  budget: {
    totalBudget: number;
    spent: number;
    baseBudgetSpent: number;    // Manual starting point for mid-project
    calculatedSpent: number;     // Auto-calculated from reports/invoices
    remaining: number;
    progress: number;
    status: 'under' | 'on_track' | 'warning' | 'over';
    trackingMode: BudgetTrackingMode;
    hours: {
      regular: number;
      overtime: number;
      premium: number;
      total: number;
    };
    scheduled: {
      amount: number;
      hours: number;
      workingDaysElapsed: number;
      totalWorkingDays: number;
      inspectorBreakdowns: {
        title: string;
        inspectorName?: string | null;
        rate: number;
        hoursPerDay: number;
        scheduledHours: number;
        scheduledAmount: number;
      }[];
    };
    baseBudgetBreakdown: {
      baseHours: number;
      averageRate: number;
      inspectorBreakdowns: {
        title: string;
        estimatedHours: number;
        rate: number;
      }[];
    } | null;
  };
  bidSchedule: {
    bidReleaseDate: string | null;
    bidDueDate: string | null;
    awardDate: string | null;
    startDate: string | null;
    substantialCompletionDate: string | null;
    finalCloseoutDate: string | null;
  };
  billingRates: {
    clientRateOptions: {
      id: string;
      optionNumber: number;
      name: string | null;
      inspectors: {
        id: string;
        title: string;
        inspectorName: string | null;
        rate: string;
        hours: string;
        scheduleType: string | null;
      }[];
    }[];
    inspectorAgreements: {
      id: string;
      projectName: string;
      inspectorName: string;
      rate: string | null;
      terms: string | null;
    }[];
  };
  attachments: {
    id: string;
    fileName: string;
    filePath: string;
    fileType: string | null;
    fileSize: number | null;
    createdAt: string;
  }[];
  dailyReports: {
    id: string;
    date: string;
    projectName?: string;
    status: string;
    weatherType: string | null;
    regularHours: string | null;
    otHours: string | null;
    signedAt: string | null;
  }[];
  projects: {
    id: string;
    name: string;
    projectNumber: string;
    status: string;
    reportCount: number;
    budgetSpent: number;
    budgetAmount: number;
    baseBudget: number;
    calculatedSpent: number;
    budgetProgress: number;
    budgetStatus: 'under' | 'on_track' | 'warning' | 'over';
    budgetRemaining: number;
    budgetTrackingMode: BudgetTrackingMode;
    scheduledBudget: {
      amount: number;
      hours: number;
      workingDaysElapsed: number;
      totalWorkingDays: number;
    };
    startDate: string | null;
    substantialCompletionDate: string | null;
    finalCloseoutDate: string | null;
    scheduleProgress: number;
    scheduleStatus: 'not_started' | 'on_track' | 'warning' | 'overdue' | 'complete';
    contractOptionId: string | null;
    contractOptionName: string | null;
  }[];
};

const getScheduleStatusConfig = (status: string) => {
  switch (status) {
    case 'complete':
      return { color: 'bg-green-500', textColor: 'text-green-600 dark:text-green-400', label: 'Complete', icon: CheckCircle2 };
    case 'on_track':
      return { color: 'bg-blue-500', textColor: 'text-blue-600 dark:text-blue-400', label: 'On Track', icon: TrendingUp };
    case 'warning':
      return { color: 'bg-yellow-500', textColor: 'text-yellow-600 dark:text-yellow-400', label: 'Near Due', icon: AlertTriangle };
    case 'overdue':
      return { color: 'bg-red-500', textColor: 'text-red-600 dark:text-red-400', label: 'Overdue', icon: AlertTriangle };
    case 'not_started':
    default:
      return { color: 'bg-gray-400', textColor: 'text-muted-foreground', label: 'Not Started', icon: Clock };
  }
};

const getBudgetStatusConfig = (status: string) => {
  switch (status) {
    case 'under':
      return { color: 'bg-green-500', textColor: 'text-green-600 dark:text-green-400', label: 'Under Budget' };
    case 'on_track':
      return { color: 'bg-blue-500', textColor: 'text-blue-600 dark:text-blue-400', label: 'On Track' };
    case 'warning':
      return { color: 'bg-yellow-500', textColor: 'text-yellow-600 dark:text-yellow-400', label: 'Approaching Limit' };
    case 'over':
      return { color: 'bg-red-500', textColor: 'text-red-600 dark:text-red-400', label: 'Over Budget' };
    default:
      return { color: 'bg-gray-400', textColor: 'text-muted-foreground', label: 'Unknown' };
  }
};

const formatCurrency = (amount: number | string | null) => {
  if (amount === null || amount === undefined) return '-';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  try {
    return format(new Date(dateStr), 'MMM d, yyyy');
  } catch {
    return '-';
  }
};

const formatFileSize = (bytes: number | null) => {
  if (!bytes) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

export default function ContractDashboard() {
  const { toast } = useToast();
  const { activeCompany, profile } = useAuth();
  const params = useParams<{ contractId: string }>();
  const contractId = params.contractId;
  const [, setLocation] = useLocation();
  const [showBudgetOverrideDialog, setShowBudgetOverrideDialog] = useState(false);
  const [budgetOverrideValue, setBudgetOverrideValue] = useState("");
  const [showBaseBudgetDialog, setShowBaseBudgetDialog] = useState(false);
  const [baseBudgetValue, setBaseBudgetValue] = useState("");

  const { data: dashboard, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/contracts", contractId, "dashboard"],
    queryFn: async () => {
      const response = await fetch(`/api/contracts/${contractId}/dashboard`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch dashboard");
      return response.json();
    },
    enabled: !!contractId,
  });

  const updateBudgetMutation = useMutation({
    mutationFn: async (budgetOverride: string | null) => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}`, {
        budgetOverride,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setShowBudgetOverrideDialog(false);
      toast({
        title: "Budget Updated",
        description: "The budget override has been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveBudgetOverride = () => {
    const value = budgetOverrideValue.trim();
    updateBudgetMutation.mutate(value === "" ? null : value);
  };

  const handleOpenBudgetOverride = () => {
    setBudgetOverrideValue(dashboard?.contract.budgetOverride || "");
    setShowBudgetOverrideDialog(true);
  };

  const updateBaseBudgetMutation = useMutation({
    mutationFn: async (baseBudgetSpent: string | null) => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}`, {
        baseBudgetSpent,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", contractId, "dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setShowBaseBudgetDialog(false);
      toast({
        title: "Base Budget Updated",
        description: "The base budget has been saved. Future reports will stack on top of this amount.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveBaseBudget = () => {
    const value = baseBudgetValue.trim();
    updateBaseBudgetMutation.mutate(value === "" ? null : value);
  };

  const handleOpenBaseBudget = () => {
    setBaseBudgetValue(dashboard?.contract.baseBudgetSpent || "");
    setShowBaseBudgetDialog(true);
  };

  if (isLoading) {
    return (
      <PageLayout title="Contract Dashboard">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </PageLayout>
    );
  }

  if (!dashboard) {
    return (
      <PageLayout title="Contract Dashboard">
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground">Contract not found</p>
          <Button
            variant="outline"
            onClick={() => setLocation("/company/contracts")}
            className="mt-4"
            data-testid="button-back-contracts"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Contracts
          </Button>
        </div>
      </PageLayout>
    );
  }

  const scheduleConfig = getScheduleStatusConfig(dashboard.schedule.status);
  const budgetConfig = getBudgetStatusConfig(dashboard.budget.status);
  const ScheduleIcon = scheduleConfig.icon;

  return (
    <PageLayout title="Contract Dashboard">
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-4">
          <Link href="/company/contracts">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h2 className="text-lg font-semibold">Back to Contracts</h2>
        </div>
        
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-xl" data-testid="text-contract-name">
                  {dashboard.contract.name}
                </CardTitle>
                <CardDescription data-testid="text-contract-number">
                  {dashboard.contract.contractNumber}
                </CardDescription>
              </div>
              <Badge variant="outline" data-testid="badge-contract-status">
                {dashboard.contract.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </Badge>
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Schedule Progress
                </CardTitle>
                <Badge className={scheduleConfig.textColor} variant="outline" data-testid="badge-schedule-status">
                  <ScheduleIcon className="h-4 w-4 mr-1" />
                  {scheduleConfig.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium" data-testid="text-schedule-progress">
                    {dashboard.schedule.progress.toFixed(1)}%
                  </span>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full transition-all ${scheduleConfig.color}`}
                    style={{ width: `${Math.min(100, dashboard.schedule.progress)}%` }}
                    data-testid="progress-schedule"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-sm text-muted-foreground">Start Date</p>
                  <p className="font-medium" data-testid="text-start-date">
                    {formatDate(dashboard.schedule.startDate)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Completion Date</p>
                  <p className="font-medium" data-testid="text-end-date">
                    {formatDate(dashboard.schedule.endDate)}
                  </p>
                </div>
              </div>

              {dashboard.schedule.daysRemaining !== null && (
                <div className="flex items-center gap-2 pt-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm" data-testid="text-days-remaining">
                    {dashboard.schedule.daysRemaining} days remaining
                  </span>
                </div>
              )}

              {dashboard.schedule.daysOverdue !== null && dashboard.schedule.status === 'overdue' && (
                <div className="flex items-center gap-2 pt-2 text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium" data-testid="text-days-overdue">
                    {dashboard.schedule.daysOverdue} days overdue
                  </span>
                </div>
              )}

              {dashboard.projects.length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium text-muted-foreground mb-3">Project Schedule Breakdown</p>
                  <div className="space-y-3">
                    {dashboard.projects.map((project) => {
                      const projectConfig = getScheduleStatusConfig(project.scheduleStatus);
                      const ProjectIcon = projectConfig.icon;
                      return (
                        <div key={project.id} className="border rounded-md p-3 space-y-2" data-testid={`project-schedule-${project.id}`}>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-medium text-sm">{project.name}</span>
                            <Badge className={`${projectConfig.textColor} text-xs`} variant="outline">
                              <ProjectIcon className="h-3 w-3 mr-1" />
                              {projectConfig.label}
                            </Badge>
                          </div>
                          <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className={`h-full transition-all ${projectConfig.color}`}
                              style={{ width: `${Math.min(100, project.scheduleProgress)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{project.startDate ? format(new Date(project.startDate), "MMM d, yyyy") : "No start"}</span>
                            <span>{project.scheduleProgress.toFixed(0)}%</span>
                            <span>{project.substantialCompletionDate ? format(new Date(project.substantialCompletionDate), "MMM d, yyyy") : "No end"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Budget Status
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs" data-testid="badge-tracking-mode">
                    {dashboard.budget.trackingMode === 'daily_reports' ? 'Daily Reports' : 
                     dashboard.budget.trackingMode === 'scheduled' ? 'Scheduled' : 'Hybrid'}
                  </Badge>
                  <Badge className={budgetConfig.textColor} variant="outline" data-testid="badge-budget-status">
                    {budgetConfig.label}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {dashboard.budget.trackingMode === 'scheduled' ? 'Scheduled Progress' : 'Spent'}
                  </span>
                  <span className="font-medium" data-testid="text-budget-progress">
                    {dashboard.budget.progress.toFixed(1)}%
                  </span>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full transition-all ${budgetConfig.color}`}
                    style={{ width: `${Math.min(100, dashboard.budget.progress)}%` }}
                    data-testid="progress-budget"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-4 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">Budget</p>
                  <p className="font-medium text-sm" data-testid="text-total-budget">
                    {formatCurrency(dashboard.budget.totalBudget)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {dashboard.budget.trackingMode === 'scheduled' ? 'Scheduled Spent' : 'Total Spent'}
                  </p>
                  <p className="font-medium text-sm" data-testid="text-budget-spent">
                    {dashboard.budget.trackingMode === 'scheduled' 
                      ? formatCurrency(dashboard.budget.baseBudgetSpent + dashboard.budget.scheduled.amount)
                      : formatCurrency(dashboard.budget.spent)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className={`font-medium text-sm ${dashboard.budget.remaining < 0 ? 'text-red-600 dark:text-red-400' : ''}`} data-testid="text-budget-remaining">
                    {formatCurrency(dashboard.budget.remaining)}
                  </p>
                </div>
              </div>

              {dashboard.budget.trackingMode === 'hybrid' && (
                <div className="pt-3 border-t">
                  <p className="text-sm text-muted-foreground mb-2">Comparison</p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Scheduled</p>
                      <p className="font-medium">{formatCurrency(dashboard.budget.baseBudgetSpent + dashboard.budget.scheduled.amount)}</p>
                      <p className="text-xs text-muted-foreground">{(dashboard.budget.scheduled.hours + (dashboard.budget.baseBudgetBreakdown?.baseHours || 0)).toFixed(0)} hrs</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground font-medium">Actual</p>
                      <p className="font-medium">{formatCurrency(dashboard.budget.spent)}</p>
                      <p className="text-xs text-muted-foreground">{dashboard.budget.hours.total.toFixed(0)} hrs</p>
                    </div>
                  </div>
                </div>
              )}

              {(dashboard.budget.baseBudgetSpent > 0 || dashboard.budget.calculatedSpent > 0) && dashboard.budget.trackingMode !== 'scheduled' && (
                <div className="pt-3 border-t">
                  <p className="text-sm text-muted-foreground mb-2">Spent Breakdown</p>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Base (Manual)</p>
                      <p className="font-medium" data-testid="text-base-budget">
                        {formatCurrency(dashboard.budget.baseBudgetSpent)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">From Reports</p>
                      <p className="font-medium" data-testid="text-calculated-spent">
                        {formatCurrency(dashboard.budget.calculatedSpent)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="font-medium" data-testid="text-total-spent">
                        {formatCurrency(dashboard.budget.spent)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {dashboard.budget.trackingMode === 'scheduled' && dashboard.budget.scheduled.inspectorBreakdowns.length > 0 && (
                <div className="pt-3 border-t">
                  <p className="text-sm text-muted-foreground mb-2">
                    Scheduled Hours ({dashboard.budget.scheduled.workingDaysElapsed} of {dashboard.budget.scheduled.totalWorkingDays} working days)
                  </p>
                  <div className="space-y-1">
                    {dashboard.budget.scheduled.inspectorBreakdowns.map((inspector, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span className="truncate flex-1">
                          {inspector.title}{inspector.inspectorName ? ` - ${inspector.inspectorName}` : ''}
                          <span className="text-xs text-muted-foreground ml-1">({inspector.hoursPerDay}h/day)</span>
                        </span>
                        <span className="font-medium whitespace-nowrap">
                          {inspector.scheduledHours.toFixed(0)} hrs ({formatCurrency(inspector.scheduledAmount)})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dashboard.budget.trackingMode !== 'scheduled' && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-2">Hours Breakdown</p>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Regular</p>
                      <p className="font-medium" data-testid="text-regular-hours">{dashboard.budget.hours.regular.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Overtime</p>
                      <p className="font-medium" data-testid="text-overtime-hours">{dashboard.budget.hours.overtime.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Premium</p>
                      <p className="font-medium" data-testid="text-premium-hours">{dashboard.budget.hours.premium.toFixed(1)}</p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground">Total Hours</p>
                    <p className="font-medium" data-testid="text-total-hours">{dashboard.budget.hours.total.toFixed(1)}</p>
                  </div>
                </div>
              )}

              {dashboard.projects.length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium text-muted-foreground mb-3">Project Budget Breakdown</p>
                  <div className="space-y-2">
                    {dashboard.projects.map((project) => {
                      const projectPercent = dashboard.budget.totalBudget > 0 
                        ? (project.budgetSpent / dashboard.budget.totalBudget) * 100 
                        : 0;
                      return (
                        <div key={project.id} className="flex items-center justify-between gap-2 text-sm" data-testid={`project-budget-${project.id}`}>
                          <span className="truncate flex-1">{project.name}</span>
                          <span className="font-medium whitespace-nowrap">{formatCurrency(project.budgetSpent)}</span>
                          <span className="text-muted-foreground text-xs w-12 text-right">({projectPercent.toFixed(1)}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-2 space-y-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={handleOpenBaseBudget}
                  data-testid="button-set-base-budget"
                >
                  {dashboard.contract.baseBudgetSpent ? 'Edit Base Budget' : 'Set Base Budget (Mid-Project)'}
                </Button>
                {dashboard.contract.baseBudgetSpent && (
                  <p className="text-xs text-muted-foreground text-center">
                    Base amount: {formatCurrency(parseFloat(dashboard.contract.baseBudgetSpent))} (auto-stacks with new reports)
                  </p>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full"
                  onClick={handleOpenBudgetOverride}
                  data-testid="button-edit-budget"
                >
                  {dashboard.contract.budgetOverride ? 'Edit Total Budget Override' : 'Override Total Budget'}
                </Button>
                {dashboard.contract.budgetOverride && (
                  <p className="text-xs text-muted-foreground text-center">
                    Budget override: {formatCurrency(parseFloat(dashboard.contract.budgetOverride))}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              Bid Schedule
            </CardTitle>
            {dashboard.projects.length > 1 && (
              <CardDescription>
                Contract-level milestones and per-project schedules
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Bid Release</p>
                <p className="font-medium text-sm" data-testid="text-bid-release-date">
                  {formatDate(dashboard.bidSchedule.bidReleaseDate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Bid Due</p>
                <p className="font-medium text-sm" data-testid="text-bid-due-date">
                  {formatDate(dashboard.bidSchedule.bidDueDate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Award Date</p>
                <p className="font-medium text-sm" data-testid="text-award-date">
                  {formatDate(dashboard.bidSchedule.awardDate)}
                </p>
              </div>
            </div>

            {dashboard.projects.length <= 1 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Start Date</p>
                  <p className="font-medium text-sm" data-testid="text-schedule-start-date">
                    {formatDate(dashboard.bidSchedule.startDate)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Substantial Completion</p>
                  <p className="font-medium text-sm" data-testid="text-substantial-completion-date">
                    {formatDate(dashboard.bidSchedule.substantialCompletionDate)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Final Closeout</p>
                  <p className="font-medium text-sm" data-testid="text-final-closeout-date">
                    {formatDate(dashboard.bidSchedule.finalCloseoutDate)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Project Schedules</p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>Substantial Completion</TableHead>
                        <TableHead>Final Closeout</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard.projects.map((project) => {
                        const statusConfig = getScheduleStatusConfig(project.scheduleStatus);
                        return (
                          <TableRow key={project.id} data-testid={`project-schedule-row-${project.id}`}>
                            <TableCell className="font-medium">{project.name}</TableCell>
                            <TableCell>{formatDate(project.startDate)}</TableCell>
                            <TableCell>{formatDate(project.substantialCompletionDate)}</TableCell>
                            <TableCell>{formatDate(project.finalCloseoutDate)}</TableCell>
                            <TableCell>
                              <Badge 
                                variant="secondary" 
                                className={`${statusConfig.color} text-white`}
                              >
                                {statusConfig.label}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Client Billing Rates
              </CardTitle>
              <p className="text-xs text-muted-foreground">Rates charged to client (from contract inspector options)</p>
            </CardHeader>
            <CardContent>
              {dashboard.billingRates.clientRateOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-client-rates">
                  No rate options configured for this contract
                </p>
              ) : (
                <div className="space-y-4">
                  {dashboard.billingRates.clientRateOptions.map((option) => (
                    <div key={option.id} className="space-y-2" data-testid={`client-rate-option-${option.id}`}>
                      {dashboard.billingRates.clientRateOptions.length > 1 && (
                        <p className="text-sm font-medium text-muted-foreground">
                          Option {option.optionNumber}{option.name ? `: ${option.name}` : ''}
                        </p>
                      )}
                      <div className="space-y-2">
                        {option.inspectors.map((inspector) => (
                          <div key={inspector.id} className="flex justify-between items-start p-3 rounded-lg border" data-testid={`client-inspector-rate-${inspector.id}`}>
                            <div>
                              <p className="font-medium text-sm">{inspector.title}</p>
                              {inspector.inspectorName && (
                                <p className="text-xs text-muted-foreground">{inspector.inspectorName}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {inspector.scheduleType === 'partTime' ? 'Part Time' : 'Full Time'} | {inspector.hours} hrs
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">{formatCurrency(inspector.rate)}/hr</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Inspector Pay Rates
              </CardTitle>
              <p className="text-xs text-muted-foreground">Rates paid to inspectors (from IOR agreements)</p>
            </CardHeader>
            <CardContent>
              {dashboard.billingRates.inspectorAgreements.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="text-no-inspector-rates">
                  No IOR agreements found for this contract's projects
                </p>
              ) : (
                <div className="space-y-2">
                  {dashboard.billingRates.inspectorAgreements.map((agreement) => (
                    <div key={agreement.id} className="flex justify-between items-start p-3 rounded-lg border" data-testid={`inspector-rate-${agreement.id}`}>
                      <div>
                        <p className="font-medium text-sm">{agreement.inspectorName}</p>
                        <p className="text-xs text-muted-foreground">{agreement.projectName}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{agreement.rate ? `${formatCurrency(agreement.rate)}/hr` : '-'}</p>
                        {agreement.terms && (
                          <p className="text-xs text-muted-foreground max-w-32 truncate">{agreement.terms}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {dashboard.contract.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Project Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap" data-testid="text-project-notes">
                {dashboard.contract.notes}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Attached Files
              <Badge variant="secondary" className="ml-2">{dashboard.attachments.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="text-no-attachments">
                No files attached to this contract
              </p>
            ) : (
              <div className="space-y-2">
                {dashboard.attachments.map((attachment) => (
                  <div 
                    key={attachment.id} 
                    className="flex items-center justify-between p-2 rounded-md hover-elevate"
                    data-testid={`attachment-${attachment.id}`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="overflow-hidden">
                        <p className="font-medium text-sm truncate">{attachment.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(attachment.fileSize)} - {formatDate(attachment.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" asChild data-testid={`download-attachment-${attachment.id}`}>
                      <a href={attachment.filePath} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Projects Summary Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              Linked Projects
              <Badge variant="secondary" className="ml-2">{dashboard.projects.length}</Badge>
            </CardTitle>
            <CardDescription>
              Projects associated with this contract and their budget contributions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dashboard.projects.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="text-no-projects">
                No projects linked to this contract
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead>Linked Option</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Reports</TableHead>
                      <TableHead className="min-w-[200px]">Budget Progress</TableHead>
                      <TableHead className="text-right">Spent / Budget</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.projects.map((project) => {
                      const budgetStatusColors = {
                        under: 'bg-blue-500',
                        on_track: 'bg-green-500',
                        warning: 'bg-yellow-500',
                        over: 'bg-red-500',
                      };
                      const hasBudget = project.budgetAmount > 0;
                      
                      return (
                        <TableRow 
                          key={project.id} 
                          data-testid={`project-row-${project.id}`}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setLocation(`/company/projects?projectId=${project.id}`)}
                        >
                          <TableCell className="font-medium">{project.name}</TableCell>
                          <TableCell className="text-muted-foreground">{project.projectNumber || '-'}</TableCell>
                          <TableCell>
                            {project.contractOptionName ? (
                              <Badge variant="outline" className="text-xs">
                                {project.contractOptionName}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={project.status === 'active' ? 'default' : 'secondary'}
                              className="capitalize"
                            >
                              {project.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{project.reportCount}</TableCell>
                          <TableCell>
                            {hasBudget ? (() => {
                              const displayProgress = project.budgetTrackingMode === 'scheduled'
                                ? project.budgetAmount > 0 
                                  ? ((project.baseBudget + project.scheduledBudget.amount) / project.budgetAmount) * 100
                                  : 0
                                : project.budgetProgress;
                              const displayStatus = displayProgress >= 100 ? 'over' 
                                : displayProgress >= 80 ? 'warning' 
                                : displayProgress >= 50 ? 'on_track' 
                                : 'under';
                              return (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className={`font-medium ${
                                      displayStatus === 'over' ? 'text-red-600 dark:text-red-400' :
                                      displayStatus === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
                                      'text-muted-foreground'
                                    }`}>
                                      {Math.min(displayProgress, 999).toFixed(1)}%
                                    </span>
                                    {displayStatus === 'over' && (
                                      <Badge variant="destructive" className="text-[10px] px-1 py-0">Over Budget</Badge>
                                    )}
                                  </div>
                                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full transition-all ${budgetStatusColors[displayStatus]}`}
                                      style={{ width: `${Math.min(displayProgress, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })() : (
                              <span className="text-xs text-muted-foreground italic">No budget set</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="space-y-0.5">
                              <div className="font-medium">
                                {project.budgetTrackingMode === 'scheduled' 
                                  ? formatCurrency(project.baseBudget + project.scheduledBudget.amount)
                                  : formatCurrency(project.budgetSpent)}
                              </div>
                              {hasBudget && (
                                <div className="text-xs text-muted-foreground">
                                  of {formatCurrency(project.budgetAmount)}
                                </div>
                              )}
                              {project.budgetTrackingMode !== 'daily_reports' && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 mt-0.5">
                                  {project.budgetTrackingMode === 'scheduled' ? 'S' : 'H'}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" data-testid={`view-project-${project.id}`}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {dashboard.projects.length > 1 && (
                  <div className="mt-4 pt-4 border-t flex justify-between items-center">
                    <span className="text-sm font-medium">Total Across All Projects</span>
                    <span className="text-sm font-bold" data-testid="text-total-project-budget">
                      {formatCurrency(dashboard.projects.reduce((sum, p) => sum + p.budgetSpent, 0))}
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Daily Reports
                <Badge variant="secondary" className="ml-2">{dashboard.dailyReports.length}</Badge>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {dashboard.dailyReports.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="text-no-reports">
                No daily reports found for this contract's projects
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Weather</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.dailyReports.map((report) => (
                      <TableRow key={report.id} data-testid={`report-row-${report.id}`}>
                        <TableCell className="font-medium">
                          {formatDate(report.date)}
                        </TableCell>
                        <TableCell>{report.projectName || '-'}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={report.status === 'submitted' ? 'default' : 'secondary'}
                            className="capitalize"
                          >
                            {report.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="capitalize">
                          {report.weatherType?.replace(/_/g, ' ') || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {report.regularHours || '0'}
                          {report.otHours && parseFloat(report.otHours) > 0 && (
                            <span className="text-muted-foreground"> + {report.otHours} OT</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" asChild data-testid={`view-report-${report.id}`}>
                            <Link href={`/report/${report.id}`}>
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showBudgetOverrideDialog} onOpenChange={setShowBudgetOverrideDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Budget Override</DialogTitle>
            <DialogDescription>
              Set a manual budget to override the auto-calculated budget from the contract value. 
              Leave empty to use the contract value.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="budgetOverride">Budget Amount ($)</Label>
              <Input
                id="budgetOverride"
                type="number"
                step="0.01"
                min="0"
                placeholder="Enter budget amount or leave empty to use contract value"
                value={budgetOverrideValue}
                onChange={(e) => setBudgetOverrideValue(e.target.value)}
                data-testid="input-budget-override"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Contract value: {formatCurrency(parseFloat(dashboard?.contract.currentValue || dashboard?.contract.originalValue || '0'))}
            </p>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowBudgetOverrideDialog(false)}
              data-testid="button-cancel-budget"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveBudgetOverride}
              disabled={updateBudgetMutation.isPending}
              data-testid="button-save-budget"
            >
              {updateBudgetMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBaseBudgetDialog} onOpenChange={setShowBaseBudgetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Base Budget (Mid-Project Onboarding)</DialogTitle>
            <DialogDescription>
              Set a base amount for work completed before the inspector joined. 
              This amount will stack with future daily reports automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="baseBudget">Base Amount Spent ($)</Label>
              <Input
                id="baseBudget"
                type="number"
                step="0.01"
                min="0"
                placeholder="Enter amount already spent before onboarding"
                value={baseBudgetValue}
                onChange={(e) => setBaseBudgetValue(e.target.value)}
                data-testid="input-base-budget"
              />
            </div>
            <div className="bg-muted/50 p-3 rounded-md space-y-1">
              <p className="text-sm font-medium">How it works:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>Base: {formatCurrency(parseFloat(baseBudgetValue || '0'))} (what you enter)</li>
                <li>+ Reports: {formatCurrency(dashboard?.budget.calculatedSpent || 0)} (auto-calculated)</li>
                <li>= Total: {formatCurrency(parseFloat(baseBudgetValue || '0') + (dashboard?.budget.calculatedSpent || 0))}</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowBaseBudgetDialog(false)}
              data-testid="button-cancel-base-budget"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveBaseBudget}
              disabled={updateBaseBudgetMutation.isPending}
              data-testid="button-save-base-budget"
            >
              {updateBaseBudgetMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

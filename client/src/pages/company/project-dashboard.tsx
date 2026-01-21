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
  ArrowLeft,
  Calendar,
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";

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
    remaining: number;
    progress: number;
    status: 'under' | 'on_track' | 'warning' | 'over';
    hours: {
      regular: number;
      overtime: number;
      premium: number;
      total: number;
    };
  };
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

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function ProjectDashboard() {
  const { toast } = useToast();
  const { activeCompany, profile } = useAuth();
  const params = useParams<{ contractId: string }>();
  const contractId = params.contractId;
  const [, setLocation] = useLocation();
  const [showBudgetOverrideDialog, setShowBudgetOverrideDialog] = useState(false);
  const [budgetOverrideValue, setBudgetOverrideValue] = useState("");

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

  if (isLoading) {
    return (
      <PageLayout title="Project Dashboard">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!dashboard) {
    return (
      <PageLayout title="Project Dashboard">
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
    <PageLayout title="Project Dashboard">
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
              <div className="flex items-center justify-between">
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
                    {dashboard.schedule.startDate 
                      ? format(new Date(dashboard.schedule.startDate), 'MMM d, yyyy')
                      : 'Not set'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Completion Date</p>
                  <p className="font-medium" data-testid="text-end-date">
                    {dashboard.schedule.endDate 
                      ? format(new Date(dashboard.schedule.endDate), 'MMM d, yyyy')
                      : 'Not set'}
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Budget Status
                </CardTitle>
                <Badge className={budgetConfig.textColor} variant="outline" data-testid="badge-budget-status">
                  {budgetConfig.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Spent</span>
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
                  <p className="text-xs text-muted-foreground">Spent</p>
                  <p className="font-medium text-sm" data-testid="text-budget-spent">
                    {formatCurrency(dashboard.budget.spent)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className={`font-medium text-sm ${dashboard.budget.remaining < 0 ? 'text-red-600 dark:text-red-400' : ''}`} data-testid="text-budget-remaining">
                    {formatCurrency(dashboard.budget.remaining)}
                  </p>
                </div>
              </div>

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

              <div className="pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={handleOpenBudgetOverride}
                  data-testid="button-edit-budget"
                >
                  {dashboard.contract.budgetOverride ? 'Edit Budget Override' : 'Set Manual Budget'}
                </Button>
                {dashboard.contract.budgetOverride && (
                  <p className="text-xs text-muted-foreground mt-1 text-center">
                    Manual override active: {formatCurrency(parseFloat(dashboard.contract.budgetOverride))}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
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
    </PageLayout>
  );
}

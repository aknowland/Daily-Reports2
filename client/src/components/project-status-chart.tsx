import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  Calendar,
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  XCircle,
} from "lucide-react";

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

type Props = {
  contracts: ContractDashboardSummary[];
  isLoading: boolean;
};

const getScheduleStatusConfig = (status: string) => {
  switch (status) {
    case 'complete':
      return { 
        color: 'bg-green-500', 
        bgColor: 'bg-green-500/20',
        textColor: 'text-green-600 dark:text-green-400', 
        label: 'Complete', 
        icon: CheckCircle2 
      };
    case 'on_track':
      return { 
        color: 'bg-blue-500', 
        bgColor: 'bg-blue-500/20',
        textColor: 'text-blue-600 dark:text-blue-400', 
        label: 'On Track', 
        icon: TrendingUp 
      };
    case 'warning':
      return { 
        color: 'bg-yellow-500', 
        bgColor: 'bg-yellow-500/20',
        textColor: 'text-yellow-600 dark:text-yellow-400', 
        label: 'Near Due', 
        icon: AlertTriangle 
      };
    case 'overdue':
      return { 
        color: 'bg-red-500', 
        bgColor: 'bg-red-500/20',
        textColor: 'text-red-600 dark:text-red-400', 
        label: 'Overdue', 
        icon: XCircle 
      };
    case 'upcoming':
      return { 
        color: 'bg-purple-500', 
        bgColor: 'bg-purple-500/20',
        textColor: 'text-purple-600 dark:text-purple-400', 
        label: 'Upcoming', 
        icon: Calendar 
      };
    case 'not_started':
    default:
      return { 
        color: 'bg-gray-400', 
        bgColor: 'bg-gray-400/20',
        textColor: 'text-muted-foreground', 
        label: 'Not Started', 
        icon: Clock 
      };
  }
};

const getBudgetStatusConfig = (status: string) => {
  switch (status) {
    case 'under':
      return { 
        color: 'bg-green-500', 
        bgColor: 'bg-green-500/20',
        textColor: 'text-green-600 dark:text-green-400', 
        label: 'Under Budget' 
      };
    case 'on_track':
      return { 
        color: 'bg-blue-500', 
        bgColor: 'bg-blue-500/20',
        textColor: 'text-blue-600 dark:text-blue-400', 
        label: 'On Track' 
      };
    case 'warning':
      return { 
        color: 'bg-yellow-500', 
        bgColor: 'bg-yellow-500/20',
        textColor: 'text-yellow-600 dark:text-yellow-400', 
        label: 'Near Budget' 
      };
    case 'over':
      return { 
        color: 'bg-red-500', 
        bgColor: 'bg-red-500/20',
        textColor: 'text-red-600 dark:text-red-400', 
        label: 'Over Budget' 
      };
    default:
      return { 
        color: 'bg-gray-400', 
        bgColor: 'bg-gray-400/20',
        textColor: 'text-muted-foreground', 
        label: 'Unknown' 
      };
  }
};

export function ProjectStatusChart({ contracts, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card data-testid="card-project-status-chart">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Project Status Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (contracts.length === 0) {
    return (
      <Card data-testid="card-project-status-chart">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Project Status Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No active contracts to display. Create a contract to see status tracking.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-project-status-chart">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Project Status Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {contracts.map((contract) => {
          const scheduleConfig = getScheduleStatusConfig(contract.schedule.status);
          const budgetConfig = getBudgetStatusConfig(contract.budget.status);
          const ScheduleIcon = scheduleConfig.icon;

          return (
            <Link 
              key={contract.id} 
              href={`/company/contracts/${contract.id}/dashboard`}
            >
              <div 
                className="p-4 rounded-lg border hover-elevate cursor-pointer space-y-3"
                data-testid={`project-status-${contract.id}`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-semibold truncate">{contract.name}</h3>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {contract.contractNumber}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${scheduleConfig.bgColor} ${scheduleConfig.textColor} border-0`}>
                      <ScheduleIcon className="h-3 w-3 mr-1" />
                      {scheduleConfig.label}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        Schedule
                      </span>
                      <span className={scheduleConfig.textColor}>
                        {contract.schedule.status === 'upcoming' ? 'Bid Phase' : `${contract.schedule.progress}%`}
                        {contract.schedule.status === 'upcoming' && contract.schedule.daysRemaining !== null && contract.schedule.daysRemaining > 0 && (
                          <span className="text-purple-500 dark:text-purple-400 ml-1">
                            ({contract.schedule.daysRemaining}d to start)
                          </span>
                        )}
                        {contract.schedule.status !== 'upcoming' && contract.schedule.daysRemaining !== null && contract.schedule.daysRemaining > 0 && (
                          <span className="text-muted-foreground ml-1">
                            ({contract.schedule.daysRemaining}d left)
                          </span>
                        )}
                        {contract.schedule.daysOverdue !== null && contract.schedule.daysOverdue > 0 && (
                          <span className="text-red-500 ml-1">
                            ({contract.schedule.daysOverdue}d overdue)
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                      <div 
                        className={`absolute left-0 top-0 h-full rounded-full transition-all ${scheduleConfig.color}`}
                        style={{ width: `${Math.min(100, contract.schedule.progress)}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <DollarSign className="h-3 w-3" />
                        Budget
                      </span>
                      <span className={budgetConfig.textColor}>
                        {contract.budget.progress}%
                        {contract.budget.totalBudget > 0 && (
                          <span className="text-muted-foreground ml-1">
                            (${contract.budget.spent.toLocaleString()} / ${contract.budget.totalBudget.toLocaleString()})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                      <div 
                        className={`absolute left-0 top-0 h-full rounded-full transition-all ${budgetConfig.color}`}
                        style={{ width: `${Math.min(100, contract.budget.progress)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function StatusSummaryCards({ contracts, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const scheduleStats = {
    upcoming: contracts.filter(c => c.schedule.status === 'upcoming').length,
    onTrack: contracts.filter(c => c.schedule.status === 'on_track').length,
    warning: contracts.filter(c => c.schedule.status === 'warning').length,
    overdue: contracts.filter(c => c.schedule.status === 'overdue').length,
    complete: contracts.filter(c => c.schedule.status === 'complete').length,
  };

  const budgetStats = {
    under: contracts.filter(c => c.budget.status === 'under').length,
    onTrack: contracts.filter(c => c.budget.status === 'on_track').length,
    warning: contracts.filter(c => c.budget.status === 'warning').length,
    over: contracts.filter(c => c.budget.status === 'over').length,
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <Card data-testid="card-schedule-upcoming">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
          <Calendar className="h-4 w-4 text-purple-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {scheduleStats.upcoming}
          </div>
          <p className="text-xs text-muted-foreground">projects in bid phase</p>
        </CardContent>
      </Card>

      <Card data-testid="card-schedule-on-track">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">On Track</CardTitle>
          <TrendingUp className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {scheduleStats.onTrack}
          </div>
          <p className="text-xs text-muted-foreground">projects on schedule</p>
        </CardContent>
      </Card>

      <Card data-testid="card-schedule-warning">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Near Due</CardTitle>
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {scheduleStats.warning}
          </div>
          <p className="text-xs text-muted-foreground">projects nearing deadline</p>
        </CardContent>
      </Card>

      <Card data-testid="card-schedule-overdue">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Overdue</CardTitle>
          <XCircle className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {scheduleStats.overdue}
          </div>
          <p className="text-xs text-muted-foreground">projects past deadline</p>
        </CardContent>
      </Card>

      <Card data-testid="card-budget-warning">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Budget Alert</CardTitle>
          <DollarSign className="h-4 w-4 text-yellow-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {budgetStats.warning + budgetStats.over}
          </div>
          <p className="text-xs text-muted-foreground">projects near/over budget</p>
        </CardContent>
      </Card>
    </div>
  );
}

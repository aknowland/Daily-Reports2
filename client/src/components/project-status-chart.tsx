import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import {
  Calendar,
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  XCircle,
  Search,
  Filter,
} from "lucide-react";

type ContractDashboardSummary = {
  id: string;
  name: string;
  contractNumber: string;
  status: string;
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

// Status priority for sorting (lower = shows first)
const getStatusPriority = (status: string): number => {
  const priorities: Record<string, number> = {
    // Upcoming statuses (show first)
    'bid_release': 1,
    'bid_received': 2,
    'under_review': 3,
    'awarded': 4,
    // In Progress statuses
    'in_execution': 5,
    'substantial_completion': 6,
    // Completed/Cancelled (filtered out but just in case)
    'final_closeout': 7,
    'not_awarded': 8,
    'cancelled': 9,
  };
  return priorities[status] ?? 10;
};

// Statuses to exclude from dashboard
const EXCLUDED_STATUSES = ['cancelled', 'not_awarded', 'final_closeout'];

export function ProjectStatusChart({ contracts, isLoading }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState<string>("all");
  const [budgetFilter, setBudgetFilter] = useState<string>("all");

  // Filter out completed/cancelled and sort by status priority
  const activeContracts = contracts
    .filter(c => !EXCLUDED_STATUSES.includes(c.status))
    .filter(c => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = c.name.toLowerCase().includes(query);
        const matchesNumber = c.contractNumber?.toLowerCase().includes(query);
        if (!matchesName && !matchesNumber) return false;
      }
      // Schedule status filter
      if (scheduleFilter !== "all" && c.schedule.status !== scheduleFilter) return false;
      // Budget status filter
      if (budgetFilter !== "all" && c.budget.status !== budgetFilter) return false;
      return true;
    })
    .sort((a, b) => getStatusPriority(a.status) - getStatusPriority(b.status));

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

  if (activeContracts.length === 0) {
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

  const totalUnfiltered = contracts.filter(c => !EXCLUDED_STATUSES.includes(c.status)).length;
  const hasFilters = searchQuery || scheduleFilter !== "all" || budgetFilter !== "all";

  return (
    <Card data-testid="card-project-status-chart">
      <CardHeader className="space-y-4">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Project Status Overview
        </CardTitle>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contracts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-contracts"
            />
          </div>
          <div className="flex gap-2">
            <Select value={scheduleFilter} onValueChange={setScheduleFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-schedule-filter">
                <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Schedule" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Schedules</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="on_track">On Track</SelectItem>
                <SelectItem value="warning">Near Due</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
              </SelectContent>
            </Select>
            <Select value={budgetFilter} onValueChange={setBudgetFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-budget-filter">
                <DollarSign className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Budget" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Budgets</SelectItem>
                <SelectItem value="under">Under Budget</SelectItem>
                <SelectItem value="on_track">On Track</SelectItem>
                <SelectItem value="warning">Near Budget</SelectItem>
                <SelectItem value="over">Over Budget</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {hasFilters && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            Showing {activeContracts.length} of {totalUnfiltered} contracts
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {activeContracts.length === 0 && hasFilters ? (
          <p className="text-muted-foreground text-center py-8">
            No contracts match your filters. Try adjusting your search criteria.
          </p>
        ) : activeContracts.map((contract) => {
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
                        {contract.schedule.status === 'upcoming' 
                          ? (['bid_release', 'bid_received', 'under_review', 'pending'].includes(contract.status) 
                              ? 'Bid Phase' 
                              : 'Pre-Construction')
                          : `${contract.schedule.progress}%`}
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
          <p className="text-xs text-muted-foreground">not yet started</p>
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

import { useMemo, useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "wouter";
import {
  BarChart3,
  Calendar,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { format, differenceInDays, addMonths, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval } from "date-fns";
import type { ContractWithProjects } from "@shared/schema";

type DashboardSummaryItem = {
  id: string;
  budget: {
    totalBudget: number;
    spent: number;
    remaining: number;
    progress: number;
    status: string;
  };
  schedule: {
    progress: number;
    status: string;
    daysRemaining: number | null;
    daysOverdue: number | null;
  };
};

type GanttContract = {
  id: string;
  name: string;
  contractNumber: string;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  scheduleProgress: number;
  budgetProgress: number;
  budgetStatus: "under" | "on_track" | "warning" | "over";
  scheduleStatus: "not_started" | "upcoming" | "on_track" | "warning" | "overdue" | "complete";
  daysRemaining: number | null;
  totalBudget: number;
  budgetSpent: number;
  budgetedHours: number | null;
  clientName: string | null;
  projectCount: number;
};

const STATUS_LABELS: Record<string, string> = {
  awarded: "Awarded",
  in_execution: "In Execution",
};

const BAR_HEIGHT = 36;
const ROW_HEIGHT = 52;
const LABEL_WIDTH_DESKTOP = 240;
const LABEL_WIDTH_MOBILE = 160;
const MIN_COL_WIDTH = 80;

function computeGanttData(contracts: ContractWithProjects[], dashboardSummary: DashboardSummaryItem[]): GanttContract[] {
  const targetStatuses = ["awarded", "in_execution"];
  const now = new Date();
  const summaryMap = new Map(dashboardSummary.map((d) => [d.id, d]));

  return contracts
    .filter((c) => targetStatuses.includes(c.status))
    .map((c) => {
      const startDate = c.startDate ? new Date(c.startDate) : null;
      const endDate = c.substantialCompletionDate
        ? new Date(c.substantialCompletionDate)
        : null;

      const summary = summaryMap.get(c.id);

      let scheduleProgress = 0;
      let scheduleStatus: GanttContract["scheduleStatus"] = "not_started";
      let daysRemaining: number | null = null;

      if (summary) {
        scheduleProgress = summary.schedule.progress;
        scheduleStatus = summary.schedule.status as GanttContract["scheduleStatus"];
        daysRemaining = summary.schedule.daysRemaining;
        if (summary.schedule.daysOverdue) {
          daysRemaining = -summary.schedule.daysOverdue;
        }
      } else if (startDate && endDate) {
        const totalDuration = endDate.getTime() - startDate.getTime();
        const elapsed = now.getTime() - startDate.getTime();

        if (totalDuration <= 0) {
          scheduleProgress = 0;
          scheduleStatus = "not_started";
        } else if (now < startDate) {
          scheduleProgress = 0;
          scheduleStatus = "upcoming";
          daysRemaining = Math.ceil(
            (startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
        } else if (now > endDate) {
          scheduleProgress = 100;
          const overdueDays = Math.ceil(
            (now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          scheduleStatus = "overdue";
          daysRemaining = -overdueDays;
        } else {
          scheduleProgress = Math.min(
            100,
            Math.max(0, (elapsed / totalDuration) * 100)
          );
          daysRemaining = Math.ceil(
            (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
          scheduleStatus = scheduleProgress >= 80 ? "warning" : "on_track";
        }
      }

      let totalBudget = 0;
      let budgetSpent = 0;
      let budgetProgress = 0;
      let budgetStatus: GanttContract["budgetStatus"] = "on_track";

      if (summary) {
        totalBudget = summary.budget.totalBudget;
        budgetSpent = summary.budget.spent;
        budgetProgress = summary.budget.progress;
        budgetStatus = summary.budget.status as GanttContract["budgetStatus"];
      } else {
        if (c.options && c.options.length > 0) {
          const awardedOptions = c.options.filter(
            (o) => o.awardStatus === "awarded"
          );
          for (const opt of awardedOptions) {
            for (const ins of opt.inspectors || []) {
              totalBudget +=
                (parseFloat(ins.rate) || 0) * (parseFloat(ins.hours) || 0);
            }
          }
        }
        if (totalBudget === 0) {
          totalBudget =
            parseFloat(c.currentValue || c.originalValue || "0") || 0;
        }
        budgetSpent = parseFloat(c.baseBudgetSpent || "0");
        if (totalBudget > 0) {
          budgetProgress = (budgetSpent / totalBudget) * 100;
          if (budgetProgress >= 100) budgetStatus = "over";
          else if (budgetProgress >= 80) budgetStatus = "warning";
          else if (budgetProgress < 50) budgetStatus = "under";
        }
      }

      const clientName = c.client?.name || null;
      const budgetedHours = c.budgetedHours ? parseFloat(c.budgetedHours) : null;

      return {
        id: c.id,
        name: c.name,
        contractNumber: c.contractNumber,
        status: c.status,
        startDate,
        endDate,
        scheduleProgress: Math.round(scheduleProgress),
        budgetProgress: Math.round(budgetProgress),
        budgetStatus,
        scheduleStatus,
        daysRemaining,
        totalBudget,
        budgetSpent,
        budgetedHours,
        clientName,
        projectCount: c.projects?.length || 0,
      };
    })
    .sort((a, b) => {
      if (a.startDate && b.startDate) return a.startDate.getTime() - b.startDate.getTime();
      if (a.startDate) return -1;
      if (b.startDate) return 1;
      return a.name.localeCompare(b.name);
    });
}

function getScheduleColor(status: GanttContract["scheduleStatus"]) {
  switch (status) {
    case "on_track":
      return "bg-blue-500 dark:bg-blue-400";
    case "warning":
      return "bg-amber-500 dark:bg-amber-400";
    case "overdue":
      return "bg-red-500 dark:bg-red-400";
    case "complete":
      return "bg-green-500 dark:bg-green-400";
    case "upcoming":
      return "bg-blue-300 dark:bg-blue-600";
    default:
      return "bg-muted-foreground/30";
  }
}

function getBudgetColor(status: GanttContract["budgetStatus"]) {
  switch (status) {
    case "under":
      return "bg-emerald-500 dark:bg-emerald-400";
    case "on_track":
      return "bg-emerald-500 dark:bg-emerald-400";
    case "warning":
      return "bg-amber-500 dark:bg-amber-400";
    case "over":
      return "bg-red-500 dark:bg-red-400";
    default:
      return "bg-muted-foreground/30";
  }
}

function getBudgetFillColor(status: GanttContract["budgetStatus"]) {
  switch (status) {
    case "under":
      return "bg-emerald-400/70 dark:bg-emerald-500/70";
    case "on_track":
      return "bg-emerald-400/70 dark:bg-emerald-500/70";
    case "warning":
      return "bg-amber-400/70 dark:bg-amber-500/70";
    case "over":
      return "bg-red-400/70 dark:bg-red-500/70";
    default:
      return "bg-muted-foreground/20";
  }
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function ContractGanttChart({
  contracts,
}: {
  contracts: ContractWithProjects[];
}) {
  const [, setLocation] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [labelWidth, setLabelWidth] = useState(LABEL_WIDTH_DESKTOP);

  useEffect(() => {
    const checkWidth = () => {
      if (containerRef.current) {
        setLabelWidth(containerRef.current.clientWidth < 640 ? LABEL_WIDTH_MOBILE : LABEL_WIDTH_DESKTOP);
      }
    };
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  const hasTargetContracts = contracts.some((c) =>
    ["awarded", "in_execution"].includes(c.status)
  );

  const { data: dashboardSummary = [], isLoading: isSummaryLoading } = useQuery<DashboardSummaryItem[]>({
    queryKey: ["/api/contracts/dashboard-summary"],
    enabled: hasTargetContracts,
  });

  const ganttData = useMemo(
    () => computeGanttData(contracts, dashboardSummary),
    [contracts, dashboardSummary]
  );

  const { timelineStart, timelineEnd, months } = useMemo(() => {
    if (ganttData.length === 0)
      return {
        timelineStart: startOfMonth(new Date()),
        timelineEnd: endOfMonth(addMonths(new Date(), 6)),
        months: [],
      };

    let earliest = new Date();
    let latest = addMonths(new Date(), 3);

    for (const c of ganttData) {
      if (c.startDate && c.startDate < earliest) earliest = c.startDate;
      if (c.endDate && c.endDate > latest) latest = c.endDate;
    }

    const tStart = startOfMonth(subMonths(earliest, 1));
    const tEnd = endOfMonth(addMonths(latest, 1));
    const monthList = eachMonthOfInterval({ start: tStart, end: tEnd });
    return { timelineStart: tStart, timelineEnd: tEnd, months: monthList };
  }, [ganttData]);

  const totalDays = Math.max(
    1,
    differenceInDays(timelineEnd, timelineStart)
  );
  const colWidth = Math.max(MIN_COL_WIDTH, MIN_COL_WIDTH * zoomLevel);
  const chartWidth = (totalDays / 30) * colWidth * 4;

  const todayOffset = useMemo(() => {
    const now = new Date();
    if (now < timelineStart || now > timelineEnd) return null;
    const daysSinceStart = differenceInDays(now, timelineStart);
    return (daysSinceStart / totalDays) * chartWidth;
  }, [timelineStart, timelineEnd, totalDays, chartWidth]);

  useEffect(() => {
    if (scrollRef.current && todayOffset !== null) {
      const scrollTarget = Math.max(0, todayOffset - scrollRef.current.clientWidth / 3);
      scrollRef.current.scrollLeft = scrollTarget;
    }
  }, [todayOffset]);

  const kpis = useMemo(() => {
    const awarded = ganttData.filter((c) => c.status === "awarded").length;
    const inExecution = ganttData.filter(
      (c) => c.status === "in_execution"
    ).length;
    const totalBudget = ganttData.reduce((s, c) => s + c.totalBudget, 0);
    const overdue = ganttData.filter(
      (c) => c.scheduleStatus === "overdue"
    ).length;
    const overBudget = ganttData.filter(
      (c) => c.budgetStatus === "over" || c.budgetStatus === "warning"
    ).length;
    return { awarded, inExecution, totalBudget, overdue, overBudget, total: ganttData.length };
  }, [ganttData]);

  if (ganttData.length === 0) return null;

  return (
    <Card className="mb-6" data-testid="gantt-chart-card" ref={containerRef}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-lg">Active Contract Timeline</CardTitle>
            <Badge variant="secondary" className="text-xs" data-testid="gantt-contract-count">
              {kpis.total} contract{kpis.total !== 1 ? "s" : ""}
            </Badge>
            {isSummaryLoading && (
              <Badge variant="outline" className="text-xs text-muted-foreground animate-pulse" data-testid="gantt-loading">
                Loading budget data...
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
              data-testid="gantt-zoom-out"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setZoomLevel((z) => Math.min(2, z + 0.25))}
              data-testid="gantt-zoom-in"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-2 flex-wrap text-sm" data-testid="gantt-legend">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5" data-testid="legend-schedule">
              <div className="w-3 h-2 rounded-sm bg-blue-500 dark:bg-blue-400" />
              <span className="text-muted-foreground">Schedule</span>
            </div>
            <div className="flex items-center gap-1.5" data-testid="legend-budget">
              <div className="w-3 h-2 rounded-sm bg-emerald-500 dark:bg-emerald-400" />
              <span className="text-muted-foreground">Budget</span>
            </div>
            <div className="flex items-center gap-1.5" data-testid="legend-warning">
              <div className="w-3 h-2 rounded-sm bg-amber-500 dark:bg-amber-400" />
              <span className="text-muted-foreground">Warning</span>
            </div>
            <div className="flex items-center gap-1.5" data-testid="legend-over">
              <div className="w-3 h-2 rounded-sm bg-red-500 dark:bg-red-400" />
              <span className="text-muted-foreground">Over</span>
            </div>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground" data-testid="gantt-kpis">
            <span className="flex items-center gap-1" data-testid="kpi-awarded">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500 dark:text-green-400" />
              {kpis.awarded} Awarded
            </span>
            <span className="flex items-center gap-1" data-testid="kpi-in-execution">
              <TrendingUp className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              {kpis.inExecution} In Execution
            </span>
            {kpis.overdue > 0 && (
              <span className="flex items-center gap-1 text-red-600 dark:text-red-400" data-testid="kpi-overdue">
                <AlertTriangle className="w-3.5 h-3.5" />
                {kpis.overdue} Overdue
              </span>
            )}
            {kpis.totalBudget > 0 && (
              <span className="flex items-center gap-1" data-testid="kpi-total-budget">
                <DollarSign className="w-3.5 h-3.5" />
                {formatCurrency(kpis.totalBudget)} Total
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="flex border-t">
          <div
            className="flex-shrink-0 border-r bg-muted/30"
            style={{ width: labelWidth }}
          >
            <div className="h-8 border-b flex items-center px-3">
              <span className="text-xs font-medium text-muted-foreground">
                Contract
              </span>
            </div>
            {ganttData.map((c) => (
              <Tooltip key={c.id}>
                <TooltipTrigger asChild>
                  <div
                    className="flex items-center px-3 gap-2 border-b cursor-pointer hover-elevate"
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => setLocation(`/company/contracts/${c.id}/dashboard`)}
                    data-testid={`gantt-label-${c.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate leading-tight">
                        {c.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {c.contractNumber}
                        {c.clientName ? ` · ${c.clientName}` : ""}
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-[10px] flex-shrink-0"
                    >
                      {STATUS_LABELS[c.status] || c.status}
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-medium">{c.name}</p>
                    {c.clientName && (
                      <p className="text-xs text-muted-foreground">
                        Client: {c.clientName}
                      </p>
                    )}
                    <p className="text-xs">
                      Schedule: {c.scheduleProgress}%
                      {c.daysRemaining !== null &&
                        ` · ${c.daysRemaining > 0 ? `${c.daysRemaining}d left` : `${Math.abs(c.daysRemaining)}d overdue`}`}
                    </p>
                    {c.totalBudget > 0 && (
                      <p className="text-xs">
                        Budget: {formatCurrency(c.budgetSpent)} /{" "}
                        {formatCurrency(c.totalBudget)} (
                        {c.budgetProgress}%)
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {c.projectCount} project
                      {c.projectCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>

          <div
            className="flex-1 overflow-x-auto overflow-y-hidden"
            ref={scrollRef}
          >
            <div
              className="relative"
              style={{ width: chartWidth, minWidth: "100%" }}
            >
              <div className="h-8 border-b flex sticky top-0 bg-card z-10">
                {months.map((m, i) => {
                  const monthStart = m;
                  const monthEnd = endOfMonth(m);
                  const dStart = Math.max(
                    0,
                    differenceInDays(monthStart, timelineStart)
                  );
                  const dEnd = differenceInDays(monthEnd, timelineStart);
                  const left = (dStart / totalDays) * chartWidth;
                  const width =
                    ((Math.min(dEnd, totalDays) - dStart) / totalDays) *
                    chartWidth;

                  return (
                    <div
                      key={i}
                      className="absolute h-full border-r flex items-center justify-center text-xs text-muted-foreground"
                      style={{ left, width }}
                    >
                      {format(m, "MMM yyyy")}
                    </div>
                  );
                })}
              </div>

              {ganttData.map((c) => {
                if (!c.startDate || !c.endDate) {
                  return (
                    <div
                      key={c.id}
                      className="border-b flex items-center justify-center"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <span className="text-xs text-muted-foreground italic">
                        No dates set
                      </span>
                    </div>
                  );
                }

                const barStartDay = Math.max(
                  0,
                  differenceInDays(c.startDate, timelineStart)
                );
                const barEndDay = Math.min(
                  totalDays,
                  differenceInDays(c.endDate, timelineStart)
                );
                const barLeft = (barStartDay / totalDays) * chartWidth;
                const barWidth = Math.max(
                  8,
                  ((barEndDay - barStartDay) / totalDays) * chartWidth
                );

                const schedFill = Math.max(0, Math.min(100, c.scheduleProgress));
                const budgetFill = Math.max(0, Math.min(100, c.budgetProgress));

                return (
                  <div
                    key={c.id}
                    className="relative border-b"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {months.map((m, i) => {
                      const dStart = Math.max(
                        0,
                        differenceInDays(m, timelineStart)
                      );
                      const left = (dStart / totalDays) * chartWidth;
                      return (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 border-r border-dashed border-border/30"
                          style={{ left }}
                        />
                      );
                    })}

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="absolute cursor-pointer group"
                          style={{
                            left: barLeft,
                            width: barWidth,
                            top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                            height: BAR_HEIGHT,
                          }}
                          onClick={() =>
                            setLocation(`/company/contracts/${c.id}/dashboard`)
                          }
                          data-testid={`gantt-bar-${c.id}`}
                        >
                          <div
                            className="absolute inset-x-0 top-0 rounded-md bg-muted/40 dark:bg-muted/20 border border-border/50"
                            style={{ height: BAR_HEIGHT }}
                          />

                          <div
                            className={`absolute top-0 left-0 h-[17px] rounded-tl-md ${schedFill >= 100 ? "rounded-tr-md" : ""} ${getScheduleColor(c.scheduleStatus)} opacity-90 transition-all`}
                            style={{
                              width: `${schedFill}%`,
                              minWidth: schedFill > 0 ? 4 : 0,
                            }}
                          />

                          <div
                            className={`absolute bottom-0 left-0 h-[17px] rounded-bl-md ${budgetFill >= 100 ? "rounded-br-md" : ""} ${getBudgetFillColor(c.budgetStatus)} opacity-90 transition-all`}
                            style={{
                              width: `${budgetFill}%`,
                              minWidth: budgetFill > 0 ? 4 : 0,
                              top: 18,
                            }}
                          />

                          {barWidth > 60 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="text-[10px] font-medium text-foreground/80 drop-shadow-sm">
                                {c.scheduleProgress}% / {c.budgetProgress}%
                              </span>
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-xs"
                      >
                        <div className="space-y-1.5">
                          <p className="font-medium">{c.name}</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <span className="text-muted-foreground">
                              Start:
                            </span>
                            <span>
                              {c.startDate
                                ? format(c.startDate, "MMM d, yyyy")
                                : "N/A"}
                            </span>
                            <span className="text-muted-foreground">
                              End:
                            </span>
                            <span>
                              {c.endDate
                                ? format(c.endDate, "MMM d, yyyy")
                                : "N/A"}
                            </span>
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> Schedule:
                            </span>
                            <span
                              className={
                                c.scheduleStatus === "overdue"
                                  ? "text-red-600 dark:text-red-400 font-medium"
                                  : c.scheduleStatus === "warning"
                                    ? "text-amber-600 dark:text-amber-400"
                                    : ""
                              }
                            >
                              {c.scheduleProgress}%
                              {c.daysRemaining !== null &&
                                ` (${c.daysRemaining > 0 ? `${c.daysRemaining}d left` : `${Math.abs(c.daysRemaining)}d over`})`}
                            </span>
                            <span className="text-muted-foreground flex items-center gap-1">
                              <DollarSign className="w-3 h-3" /> Budget:
                            </span>
                            <span
                              className={
                                c.budgetStatus === "over"
                                  ? "text-red-600 dark:text-red-400 font-medium"
                                  : c.budgetStatus === "warning"
                                    ? "text-amber-600 dark:text-amber-400"
                                    : ""
                              }
                            >
                              {c.budgetProgress}%
                              {c.totalBudget > 0 &&
                                ` (${formatCurrency(c.budgetSpent)}/${formatCurrency(c.totalBudget)})`}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground pt-1">
                            Click to view dashboard
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}

              {todayOffset !== null && (
                <div
                  className="absolute top-0 bottom-0 w-px z-20 pointer-events-none"
                  data-testid="gantt-today-marker"
                  style={{
                    left: todayOffset,
                    background:
                      "repeating-linear-gradient(to bottom, hsl(var(--destructive)) 0, hsl(var(--destructive)) 4px, transparent 4px, transparent 8px)",
                  }}
                >
                  <div className="absolute -top-0 -translate-x-1/2 bg-destructive text-destructive-foreground text-[9px] px-1 rounded-b font-medium">
                    Today
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

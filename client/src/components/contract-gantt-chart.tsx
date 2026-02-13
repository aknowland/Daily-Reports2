import { useMemo, useState, useRef, useEffect } from "react";
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
  ZoomIn,
  ZoomOut,
  ChevronRight,
} from "lucide-react";
import { format, differenceInDays, addMonths, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval } from "date-fns";
import type { ContractWithProjects } from "@shared/schema";

type GanttProject = {
  id: string;
  name: string;
  projectNumber: string;
  contractId: string;
  contractName: string;
  contractNumber: string;
  contractStatus: string;
  startDate: Date | null;
  endDate: Date | null;
  scheduleProgress: number;
  budgetProgress: number;
  budgetStatus: "under" | "on_track" | "warning" | "over";
  scheduleStatus: "not_started" | "upcoming" | "on_track" | "warning" | "overdue" | "complete";
  daysRemaining: number | null;
  totalBudget: number;
  budgetSpent: number;
  clientName: string | null;
};

type GanttRow = {
  type: "contract_header";
  contractId: string;
  contractName: string;
  contractNumber: string;
  contractStatus: string;
  projectCount: number;
  clientName: string | null;
} | {
  type: "project";
  project: GanttProject;
};

const BAR_HEIGHT = 28;
const ROW_HEIGHT = 44;
const HEADER_ROW_HEIGHT = 36;
const LABEL_WIDTH_DESKTOP = 260;
const LABEL_WIDTH_MOBILE = 180;
const MIN_COL_WIDTH = 80;

function computeGanttRows(contracts: ContractWithProjects[]): { rows: GanttRow[]; projects: GanttProject[] } {
  const targetStatuses = ["awarded", "in_execution"];
  const now = new Date();
  const allProjects: GanttProject[] = [];
  const rows: GanttRow[] = [];

  const activeContracts = contracts
    .filter((c) => targetStatuses.includes(c.status))
    .sort((a, b) => {
      const aStart = a.startDate ? new Date(a.startDate).getTime() : Infinity;
      const bStart = b.startDate ? new Date(b.startDate).getTime() : Infinity;
      return aStart - bStart;
    });

  for (const contract of activeContracts) {
    const contractProjects = (contract.projects || []).filter(p => p.name);
    if (contractProjects.length === 0) continue;

    const clientName = contract.client?.name || null;

    rows.push({
      type: "contract_header",
      contractId: contract.id,
      contractName: contract.name,
      contractNumber: contract.contractNumber,
      contractStatus: contract.status,
      projectCount: contractProjects.length,
      clientName,
    });

    for (const project of contractProjects) {
      const startDate = project.startDate ? new Date(project.startDate) : null;
      const endDate = project.substantialCompletionDate
        ? new Date(project.substantialCompletionDate)
        : null;

      let scheduleProgress = 0;
      let scheduleStatus: GanttProject["scheduleStatus"] = "not_started";
      let daysRemaining: number | null = null;

      if (startDate && endDate) {
        const totalDuration = endDate.getTime() - startDate.getTime();
        const elapsed = now.getTime() - startDate.getTime();

        if (totalDuration <= 0) {
          scheduleProgress = 0;
          scheduleStatus = "not_started";
        } else if (now < startDate) {
          scheduleProgress = 0;
          scheduleStatus = "upcoming";
          daysRemaining = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        } else if (now > endDate) {
          scheduleProgress = 100;
          const overdueDays = Math.ceil((now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
          scheduleStatus = "overdue";
          daysRemaining = -overdueDays;
        } else {
          scheduleProgress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
          daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          scheduleStatus = scheduleProgress >= 80 ? "warning" : "on_track";
        }
      }

      let totalBudget = 0;
      let budgetSpent = 0;
      let budgetProgress = 0;
      let budgetStatus: GanttProject["budgetStatus"] = "on_track";

      const projBudget = parseFloat((project as any).budgetAmount || "0") || 0;
      const projBaseBudget = parseFloat((project as any).baseBudget || "0") || 0;
      totalBudget = projBudget || projBaseBudget;

      if (totalBudget > 0) {
        budgetProgress = Math.min(100, (budgetSpent / totalBudget) * 100);
        if (budgetProgress >= 100) budgetStatus = "over";
        else if (budgetProgress >= 80) budgetStatus = "warning";
        else if (budgetProgress < 50) budgetStatus = "under";
      }

      const ganttProject: GanttProject = {
        id: project.id,
        name: project.name,
        projectNumber: project.projectNumber,
        contractId: contract.id,
        contractName: contract.name,
        contractNumber: contract.contractNumber,
        contractStatus: contract.status,
        startDate,
        endDate,
        scheduleProgress: Math.round(scheduleProgress),
        budgetProgress: Math.round(budgetProgress),
        budgetStatus,
        scheduleStatus,
        daysRemaining,
        totalBudget,
        budgetSpent,
        clientName,
      };

      allProjects.push(ganttProject);
      rows.push({ type: "project", project: ganttProject });
    }
  }

  return { rows, projects: allProjects };
}

function getScheduleColor(status: GanttProject["scheduleStatus"]) {
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

function getBudgetFillColor(status: GanttProject["budgetStatus"]) {
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

  const { rows, projects: ganttProjects } = useMemo(
    () => computeGanttRows(contracts),
    [contracts]
  );

  const { timelineStart, timelineEnd, months } = useMemo(() => {
    if (ganttProjects.length === 0)
      return {
        timelineStart: startOfMonth(new Date()),
        timelineEnd: endOfMonth(addMonths(new Date(), 6)),
        months: [],
      };

    let earliest = new Date();
    let latest = addMonths(new Date(), 3);

    for (const p of ganttProjects) {
      if (p.startDate && p.startDate < earliest) earliest = p.startDate;
      if (p.endDate && p.endDate > latest) latest = p.endDate;
    }

    const tStart = startOfMonth(subMonths(earliest, 1));
    const tEnd = endOfMonth(addMonths(latest, 1));
    const monthList = eachMonthOfInterval({ start: tStart, end: tEnd });
    return { timelineStart: tStart, timelineEnd: tEnd, months: monthList };
  }, [ganttProjects]);

  const totalDays = Math.max(1, differenceInDays(timelineEnd, timelineStart));
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
    const contractIds = new Set<string>();
    const activeProjects = ganttProjects.length;
    for (const p of ganttProjects) contractIds.add(p.contractId);
    const overdue = ganttProjects.filter((p) => p.scheduleStatus === "overdue").length;
    const totalBudget = ganttProjects.reduce((s, p) => s + p.totalBudget, 0);
    return {
      contracts: contractIds.size,
      activeProjects,
      overdue,
      totalBudget,
    };
  }, [ganttProjects]);

  if (rows.length === 0) return null;

  return (
    <Card className="mb-6" data-testid="gantt-chart-card" ref={containerRef}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-lg">Active Project Timeline</CardTitle>
            <Badge variant="secondary" className="text-xs" data-testid="gantt-project-count">
              {kpis.activeProjects} project{kpis.activeProjects !== 1 ? "s" : ""} across {kpis.contracts} contract{kpis.contracts !== 1 ? "s" : ""}
            </Badge>
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
            <span className="flex items-center gap-1" data-testid="kpi-projects">
              <TrendingUp className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              {kpis.activeProjects} Active Projects
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
                Project
              </span>
            </div>
            {rows.map((row) => {
              if (row.type === "contract_header") {
                return (
                  <div
                    key={`header-${row.contractId}`}
                    className="flex items-center px-3 gap-2 border-b bg-muted/50 cursor-pointer hover-elevate"
                    style={{ height: HEADER_ROW_HEIGHT }}
                    onClick={() => setLocation(`/company/contracts/${row.contractId}/dashboard`)}
                    data-testid={`gantt-contract-header-${row.contractId}`}
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">
                        {row.contractName}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                      {row.projectCount}
                    </Badge>
                  </div>
                );
              }

              const p = row.project;
              return (
                <Tooltip key={`project-${p.id}`}>
                  <TooltipTrigger asChild>
                    <div
                      className="flex items-center pl-7 pr-3 gap-2 border-b cursor-pointer hover-elevate"
                      style={{ height: ROW_HEIGHT }}
                      onClick={() => setLocation(`/project/${p.id}/dashboard`)}
                      data-testid={`gantt-label-${p.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate leading-tight">
                          {p.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {p.projectNumber}
                          {p.clientName ? ` · ${p.clientName}` : ""}
                        </div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <div className="space-y-1">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Contract: {p.contractName}
                      </p>
                      {p.clientName && (
                        <p className="text-xs text-muted-foreground">
                          Client: {p.clientName}
                        </p>
                      )}
                      <p className="text-xs">
                        Schedule: {p.scheduleProgress}%
                        {p.daysRemaining !== null &&
                          ` · ${p.daysRemaining > 0 ? `${p.daysRemaining}d left` : `${Math.abs(p.daysRemaining)}d overdue`}`}
                      </p>
                      {p.totalBudget > 0 && (
                        <p className="text-xs">
                          Budget: {formatCurrency(p.budgetSpent)} / {formatCurrency(p.totalBudget)} ({p.budgetProgress}%)
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
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
                  const dStart = Math.max(0, differenceInDays(monthStart, timelineStart));
                  const dEnd = differenceInDays(monthEnd, timelineStart);
                  const left = (dStart / totalDays) * chartWidth;
                  const width = ((Math.min(dEnd, totalDays) - dStart) / totalDays) * chartWidth;

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

              {rows.map((row) => {
                if (row.type === "contract_header") {
                  return (
                    <div
                      key={`chart-header-${row.contractId}`}
                      className="border-b bg-muted/50"
                      style={{ height: HEADER_ROW_HEIGHT }}
                    />
                  );
                }

                const p = row.project;

                if (!p.startDate || !p.endDate) {
                  return (
                    <div
                      key={`chart-${p.id}`}
                      className="border-b flex items-center justify-center"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <span className="text-xs text-muted-foreground italic">
                        No dates set
                      </span>
                    </div>
                  );
                }

                const barStartDay = Math.max(0, differenceInDays(p.startDate, timelineStart));
                const barEndDay = Math.min(totalDays, differenceInDays(p.endDate, timelineStart));
                const barLeft = (barStartDay / totalDays) * chartWidth;
                const barWidth = Math.max(8, ((barEndDay - barStartDay) / totalDays) * chartWidth);

                const schedFill = Math.max(0, Math.min(100, p.scheduleProgress));
                const budgetFill = Math.max(0, Math.min(100, p.budgetProgress));

                return (
                  <div
                    key={`chart-${p.id}`}
                    className="relative border-b"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {months.map((m, i) => {
                      const dStart = Math.max(0, differenceInDays(m, timelineStart));
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
                          onClick={() => setLocation(`/project/${p.id}/dashboard`)}
                          data-testid={`gantt-bar-${p.id}`}
                        >
                          <div
                            className="absolute inset-x-0 top-0 rounded-md bg-muted/40 dark:bg-muted/20 border border-border/50"
                            style={{ height: BAR_HEIGHT }}
                          />

                          <div
                            className={`absolute top-0 left-0 h-[13px] rounded-tl-md ${schedFill >= 100 ? "rounded-tr-md" : ""} ${getScheduleColor(p.scheduleStatus)} opacity-90 transition-all`}
                            style={{
                              width: `${schedFill}%`,
                              minWidth: schedFill > 0 ? 4 : 0,
                            }}
                          />

                          <div
                            className={`absolute left-0 h-[13px] rounded-bl-md ${budgetFill >= 100 ? "rounded-br-md" : ""} ${getBudgetFillColor(p.budgetStatus)} opacity-90 transition-all`}
                            style={{
                              width: `${budgetFill}%`,
                              minWidth: budgetFill > 0 ? 4 : 0,
                              top: 14,
                            }}
                          />

                          {barWidth > 60 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="text-[10px] font-medium text-foreground/80 drop-shadow-sm">
                                {p.scheduleProgress}%{p.totalBudget > 0 ? ` / ${p.budgetProgress}%` : ""}
                              </span>
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <div className="space-y-1.5">
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.contractName}</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <span className="text-muted-foreground">Start:</span>
                            <span>{p.startDate ? format(p.startDate, "MMM d, yyyy") : "N/A"}</span>
                            <span className="text-muted-foreground">End:</span>
                            <span>{p.endDate ? format(p.endDate, "MMM d, yyyy") : "N/A"}</span>
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> Schedule:
                            </span>
                            <span
                              className={
                                p.scheduleStatus === "overdue"
                                  ? "text-red-600 dark:text-red-400 font-medium"
                                  : p.scheduleStatus === "warning"
                                    ? "text-amber-600 dark:text-amber-400"
                                    : ""
                              }
                            >
                              {p.scheduleProgress}%
                              {p.daysRemaining !== null &&
                                ` (${p.daysRemaining > 0 ? `${p.daysRemaining}d left` : `${Math.abs(p.daysRemaining)}d over`})`}
                            </span>
                            {p.totalBudget > 0 && (
                              <>
                                <span className="text-muted-foreground flex items-center gap-1">
                                  <DollarSign className="w-3 h-3" /> Budget:
                                </span>
                                <span
                                  className={
                                    p.budgetStatus === "over"
                                      ? "text-red-600 dark:text-red-400 font-medium"
                                      : p.budgetStatus === "warning"
                                        ? "text-amber-600 dark:text-amber-400"
                                        : ""
                                  }
                                >
                                  {p.budgetProgress}%
                                  {` (${formatCurrency(p.budgetSpent)}/${formatCurrency(p.totalBudget)})`}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground pt-1">
                            Click to view project
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

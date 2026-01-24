import { calculateWorkingDays } from "./working-days-calculator";
import { formatPacificDate, getTodayPacific } from "./timezone";

export type ScheduleType = "fullTime" | "partTime";
export type BudgetTrackingMode = "daily_reports" | "scheduled" | "hybrid";

export interface InspectorRate {
  title: string;
  inspectorName?: string;
  rate: string;
  hours: string;
  scheduleType: ScheduleType;
}

export interface ScheduledBudgetResult {
  scheduledHours: number;
  scheduledAmount: number;
  workingDaysElapsed: number;
  totalWorkingDays: number;
  inspectorBreakdowns: {
    title: string;
    inspectorName?: string;
    rate: number;
    hoursPerDay: number;
    scheduledHours: number;
    scheduledAmount: number;
  }[];
}

export interface BaseBudgetBreakdown {
  baseBudget: number;
  baseHours: number;
  averageRate: number;
  inspectorBreakdowns: {
    title: string;
    estimatedHours: number;
    rate: number;
  }[];
}

export interface HybridBudgetResult {
  base: {
    amount: number;
    hours: number;
    breakdown: BaseBudgetBreakdown | null;
  };
  scheduled: {
    amount: number;
    hours: number;
    details: ScheduledBudgetResult | null;
  };
  actual: {
    amount: number;
    hours: number;
  };
  totals: {
    scheduledAmount: number;
    scheduledHours: number;
    actualAmount: number;
    actualHours: number;
  };
}

function formatDateString(date: Date | string | null | undefined): string {
  if (!date) return "";
  if (typeof date === "string") {
    if (date.includes("T")) {
      return date.split("T")[0];
    }
    return date;
  }
  return formatPacificDate(date, "yyyy-MM-dd");
}

export function calculateScheduledBudget(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  inspectors: InspectorRate[],
  asOfDate?: Date | string
): ScheduledBudgetResult {
  const startStr = formatDateString(startDate);
  const endStr = formatDateString(endDate);
  const today = asOfDate ? formatDateString(asOfDate) : getTodayPacific();
  
  if (!startStr) {
    return {
      scheduledHours: 0,
      scheduledAmount: 0,
      workingDaysElapsed: 0,
      totalWorkingDays: 0,
      inspectorBreakdowns: [],
    };
  }
  
  const effectiveEndDate = endStr && endStr < today ? endStr : today;
  
  if (effectiveEndDate < startStr) {
    return {
      scheduledHours: 0,
      scheduledAmount: 0,
      workingDaysElapsed: 0,
      totalWorkingDays: 0,
      inspectorBreakdowns: [],
    };
  }
  
  const workingDaysElapsed = calculateWorkingDays(startStr, effectiveEndDate);
  const totalWorkingDays = endStr ? calculateWorkingDays(startStr, endStr) : workingDaysElapsed;
  
  let totalScheduledHours = 0;
  let totalScheduledAmount = 0;
  const inspectorBreakdowns: ScheduledBudgetResult["inspectorBreakdowns"] = [];
  
  for (const inspector of inspectors) {
    const rate = parseFloat(inspector.rate) || 0;
    const hoursPerDay = inspector.scheduleType === "fullTime" ? 8 : 4;
    const scheduledHours = workingDaysElapsed * hoursPerDay;
    const scheduledAmount = scheduledHours * rate;
    
    totalScheduledHours += scheduledHours;
    totalScheduledAmount += scheduledAmount;
    
    inspectorBreakdowns.push({
      title: inspector.title,
      inspectorName: inspector.inspectorName,
      rate,
      hoursPerDay,
      scheduledHours,
      scheduledAmount,
    });
  }
  
  return {
    scheduledHours: totalScheduledHours,
    scheduledAmount: totalScheduledAmount,
    workingDaysElapsed,
    totalWorkingDays,
    inspectorBreakdowns,
  };
}

export function calculateBaseBudgetBreakdown(
  baseBudget: number | string | null | undefined,
  inspectors: InspectorRate[]
): BaseBudgetBreakdown | null {
  const baseBudgetNum = typeof baseBudget === "string" ? parseFloat(baseBudget) : (baseBudget || 0);
  
  if (!baseBudgetNum || baseBudgetNum <= 0 || inspectors.length === 0) {
    return null;
  }
  
  const totalRate = inspectors.reduce((sum, i) => sum + (parseFloat(i.rate) || 0), 0);
  const averageRate = totalRate / inspectors.length;
  
  if (averageRate <= 0) return null;
  
  const baseHours = baseBudgetNum / averageRate;
  
  const inspectorBreakdowns = inspectors.map(inspector => {
    const rate = parseFloat(inspector.rate) || 0;
    const proportion = rate / totalRate;
    const estimatedHours = baseHours * proportion;
    
    return {
      title: inspector.title,
      estimatedHours,
      rate,
    };
  });
  
  return {
    baseBudget: baseBudgetNum,
    baseHours,
    averageRate,
    inspectorBreakdowns,
  };
}

export function calculateHybridBudget(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  inspectors: InspectorRate[],
  baseBudget: number | string | null | undefined,
  actualAmount: number,
  actualHours: number,
  asOfDate?: Date | string
): HybridBudgetResult {
  const baseBudgetNum = typeof baseBudget === "string" ? parseFloat(baseBudget) : (baseBudget || 0);
  
  const baseBreakdown = calculateBaseBudgetBreakdown(baseBudget, inspectors);
  const baseHours = baseBreakdown?.baseHours || 0;
  
  const scheduledDetails = calculateScheduledBudget(startDate, endDate, inspectors, asOfDate);
  
  return {
    base: {
      amount: baseBudgetNum,
      hours: baseHours,
      breakdown: baseBreakdown,
    },
    scheduled: {
      amount: scheduledDetails.scheduledAmount,
      hours: scheduledDetails.scheduledHours,
      details: scheduledDetails,
    },
    actual: {
      amount: actualAmount,
      hours: actualHours,
    },
    totals: {
      scheduledAmount: baseBudgetNum + scheduledDetails.scheduledAmount,
      scheduledHours: baseHours + scheduledDetails.scheduledHours,
      actualAmount: baseBudgetNum + actualAmount,
      actualHours: baseHours + actualHours,
    },
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatHours(hours: number): string {
  return hours.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

export function getBudgetProgress(
  spent: number,
  budget: number
): { percent: number; status: "under" | "on_track" | "warning" | "over" } {
  if (budget <= 0) return { percent: 0, status: "under" };
  
  const percent = (spent / budget) * 100;
  
  if (percent >= 100) return { percent, status: "over" };
  if (percent >= 80) return { percent, status: "warning" };
  if (percent >= 50) return { percent, status: "on_track" };
  return { percent, status: "under" };
}

export function getScheduleProgress(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined
): { percent: number; daysElapsed: number; totalDays: number; status: "not_started" | "in_progress" | "near_end" | "completed" } {
  const startStr = formatDateString(startDate);
  const endStr = formatDateString(endDate);
  const today = getTodayPacific();
  
  if (!startStr) return { percent: 0, daysElapsed: 0, totalDays: 0, status: "not_started" };
  if (today < startStr) return { percent: 0, daysElapsed: 0, totalDays: 0, status: "not_started" };
  
  const workingDaysElapsed = calculateWorkingDays(startStr, today);
  const totalWorkingDays = endStr ? calculateWorkingDays(startStr, endStr) : workingDaysElapsed;
  
  if (!endStr || totalWorkingDays === 0) {
    return { percent: 0, daysElapsed: workingDaysElapsed, totalDays: totalWorkingDays, status: "in_progress" };
  }
  
  const percent = (workingDaysElapsed / totalWorkingDays) * 100;
  
  if (percent >= 100) return { percent: 100, daysElapsed: workingDaysElapsed, totalDays: totalWorkingDays, status: "completed" };
  if (percent >= 80) return { percent, daysElapsed: workingDaysElapsed, totalDays: totalWorkingDays, status: "near_end" };
  return { percent, daysElapsed: workingDaysElapsed, totalDays: totalWorkingDays, status: "in_progress" };
}

type ScheduleType = "fullTime" | "partTime";
export type BudgetTrackingMode = "daily_reports" | "scheduled" | "hybrid";

function parseDateLocal(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(year, month, day);
}

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getObservedHolidayDate(year: number, month: number, day: number): Date {
  const holiday = new Date(year, month, day);
  const dayOfWeek = holiday.getDay();
  
  if (dayOfWeek === 0) {
    return new Date(year, month, day + 1);
  } else if (dayOfWeek === 6) {
    return new Date(year, month, day - 1);
  }
  return holiday;
}

function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const firstDay = new Date(year, month, 1);
  let count = 0;
  let day = 1;
  
  while (count < n) {
    const current = new Date(year, month, day);
    if (current.getDay() === weekday) {
      count++;
      if (count === n) return current;
    }
    day++;
  }
  return new Date(year, month, day);
}

function getLastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  let day = lastDay.getDate();
  
  while (day > 0) {
    const current = new Date(year, month, day);
    if (current.getDay() === weekday) {
      return current;
    }
    day--;
  }
  return lastDay;
}

function getHolidaysForYear(year: number): Set<string> {
  const holidays = new Set<string>();
  
  holidays.add(formatDateLocal(getObservedHolidayDate(year, 0, 1)));
  holidays.add(formatDateLocal(getNthWeekdayOfMonth(year, 0, 1, 3)));
  holidays.add(formatDateLocal(getNthWeekdayOfMonth(year, 1, 1, 3)));
  holidays.add(formatDateLocal(getLastWeekdayOfMonth(year, 4, 1)));
  holidays.add(formatDateLocal(getObservedHolidayDate(year, 5, 19)));
  holidays.add(formatDateLocal(getObservedHolidayDate(year, 6, 4)));
  holidays.add(formatDateLocal(getNthWeekdayOfMonth(year, 8, 1, 1)));
  holidays.add(formatDateLocal(getNthWeekdayOfMonth(year, 9, 1, 2)));
  holidays.add(formatDateLocal(getObservedHolidayDate(year, 10, 11)));
  holidays.add(formatDateLocal(getNthWeekdayOfMonth(year, 10, 4, 4)));
  holidays.add(formatDateLocal(getObservedHolidayDate(year, 11, 25)));
  
  return holidays;
}

export function calculateWorkingDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  
  const start = parseDateLocal(startDate);
  const end = parseDateLocal(endDate);
  
  if (!start || !end) return 0;
  if (end < start) return 0;
  
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const allHolidays = new Set<string>();
  
  for (let year = startYear; year <= endYear; year++) {
    const yearHolidays = getHolidaysForYear(year);
    yearHolidays.forEach(h => allHolidays.add(h));
  }
  
  let workingDays = 0;
  const current = new Date(start.getTime());
  
  while (current <= end) {
    const dayOfWeek = current.getDay();
    const dateStr = formatDateLocal(current);
    
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !allHolidays.has(dateStr)) {
      workingDays++;
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return workingDays;
}

function getTodayString(): string {
  const now = new Date();
  return formatDateLocal(now);
}

export interface InspectorRate {
  title: string;
  inspectorName?: string | null;
  rate: string;
  hours: string;
  scheduleType: string | null;
}

export interface ScheduledBudgetResult {
  scheduledHours: number;
  scheduledAmount: number;
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
}

// January 2, 2026 - first working day after base budget cutoff (Dec 31, 2025)
// January 1 is New Year's Day holiday
export const BASE_BUDGET_CUTOFF_START = "2026-01-02";

export function calculateScheduledBudget(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  inspectors: InspectorRate[],
  asOfDate?: Date | string,
  hasBaseBudget?: boolean
): ScheduledBudgetResult {
  let startStr = formatDateString(startDate);
  const endStr = formatDateString(endDate);
  const today = asOfDate ? formatDateString(asOfDate) : getTodayString();
  
  // If there's a base budget, scheduled hours start from January 2, 2026
  // (base budget covers all work through December 31, 2025)
  if (hasBaseBudget) {
    if (!startStr || startStr < BASE_BUDGET_CUTOFF_START) {
      startStr = BASE_BUDGET_CUTOFF_START;
    }
  }
  
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

function formatDateString(date: Date | string | null | undefined): string {
  if (!date) return "";
  if (typeof date === "string") {
    if (date.includes("T")) {
      return date.split("T")[0];
    }
    return date;
  }
  return formatDateLocal(date);
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

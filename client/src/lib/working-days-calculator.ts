type ScheduleType = "fullTime" | "partTime";

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

export function calculateTotalHours(
  startDate: string, 
  endDate: string, 
  scheduleType: ScheduleType
): number {
  const workingDays = calculateWorkingDays(startDate, endDate);
  const hoursPerDay = scheduleType === "fullTime" ? 8 : 4;
  return workingDays * hoursPerDay;
}

export function formatHoursDisplay(hours: number): string {
  return hours.toLocaleString('en-US');
}

export function getHolidaysInRange(startDate: string, endDate: string): { date: string; name: string }[] {
  if (!startDate || !endDate) return [];
  
  const start = parseDateLocal(startDate);
  const end = parseDateLocal(endDate);
  
  if (!start || !end) return [];
  if (end < start) return [];
  
  const holidays: { date: string; name: string }[] = [];
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  
  for (let year = startYear; year <= endYear; year++) {
    const yearHolidays = [
      { date: getObservedHolidayDate(year, 0, 1), name: "New Year's Day" },
      { date: getNthWeekdayOfMonth(year, 0, 1, 3), name: "MLK Day" },
      { date: getNthWeekdayOfMonth(year, 1, 1, 3), name: "Presidents' Day" },
      { date: getLastWeekdayOfMonth(year, 4, 1), name: "Memorial Day" },
      { date: getObservedHolidayDate(year, 5, 19), name: "Juneteenth" },
      { date: getObservedHolidayDate(year, 6, 4), name: "Independence Day" },
      { date: getNthWeekdayOfMonth(year, 8, 1, 1), name: "Labor Day" },
      { date: getNthWeekdayOfMonth(year, 9, 1, 2), name: "Columbus Day" },
      { date: getObservedHolidayDate(year, 10, 11), name: "Veterans Day" },
      { date: getNthWeekdayOfMonth(year, 10, 4, 4), name: "Thanksgiving" },
      { date: getObservedHolidayDate(year, 11, 25), name: "Christmas Day" },
    ];
    
    for (const h of yearHolidays) {
      if (h.date >= start && h.date <= end) {
        holidays.push({
          date: formatDateLocal(h.date),
          name: h.name,
        });
      }
    }
  }
  
  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

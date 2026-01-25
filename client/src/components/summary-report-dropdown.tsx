import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText, ChevronDown, Download, Send, Calendar as CalendarIcon } from "lucide-react";
import { format, startOfWeek, endOfWeek, subWeeks, addDays } from "date-fns";
import { cn } from "@/lib/utils";

export type ReportType = "weekly" | "monthly" | "current";
export type DashboardScope = "project" | "contract" | "company";

interface SummaryReportDropdownProps {
  scope: DashboardScope;
  entityId: string;
  distributionEmails?: string[];
  onDownload: (type: ReportType, params: ReportParams) => void;
  onEmail: (type: ReportType, params: ReportParams & { additionalEmails: string }) => void;
  isEmailPending?: boolean;
}

export interface ReportParams {
  month?: string;
  year?: string;
  weekStart?: string;
  weekEnd?: string;
}

const months = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export function SummaryReportDropdown({
  scope,
  entityId,
  distributionEmails = [],
  onDownload,
  onEmail,
  isEmailPending = false,
}: SummaryReportDropdownProps) {
  const [selectedReportType, setSelectedReportType] = useState<ReportType | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedWeekDate, setSelectedWeekDate] = useState<Date>(now);
  const [additionalEmails, setAdditionalEmails] = useState("");
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const weekStart = startOfWeek(selectedWeekDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedWeekDate, { weekStartsOn: 1 });

  const handleReportSelect = (type: ReportType) => {
    setSelectedReportType(type);
    setDialogOpen(true);
  };

  const handleDownload = () => {
    if (!selectedReportType) return;
    
    const params: ReportParams = {};
    if (selectedReportType === "monthly") {
      params.month = selectedMonth;
      params.year = selectedYear;
    } else if (selectedReportType === "weekly") {
      params.weekStart = format(weekStart, "yyyy-MM-dd");
      params.weekEnd = format(weekEnd, "yyyy-MM-dd");
    }
    
    onDownload(selectedReportType, params);
    setDialogOpen(false);
  };

  const handleEmail = () => {
    if (!selectedReportType) return;
    
    const params: ReportParams = {};
    if (selectedReportType === "monthly") {
      params.month = selectedMonth;
      params.year = selectedYear;
    } else if (selectedReportType === "weekly") {
      params.weekStart = format(weekStart, "yyyy-MM-dd");
      params.weekEnd = format(weekEnd, "yyyy-MM-dd");
    }
    
    onEmail(selectedReportType, { ...params, additionalEmails });
  };

  const getDialogTitle = () => {
    const scopeLabel = scope === "project" ? "Project" : scope === "contract" ? "Contract" : "Company";
    switch (selectedReportType) {
      case "weekly":
        return `Weekly ${scopeLabel} Summary`;
      case "monthly":
        return `Monthly ${scopeLabel} Summary`;
      case "current":
        return `Current ${scopeLabel} Status Report`;
      default:
        return "Summary Report";
    }
  };

  const getDialogDescription = () => {
    switch (selectedReportType) {
      case "weekly":
        return "Generate a PDF summary for the selected week";
      case "monthly":
        return "Generate a PDF summary for the selected month";
      case "current":
        return "Generate a snapshot report of the current status";
      default:
        return "";
    }
  };

  const quickWeekOptions = [
    { label: "This Week", date: now },
    { label: "Last Week", date: subWeeks(now, 1) },
    { label: "2 Weeks Ago", date: subWeeks(now, 2) },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid="button-summary-reports">
            <FileText className="w-4 h-4 mr-2" />
            Summary Reports
            <ChevronDown className="w-4 h-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem 
            onClick={() => handleReportSelect("weekly")}
            data-testid="menu-item-weekly-summary"
          >
            <CalendarIcon className="w-4 h-4 mr-2" />
            Weekly Summary
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => handleReportSelect("monthly")}
            data-testid="menu-item-monthly-summary"
          >
            <CalendarIcon className="w-4 h-4 mr-2" />
            Monthly Summary
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => handleReportSelect("current")}
            data-testid="menu-item-current-status"
          >
            <FileText className="w-4 h-4 mr-2" />
            Current Status Report
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="modal-summary-report">
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
            <DialogDescription>{getDialogDescription()}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedReportType === "weekly" && (
              <div className="space-y-3">
                <Label>Select Week</Label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {quickWeekOptions.map((opt) => (
                    <Button
                      key={opt.label}
                      variant={format(startOfWeek(opt.date, { weekStartsOn: 1 }), "yyyy-MM-dd") === 
                               format(weekStart, "yyyy-MM-dd") ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedWeekDate(opt.date)}
                      data-testid={`button-week-${opt.label.toLowerCase().replace(/\s/g, "-")}`}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
                
                <Popover open={weekPickerOpen} onOpenChange={setWeekPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="button-week-picker"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedWeekDate}
                      onSelect={(date) => {
                        if (date) {
                          setSelectedWeekDate(date);
                          setWeekPickerOpen(false);
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {selectedReportType === "monthly" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="month">Month</Label>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger id="month" data-testid="select-month">
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger id="year" data-testid="select-year">
                      <SelectValue placeholder="Select year" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y} value={y.toString()}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {selectedReportType === "current" && (
              <div className="text-sm text-muted-foreground">
                This report provides a current snapshot of all status information as of today, {format(now, "MMMM d, yyyy")}.
              </div>
            )}

            {distributionEmails.length > 0 && (
              <div className="space-y-2">
                <Label>Distribution List</Label>
                <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                  {distributionEmails.join(", ")}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="additional-emails">Additional Recipients (optional)</Label>
              <Input
                id="additional-emails"
                placeholder="email1@example.com, email2@example.com"
                value={additionalEmails}
                onChange={(e) => setAdditionalEmails(e.target.value)}
                data-testid="input-additional-emails"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleDownload}
              className="flex-1"
              data-testid="button-download-report"
            >
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
            <Button
              onClick={handleEmail}
              disabled={isEmailPending || (distributionEmails.length === 0 && !additionalEmails)}
              className="flex-1"
              data-testid="button-email-report"
            >
              <Send className="w-4 h-4 mr-2" />
              {isEmailPending ? "Sending..." : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

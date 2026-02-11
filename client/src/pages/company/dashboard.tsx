import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { PageLayout } from "@/components/layout/page-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SummaryReportDropdown, ReportType, ReportParams } from "@/components/summary-report-dropdown";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { 
  FileText, 
  Users, 
  FolderKanban, 
  ClipboardList, 
  AlertCircle,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Receipt,
  DollarSign,
  Clock,
  CheckCircle2,
  TrendingUp,
  Calendar,
  CalendarDays,
  Bell,
  Activity,
  AlertTriangle,
  BarChart3,
  Briefcase,
  Timer,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  ChevronUp,
  Search,
  Filter,
  X,
  Eye,
  EyeOff,
  MessageSquare,
  Send,
  Trash2,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { useState } from "react";
import { format, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, isSameMonth, startOfWeek, endOfWeek, isSameDay, addMonths, subMonths } from "date-fns";
import { parseDateSafe } from "@/lib/timezone";

type ContractDashboardSummary = {
  id: string;
  name: string;
  contractNumber: string;
  status: string;
  bidDueDate: string | null;
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

type CompanyDashboardData = {
  summary: {
    activeContracts: number;
    upcomingContracts: number;
    completedContracts: number;
    totalContracts: number;
    activeProjects: number;
    totalProjects: number;
    totalInspectors: number;
    totalReports: number;
    hoursThisMonth: number;
  };
  inspectorWorkload: {
    userId: string;
    name: string;
    regularHours: number;
    overtimeHours: number;
    totalHours: number;
    reportCount: number;
    projectCount: number;
  }[];
  contractTimeline: {
    id: string;
    name: string;
    contractNumber: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
    color: string;
  }[];
  alerts: {
    id: string;
    type: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    message: string;
    date: string;
    contractId?: string;
  }[];
  recentActivity: {
    id: string;
    type: string;
    date: string;
    title: string;
    status: string;
    inspectorId: string;
  }[];
  revenueAnalytics: {
    month: string;
    revenue: number;
    hours: number;
  }[];
  atRiskProjects?: {
    id: string;
    name: string;
    contractId?: string;
    contractName?: string;
    hoursRemaining: number;
    budgetedHours: number;
    percentRemaining: number;
    status: 'orange' | 'red';
    recommendation: string;
  }[];
  projectProgress?: {
    id: string;
    name: string;
    projectNumber: string;
    contractId: string | null;
    contractName: string | null;
    scheduleProgress: number;
    budgetProgress: number;
    scheduleStatus: 'on_track' | 'warning' | 'over';
    budgetStatus: 'on_track' | 'warning' | 'over';
    startDate: string | null;
    endDate: string | null;
    budgetedHours: number;
    usedHours: number;
  }[];
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'in_execution': return 'bg-blue-500';
    case 'awarded': return 'bg-green-500';
    case 'substantial_completion': return 'bg-gray-400';
    case 'bid_release':
    case 'bid_received':
    case 'under_review': return 'bg-yellow-500';
    default: return 'bg-gray-300';
  }
};

const getBudgetStatusColor = (status: string) => {
  switch (status) {
    case 'under': return 'text-green-600 dark:text-green-400';
    case 'on_track': return 'text-blue-600 dark:text-blue-400';
    case 'warning': return 'text-amber-600 dark:text-amber-400';
    case 'over': return 'text-red-600 dark:text-red-400';
    default: return 'text-muted-foreground';
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

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  try {
    return format(parseDateSafe(dateStr), 'MMM d');
  } catch {
    return '-';
  }
};

const CONTRACT_STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "bid_release", label: "Bid Release" },
  { value: "bid_received", label: "Bid Received" },
  { value: "under_review", label: "Under Review" },
  { value: "awarded", label: "Awarded" },
  { value: "in_execution", label: "In Execution" },
  { value: "substantial_completion", label: "Substantial Completion" },
  { value: "final_closeout", label: "Final Closeout" },
  { value: "cancelled", label: "Cancelled" },
  { value: "not_awarded", label: "Not Awarded" },
];

export default function CompanyDashboard() {
  const { activeCompany } = useAuth();
  const { toast } = useToast();
  const [contractsToShow, setContractsToShow] = useState(7);
  const [contractSearch, setContractSearch] = useState("");
  const [contractStatusFilter, setContractStatusFilter] = useState("all");
  const [isEmailPending, setIsEmailPending] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<Date | null>(null);
  const [progressContractFilter, setProgressContractFilter] = useState("all");
  const [newNote, setNewNote] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [workloadPeriod, setWorkloadPeriod] = useState("month");
  const [expandedInspectors, setExpandedInspectors] = useState<Set<string>>(new Set());
  
  const dismissAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      await apiRequest("POST", `/api/alerts/${alertId}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/dashboard"] });
    },
  });

  const handleDownloadReport = (type: ReportType, params: ReportParams) => {
    let url = '';
    if (type === 'weekly') {
      url = `/api/company/weekly-summary?weekStart=${params.weekStart}&weekEnd=${params.weekEnd}`;
    } else if (type === 'monthly') {
      url = `/api/company/monthly-summary?month=${params.month}&year=${params.year}`;
    } else if (type === 'current') {
      url = `/api/company/current-status`;
    }
    window.open(url, '_blank');
  };

  const handleEmailReport = async (type: ReportType, params: ReportParams & { additionalEmails: string }) => {
    setIsEmailPending(true);
    try {
      const emailList = params.additionalEmails
        .split(',')
        .map(e => e.trim())
        .filter(e => e && e.includes('@'));
      
      let endpoint = '';
      let body: any = { additionalEmails: emailList };
      
      if (type === 'weekly') {
        endpoint = `/api/company/weekly-summary/email`;
        body.weekStart = params.weekStart;
        body.weekEnd = params.weekEnd;
      } else if (type === 'monthly') {
        endpoint = `/api/company/monthly-summary/email`;
        body.month = parseInt(params.month || '1');
        body.year = parseInt(params.year || new Date().getFullYear().toString());
      } else if (type === 'current') {
        endpoint = `/api/company/current-status/email`;
      }
      
      const response = await apiRequest('POST', endpoint, body);
      const result = await response.json();
      
      toast({
        title: "Report Sent",
        description: result.message || "Email sent successfully",
      });
    } catch (error: any) {
      toast({
        title: "Failed to send email",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsEmailPending(false);
    }
  };

  const { data: companyDashboard, isLoading: dashboardLoading } = useQuery<CompanyDashboardData>({
    queryKey: ["/api/company/dashboard"],
    queryFn: async () => {
      const response = await fetch("/api/company/dashboard", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch dashboard");
      return response.json();
    },
    enabled: !!activeCompany?.id,
  });

  const { data: reportStats, isLoading: statsLoading } = useQuery<{
    total: number;
    thisMonth: number;
    pending: number;
    submitted: number;
  }>({
    queryKey: ["/api/reports/stats"],
  });

  const { data: contractsSummary, isLoading: contractsLoading } = useQuery<ContractDashboardSummary[]>({
    queryKey: ["/api/contracts/dashboard-summary"],
  });

  const { data: invoiceStats, isLoading: invoiceStatsLoading } = useQuery<{
    total: number;
    draft: number;
    sent: number;
    paid: number;
    overdue: number;
    totalAmount: number;
    paidAmount: number;
    outstandingAmount: number;
  }>({
    queryKey: ["/api/invoices/stats"],
  });

  const { data: companyNotes = [], isLoading: notesLoading } = useQuery<any[]>({
    queryKey: ["/api/company/notes"],
    enabled: !!activeCompany?.id,
  });

  const { data: companyMembers = [] } = useQuery<any[]>({
    queryKey: ["/api/companies", activeCompany?.id, "members"],
    queryFn: async () => {
      const response = await fetch(`/api/companies/${activeCompany?.id}/members`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!activeCompany?.id,
  });

  const { data: inspectorWorkloadData = [], isLoading: workloadLoading } = useQuery<any[]>({
    queryKey: ["/api/company/inspector-workload", workloadPeriod],
    queryFn: async () => {
      const response = await fetch(`/api/company/inspector-workload?period=${workloadPeriod}`, { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!activeCompany?.id,
  });

  const addNoteMutation = useMutation({
    mutationFn: async (data: { content: string; mentions: string[] }) => {
      return apiRequest("POST", "/api/company/notes", data);
    },
    onSuccess: () => {
      setNewNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/company/notes"] });
      toast({ title: "Note added", description: "Your note has been posted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add note", variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest("DELETE", `/api/company/notes/${noteId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/notes"] });
      toast({ title: "Note deleted", description: "The note has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete note", variant: "destructive" });
    },
  });

  const parseNoteMentions = (content: string): string[] => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[2]);
    }
    return mentions;
  };

  const renderNoteContent = (content: string) => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match;
    let key = 0;
    while ((match = mentionRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index));
      }
      parts.push(
        <span key={key++} className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded px-1 font-medium">
          @{match[1]}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }
    return parts.length > 0 ? parts : content;
  };

  const handleNoteMentionSelect = (member: any) => {
    const name = [member.user?.firstName, member.user?.lastName].filter(Boolean).join(' ') || 'Unknown';
    const mentionText = `@[${name}](${member.user?.id}) `;
    const lastAtIndex = newNote.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      setNewNote(newNote.substring(0, lastAtIndex) + mentionText);
    } else {
      setNewNote(newNote + mentionText);
    }
    setShowMentions(false);
    setMentionFilter("");
  };

  const handleNoteChange = (value: string) => {
    setNewNote(value);
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = value.substring(lastAtIndex + 1);
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('[')) {
        setShowMentions(true);
        setMentionFilter(textAfterAt.toLowerCase());
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  const filteredCompanyMembers = companyMembers.filter((member: any) => {
    const name = [member.user?.firstName, member.user?.lastName].filter(Boolean).join(' ').toLowerCase();
    return name.includes(mentionFilter);
  });

  const handleSubmitNote = () => {
    if (!newNote.trim()) return;
    const mentions = parseNoteMentions(newNote);
    addNoteMutation.mutate({ content: newNote.trim(), mentions });
  };

  const toggleInspectorExpanded = (userId: string) => {
    setExpandedInspectors(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const workloadPeriodLabel = { day: "Today", week: "This Week", month: "This Month", year: "This Year" }[workloadPeriod] || "This Month";

  // Priority-based sorting for contracts
  // Order: 1) Bid Released/Received by upcoming bid due date, 2) Under Review by bid due date (oldest first), 
  //        3) Awarded by start date, 4) In Execution by progress % descending
  const sortContractsByPriority = (contracts: ContractDashboardSummary[]) => {
    return [...contracts].sort((a, b) => {
      // Calculate priority scores (lower = higher priority)
      const getPriority = (contract: ContractDashboardSummary) => {
        const isBidReleased = contract.status === 'bid_release';
        const isBidReceived = contract.status === 'bid_received';
        const isUnderReview = contract.status === 'under_review';
        const isAwarded = contract.status === 'awarded';
        const isInExecution = contract.status === 'in_execution';
        
        // Priority 1: Bid Released or Bid Received (sorted by upcoming bid due date)
        if (isBidReleased || isBidReceived) return 1;
        // Priority 2: Under Review (sorted by bid due date, oldest first)
        if (isUnderReview) return 2;
        // Priority 3: Awarded (sorted by start date)
        if (isAwarded) return 3;
        // Priority 4: In Execution (sorted by schedule progress % descending)
        if (isInExecution) return 4;
        // Priority 5: Other statuses
        return 5;
      };
      
      const aPriority = getPriority(a);
      const bPriority = getPriority(b);
      
      if (aPriority !== bPriority) return aPriority - bPriority;
      
      // Within same priority, apply appropriate secondary sorting
      if (aPriority === 1) {
        // Bid Released/Received: sort by bid due date (soonest first)
        const aDue = a.bidDueDate ? parseDateSafe(a.bidDueDate).getTime() : Infinity;
        const bDue = b.bidDueDate ? parseDateSafe(b.bidDueDate).getTime() : Infinity;
        return aDue - bDue;
      }
      
      if (aPriority === 2) {
        // Under Review: sort by bid due date (oldest first - ascending order)
        // Contracts without bid due date go to end of this group
        const aDue = a.bidDueDate ? parseDateSafe(a.bidDueDate).getTime() : Infinity;
        const bDue = b.bidDueDate ? parseDateSafe(b.bidDueDate).getTime() : Infinity;
        return aDue - bDue;
      }
      
      if (aPriority === 3) {
        // Awarded/Pre-construction: sort by start date (earliest first)
        const aStart = a.schedule.startDate ? parseDateSafe(a.schedule.startDate).getTime() : Infinity;
        const bStart = b.schedule.startDate ? parseDateSafe(b.schedule.startDate).getTime() : Infinity;
        return aStart - bStart;
      }
      
      if (aPriority === 4) {
        // In Execution: sort by schedule progress (highest first - descending)
        return b.schedule.progress - a.schedule.progress;
      }
      
      // Default: sort alphabetically
      return a.name.localeCompare(b.name);
    });
  };

  // Filter contracts by search and status
  const filteredContracts = contractsSummary?.filter(contract => {
    const matchesSearch = contractSearch === "" || 
      contract.name.toLowerCase().includes(contractSearch.toLowerCase()) ||
      contract.contractNumber.toLowerCase().includes(contractSearch.toLowerCase());
    const matchesStatus = contractStatusFilter === "all" || contract.status === contractStatusFilter;
    return matchesSearch && matchesStatus;
  });
  
  // Apply priority sorting and slice for display
  const sortedContracts = filteredContracts ? sortContractsByPriority(filteredContracts) : [];
  const displayedContracts = sortedContracts.slice(0, contractsToShow);
  
  // Calculate completion rates
  const completedContracts = contractsSummary?.filter(c => 
    c.status === 'substantial_completion' || c.status === 'final_closeout'
  ).length || 0;
  const totalContracts = contractsSummary?.length || 0;
  const completionRate = totalContracts > 0 ? Math.round((completedContracts / totalContracts) * 100) : 0;

  // Calendar events from contracts
  const calendarEvents = (contractsSummary || []).flatMap(contract => {
    const events: { date: Date; title: string; type: string; contract: ContractDashboardSummary }[] = [];
    if (contract.bidDueDate) {
      events.push({ date: parseDateSafe(contract.bidDueDate), title: `Bid Due: ${contract.name}`, type: "bid_due", contract });
    }
    if (contract.schedule.startDate) {
      events.push({ date: parseDateSafe(contract.schedule.startDate), title: `Start: ${contract.name}`, type: "start", contract });
    }
    if (contract.schedule.endDate) {
      events.push({ date: parseDateSafe(contract.schedule.endDate), title: `Completion: ${contract.name}`, type: "completion", contract });
    }
    return events;
  }).sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <PageLayout title="Company Dashboard">
      <div className="space-y-6 p-4 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="title-company-dashboard">
              {activeCompany?.name || "Company"} Dashboard
            </h1>
            <p className="text-muted-foreground">
              Overview of your company's activity
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCalendar(!showCalendar)}
              data-testid="button-toggle-calendar"
            >
              {showCalendar ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              {showCalendar ? "Hide Calendar" : "Show Calendar"}
            </Button>
            <SummaryReportDropdown
              scope="company"
              entityId={activeCompany?.id || ''}
              onDownload={handleDownloadReport}
              onEmail={handleEmailReport}
              isEmailPending={isEmailPending}
            />
          </div>
        </div>

        {/* Contract Calendar - Collapsible */}
        {showCalendar && (
          <Card data-testid="card-calendar">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Contract Calendar
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                    data-testid="button-prev-month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="font-medium min-w-[140px] text-center">
                    {format(calendarMonth, "MMMM yyyy")}
                  </span>
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                    data-testid="button-next-month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCalendarMonth(new Date())}
                    data-testid="button-today"
                  >
                    Today
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-orange-200 dark:bg-orange-800" />
                  <span>Bid Due</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-green-200 dark:bg-green-800" />
                  <span>Start Date</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-blue-200 dark:bg-blue-800" />
                  <span>Completion</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {contractsLoading ? (
                <Skeleton className="h-[400px] w-full" />
              ) : calendarEvents.length === 0 ? (
                <p className="text-center text-muted-foreground py-4 mb-4 bg-muted/50 rounded-md">
                  No contract dates scheduled. Add bid due dates, start dates, or completion dates to your contracts to see them here.
                </p>
              ) : null}
              {(() => {
                const monthStart = startOfMonth(calendarMonth);
                const monthEnd = endOfMonth(calendarMonth);
                const calendarStart = startOfWeek(monthStart);
                const calendarEnd = endOfWeek(monthEnd);
                const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
                const today = new Date();
                
                return (
                  <div className="border rounded-md">
                    <div className="grid grid-cols-7 border-b">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground border-r last:border-r-0">
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7">
                      {calendarDays.map((day, index) => {
                        const dayEvents = calendarEvents.filter(event => isSameDay(event.date, day));
                        const isCurrentMonth = isSameMonth(day, calendarMonth);
                        const isToday = isSameDay(day, today);
                        const isSelected = selectedCalendarDay && isSameDay(day, selectedCalendarDay);
                        
                        return (
                          <div
                            key={index}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedCalendarDay(day)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setSelectedCalendarDay(day);
                              }
                            }}
                            className={`min-h-[80px] sm:min-h-[100px] p-1 border-r border-b last:border-r-0 cursor-pointer hover-elevate ${
                              !isCurrentMonth ? 'bg-muted/30' : ''
                            } ${isToday ? 'bg-primary/5' : ''} ${isSelected ? 'ring-2 ring-primary ring-inset' : ''}`}
                            data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
                          >
                            <div className={`text-sm mb-1 ${
                              isToday 
                                ? 'bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center' 
                                : !isCurrentMonth 
                                  ? 'text-muted-foreground' 
                                  : ''
                            }`}>
                              {format(day, 'd')}
                            </div>
                            <div className="space-y-1">
                              {dayEvents.slice(0, 3).map((event, eventIndex) => (
                                <Link
                                  key={`${event.contract.id}-${event.type}-${eventIndex}`}
                                  href={`/company/contracts/${event.contract.id}/dashboard`}
                                  onClick={(e) => e.stopPropagation()}
                                  className={`block text-xs p-1 rounded truncate cursor-pointer hover-elevate ${
                                    event.type === 'bid_due' 
                                      ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' 
                                      : event.type === 'start' 
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                  }`}
                                  title={event.title}
                                  data-testid={`calendar-event-${event.contract.id}-${event.type}`}
                                >
                                  {event.contract.name}
                                </Link>
                              ))}
                              {dayEvents.length > 3 && (
                                <div className="text-xs text-muted-foreground">
                                  +{dayEvents.length - 3} more
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Day Summary Panel */}
        {showCalendar && selectedCalendarDay && (
          <Card data-testid="card-day-summary">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5" />
                  {format(selectedCalendarDay, "EEEE, MMMM d, yyyy")}
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setSelectedCalendarDay(null)}
                  data-testid="button-close-day-panel"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const dayEvents = calendarEvents.filter(event => 
                  isSameDay(event.date, selectedCalendarDay)
                );
                
                if (dayEvents.length === 0) {
                  return (
                    <p className="text-center text-muted-foreground py-4">
                      No contract dates scheduled for this day.
                    </p>
                  );
                }
                
                return (
                  <div className="space-y-3">
                    {dayEvents.map((event, index) => (
                      <Link
                        key={`${event.contract.id}-${event.type}-${index}`}
                        href={`/company/contracts/${event.contract.id}/dashboard`}
                        className="block"
                        data-testid={`day-panel-event-${event.contract.id}-${event.type}`}
                      >
                        <Card className="hover-elevate">
                          <CardContent className="p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="flex items-start gap-2 flex-1 min-w-0">
                                <div className={`w-1 self-stretch shrink-0 ${
                                  event.type === 'bid_due' 
                                    ? 'bg-orange-500' 
                                    : event.type === 'start' 
                                      ? 'bg-green-500'
                                      : 'bg-blue-500'
                                }`} />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">{event.contract.name}</div>
                                  <div className="text-sm text-muted-foreground">{event.contract.contractNumber}</div>
                                  <Badge variant="outline" className="mt-1">
                                    {event.type === 'bid_due' ? 'Bid Due' : event.type === 'start' ? 'Start Date' : 'Completion'}
                                  </Badge>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card data-testid="card-kpi-hours">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hours This Month</CardTitle>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {dashboardLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-hours-this-month">
                    {companyDashboard?.summary.hoursThisMonth?.toFixed(1) || '0'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Across {companyDashboard?.summary.totalInspectors || 0} inspectors
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-kpi-reports">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reports Submitted</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-reports-submitted">
                    {reportStats?.thisMonth || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {reportStats?.total || 0} total reports
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-kpi-active-contracts">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Contracts</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {dashboardLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-active-contracts">
                    {companyDashboard?.summary.activeContracts || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {companyDashboard?.summary.upcomingContracts || 0} upcoming
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-kpi-revenue">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue Billed</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {invoiceStatsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-500" data-testid="text-revenue-billed">
                    {formatCurrency(invoiceStats?.paidAmount || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(invoiceStats?.outstandingAmount || 0)} outstanding
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-kpi-completion">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {contractsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-500" data-testid="text-completion-rate">
                    {completionRate}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {completedContracts} of {totalContracts} contracts
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Dashboard Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - 2/3 width */}
          <div className="lg:col-span-2 space-y-6 min-w-0">
            {/* Revenue Analytics */}
            <Card data-testid="card-revenue-analytics">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    <CardTitle>Revenue Trends</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs">Last 12 months</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {dashboardLoading ? (
                  <div className="h-48 flex items-center justify-center">
                    <Skeleton className="h-full w-full" />
                  </div>
                ) : companyDashboard?.revenueAnalytics && companyDashboard.revenueAnalytics.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex h-48 items-end gap-1">
                      {companyDashboard.revenueAnalytics.map((item, index) => {
                        const maxRevenue = Math.max(...companyDashboard.revenueAnalytics.map(r => r.revenue));
                        const height = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0;
                        return (
                          <div 
                            key={item.month} 
                            className="flex-1 flex flex-col items-center gap-1"
                            data-testid={`bar-revenue-${item.month}`}
                          >
                            <div 
                              className="w-full bg-primary/80 rounded-t"
                              style={{ height: `${Math.max(height, 4)}%` }}
                              title={`${formatCurrency(item.revenue)} - ${item.hours}h`}
                            />
                            <span className="text-[10px] text-muted-foreground rotate-45 origin-left whitespace-nowrap">
                              {format(new Date(item.month + '-01'), 'MMM')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Total: {formatCurrency(companyDashboard.revenueAnalytics.reduce((sum, r) => sum + r.revenue, 0))}</span>
                      <span>{companyDashboard.revenueAnalytics.reduce((sum, r) => sum + r.hours, 0).toFixed(0)} hours logged</span>
                    </div>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center text-muted-foreground">
                    No revenue data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Project Progress Chart */}
            <Card data-testid="card-project-progress">
              <CardHeader>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <CardTitle>Project Progress</CardTitle>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={progressContractFilter} onValueChange={setProgressContractFilter}>
                      <SelectTrigger className="w-[180px]" data-testid="select-progress-contract-filter">
                        <SelectValue placeholder="All Contracts" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Contracts</SelectItem>
                        <SelectItem value="unlinked">No Contract</SelectItem>
                        {(() => {
                          const contractNames = new Map<string, string>();
                          companyDashboard?.projectProgress?.forEach(p => {
                            if (p.contractId && p.contractName) {
                              contractNames.set(p.contractId, p.contractName);
                            }
                          });
                          return Array.from(contractNames.entries()).map(([id, name]) => (
                            <SelectItem key={id} value={id}>{name}</SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <CardDescription>Schedule and budget progress for active projects</CardDescription>
              </CardHeader>
              <CardContent>
                {dashboardLoading ? (
                  <div className="space-y-4">
                    {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : (() => {
                  const filtered = (companyDashboard?.projectProgress || []).filter(p => {
                    if (progressContractFilter === "all") return true;
                    if (progressContractFilter === "unlinked") return !p.contractId;
                    return p.contractId === progressContractFilter;
                  });
                  
                  if (filtered.length === 0) {
                    return (
                      <div className="h-32 flex items-center justify-center text-muted-foreground">
                        No projects to display
                      </div>
                    );
                  }
                  
                  const getBarColor = (status: string) => {
                    switch (status) {
                      case 'over': return 'bg-red-500 dark:bg-red-400';
                      case 'warning': return 'bg-amber-500 dark:bg-amber-400';
                      default: return 'bg-blue-500 dark:bg-blue-400';
                    }
                  };
                  
                  const getBudgetBarColor = (status: string) => {
                    switch (status) {
                      case 'over': return 'bg-red-500 dark:bg-red-400';
                      case 'warning': return 'bg-amber-500 dark:bg-amber-400';
                      default: return 'bg-emerald-500 dark:bg-emerald-400';
                    }
                  };
                  
                  return (
                    <div className="space-y-1">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-sm bg-blue-500 dark:bg-blue-400" />
                          <span>Schedule</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-sm bg-emerald-500 dark:bg-emerald-400" />
                          <span>Budget</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-sm bg-amber-500 dark:bg-amber-400" />
                          <span>Warning (80%+)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-sm bg-red-500 dark:bg-red-400" />
                          <span>Over (100%+)</span>
                        </div>
                      </div>
                      
                      <div className="max-h-[280px] overflow-y-auto">
                      {filtered.map((project) => (
                        <div key={project.id} className="py-2 border-b last:border-b-0" data-testid={`row-project-progress-${project.id}`}>
                          <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                            <Link href={`/projects/${project.id}`}>
                              <span className="text-sm font-medium hover:underline cursor-pointer" data-testid={`text-project-name-${project.id}`}>
                                {project.name}
                              </span>
                            </Link>
                            {project.contractName && (
                              <Badge variant="outline" className="text-xs">
                                {project.contractName}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-muted-foreground w-16 shrink-0">Schedule</span>
                              <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden relative">
                                <div 
                                  className={`h-full rounded-sm transition-all ${getBarColor(project.scheduleStatus)}`}
                                  style={{ width: `${Math.min(project.scheduleProgress, 100)}%` }}
                                />
                                {project.scheduleProgress > 100 && (
                                  <div 
                                    className="absolute top-0 h-full bg-red-500/30 dark:bg-red-400/30 border-l-2 border-red-600 dark:border-red-300"
                                    style={{ left: '100%', width: `${Math.min(project.scheduleProgress - 100, 50)}%` }}
                                  />
                                )}
                              </div>
                              <span className={`text-xs font-medium w-10 text-right ${project.scheduleStatus === 'over' ? 'text-red-600 dark:text-red-400' : project.scheduleStatus === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                {project.scheduleProgress.toFixed(0)}%
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-muted-foreground w-16 shrink-0">Budget</span>
                              <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden relative">
                                {project.budgetedHours > 0 ? (
                                  <>
                                    <div 
                                      className={`h-full rounded-sm transition-all ${getBudgetBarColor(project.budgetStatus)}`}
                                      style={{ width: `${Math.min(project.budgetProgress, 100)}%` }}
                                    />
                                    {project.budgetProgress > 100 && (
                                      <div 
                                        className="absolute top-0 h-full bg-red-500/30 dark:bg-red-400/30 border-l-2 border-red-600 dark:border-red-300"
                                        style={{ left: '100%', width: `${Math.min(project.budgetProgress - 100, 50)}%` }}
                                      />
                                    )}
                                  </>
                                ) : (
                                  <div className="h-full flex items-center justify-center">
                                    <span className="text-[10px] text-muted-foreground">No budget set</span>
                                  </div>
                                )}
                              </div>
                              <span className={`text-xs font-medium w-10 text-right ${project.budgetStatus === 'over' ? 'text-red-600 dark:text-red-400' : project.budgetStatus === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                {project.budgetedHours > 0 ? `${project.budgetProgress.toFixed(0)}%` : '—'}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                            {project.startDate && project.endDate && (
                              <span>{format(new Date(project.startDate), 'MMM d, yyyy')} — {format(new Date(project.endDate), 'MMM d, yyyy')}</span>
                            )}
                            {project.budgetedHours > 0 && (
                              <span>{project.usedHours}h / {project.budgetedHours}h</span>
                            )}
                          </div>
                        </div>
                      ))}
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Combined Contract Status Card */}
            <Card data-testid="card-contract-status">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    <CardTitle>Contract Status</CardTitle>
                  </div>
                  <Link href="/company/contracts">
                    <Button variant="ghost" size="sm" className="h-8 gap-1">
                      View All <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
                <CardDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
                  <span>Schedule and budget progress</span>
                  {filteredContracts && (
                    <Badge variant="secondary" className="text-xs w-fit">
                      {displayedContracts?.length || 0} of {filteredContracts.length}
                      {contractSearch || contractStatusFilter !== "all" ? " filtered" : " total"}
                    </Badge>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search contracts..."
                      value={contractSearch}
                      onChange={(e) => {
                        setContractSearch(e.target.value);
                        setContractsToShow(7);
                      }}
                      className="pl-9 pr-8"
                      data-testid="input-contract-search"
                    />
                    {contractSearch && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1 h-7 w-7"
                        onClick={() => setContractSearch("")}
                        data-testid="button-clear-search"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <Select
                    value={contractStatusFilter}
                    onValueChange={(value) => {
                      setContractStatusFilter(value);
                      setContractsToShow(7);
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-contract-status">
                      <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTRACT_STATUS_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {contractsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                ) : displayedContracts && displayedContracts.length > 0 ? (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto overflow-x-hidden pr-1">
                    {displayedContracts.map((contract) => {
                      const now = new Date();
                      const start = contract.schedule.startDate ? parseDateSafe(contract.schedule.startDate) : null;
                      const end = contract.schedule.endDate ? parseDateSafe(contract.schedule.endDate) : null;
                      
                      // Check if contract is in bid phase (should never show as overdue)
                      const isInBidPhase = ['bid_release', 'bid_received', 'under_review'].includes(contract.status);
                      // Only show bid due badges for pre-review statuses (not under_review or later)
                      const showBidDueBadge = ['bid_release', 'bid_received'].includes(contract.status);
                      
                      let daysInfo = '';
                      let scheduleStatus: 'upcoming' | 'active' | 'ending_soon' | 'overdue' | 'completed' = 'active';
                      if (start && end) {
                        if (now < start) {
                          daysInfo = `Starts in ${differenceInDays(start, now)} days`;
                          scheduleStatus = 'upcoming';
                        } else if (now > end) {
                          // Don't show overdue for contracts in bid phase (including under_review)
                          if (isInBidPhase) {
                            daysInfo = '';
                            scheduleStatus = 'upcoming';
                          } else {
                            daysInfo = `Ended ${differenceInDays(now, end)} days ago`;
                            scheduleStatus = 'overdue';
                          }
                        } else {
                          const remaining = differenceInDays(end, now);
                          daysInfo = `${remaining} days remaining`;
                          scheduleStatus = remaining <= 7 ? 'ending_soon' : 'active';
                        }
                      }
                      const bidDue = contract.bidDueDate ? parseDateSafe(contract.bidDueDate) : null;
                      let bidDueInfo: { label: string; color: string } | null = null;
                      if (showBidDueBadge && bidDue) {
                        const daysUntilDue = differenceInDays(bidDue, now);
                        if (daysUntilDue < 0) {
                          bidDueInfo = { label: `Overdue ${Math.abs(daysUntilDue)} days`, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
                        } else if (daysUntilDue <= 3) {
                          bidDueInfo = { label: `Due in ${daysUntilDue} days`, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
                        } else if (daysUntilDue <= 7) {
                          bidDueInfo = { label: `Due in ${daysUntilDue} days`, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' };
                        } else if (daysUntilDue <= 14) {
                          bidDueInfo = { label: `Due in ${daysUntilDue} days`, color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' };
                        } else {
                          bidDueInfo = { label: `Due in ${daysUntilDue} days`, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
                        }
                      }
                      
                      const getScheduleStatusColor = (status: typeof scheduleStatus) => {
                        switch (status) {
                          case 'overdue': return 'text-red-600 dark:text-red-400';
                          case 'ending_soon': return 'text-amber-600 dark:text-amber-400';
                          case 'upcoming': return 'text-blue-600 dark:text-blue-400';
                          default: return 'text-muted-foreground';
                        }
                      };
                      
                      return (
                        <Link key={contract.id} href={`/company/contracts/${contract.id}/dashboard`}>
                          <div 
                            className="p-3 rounded-lg border hover-elevate cursor-pointer"
                            data-testid={`status-contract-${contract.id}`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-2 h-2 rounded-full ${getStatusColor(contract.status)}`} />
                                <span className="font-medium truncate">{contract.name}</span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Badge variant="outline" className="text-xs">
                                  {contract.status.replace(/_/g, ' ')}
                                </Badge>
                                {bidDueInfo && (
                                  <Badge className={`text-xs ${bidDueInfo.color}`} data-testid={`badge-bid-due-${contract.id}`}>
                                    {bidDueInfo.label}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {contract.clientName && (
                              <div className="text-xs text-muted-foreground ml-4 mb-2 truncate">
                                {contract.clientName}
                              </div>
                            )}
                            
                            {/* Dates Row */}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground mb-3">
                              <div className="flex items-center gap-1 shrink-0">
                                <Calendar className="h-3 w-3" />
                                <span>{formatDate(contract.schedule.startDate)}</span>
                                <span>→</span>
                                <span>{formatDate(contract.schedule.endDate)}</span>
                              </div>
                              {daysInfo && (
                                <Badge variant="secondary" className={`text-xs shrink-0 ${getScheduleStatusColor(scheduleStatus)}`}>
                                  {daysInfo}
                                </Badge>
                              )}
                            </div>
                            
                            {/* Progress Bars */}
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground">Schedule</span>
                                  <span>{contract.schedule.progress.toFixed(0)}%</span>
                                </div>
                                <Progress value={contract.schedule.progress} className="h-1.5" />
                              </div>
                              <div>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="text-muted-foreground">Budget</span>
                                  <span className={getBudgetStatusColor(contract.budget.status)}>
                                    {contract.budget.progress.toFixed(0)}%
                                  </span>
                                </div>
                                <Progress 
                                  value={Math.min(contract.budget.progress, 100)} 
                                  className={`h-1.5 ${contract.budget.status === 'over' ? '[&>div]:bg-red-500' : ''}`}
                                />
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                    {filteredContracts && filteredContracts.length > contractsToShow && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full"
                        onClick={() => setContractsToShow(prev => prev + 7)}
                        data-testid="button-show-more-contracts"
                      >
                        Show {Math.min(7, filteredContracts.length - contractsToShow)} More <ChevronDown className="h-4 w-4 ml-1" />
                      </Button>
                    )}
                    {contractsToShow > 7 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full"
                        onClick={() => setContractsToShow(7)}
                        data-testid="button-collapse-contracts"
                      >
                        Show Less <ChevronUp className="h-4 w-4 ml-1" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    {contractSearch || contractStatusFilter !== "all" 
                      ? "No contracts match your search or filter"
                      : "No contracts found"}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - 1/3 width */}
          <div className="space-y-6 min-w-0">
            {/* Notifications Center / Alerts */}
            <Card data-testid="card-notifications">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" />
                  <CardTitle>Notifications</CardTitle>
                  {companyDashboard?.alerts && companyDashboard.alerts.length > 0 && (
                    <Badge variant="destructive" className="ml-auto">
                      {companyDashboard.alerts.length}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {dashboardLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : companyDashboard?.alerts && companyDashboard.alerts.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {companyDashboard.alerts.map((alert) => (
                      <div 
                        key={alert.id}
                        className={`p-3 rounded-lg border group hover-elevate ${
                          alert.severity === 'critical' ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950' :
                          alert.severity === 'warning' ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950' :
                          'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950'
                        }`}
                        data-testid={`alert-${alert.id}`}
                      >
                        <div className="flex items-start gap-2">
                          {alert.severity === 'critical' ? (
                            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                          ) : alert.severity === 'warning' ? (
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                          ) : (
                            <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                          )}
                          <Link 
                            href={alert.contractId ? `/company/contracts/${alert.contractId}/dashboard` : '#'}
                            className="min-w-0 flex-1 cursor-pointer"
                          >
                            <p className="text-sm font-medium hover:underline">{alert.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity invisible group-hover:visible px-1.5 no-default-hover-elevate"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              dismissAlertMutation.mutate(alert.id);
                            }}
                            data-testid={`button-dismiss-alert-${alert.id}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p>No pending alerts</p>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* At-Risk Projects */}
            {companyDashboard?.atRiskProjects && companyDashboard.atRiskProjects.length > 0 && (
              <Card data-testid="card-at-risk-projects">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    <CardTitle>At-Risk Projects</CardTitle>
                    <Badge variant="destructive" className="ml-auto">
                      {companyDashboard.atRiskProjects.length}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Projects with less than 20% of budgeted hours remaining
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {companyDashboard.atRiskProjects.map((project) => (
                      <Link 
                        key={project.id} 
                        href={`/project/${project.id}/dashboard`}
                      >
                        <div 
                          className={`p-3 rounded-lg border cursor-pointer hover-elevate ${
                            project.status === 'red' 
                              ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800' 
                              : 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800'
                          }`}
                          data-testid={`at-risk-project-${project.id}`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-medium text-sm truncate">{project.name}</span>
                            <Badge 
                              variant={project.status === 'red' ? 'destructive' : 'secondary'}
                              className="shrink-0"
                            >
                              {project.percentRemaining}% left
                            </Badge>
                          </div>
                          {project.contractName && (
                            <p className="text-xs text-muted-foreground mb-1">
                              Contract: {project.contractName}
                            </p>
                          )}
                          <p className={`text-xs ${
                            project.status === 'red' 
                              ? 'text-red-700 dark:text-red-400' 
                              : 'text-orange-700 dark:text-orange-400'
                          }`}>
                            {project.recommendation}
                          </p>
                          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                            <span>{project.hoursRemaining.toFixed(1)} hrs remaining</span>
                            <span>{project.budgetedHours.toFixed(1)} hrs budgeted</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Inspector Workload */}
            <Card data-testid="card-inspector-workload">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    <CardTitle>Inspector Workload <span className="text-sm font-normal text-muted-foreground">({workloadPeriodLabel})</span></CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={workloadPeriod} onValueChange={setWorkloadPeriod}>
                      <SelectTrigger className="w-[110px]" data-testid="select-workload-period">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">Day</SelectItem>
                        <SelectItem value="week">Week</SelectItem>
                        <SelectItem value="month">Month</SelectItem>
                        <SelectItem value="year">Year</SelectItem>
                      </SelectContent>
                    </Select>
                    <Link href="/company/team">
                      <Button variant="ghost" size="sm" className="h-8 gap-1">
                        Manage <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {workloadLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map(i => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : inspectorWorkloadData.length > 0 ? (
                  <div className="space-y-2">
                    {inspectorWorkloadData.map((inspector: any) => (
                      <div key={inspector.userId} data-testid={`inspector-${inspector.userId}`}>
                        <div
                          className="flex items-center justify-between gap-2 p-2 rounded-lg cursor-pointer hover-elevate"
                          onClick={() => toggleInspectorExpanded(inspector.userId)}
                          data-testid={`button-expand-inspector-${inspector.userId}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {expandedInspectors.has(inspector.userId) ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0">
                              <p className="font-medium truncate">{inspector.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {inspector.projectCount} project{inspector.projectCount !== 1 ? 's' : ''} · {inspector.reportCount} reports
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-medium">{inspector.totalHours}h</p>
                            <p className="text-xs text-muted-foreground">
                              {inspector.overtimeHours > 0 && (
                                <span className="text-amber-600 dark:text-amber-400">+{inspector.overtimeHours}h OT</span>
                              )}
                            </p>
                          </div>
                        </div>
                        {expandedInspectors.has(inspector.userId) && inspector.projectBreakdown && (
                          <div className="ml-8 mt-1 mb-2 space-y-1">
                            {inspector.projectBreakdown.map((project: any) => (
                              <div
                                key={project.projectId}
                                className="flex items-center justify-between gap-2 text-sm p-2 rounded bg-muted/50"
                                data-testid={`workload-project-${inspector.userId}-${project.projectId}`}
                              >
                                <div className="min-w-0">
                                  <p className="truncate">{project.projectName}</p>
                                  <p className="text-xs text-muted-foreground">{project.reportCount} reports</p>
                                </div>
                                <div className="text-right shrink-0 text-xs">
                                  <p>{project.regularHours}h reg</p>
                                  {project.overtimeHours > 0 && (
                                    <p className="text-amber-600 dark:text-amber-400">+{project.overtimeHours}h OT</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No inspector data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity Feed */}
            <Card data-testid="card-recent-activity">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    <CardTitle>Recent Activity</CardTitle>
                  </div>
                  <Link href="/reports">
                    <Button variant="ghost" size="sm" className="h-8 gap-1">
                      All Reports <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {dashboardLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : companyDashboard?.recentActivity && companyDashboard.recentActivity.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {companyDashboard.recentActivity.slice(0, 10).map((activity) => (
                      <div 
                        key={activity.id} 
                        className="flex items-start gap-2 py-2 border-b last:border-0"
                        data-testid={`activity-${activity.id}`}
                      >
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{activity.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseDateSafe(activity.date), 'MMM d, h:mm a')}
                          </p>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={`text-xs shrink-0 ${
                            activity.status === 'submitted' ? 'text-green-600' :
                            activity.status === 'draft' ? 'text-amber-600' : ''
                          }`}
                        >
                          {activity.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    No recent activity
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Invoice Tracking Overview */}
        <Card data-testid="card-invoice-overview">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <CardTitle>Invoice Tracking</CardTitle>
            </div>
            <Link href="/company/billing">
              <Button variant="ghost" size="sm" className="h-8 gap-1" data-testid="link-view-all-invoices">
                View All <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-sm">Outstanding</span>
                </div>
                {invoiceStatsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-500" data-testid="text-outstanding-amount">
                    {formatCurrency(invoiceStats?.outstandingAmount || 0)}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {invoiceStats?.sent || 0} sent, {invoiceStats?.overdue || 0} overdue
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm">Paid</span>
                </div>
                {invoiceStatsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold text-green-600 dark:text-green-500" data-testid="text-paid-amount">
                    {formatCurrency(invoiceStats?.paidAmount || 0)}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {invoiceStats?.paid || 0} invoices paid
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Draft</span>
                </div>
                {invoiceStatsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-draft-count">
                    {invoiceStats?.draft || 0}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Pending review
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Receipt className="h-4 w-4" />
                  <span className="text-sm">Total Invoices</span>
                </div>
                {invoiceStatsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="text-total-invoices">
                    {invoiceStats?.total || 0}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(invoiceStats?.totalAmount || 0)} total
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team Notes */}
        <Card data-testid="card-team-notes">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Notes</CardTitle>
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="mb-4 relative">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Textarea
                    placeholder="Leave a note... Type @ to mention team members"
                    value={newNote}
                    onChange={(e) => handleNoteChange(e.target.value)}
                    className="min-h-[80px] resize-none"
                    data-testid="input-note"
                  />
                  {showMentions && filteredCompanyMembers.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-1 w-full max-w-xs bg-popover border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {filteredCompanyMembers.map((member: any) => (
                        <button
                          key={member.user?.id}
                          className="w-full px-3 py-2 text-left text-sm hover-elevate flex items-center gap-2"
                          onClick={() => handleNoteMentionSelect(member)}
                          data-testid={`mention-option-${member.user?.id}`}
                        >
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                            {(member.user?.firstName?.[0] || '').toUpperCase()}{(member.user?.lastName?.[0] || '').toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium">
                              {[member.user?.firstName, member.user?.lastName].filter(Boolean).join(' ') || 'Unknown'}
                            </div>
                            <div className="text-xs text-muted-foreground capitalize">{member.role}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={handleSubmitNote}
                  disabled={!newNote.trim() || addNoteMutation.isPending}
                  data-testid="button-submit-note"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {notesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-3 bg-muted rounded-md animate-pulse">
                    <div className="flex items-start gap-2">
                      <div className="w-8 h-8 rounded-full bg-muted-foreground/20" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-24 bg-muted-foreground/20 rounded" />
                        <div className="h-3 w-full bg-muted-foreground/20 rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : companyNotes.length > 0 ? (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {companyNotes.map((note: any) => (
                  <div
                    key={note.id}
                    className="p-3 bg-muted rounded-md"
                    data-testid={`note-${note.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium flex-shrink-0">
                          {note.author?.profileImageUrl ? (
                            <img
                              src={note.author.profileImageUrl}
                              alt="Avatar"
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <>
                              {(note.author?.firstName?.[0] || '').toUpperCase()}
                              {(note.author?.lastName?.[0] || '').toUpperCase()}
                            </>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                              {[note.author?.firstName, note.author?.lastName].filter(Boolean).join(' ') || 'Unknown User'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {note.createdAt ? format(parseDateSafe(note.createdAt), 'MMM d, yyyy h:mm a') : ''}
                            </span>
                          </div>
                          <p className="text-sm mt-1 whitespace-pre-wrap break-words">
                            {renderNoteContent(note.content)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="flex-shrink-0 h-6 w-6"
                        onClick={() => deleteNoteMutation.mutate(note.id)}
                        disabled={deleteNoteMutation.isPending}
                        data-testid={`button-delete-note-${note.id}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No notes yet. Be the first to leave a note!
              </p>
            )}
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/reports">
            <Card className="cursor-pointer hover-elevate" data-testid="card-quick-reports">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-primary/10 p-3">
                  <ClipboardList className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">View Reports</h3>
                  <p className="text-sm text-muted-foreground">Manage daily field reports</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/company/team">
            <Card className="cursor-pointer hover-elevate" data-testid="card-quick-team">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-blue-500/10 p-3">
                  <Users className="h-6 w-6 text-blue-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Team Members</h3>
                  <p className="text-sm text-muted-foreground">Manage your team</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/company/projects">
            <Card className="cursor-pointer hover-elevate" data-testid="card-quick-projects">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-amber-500/10 p-3">
                  <FolderKanban className="h-6 w-6 text-amber-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Projects</h3>
                  <p className="text-sm text-muted-foreground">View company projects</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </PageLayout>
  );
}

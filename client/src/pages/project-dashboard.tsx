import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useParams, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SummaryReportDropdown, ReportType, ReportParams } from "@/components/summary-report-dropdown";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Users,
  Activity,
  Image,
  AlertCircle,
  ShieldAlert,
  Cloud,
  Sun,
  CloudRain,
  Wind,
  Snowflake,
  MapPin,
  Building2,
  Hash,
  Flag,
  Download,
  Mail,
  BarChart3,
  Plus,
  Receipt,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Pencil,
  Trash2,
  DollarSign,
} from "lucide-react";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ClientSelect } from "@/components/client-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ProjectDashboardData = {
  project: {
    id: string;
    name: string;
    projectNumber: string;
    address: string | null;
    client: string | null;
    clientInfo: {
      name: string;
      contactName: string | null;
      contactEmail: string | null;
    } | null;
    startDate: string | null;
    substantialCompletionDate: string | null;
    finalCloseoutDate: string | null;
    distributionEmails: string[] | null;
  };
  schedule: {
    progress: number;
    status: 'not_started' | 'on_track' | 'warning' | 'overdue' | 'complete';
    daysRemaining: number | null;
    daysOverdue: number | null;
    startDate: string | null;
    endDate: string | null;
  };
  hours: {
    budgeted: number;
    baseBudget: number;
    used: number;
    remaining: number;
    progress: number;
    status: 'under' | 'on_track' | 'warning' | 'over';
    breakdown: {
      regular: number;
      overtime: number;
      premium: number;
    };
    sources?: {
      dailyReports: {
        total: number;
        regular: number;
        overtime: number;
        premium: number;
      };
      manualEntries: {
        total: number;
        regular: number;
        overtime: number;
      };
    };
  };
  dailyReports: {
    id: string;
    date: string;
    status: string;
    weatherType: string | null;
    regularHours: string | null;
    otHours: string | null;
    signedAt: string | null;
  }[];
  activityTimeline: {
    id: string;
    type: 'report';
    date: string;
    title: string;
    description: string;
    status: string | null;
    inspectorId: string;
  }[];
  photoGallery: {
    id: string;
    path: string;
    caption: string | null;
    reportDate: string;
    createdAt: string | null;
  }[];
  issuesSummary: {
    totalCount: number;
    recentIssues: {
      id: string;
      date: string;
      details: string | null;
    }[];
  };
  safetySummary: {
    totalCount: number;
    recentIncidents: {
      id: string;
      date: string;
      details: string | null;
    }[];
  };
  weatherSummary: {
    totalReports: number;
    breakdown: {
      type: string;
      count: number;
      percentage: number;
    }[];
    recentWeather: {
      date: string;
      type: string | null;
      notes: string | null;
    }[];
  };
  teamOverview: {
    inspectorId: string;
    name: string;
    regular: number;
    overtime: number;
    premium: number;
    reportCount: number;
    totalHours: number;
  }[];
  upcomingMilestones: {
    date: string;
    label: string;
    type: string;
    daysUntil: number;
    isPast: boolean;
  }[];
  forecast: {
    workingDaysRemaining: number;
    dailyCapacity: number;
    scheduleType: string;
    maxPossibleHours: number;
    hoursRemaining: number;
    burnRate: number;
    projectedCompletion: 'on_track' | 'at_risk' | 'over_budget' | 'unknown';
    recommendation: string;
    suggestedDailyHours: number | null;
    additionalHoursNeeded: number;
  } | null;
};

type BillingRateEntry = {
  title: string;
  inspectorName: string;
  rate: string;
  hours: string;
  scheduleType: "fullTime" | "partTime";
};

type BaseHoursEntry = {
  inspectorName: string;
  regularHours: string;
  overtimeHours: string;
  billedAmount: string;
};

type ContractOptionInspector = {
  title: string;
  inspectorName?: string;
  rate: string;
  hours: string;
  scheduleType?: "fullTime" | "partTime";
};

type Contract = {
  id: string;
  name: string;
  options?: {
    id: string;
    name: string;
    awardStatus: string;
    inspectors?: ContractOptionInspector[];
  }[];
};

const emptyBillingRate: BillingRateEntry = {
  title: "",
  inspectorName: "",
  rate: "",
  hours: "",
  scheduleType: "fullTime",
};

const emptyBaseHoursEntry: BaseHoursEntry = {
  inspectorName: "",
  regularHours: "",
  overtimeHours: "",
  billedAmount: "",
};

const getWeatherIcon = (type: string | null) => {
  switch (type?.toLowerCase()) {
    case 'clear':
    case 'sunny':
      return <Sun className="w-4 h-4 text-yellow-500" />;
    case 'cloudy':
    case 'overcast':
    case 'partly_cloudy':
      return <Cloud className="w-4 h-4 text-gray-500" />;
    case 'rain':
    case 'rainy':
      return <CloudRain className="w-4 h-4 text-blue-500" />;
    case 'windy':
      return <Wind className="w-4 h-4 text-cyan-500" />;
    case 'snow':
    case 'snowy':
      return <Snowflake className="w-4 h-4 text-blue-300" />;
    default:
      return <Cloud className="w-4 h-4 text-gray-400" />;
  }
};

const getScheduleStatusColor = (status: string) => {
  switch (status) {
    case 'on_track':
      return 'bg-green-500';
    case 'warning':
      return 'bg-yellow-500';
    case 'overdue':
      return 'bg-red-500';
    case 'complete':
      return 'bg-blue-500';
    default:
      return 'bg-gray-500';
  }
};

const getHoursStatusColor = (status: string) => {
  switch (status) {
    case 'under':
      return 'bg-green-500';
    case 'on_track':
      return 'bg-blue-500';
    case 'warning':
      return 'bg-yellow-500';
    case 'over':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
};

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

export default function ProjectDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { isAdmin, isCompanyAdmin, isEffectiveSystemAdmin, isEffectiveCompanyAdmin, activeCompany } = useAuth();
  const [isEmailPending, setIsEmailPending] = useState(false);
  
  // Inspector action dialogs
  const [timesheetDialogOpen, setTimesheetDialogOpen] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [isGenerating, setIsGenerating] = useState(false);
  const [timesheetMode, setTimesheetMode] = useState<'daily_reports' | 'manual'>('daily_reports');
  const [manualEntries, setManualEntries] = useState<Record<string, { regularHours: string; otHours: string }>>({});
  const [isSavingEntries, setIsSavingEntries] = useState(false);
  
  // Edit project dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: "",
    projectNumber: "",
    client: "",
    clientId: "",
    address: "",
    distributionEmails: "",
    contractId: "",
    contractOptionId: "",
    startDate: "",
    substantialCompletionDate: "",
    finalCloseoutDate: "",
    budgetAmount: "",
    baseBudget: "",
    budgetTrackingMode: "" as "" | "daily_reports" | "scheduled" | "hybrid",
    inheritBillingRates: true,
  });
  const [billingRates, setBillingRates] = useState<BillingRateEntry[]>([{ ...emptyBillingRate }]);
  const [baseHours, setBaseHours] = useState<BaseHoursEntry[]>([]);
  
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  
  // Generate all days in selected month
  const daysInMonth = useMemo(() => {
    const year = parseInt(selectedYear);
    const month = parseInt(selectedMonth) - 1;
    const days: Date[] = [];
    const lastDay = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  }, [selectedMonth, selectedYear]);

  // Fetch existing manual entries when mode is manual
  const { data: existingManualEntries, refetch: refetchManualEntries } = useQuery({
    queryKey: ['/api/manual-time-entries', id, selectedMonth, selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/manual-time-entries?projectId=${id}&month=${selectedMonth}&year=${selectedYear}`, {
        credentials: 'include',
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: timesheetMode === 'manual' && timesheetDialogOpen && !!id,
  });

  // Populate manual entries from fetched data
  useEffect(() => {
    if (existingManualEntries && Array.isArray(existingManualEntries)) {
      const entriesMap: Record<string, { regularHours: string; otHours: string }> = {};
      existingManualEntries.forEach((entry: any) => {
        const dateKey = format(new Date(entry.date), 'yyyy-MM-dd');
        entriesMap[dateKey] = {
          regularHours: entry.regularHours || '',
          otHours: entry.otHours || '',
        };
      });
      setManualEntries(entriesMap);
    }
  }, [existingManualEntries]);

  // Reset manual entries when month/year changes
  useEffect(() => {
    setManualEntries({});
  }, [selectedMonth, selectedYear]);

  const { data, isLoading, error } = useQuery<ProjectDashboardData>({
    queryKey: ['/api/projects', id, 'dashboard'],
    enabled: !!id,
  });

  // Fetch contracts for edit dialog (admin only)
  const { data: contracts = [] } = useQuery<Contract[]>({
    queryKey: ['/api/contracts'],
    enabled: isEffectiveCompanyAdmin && editDialogOpen,
  });

  // Fetch full project data for editing
  const { data: fullProjectData } = useQuery<any>({
    queryKey: ['/api/projects', id],
    enabled: isEffectiveCompanyAdmin && editDialogOpen && !!id,
  });

  // Selected contract and awarded options for edit form
  const selectedContract = useMemo(() => {
    if (!editFormData.contractId) return null;
    return contracts.find((c) => c.id === editFormData.contractId) || null;
  }, [editFormData.contractId, contracts]);

  const awardedOptions = useMemo(() => {
    if (!selectedContract?.options) return [];
    return selectedContract.options.filter((opt) => opt.awardStatus === "awarded");
  }, [selectedContract]);

  // Get inherited billing rates from the selected contract option
  const inheritedRates = useMemo(() => {
    if (!editFormData.contractOptionId || !selectedContract?.options) return [];
    const selectedOption = selectedContract.options.find(opt => opt.id === editFormData.contractOptionId);
    if (!selectedOption?.inspectors) return [];
    return selectedOption.inspectors.map((ins: ContractOptionInspector) => ({
      title: ins.title,
      inspectorName: ins.inspectorName || "",
      rate: ins.rate,
      hours: ins.hours,
      scheduleType: (ins.scheduleType as "fullTime" | "partTime") || "fullTime",
    }));
  }, [editFormData.contractOptionId, selectedContract]);

  // Billing rate helper functions
  const addBillingRate = () => {
    setBillingRates([...billingRates, { ...emptyBillingRate }]);
  };

  const removeBillingRate = (index: number) => {
    if (billingRates.length <= 1) return;
    setBillingRates(billingRates.filter((_, i) => i !== index));
  };

  const updateBillingRate = (index: number, field: keyof BillingRateEntry, value: string) => {
    setBillingRates(billingRates.map((rate, i) => 
      i === index ? { ...rate, [field]: value } : rate
    ));
  };

  // Base hours helper functions
  const addBaseHoursEntry = () => {
    setBaseHours([...baseHours, { ...emptyBaseHoursEntry }]);
  };

  const removeBaseHoursEntry = (index: number) => {
    setBaseHours(baseHours.filter((_, i) => i !== index));
  };

  const updateBaseHoursEntry = (index: number, field: keyof BaseHoursEntry, value: string) => {
    setBaseHours(baseHours.map((entry, i) => 
      i === index ? { ...entry, [field]: value } : entry
    ));
  };

  const calculateBaseHoursTotal = () => {
    let totalRegular = 0;
    let totalOvertime = 0;
    let totalBilled = 0;
    for (const entry of baseHours) {
      totalRegular += parseFloat(entry.regularHours) || 0;
      totalOvertime += parseFloat(entry.overtimeHours) || 0;
      totalBilled += parseFloat(entry.billedAmount) || 0;
    }
    return { totalRegular, totalOvertime, totalBilled };
  };

  const calculateBillingTotal = (rates: BillingRateEntry[]) => {
    return rates.reduce((sum, r) => sum + (parseFloat(r.rate) || 0) * (parseFloat(r.hours) || 0), 0);
  };

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: async (formDataWithId: typeof editFormData & { id: string; billingRates?: BillingRateEntry[]; baseHours?: BaseHoursEntry[] }) => {
      const project = await apiRequest("PATCH", `/api/projects/${formDataWithId.id}`, {
        ...formDataWithId,
        contractId: formDataWithId.contractId || null,
        contractOptionId: formDataWithId.contractOptionId || null,
        clientId: formDataWithId.clientId || null,
        budgetAmount: formDataWithId.budgetAmount ? parseFloat(formDataWithId.budgetAmount) : null,
        baseBudget: formDataWithId.baseBudget ? parseFloat(formDataWithId.baseBudget) : null,
        budgetTrackingMode: formDataWithId.budgetTrackingMode || null,
        distributionEmails: formDataWithId.distributionEmails
          .split(",")
          .map(e => e.trim())
          .filter(Boolean),
      });
      
      // Save billing rates if not inheriting
      if (formDataWithId.billingRates && !formDataWithId.inheritBillingRates) {
        const validRates = formDataWithId.billingRates.filter(r => r.title && r.rate);
        if (validRates.length > 0) {
          await apiRequest("PUT", `/api/projects/${formDataWithId.id}/billing-rates`, { rates: validRates });
        }
      }
      
      // Save base hours entries
      if (formDataWithId.baseHours) {
        const validEntries = formDataWithId.baseHours.filter(e => e.inspectorName && (parseFloat(e.regularHours) > 0 || parseFloat(e.overtimeHours) > 0));
        await apiRequest("PUT", `/api/projects/${formDataWithId.id}/base-hours`, { entries: validEntries });
      }
      
      return project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      setEditDialogOpen(false);
      toast({
        title: "Project Updated",
        description: "Project has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update project.",
        variant: "destructive",
      });
    },
  });

  // Function to open edit dialog and populate form
  const openEditDialog = async () => {
    if (!id) return;
    setEditDialogOpen(true);
  };

  // Populate edit form when fullProjectData is loaded
  useEffect(() => {
    if (fullProjectData && editDialogOpen) {
      setEditFormData({
        name: fullProjectData.name || "",
        projectNumber: fullProjectData.projectNumber || "",
        client: fullProjectData.client || "",
        clientId: fullProjectData.clientId || "",
        address: fullProjectData.address || "",
        distributionEmails: fullProjectData.distributionEmails?.join(", ") || "",
        contractId: fullProjectData.contractId || "",
        contractOptionId: fullProjectData.contractOptionId || "",
        startDate: fullProjectData.startDate ? fullProjectData.startDate.split("T")[0] : "",
        substantialCompletionDate: fullProjectData.substantialCompletionDate ? fullProjectData.substantialCompletionDate.split("T")[0] : "",
        finalCloseoutDate: fullProjectData.finalCloseoutDate ? fullProjectData.finalCloseoutDate.split("T")[0] : "",
        budgetAmount: fullProjectData.budgetAmount?.toString() || "",
        baseBudget: fullProjectData.baseBudget?.toString() || "",
        budgetTrackingMode: fullProjectData.budgetTrackingMode || "",
        inheritBillingRates: fullProjectData.inheritBillingRates ?? true,
      });

      // Load billing rates
      fetch(`/api/projects/${id}/billing-rates`, { credentials: "include" })
        .then(res => res.ok ? res.json() : [])
        .then(rates => {
          if (rates.length > 0) {
            setBillingRates(rates.map((r: any) => ({
              title: r.title || "",
              inspectorName: r.inspectorName || "",
              rate: r.rate || "",
              hours: r.hours || "",
              scheduleType: r.scheduleType || "fullTime",
            })));
          } else {
            setBillingRates([{ ...emptyBillingRate }]);
          }
        });

      // Load base hours
      fetch(`/api/projects/${id}/base-hours`, { credentials: "include" })
        .then(res => res.ok ? res.json() : [])
        .then(entries => {
          if (entries.length > 0) {
            setBaseHours(entries.map((e: any) => ({
              inspectorName: e.inspectorName || "",
              regularHours: e.regularHours || "",
              overtimeHours: e.overtimeHours || "",
              billedAmount: e.billedAmount || "",
            })));
          } else {
            setBaseHours([]);
          }
        });
    }
  }, [fullProjectData, editDialogOpen, id]);

  const handleDownloadReport = (type: ReportType, params: ReportParams) => {
    let url = '';
    if (type === 'weekly') {
      url = `/api/projects/${id}/weekly-summary?weekStart=${params.weekStart}&weekEnd=${params.weekEnd}`;
    } else if (type === 'monthly') {
      url = `/api/projects/${id}/monthly-summary?month=${params.month}&year=${params.year}`;
    } else if (type === 'current') {
      url = `/api/projects/${id}/current-status`;
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
        endpoint = `/api/projects/${id}/weekly-summary/email`;
        body.weekStart = params.weekStart;
        body.weekEnd = params.weekEnd;
      } else if (type === 'monthly') {
        endpoint = `/api/projects/${id}/monthly-summary/email`;
        body.month = parseInt(params.month || '1');
        body.year = parseInt(params.year || new Date().getFullYear().toString());
      } else if (type === 'current') {
        endpoint = `/api/projects/${id}/current-status/email`;
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

  const handleSaveManualEntries = async () => {
    setIsSavingEntries(true);
    try {
      // Convert entries to array format for API
      const entriesArray = Object.entries(manualEntries)
        .filter(([_, entry]) => entry.regularHours || entry.otHours)
        .map(([dateKey, entry]) => ({
          date: dateKey,
          regularHours: entry.regularHours || null,
          otHours: entry.otHours || null,
        }));

      const response = await apiRequest('POST', '/api/manual-time-entries/bulk', {
        projectId: id,
        entries: entriesArray,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save entries');
      }

      toast({
        title: "Entries Saved",
        description: "Your time entries have been saved",
      });
      
      // Refetch the entries
      refetchManualEntries();
    } catch (error: any) {
      toast({
        title: "Failed to save entries",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSavingEntries(false);
    }
  };

  const handleGenerateTimesheet = async () => {
    // If manual mode, save entries first
    if (timesheetMode === 'manual') {
      setIsSavingEntries(true);
      try {
        const entriesArray = Object.entries(manualEntries)
          .filter(([_, entry]) => entry.regularHours || entry.otHours)
          .map(([dateKey, entry]) => ({
            date: dateKey,
            regularHours: entry.regularHours || null,
            otHours: entry.otHours || null,
          }));

        const response = await apiRequest('POST', '/api/manual-time-entries/bulk', {
          projectId: id,
          entries: entriesArray,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to save entries');
        }
        
        refetchManualEntries();
      } catch (error: any) {
        toast({
          title: "Failed to save entries",
          description: error.message || "Please try again",
          variant: "destructive",
        });
        setIsSavingEntries(false);
        return; // Stop if save fails
      } finally {
        setIsSavingEntries(false);
      }
    }
    
    setIsGenerating(true);
    try {
      const response = await fetch('/api/billing/timesheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          month: parseInt(selectedMonth),
          year: parseInt(selectedYear),
          useManualEntries: timesheetMode === 'manual',
        }),
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate timesheet');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Timesheet_${months.find(m => m.value === selectedMonth)?.label}_${selectedYear}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Timesheet Generated",
        description: "Your timesheet PDF has been downloaded",
      });
      setTimesheetDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Failed to generate timesheet",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateInvoice = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/billing/inspector-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          month: parseInt(selectedMonth),
          year: parseInt(selectedYear),
        }),
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to generate invoice');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Inspector_Invoice_${months.find(m => m.value === selectedMonth)?.label}_${selectedYear}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Invoice Generated",
        description: "Your invoice PDF has been downloaded",
      });
      setInvoiceDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Failed to generate invoice",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <PageLayout title="Project Dashboard">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error || !data) {
    return (
      <PageLayout title="Project Dashboard">
        <div className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="w-12 h-12 text-destructive mb-4" />
          <h2 className="text-lg font-semibold">Failed to load project dashboard</h2>
          <p className="text-muted-foreground">Please try again later</p>
          <Button asChild className="mt-4">
            <Link href="/my-projects">Back to Projects</Link>
          </Button>
        </div>
      </PageLayout>
    );
  }

  const { project, schedule, hours, dailyReports, activityTimeline, photoGallery, issuesSummary, safetySummary, weatherSummary, teamOverview, upcomingMilestones, forecast } = data;

  return (
    <PageLayout title={project.name}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/my-projects">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Projects
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate" data-testid="text-project-name">{project.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            {isEffectiveCompanyAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={openEditDialog}
                data-testid="button-edit-project"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit Project
              </Button>
            )}
            <SummaryReportDropdown
              scope="project"
              entityId={id || ''}
              distributionEmails={project.distributionEmails || []}
              onDownload={handleDownloadReport}
              onEmail={handleEmailReport}
              isEmailPending={isEmailPending}
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-1">
              {project.projectNumber && (
                <span className="flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  {project.projectNumber}
                </span>
              )}
              {project.client && (
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {project.client}
                </span>
              )}
              {project.address && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {project.address}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card data-testid="card-schedule-progress">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Schedule Progress</CardTitle>
              <Calendar className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{Math.round(schedule.progress)}%</span>
                  <Badge variant={schedule.status === 'on_track' ? 'default' : schedule.status === 'warning' ? 'secondary' : schedule.status === 'overdue' ? 'destructive' : 'outline'}>
                    {schedule.status.replace('_', ' ')}
                  </Badge>
                </div>
                <Progress value={schedule.progress} className={getScheduleStatusColor(schedule.status)} />
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  {schedule.startDate && (
                    <div>
                      <span className="font-medium">Start:</span>{' '}
                      {format(new Date(schedule.startDate), 'MMM d, yyyy')}
                    </div>
                  )}
                  {schedule.endDate && (
                    <div>
                      <span className="font-medium">End:</span>{' '}
                      {format(new Date(schedule.endDate), 'MMM d, yyyy')}
                    </div>
                  )}
                </div>
                {schedule.daysRemaining !== null && schedule.daysRemaining > 0 && (
                  <div className="text-sm">
                    <span className="font-medium text-green-600">{schedule.daysRemaining}</span> days remaining
                  </div>
                )}
                {schedule.daysOverdue !== null && schedule.daysOverdue > 0 && (
                  <div className="text-sm text-red-600">
                    <span className="font-medium">{schedule.daysOverdue}</span> days overdue
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-hours-budget">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hours Budget</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={hours.status === 'under' || hours.status === 'on_track' ? 'default' : hours.status === 'warning' ? 'secondary' : 'destructive'}>
                  {hours.status === 'under' ? 'On Track' : hours.status.replace('_', ' ')}
                </Badge>
                <Clock className="w-4 h-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Hours Budget Summary - Budgeted / Used / Remaining */}
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="p-2 bg-muted/50 rounded text-center">
                    <p className="text-xs text-muted-foreground">Budgeted</p>
                    <p className="text-lg font-bold" data-testid="text-budgeted-hours">{hours.budgeted.toFixed(1)}</p>
                  </div>
                  <div className="p-2 bg-muted/50 rounded text-center">
                    <p className="text-xs text-muted-foreground">Used</p>
                    <p className="text-lg font-bold" data-testid="text-used-hours">{hours.used.toFixed(1)}</p>
                  </div>
                  <div className={`p-2 rounded text-center ${
                    hours.budgeted > 0 && (hours.remaining / hours.budgeted) <= 0.1 
                      ? 'bg-red-50 dark:bg-red-950' 
                      : hours.budgeted > 0 && (hours.remaining / hours.budgeted) < 0.2 
                        ? 'bg-orange-50 dark:bg-orange-950' 
                        : 'bg-green-50 dark:bg-green-950'
                  }`}>
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p className={`text-lg font-bold ${
                      hours.budgeted > 0 && (hours.remaining / hours.budgeted) <= 0.1 
                        ? 'text-red-700 dark:text-red-400' 
                        : hours.budgeted > 0 && (hours.remaining / hours.budgeted) < 0.2 
                          ? 'text-orange-700 dark:text-orange-400' 
                          : 'text-green-700 dark:text-green-400'
                    }`} data-testid="text-remaining-hours">
                      {hours.remaining.toFixed(1)}
                    </p>
                  </div>
                </div>
                
                {hours.budgeted > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Hours Progress</span>
                      <span>{hours.progress.toFixed(1)}%</span>
                    </div>
                    <Progress 
                      value={Math.min(hours.progress, 100)} 
                      className={`h-2 ${hours.progress > 100 ? '[&>div]:bg-red-500' : ''}`}
                    />
                  </div>
                )}
                
                {/* Hours Breakdown by Type */}
                <div className="pt-2">
                  <div className="text-xs text-muted-foreground mb-2">Hours by Type</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center p-2 bg-muted rounded">
                      <div className="font-medium">{hours.breakdown.regular.toFixed(1)}</div>
                      <div className="text-muted-foreground">Regular</div>
                    </div>
                    <div className="text-center p-2 bg-muted rounded">
                      <div className="font-medium">{hours.breakdown.overtime.toFixed(1)}</div>
                      <div className="text-muted-foreground">OT</div>
                    </div>
                    <div className="text-center p-2 bg-muted rounded">
                      <div className="font-medium">{hours.breakdown.premium.toFixed(1)}</div>
                      <div className="text-muted-foreground">Premium</div>
                    </div>
                  </div>
                </div>
                
                {hours.sources && (hours.sources.dailyReports.total > 0 || hours.sources.manualEntries.total > 0) && (
                  <div className="pt-3 border-t border-border">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Hours by Source</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded">
                        <div className="flex items-center gap-1 mb-1">
                          <FileText className="w-3 h-3" />
                          <span className="font-medium">Daily Reports</span>
                        </div>
                        <div className="text-lg font-bold">{hours.sources.dailyReports.total.toFixed(1)} hrs</div>
                      </div>
                      <div className="p-2 bg-green-50 dark:bg-green-950 rounded">
                        <div className="flex items-center gap-1 mb-1">
                          <Clock className="w-3 h-3" />
                          <span className="font-medium">Manual Entries</span>
                        </div>
                        <div className="text-lg font-bold">{hours.sources.manualEntries.total.toFixed(1)} hrs</div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Hours Forecast - Hidden from inspectors */}
                {(isAdmin || isCompanyAdmin || isEffectiveSystemAdmin || isEffectiveCompanyAdmin) && forecast && (
                  <div className="pt-3 border-t border-border" data-testid="section-hours-forecast">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-medium text-muted-foreground">Hours Forecast</div>
                      <Badge 
                        variant={forecast.projectedCompletion === 'on_track' ? 'default' : forecast.projectedCompletion === 'at_risk' ? 'secondary' : 'destructive'}
                        data-testid="badge-forecast-status"
                      >
                        {forecast.projectedCompletion === 'on_track' ? 'On Track' : forecast.projectedCompletion === 'at_risk' ? 'At Risk' : forecast.projectedCompletion === 'over_budget' ? 'Over Budget' : 'Unknown'}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      <div className="p-2 bg-muted/50 rounded">
                        <div className="text-muted-foreground">Working Days Left</div>
                        <div className="text-lg font-bold" data-testid="text-working-days-remaining">{forecast.workingDaysRemaining}</div>
                      </div>
                      <div className="p-2 bg-muted/50 rounded">
                        <div className="text-muted-foreground">Daily Capacity</div>
                        <div className="text-lg font-bold" data-testid="text-daily-capacity">
                          {forecast.dailyCapacity} hrs
                          <span className="text-xs font-normal text-muted-foreground ml-1">
                            ({forecast.scheduleType === 'partTime' ? 'PT' : 'FT'})
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      <div className="p-2 bg-muted/50 rounded">
                        <div className="text-muted-foreground">Max Possible Hours</div>
                        <div className="text-lg font-bold" data-testid="text-max-possible-hours">{forecast.maxPossibleHours.toFixed(1)}</div>
                      </div>
                      <div className="p-2 bg-muted/50 rounded">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          {forecast.burnRate > forecast.dailyCapacity ? (
                            <TrendingUp className="w-3 h-3 text-red-500" />
                          ) : (
                            <TrendingDown className="w-3 h-3 text-green-500" />
                          )}
                          <span>Burn Rate</span>
                        </div>
                        <div className="text-lg font-bold" data-testid="text-burn-rate">{forecast.burnRate.toFixed(1)} hrs/day</div>
                      </div>
                    </div>
                    
                    {forecast.suggestedDailyHours !== null && (
                      <div className={`p-2 rounded mb-3 ${
                        forecast.projectedCompletion === 'on_track' 
                          ? 'bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800' 
                          : forecast.projectedCompletion === 'at_risk'
                            ? 'bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800'
                            : 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800'
                      }`}>
                        <div className="text-xs text-muted-foreground mb-1">Suggested Daily Hours</div>
                        <div className={`text-lg font-bold ${
                          forecast.projectedCompletion === 'on_track' 
                            ? 'text-green-700 dark:text-green-400' 
                            : forecast.projectedCompletion === 'at_risk'
                              ? 'text-orange-700 dark:text-orange-400'
                              : 'text-red-700 dark:text-red-400'
                        }`} data-testid="text-suggested-daily-hours">
                          {forecast.suggestedDailyHours.toFixed(1)} hrs/day
                        </div>
                      </div>
                    )}
                    
                    {forecast.additionalHoursNeeded > 0 && (
                      <div className="p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded mb-3">
                        <div className="text-xs text-muted-foreground mb-1">Additional Hours Needed</div>
                        <div className="text-lg font-bold text-red-700 dark:text-red-400" data-testid="text-additional-hours-needed">
                          {forecast.additionalHoursNeeded.toFixed(1)} hrs
                        </div>
                      </div>
                    )}
                    
                    <div className={`p-2 rounded text-xs ${
                      forecast.projectedCompletion === 'on_track' 
                        ? 'bg-green-50 dark:bg-green-950' 
                        : forecast.projectedCompletion === 'at_risk'
                          ? 'bg-orange-50 dark:bg-orange-950'
                          : 'bg-red-50 dark:bg-red-950'
                    }`}>
                      <div className="flex items-start gap-2">
                        <AlertCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                          forecast.projectedCompletion === 'on_track' 
                            ? 'text-green-600' 
                            : forecast.projectedCompletion === 'at_risk'
                              ? 'text-orange-600'
                              : 'text-red-600'
                        }`} />
                        <p className="text-muted-foreground" data-testid="text-forecast-recommendation">
                          {forecast.recommendation}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-daily-reports">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Daily Reports</CardTitle>
              <FileText className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-2">{dailyReports.length}</div>
              <div className="text-sm text-muted-foreground mb-3">Total reports submitted</div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {dailyReports.slice(0, 10).map((report) => (
                  <Link
                    key={report.id}
                    href={`/reports/${report.id}`}
                    className="flex items-center justify-between text-xs p-2 bg-muted rounded hover-elevate cursor-pointer"
                  >
                    <span>{format(new Date(report.date), 'MMM d, yyyy')}</span>
                    <div className="flex items-center gap-2">
                      {getWeatherIcon(report.weatherType)}
                      <Badge variant="outline" className="text-xs">
                        {parseFloat(report.regularHours || '0').toFixed(1)} hrs
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-project-reports">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Project Reports</CardTitle>
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground mb-4">
                Generate summary reports for this project
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted rounded">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    <div>
                      <div className="text-sm font-medium">Weekly Summary</div>
                      <div className="text-xs text-muted-foreground">Reports by week with daily details</div>
                    </div>
                  </div>
                  <SummaryReportDropdown
                    scope="project"
                    entityId={id || ''}
                    distributionEmails={project.distributionEmails || []}
                    onDownload={handleDownloadReport}
                    onEmail={handleEmailReport}
                    isEmailPending={isEmailPending}
                    defaultReportType="weekly"
                    triggerVariant="icon"
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    <div>
                      <div className="text-sm font-medium">Monthly Summary</div>
                      <div className="text-xs text-muted-foreground">Full month overview with metrics</div>
                    </div>
                  </div>
                  <SummaryReportDropdown
                    scope="project"
                    entityId={id || ''}
                    distributionEmails={project.distributionEmails || []}
                    onDownload={handleDownloadReport}
                    onEmail={handleEmailReport}
                    isEmailPending={isEmailPending}
                    defaultReportType="monthly"
                    triggerVariant="icon"
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    <div>
                      <div className="text-sm font-medium">Current Status</div>
                      <div className="text-xs text-muted-foreground">Today's snapshot of project</div>
                    </div>
                  </div>
                  <SummaryReportDropdown
                    scope="project"
                    entityId={id || ''}
                    distributionEmails={project.distributionEmails || []}
                    onDownload={handleDownloadReport}
                    onEmail={handleEmailReport}
                    isEmailPending={isEmailPending}
                    defaultReportType="current"
                    triggerVariant="icon"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-inspector-actions">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Inspector Actions</CardTitle>
              <ClipboardList className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground mb-4">
                Create reports and generate billing documents
              </div>
              <div className="space-y-3">
                <Link href={`/create-report?projectId=${id}`}>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    data-testid="button-new-daily-report"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    New Daily Report
                  </Button>
                </Link>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => setTimesheetDialogOpen(true)}
                  data-testid="button-generate-timesheet"
                >
                  <ClipboardList className="w-4 h-4 mr-2" />
                  Generate Timesheet
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => setInvoiceDialogOpen(true)}
                  data-testid="button-generate-invoice"
                >
                  <Receipt className="w-4 h-4 mr-2" />
                  Generate Invoice
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {upcomingMilestones.length > 0 && (
            <Card data-testid="card-milestones">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Upcoming Milestones</CardTitle>
                <Flag className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {upcomingMilestones.slice(0, 5).map((milestone, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {milestone.isPast ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : milestone.daysUntil <= 7 ? (
                          <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        ) : (
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className={milestone.isPast ? 'text-muted-foreground' : ''}>{milestone.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {milestone.isPast ? (
                          <span className="text-green-600">Completed</span>
                        ) : (
                          `${milestone.daysUntil} days`
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {teamOverview.length > 0 && (
            <Card data-testid="card-team-overview">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Team Hours</CardTitle>
                <Users className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {teamOverview.slice(0, 5).map((inspector) => (
                    <div key={inspector.inspectorId} className="flex items-center justify-between text-sm">
                      <span className="truncate max-w-[120px]">{inspector.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {inspector.reportCount} reports
                        </Badge>
                        <span className="font-medium">{inspector.totalHours.toFixed(1)} hrs</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card data-testid="card-weather-summary">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Weather Summary</CardTitle>
              <Cloud className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {weatherSummary.breakdown.slice(0, 5).map((weather) => (
                  <div key={weather.type} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {getWeatherIcon(weather.type)}
                      <span className="capitalize">{weather.type.replace('_', ' ')}</span>
                    </div>
                    <span className="text-muted-foreground">{weather.percentage}%</span>
                  </div>
                ))}
                {weatherSummary.breakdown.length === 0 && (
                  <p className="text-sm text-muted-foreground">No weather data available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card data-testid="card-issues">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Issues Reported</CardTitle>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-muted-foreground" />
                {issuesSummary.totalCount > 0 && (
                  <Badge variant="secondary">{issuesSummary.totalCount}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {issuesSummary.recentIssues.length > 0 ? (
                <div className="space-y-3 max-h-40 overflow-y-auto">
                  {issuesSummary.recentIssues.map((issue) => (
                    <div key={issue.id} className="text-sm p-2 bg-muted rounded">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(issue.date), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <p className="text-xs line-clamp-2">{issue.details || 'No details provided'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  No issues reported
                </p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-safety">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Safety Incidents</CardTitle>
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                {safetySummary.totalCount > 0 && (
                  <Badge variant="destructive">{safetySummary.totalCount}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {safetySummary.recentIncidents.length > 0 ? (
                <div className="space-y-3 max-h-40 overflow-y-auto">
                  {safetySummary.recentIncidents.map((incident) => (
                    <div key={incident.id} className="text-sm p-2 bg-red-50 dark:bg-red-950 rounded border border-red-200 dark:border-red-800">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(incident.date), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <p className="text-xs line-clamp-2">{incident.details || 'No details provided'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  No safety incidents reported
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card data-testid="card-activity">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
              <Activity className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {activityTimeline.length > 0 ? (
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {activityTimeline.map((activity) => (
                    <Link
                      key={activity.id}
                      href={`/reports/${activity.id}`}
                      className="flex items-start gap-3 text-sm p-2 bg-muted rounded hover-elevate cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{activity.title}</p>
                        <p className="text-xs text-muted-foreground">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(activity.date), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {activity.status}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No recent activity</p>
              )}
            </CardContent>
          </Card>

          {photoGallery.length > 0 && (
            <Card data-testid="card-photos">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Recent Photos</CardTitle>
                <Image className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {photoGallery.slice(0, 6).map((photo) => (
                    <div
                      key={photo.id}
                      className="aspect-square bg-muted rounded overflow-hidden"
                    >
                      <img
                        src={photo.path}
                        alt={photo.caption || 'Project photo'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {project.distributionEmails && project.distributionEmails.length > 0 && (
          <Card data-testid="card-distribution">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Distribution List</CardTitle>
              <Mail className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {project.distributionEmails.map((email, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {email}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={timesheetDialogOpen} onOpenChange={setTimesheetDialogOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="modal-timesheet">
          <DialogHeader>
            <DialogTitle>Generate Timesheet</DialogTitle>
            <DialogDescription>
              Generate a timesheet PDF for your work on this project
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger data-testid="select-timesheet-month">
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
                <Label>Year</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger data-testid="select-timesheet-year">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Tabs value={timesheetMode} onValueChange={(v) => setTimesheetMode(v as 'daily_reports' | 'manual')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="daily_reports" data-testid="tab-daily-reports">
                  From Daily Reports
                </TabsTrigger>
                <TabsTrigger value="manual" data-testid="tab-manual-entry">
                  Manual Entry
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="daily_reports" className="mt-4">
                <div className="p-4 bg-muted rounded text-sm text-muted-foreground">
                  Hours will be calculated from your submitted daily reports for this project during the selected period.
                </div>
              </TabsContent>
              
              <TabsContent value="manual" className="mt-4">
                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground mb-2">
                    Enter hours for each day. Leave blank for days not worked.
                  </div>
                  <ScrollArea className="h-64 border rounded-md">
                    <div className="p-2">
                      <div className="grid grid-cols-[1fr,80px,80px] gap-2 mb-2 px-2 text-xs font-medium text-muted-foreground sticky top-0 bg-background py-1">
                        <span>Date</span>
                        <span className="text-center">Regular</span>
                        <span className="text-center">OT</span>
                      </div>
                      {daysInMonth.map((day) => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const dayOfWeek = day.getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        return (
                          <div 
                            key={dateKey} 
                            className={`grid grid-cols-[1fr,80px,80px] gap-2 items-center py-1.5 px-2 rounded ${isWeekend ? 'bg-muted/50' : ''}`}
                          >
                            <span className="text-sm">
                              {format(day, 'EEE, MMM d')}
                              {isWeekend && <span className="text-xs text-muted-foreground ml-1">(Weekend)</span>}
                            </span>
                            <Input
                              type="number"
                              step="0.5"
                              min="0"
                              max="24"
                              placeholder="0"
                              className="h-8 text-center text-sm"
                              value={manualEntries[dateKey]?.regularHours || ''}
                              onChange={(e) => {
                                setManualEntries(prev => ({
                                  ...prev,
                                  [dateKey]: {
                                    ...prev[dateKey],
                                    regularHours: e.target.value,
                                    otHours: prev[dateKey]?.otHours || '',
                                  }
                                }));
                              }}
                              data-testid={`input-regular-hours-${dateKey}`}
                            />
                            <Input
                              type="number"
                              step="0.5"
                              min="0"
                              max="24"
                              placeholder="0"
                              className="h-8 text-center text-sm"
                              value={manualEntries[dateKey]?.otHours || ''}
                              onChange={(e) => {
                                setManualEntries(prev => ({
                                  ...prev,
                                  [dateKey]: {
                                    ...prev[dateKey],
                                    regularHours: prev[dateKey]?.regularHours || '',
                                    otHours: e.target.value,
                                  }
                                }));
                              }}
                              data-testid={`input-ot-hours-${dateKey}`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">
                      Total: {Object.values(manualEntries).reduce((sum, e) => sum + (parseFloat(e.regularHours) || 0) + (parseFloat(e.otHours) || 0), 0).toFixed(1)} hrs
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleSaveManualEntries}
                      disabled={isSavingEntries}
                    >
                      {isSavingEntries ? "Saving..." : "Save Entries"}
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTimesheetDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleGenerateTimesheet} 
              disabled={isGenerating || isSavingEntries}
              data-testid="button-download-timesheet"
            >
              {isGenerating ? "Generating..." : "Download Timesheet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="modal-invoice">
          <DialogHeader>
            <DialogTitle>Generate Invoice</DialogTitle>
            <DialogDescription>
              Generate an invoice for your work on this project
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger data-testid="select-invoice-month">
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
                <Label>Year</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger data-testid="select-invoice-year">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleGenerateInvoice} 
              disabled={isGenerating}
              data-testid="button-download-invoice"
            >
              {isGenerating ? "Generating..." : "Download Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) {
          setEditFormData({
            name: "", projectNumber: "", client: "", clientId: "", address: "",
            distributionEmails: "", contractId: "", contractOptionId: "",
            startDate: "", substantialCompletionDate: "", finalCloseoutDate: "",
            budgetAmount: "", baseBudget: "", budgetTrackingMode: "", inheritBillingRates: true,
          });
          setBillingRates([{ ...emptyBillingRate }]);
          setBaseHours([]);
        }
      }}>
        <DialogContent className="max-h-[90vh] flex flex-col overflow-hidden max-w-2xl">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Update project details and settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4 overflow-y-auto flex-1 min-h-0 pr-2">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Project Name *</Label>
                <Input
                  id="edit-name"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  placeholder="Enter project name"
                  data-testid="input-edit-project-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-projectNumber">Project Number *</Label>
                <Input
                  id="edit-projectNumber"
                  value={editFormData.projectNumber}
                  onChange={(e) => setEditFormData({ ...editFormData, projectNumber: e.target.value })}
                  placeholder="e.g., PRJ-001"
                  data-testid="input-edit-project-number"
                />
              </div>
            </div>

            {/* Client Selection */}
            <div className="space-y-2">
              <Label>Client</Label>
              <ClientSelect
                value={editFormData.clientId}
                onValueChange={(clientId: string, clientName?: string) => setEditFormData({ ...editFormData, clientId, client: clientName || "" })}
                companyId={activeCompany?.id || ""}
                data-testid="select-edit-client"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-address">Address</Label>
              <Input
                id="edit-address"
                value={editFormData.address}
                onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                placeholder="Project address"
                data-testid="input-edit-address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-distributionEmails">Distribution Emails</Label>
              <Textarea
                id="edit-distributionEmails"
                value={editFormData.distributionEmails}
                onChange={(e) => setEditFormData({ ...editFormData, distributionEmails: e.target.value })}
                placeholder="email1@example.com, email2@example.com"
                rows={2}
                data-testid="input-edit-distribution-emails"
              />
              <p className="text-xs text-muted-foreground">Comma-separated list of emails for report distribution</p>
            </div>

            {/* Contract Linking */}
            <div className="space-y-2">
              <Label>Link to Contract (Optional)</Label>
              <Select
                value={editFormData.contractId}
                onValueChange={(v) => setEditFormData({ ...editFormData, contractId: v, contractOptionId: "" })}
              >
                <SelectTrigger data-testid="select-edit-contract">
                  <SelectValue placeholder="Select a contract" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No contract</SelectItem>
                  {contracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {contract.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {awardedOptions.length > 0 && (
              <div className="space-y-2">
                <Label>Contract Option</Label>
                <Select
                  value={editFormData.contractOptionId}
                  onValueChange={(v) => setEditFormData({ ...editFormData, contractOptionId: v })}
                >
                  <SelectTrigger data-testid="select-edit-contract-option">
                    <SelectValue placeholder="Select an awarded option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {awardedOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-startDate">Start Date</Label>
                <Input
                  id="edit-startDate"
                  type="date"
                  value={editFormData.startDate}
                  onChange={(e) => setEditFormData({ ...editFormData, startDate: e.target.value })}
                  data-testid="input-edit-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-substantialCompletionDate">Substantial Completion</Label>
                <Input
                  id="edit-substantialCompletionDate"
                  type="date"
                  value={editFormData.substantialCompletionDate}
                  onChange={(e) => setEditFormData({ ...editFormData, substantialCompletionDate: e.target.value })}
                  data-testid="input-edit-substantial-completion"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-finalCloseoutDate">Final Closeout</Label>
                <Input
                  id="edit-finalCloseoutDate"
                  type="date"
                  value={editFormData.finalCloseoutDate}
                  onChange={(e) => setEditFormData({ ...editFormData, finalCloseoutDate: e.target.value })}
                  data-testid="input-edit-final-closeout"
                />
              </div>
            </div>

            {/* Budget */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-budgetAmount">Budget Amount ($)</Label>
                <Input
                  id="edit-budgetAmount"
                  type="number"
                  value={editFormData.budgetAmount}
                  onChange={(e) => setEditFormData({ ...editFormData, budgetAmount: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-edit-budget-amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-baseBudget">Base Budget (Pre-Onboarding)</Label>
                <Input
                  id="edit-baseBudget"
                  type="number"
                  value={editFormData.baseBudget}
                  onChange={(e) => setEditFormData({ ...editFormData, baseBudget: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-edit-base-budget"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Budget Tracking Mode</Label>
              <Select
                value={editFormData.budgetTrackingMode}
                onValueChange={(v) => setEditFormData({ ...editFormData, budgetTrackingMode: v as "" | "daily_reports" | "scheduled" | "hybrid" })}
              >
                <SelectTrigger data-testid="select-edit-budget-mode">
                  <SelectValue placeholder="Inherit from contract" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Inherit from contract</SelectItem>
                  <SelectItem value="daily_reports">Daily Reports</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Billing Rates */}
            {editFormData.contractOptionId && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Inherit Billing Rates from Contract</Label>
                  <Switch
                    checked={editFormData.inheritBillingRates}
                    onCheckedChange={(checked) => setEditFormData({ ...editFormData, inheritBillingRates: checked })}
                    data-testid="switch-inherit-billing-rates"
                  />
                </div>
                {editFormData.inheritBillingRates && inheritedRates.length > 0 && (
                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                    Inheriting {inheritedRates.length} rate(s) from contract option (${calculateBillingTotal(inheritedRates).toLocaleString()} total)
                  </div>
                )}
              </div>
            )}

            {!editFormData.inheritBillingRates && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Project Billing Rates</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addBillingRate}
                    data-testid="button-add-billing-rate"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Rate
                  </Button>
                </div>
                {billingRates.map((rate, idx) => (
                  <Card key={idx} className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">Rate #{idx + 1}</span>
                      {billingRates.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeBillingRate(idx)}
                          className="h-6 w-6"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Title/Role"
                        value={rate.title}
                        onChange={(e) => updateBillingRate(idx, "title", e.target.value)}
                        data-testid={`input-rate-title-${idx}`}
                      />
                      <Input
                        placeholder="Inspector Name"
                        value={rate.inspectorName}
                        onChange={(e) => updateBillingRate(idx, "inspectorName", e.target.value)}
                        data-testid={`input-rate-inspector-${idx}`}
                      />
                      <Input
                        placeholder="Hourly Rate ($)"
                        type="number"
                        value={rate.rate}
                        onChange={(e) => updateBillingRate(idx, "rate", e.target.value)}
                        data-testid={`input-rate-rate-${idx}`}
                      />
                      <Input
                        placeholder="Hours"
                        type="number"
                        value={rate.hours}
                        onChange={(e) => updateBillingRate(idx, "hours", e.target.value)}
                        data-testid={`input-rate-hours-${idx}`}
                      />
                    </div>
                    <div className="mt-2">
                      <Select
                        value={rate.scheduleType}
                        onValueChange={(v) => updateBillingRate(idx, "scheduleType", v)}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fullTime">Full-Time</SelectItem>
                          <SelectItem value="partTime">Part-Time</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </Card>
                ))}
                {billingRates.some(r => r.rate && r.hours) && (
                  <div className="text-right text-sm font-medium">
                    Total: ${calculateBillingTotal(billingRates).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {/* Base Hours Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label className="text-sm font-medium">Base Hours (Pre-Onboarding)</Label>
                  <p className="text-xs text-muted-foreground">Track hours already used before joining this project</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addBaseHoursEntry}
                  data-testid="button-add-base-hours"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Entry
                </Button>
              </div>

              {baseHours.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No base hours entries. Add entries for inspectors who had hours before onboarding.</p>
              ) : (
                <div className="space-y-3">
                  {baseHours.map((entry, idx) => (
                    <Card key={idx} className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground">Entry #{idx + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeBaseHoursEntry(idx)}
                          className="h-6 w-6"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <Input
                            placeholder="Inspector Name"
                            value={entry.inspectorName}
                            onChange={(e) => updateBaseHoursEntry(idx, "inspectorName", e.target.value)}
                            data-testid={`input-base-inspector-${idx}`}
                          />
                        </div>
                        <Input
                          placeholder="Regular Hours"
                          type="number"
                          value={entry.regularHours}
                          onChange={(e) => updateBaseHoursEntry(idx, "regularHours", e.target.value)}
                          data-testid={`input-base-regular-${idx}`}
                        />
                        <Input
                          placeholder="OT Hours"
                          type="number"
                          value={entry.overtimeHours}
                          onChange={(e) => updateBaseHoursEntry(idx, "overtimeHours", e.target.value)}
                          data-testid={`input-base-overtime-${idx}`}
                        />
                        <div className="col-span-2">
                          <Input
                            placeholder="Already Billed ($)"
                            type="number"
                            value={entry.billedAmount}
                            onChange={(e) => updateBaseHoursEntry(idx, "billedAmount", e.target.value)}
                            data-testid={`input-base-billed-${idx}`}
                          />
                        </div>
                      </div>
                    </Card>
                  ))}
                  
                  {baseHours.some(e => e.inspectorName && (parseFloat(e.regularHours) > 0 || parseFloat(e.overtimeHours) > 0)) && (
                    <div className="text-right text-sm font-medium">
                      {(() => {
                        const totals = calculateBaseHoursTotal();
                        return (
                          <span>
                            Total: {totals.totalRegular.toFixed(1)} reg + {totals.totalOvertime.toFixed(1)} OT hrs
                            {totals.totalBilled > 0 && ` | $${totals.totalBilled.toLocaleString()} billed`}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex-shrink-0 pt-4">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (id) {
                  updateProjectMutation.mutate({ ...editFormData, id, billingRates, baseHours });
                }
              }}
              disabled={!editFormData.name.trim() || !editFormData.projectNumber.trim() || updateProjectMutation.isPending}
              data-testid="button-save-project"
            >
              {updateProjectMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
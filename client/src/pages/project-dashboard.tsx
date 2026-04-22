import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { PageLayout } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
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
  History,
  MessageSquare,
  Send,
  X,
  FolderOpen,
} from "lucide-react";
import { format } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { parseDateSafe } from "@/lib/timezone";
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
import { DailyReportDialog } from "@/components/reports/daily-report-dialog";
import { PhotoLightbox } from "@/components/photo-lightbox";

type ProjectDashboardData = {
  hasAdminAccess: boolean;
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
      baseHours?: {
        total: number;
        regular: number;
        overtime: number;
        billedAmount: number;
        entryCount: number;
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

// Comment types for the comments section
type ProjectComment = {
  id: string;
  projectId: string;
  companyId: string;
  authorId: string;
  content: string;
  mentions: string[];
  createdAt: string;
  author: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    profileImageUrl: string | null;
  };
};

type TeamMember = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string;
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
  const { user, isAdmin, isCompanyAdmin, isEffectiveSystemAdmin, isEffectiveCompanyAdmin, activeCompany } = useAuth();
  const [isEmailPending, setIsEmailPending] = useState(false);
  
  // Inspector action dialogs
  const [timesheetDialogOpen, setTimesheetDialogOpen] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [dailyReportDialogOpen, setDailyReportDialogOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [isGenerating, setIsGenerating] = useState(false);
  const [timesheetMode, setTimesheetMode] = useState<'daily_reports' | 'manual'>('daily_reports');
  const [manualEntries, setManualEntries] = useState<Record<string, { regularHours: string; otHours: string; inspectorName?: string }>>({});
  const [manualEntryInspectorName, setManualEntryInspectorName] = useState<string>('');
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
    budgetedHours: "",
    baseBudget: "",
    budgetTrackingMode: "" as "" | "daily_reports" | "scheduled" | "hybrid",
    inheritBillingRates: true,
  });
  const [billingRates, setBillingRates] = useState<BillingRateEntry[]>([{ ...emptyBillingRate }]);
  const [baseHours, setBaseHours] = useState<BaseHoursEntry[]>([]);
  
  // Comments state
  const [newComment, setNewComment] = useState("");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  
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
      const entriesMap: Record<string, { regularHours: string; otHours: string; inspectorName?: string }> = {};
      let foundName = '';
      existingManualEntries.forEach((entry: any) => {
        const dateKey = format(parseDateSafe(entry.date), 'yyyy-MM-dd');
        entriesMap[dateKey] = {
          regularHours: entry.regularHours || '',
          otHours: entry.otHours || '',
          inspectorName: entry.inspectorName || '',
        };
        // Use the first found inspector name
        if (!foundName && entry.inspectorName) {
          foundName = entry.inspectorName;
        }
      });
      setManualEntries(entriesMap);
      // Set the inspector name from existing entries if we found one
      if (foundName) {
        setManualEntryInspectorName(foundName);
      }
    }
  }, [existingManualEntries]);

  // Reset manual entries when month/year changes
  useEffect(() => {
    setManualEntries({});
    setManualEntryInspectorName('');
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

  // Fetch comments for the project
  const { data: comments = [], isLoading: isCommentsLoading, isError: isCommentsError, refetch: refetchComments } = useQuery<ProjectComment[]>({
    queryKey: ['/api/projects', id, 'comments'],
    enabled: !!id,
  });

  // Fetch team members for @mentions
  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ['/api/projects', id, 'team-members'],
    enabled: !!id,
  });

  // Fetch inspector's own timesheets for this project
  const { data: myTimesheets = [], refetch: refetchMyTimesheets } = useQuery<{
    id: string;
    month: number;
    year: number;
    status: string;
    totalRegularHours: string | null;
    totalOvertimeHours: string | null;
    totalPremiumHours: string | null;
  }[]>({
    queryKey: ['/api/timesheets/my', id],
    queryFn: async () => {
      const res = await fetch(`/api/timesheets/my?projectId=${id}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });

  // Mutation to submit a timesheet for review
  const submitTimesheetMutation = useMutation({
    mutationFn: async (timesheetId: string) => {
      const res = await apiRequest('PATCH', `/api/timesheets/${timesheetId}`, { status: 'submitted' });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/timesheets/my', id] });
      refetchMyTimesheets();
      toast({ title: "Timesheet Submitted", description: "Your timesheet has been submitted for admin review." });
    },
    onError: (err: any) => {
      toast({ title: "Submission Failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async (data: { content: string; mentions: string[] }) => {
      return apiRequest("POST", `/api/projects/${id}/comments`, data);
    },
    onSuccess: () => {
      setNewComment("");
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'comments'] });
      toast({ title: "Comment added", description: "Your comment has been posted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add comment", variant: "destructive" });
    },
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return apiRequest("DELETE", `/api/projects/${id}/comments/${commentId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'comments'] });
      toast({ title: "Comment deleted", description: "Your comment has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete comment", variant: "destructive" });
    },
  });

  // Helper to parse @mentions from comment content
  const parseMentions = (content: string): string[] => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[2]); // Push user ID
    }
    return mentions;
  };

  // Helper to render comment content with highlighted mentions
  const renderCommentContent = (content: string) => {
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
        <span key={key++} className="bg-primary/10 text-primary rounded px-1 font-medium">
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

  // Handle @mention insertion
  const handleMentionSelect = (member: TeamMember) => {
    const name = [member.firstName, member.lastName].filter(Boolean).join(' ') || 'Unknown';
    const mentionText = `@[${name}](${member.id}) `;
    
    // Find where to insert - replace the @filter text
    const lastAtIndex = newComment.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      setNewComment(newComment.substring(0, lastAtIndex) + mentionText);
    } else {
      setNewComment(newComment + mentionText);
    }
    setShowMentions(false);
    setMentionFilter("");
  };

  // Handle comment input change with @mention detection
  const handleCommentChange = (value: string) => {
    setNewComment(value);
    
    // Check for @ trigger
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = value.substring(lastAtIndex + 1);
      // Show mentions if we're right after @ or typing a filter
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

  // Filter team members for mentions dropdown
  const filteredMembers = teamMembers.filter(member => {
    const name = [member.firstName, member.lastName].filter(Boolean).join(' ').toLowerCase();
    return name.includes(mentionFilter);
  });

  // Handle submit comment
  const handleSubmitComment = () => {
    if (!newComment.trim()) return;
    const mentions = parseMentions(newComment);
    addCommentMutation.mutate({ content: newComment.trim(), mentions });
  };

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

  // Find billing rate for an inspector by name (case-insensitive exact match)
  const findInspectorRate = (inspectorName: string): { rate: number; matchedName: string } | null => {
    if (!inspectorName) return null;
    const normalizedInput = inspectorName.toLowerCase().trim();
    
    // Exact match only (case-insensitive)
    const matchingRate = billingRates.find(r => 
      r.inspectorName?.toLowerCase().trim() === normalizedInput
    );
    
    if (!matchingRate) return null;
    const rate = parseFloat(matchingRate.rate);
    return rate > 0 ? { rate, matchedName: matchingRate.inspectorName || '' } : null;
  };
  
  // Get list of inspector names from billing rates for suggestions
  const billingRateInspectors = billingRates
    .filter(r => r.inspectorName && r.inspectorName.trim())
    .map(r => r.inspectorName);

  const updateBaseHoursEntry = (index: number, field: keyof BaseHoursEntry, value: string) => {
    setBaseHours(baseHours.map((entry, i) => {
      if (i !== index) return entry;
      
      const updatedEntry = { ...entry, [field]: value };
      
      // Auto-calculate hours when billed amount OR inspector name changes
      // ONLY if both hour fields are currently empty
      if (field === "billedAmount" || field === "inspectorName") {
        const currentHours = parseFloat(entry.regularHours) || 0;
        const currentOT = parseFloat(entry.overtimeHours) || 0;
        const hoursAreEmpty = currentHours === 0 && currentOT === 0;
        
        if (hoursAreEmpty) {
          const rateInfo = findInspectorRate(updatedEntry.inspectorName);
          const billedAmount = parseFloat(updatedEntry.billedAmount) || 0;
          
          if (rateInfo && billedAmount > 0) {
            const calculatedHours = billedAmount / rateInfo.rate;
            updatedEntry.regularHours = calculatedHours.toFixed(1);
          }
        }
      }
      
      return updatedEntry;
    }));
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
        budgetedHours: fullProjectData.budgetedHours?.toString() || "",
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
          inspectorName: manualEntryInspectorName || null,
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
            inspectorName: manualEntryInspectorName || null,
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
      
      const warningHeader = response.headers.get("X-Timesheet-Hours-Warning");
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

      if (warningHeader) {
        try {
          const w = JSON.parse(warningHeader);
          toast({
            title: "Hours Changed on Approved Timesheet",
            description: `The approved record had ${w.oldReg}h reg / ${w.oldOT}h OT / ${w.oldPrm}h premium. The regenerated PDF now shows ${w.newReg}h reg / ${w.newOT}h OT / ${w.newPrm}h premium.`,
            variant: "destructive",
            duration: 10000,
          });
        } catch (_) {}
      }

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

  const { hasAdminAccess, project, schedule, hours, dailyReports, activityTimeline, photoGallery, issuesSummary, safetySummary, weatherSummary, teamOverview, upcomingMilestones, forecast } = data;

  return (
    <PageLayout title={project.name}>
      <div className="space-y-6 w-full overflow-x-hidden">
        <PageHeader
          icon={FolderOpen}
          title={project.name}
          subtitle={`#${project.projectNumber}${project.client ? ` • ${project.client}` : ''}`}
        >
          <Button
            variant="outline"
            size="sm"
            className=""
            asChild
          >
            <Link href="/my-projects">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Link>
          </Button>
          <Button
            size="sm"
            className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold shadow-sm"
            onClick={() => setDailyReportDialogOpen(true)}
            data-testid="button-new-daily-report-header"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Daily Report
          </Button>
          {isEffectiveCompanyAdmin && (
            <Button
              variant="outline"
              size="sm"
              className=""
              onClick={openEditDialog}
              data-testid="button-edit-project"
            >
              <Pencil className="w-4 h-4 mr-2" />
              Edit
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
        </PageHeader>

        {project.address && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground -mt-4">
            <MapPin className="w-3 h-3" />
            {project.address}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {/* Column 1: Schedule, Hours, Daily Reports, Weather */}
          <div className="space-y-4">
            <Card data-testid="card-schedule-progress">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Schedule Progress</CardTitle>
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {hours.budgeted > 0 ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold">{Math.round(hours.progress)}%</span>
                        <Badge variant={hours.status === 'on_track' || hours.status === 'under' ? 'success' : hours.status === 'warning' ? 'warning' : hours.status === 'over' ? 'destructive' : 'muted'}>
                          {hours.status === 'under' ? 'under budget' : hours.status === 'over' ? 'over budget' : hours.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <Progress value={Math.min(hours.progress, 100)} className={hours.status === 'over' ? '[&>div]:bg-red-500' : hours.status === 'warning' ? '[&>div]:bg-yellow-500' : ''} />
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{hours.used.toFixed(1)} hrs used</span>
                        <span>{hours.budgeted.toFixed(1)} hrs budgeted</span>
                      </div>
                      <div className="text-sm">
                        <span className={`font-medium ${hours.remaining > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {hours.remaining.toFixed(1)}
                        </span>{' '}
                        hours remaining
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold">{Math.round(schedule.progress)}%</span>
                        <Badge variant={schedule.status === 'on_track' || schedule.status === 'complete' ? 'success' : schedule.status === 'warning' ? 'warning' : schedule.status === 'overdue' ? 'destructive' : 'muted'}>
                          {schedule.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <Progress value={schedule.progress} className={getScheduleStatusColor(schedule.status)} />
                    </>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    {schedule.startDate && (
                      <div>
                        <span className="font-medium">Start:</span>{' '}
                        {format(parseDateSafe(schedule.startDate), 'MMM d, yyyy')}
                      </div>
                    )}
                    {schedule.endDate && (
                      <div>
                        <span className="font-medium">End:</span>{' '}
                        {format(parseDateSafe(schedule.endDate), 'MMM d, yyyy')}
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

            {hasAdminAccess && hours.budgeted > 0 && (
              <Card data-testid="card-hours-breakdown">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Hours Breakdown</CardTitle>
                  <Clock className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {hours.sources?.dailyReports && hours.sources.dailyReports.total > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">Daily Reports</span>
                          <span className="font-bold">{hours.sources.dailyReports.total.toFixed(1)} hrs</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground pl-3">
                          <span>Reg: {hours.sources.dailyReports.regular.toFixed(1)}</span>
                          <span>OT: {hours.sources.dailyReports.overtime.toFixed(1)}</span>
                          {hours.sources.dailyReports.premium > 0 && (
                            <span>Premium: {hours.sources.dailyReports.premium.toFixed(1)}</span>
                          )}
                        </div>
                      </div>
                    )}
                    {hours.sources?.manualEntries && hours.sources.manualEntries.total > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">Manual Entries</span>
                          <span className="font-bold">{hours.sources.manualEntries.total.toFixed(1)} hrs</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground pl-3">
                          <span>Reg: {hours.sources.manualEntries.regular.toFixed(1)}</span>
                          <span>OT: {hours.sources.manualEntries.overtime.toFixed(1)}</span>
                        </div>
                      </div>
                    )}
                    {hours.sources?.baseHours && hours.sources.baseHours.total > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">Base Hours</span>
                          <span className="font-bold">{hours.sources.baseHours.total.toFixed(1)} hrs</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground pl-3">
                          <span>Reg: {hours.sources.baseHours.regular.toFixed(1)}</span>
                          <span>OT: {hours.sources.baseHours.overtime.toFixed(1)}</span>
                        </div>
                      </div>
                    )}
                    <div className="border-t pt-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">Total</span>
                        <span className="font-bold">{hours.used.toFixed(1)} hrs</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground pl-3">
                        <span>Reg: {hours.breakdown.regular.toFixed(1)}</span>
                        <span>OT: {hours.breakdown.overtime.toFixed(1)}</span>
                        {hours.breakdown.premium > 0 && (
                          <span>Premium: {hours.breakdown.premium.toFixed(1)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card data-testid="card-daily-reports">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Daily Reports</CardTitle>
                <FileText className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-2">{dailyReports.length}</div>
                <div className="text-sm text-muted-foreground mb-3">Total reports submitted</div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {dailyReports.slice(0, 5).map((report) => (
                    <Link
                      key={report.id}
                      href={`/reports/${report.id}`}
                      className="flex items-center justify-between text-xs p-2 bg-muted rounded hover-elevate cursor-pointer"
                    >
                      <span>{format(parseDateSafe(report.date), 'MMM d, yyyy')}</span>
                      <div className="flex items-center gap-2">
                        {getWeatherIcon(report.weatherType)}
                        <Badge variant="outline" className="text-xs">
                          {parseFloat(report.regularHours || '0').toFixed(1)} hrs
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
                {dailyReports.length > 0 && (
                  <Link href={`/project/${project.id}/daily-reports`}>
                    <Button variant="outline" size="sm" className="w-full mt-3 gap-2" data-testid="button-view-all-daily-reports">
                      <FileText className="w-4 h-4" />
                      View All Daily Reports
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>

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

          {/* Column 2: Project Reports, Inspector Actions, Milestones, Team */}
          <div className="space-y-4">
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
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => setDailyReportDialogOpen(true)}
                    data-testid="button-new-daily-report"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    New Daily Report
                  </Button>
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

            {myTimesheets.length > 0 && (
              <Card data-testid="card-my-timesheets">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">My Timesheets</CardTitle>
                  <ClipboardList className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {myTimesheets.map((ts) => {
                      const monthLabel = months.find(m => m.value === String(ts.month))?.label ?? String(ts.month);
                      const totalHours = (
                        parseFloat(ts.totalRegularHours || '0') +
                        parseFloat(ts.totalOvertimeHours || '0') +
                        parseFloat(ts.totalPremiumHours || '0')
                      ).toFixed(1);
                      return (
                        <div
                          key={ts.id}
                          className="p-2 bg-muted rounded text-sm"
                          data-testid={`row-timesheet-${ts.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">{monthLabel} {ts.year}</div>
                              <div className="text-xs text-muted-foreground">{totalHours} hrs</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={ts.status === 'approved' ? 'success' : ts.status === 'submitted' ? 'warning' : 'secondary'}
                                className="capitalize text-xs"
                                data-testid={`status-timesheet-${ts.id}`}
                              >
                                {ts.status}
                              </Badge>
                              {ts.status === 'draft' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  disabled={submitTimesheetMutation.isPending}
                                  onClick={() => submitTimesheetMutation.mutate(ts.id)}
                                  data-testid={`button-submit-timesheet-${ts.id}`}
                                >
                                  <Send className="w-3 h-3 mr-1" />
                                  Submit for Review
                                </Button>
                              )}
                            </div>
                          </div>
                          {ts.status === 'draft' && ts.adminNote && (
                            <div
                              className="mt-1.5 text-xs bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1"
                              data-testid={`note-timesheet-${ts.id}`}
                            >
                              <span className="font-medium text-amber-700 dark:text-amber-400">Admin note: </span>
                              <span className="text-amber-800 dark:text-amber-300">{ts.adminNote}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

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
          </div>

          {/* Column 3: Recent Activity, Issues, Safety, Photos */}
          <div className="space-y-4">
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
                            {format(parseDateSafe(activity.date), 'MMM d, yyyy h:mm a')}
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
                            {format(parseDateSafe(issue.date), 'MMM d, yyyy')}
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
                            {format(parseDateSafe(incident.date), 'MMM d, yyyy')}
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

            {photoGallery.length > 0 && (
              <Card data-testid="card-photos">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Recent Photos ({photoGallery.length})</CardTitle>
                  <Image className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2">
                    {(showAllPhotos ? photoGallery : photoGallery.slice(0, 12)).map((photo) => (
                      <div
                        key={photo.id}
                        className="aspect-square bg-muted rounded-md overflow-hidden cursor-pointer"
                        onClick={() => {
                          const fullIndex = photoGallery.findIndex(p => p.id === photo.id);
                          setLightboxIndex(fullIndex >= 0 ? fullIndex : 0);
                          setLightboxOpen(true);
                        }}
                        data-testid={`photo-thumb-${photo.id}`}
                      >
                        <img
                          src={photo.path}
                          alt={photo.caption || 'Project photo'}
                          className="w-full h-full object-cover transition-transform hover:scale-105"
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                  {photoGallery.length > 12 && !showAllPhotos && (
                    <Button
                      variant="outline"
                      className="w-full mt-3"
                      onClick={() => setShowAllPhotos(true)}
                      data-testid="button-view-all-photos"
                    >
                      View All {photoGallery.length} Photos
                    </Button>
                  )}
                  {showAllPhotos && photoGallery.length > 12 && (
                    <Button
                      variant="ghost"
                      className="w-full mt-3"
                      onClick={() => setShowAllPhotos(false)}
                      data-testid="button-show-fewer-photos"
                    >
                      Show Fewer
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
            <PhotoLightbox
              photos={photoGallery}
              initialIndex={lightboxIndex}
              open={lightboxOpen}
              onOpenChange={setLightboxOpen}
            />
          </div>
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

        {/* Project Comments Section */}
        <Card data-testid="card-project-comments">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Comments</CardTitle>
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="mb-4 relative">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Textarea
                    placeholder="Leave a comment... Type @ to mention team members"
                    value={newComment}
                    onChange={(e) => handleCommentChange(e.target.value)}
                    className="min-h-[80px] resize-none"
                    data-testid="input-comment"
                  />
                  {showMentions && filteredMembers.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-1 w-full max-w-xs bg-popover border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {filteredMembers.map((member) => (
                        <button
                          key={member.id}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
                          onClick={() => handleMentionSelect(member)}
                          data-testid={`mention-option-${member.id}`}
                        >
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                            {(member.firstName?.[0] || '').toUpperCase()}{(member.lastName?.[0] || '').toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium">
                              {[member.firstName, member.lastName].filter(Boolean).join(' ') || 'Unknown'}
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
                  onClick={handleSubmitComment}
                  disabled={!newComment.trim() || addCommentMutation.isPending}
                  data-testid="button-submit-comment"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {isCommentsLoading ? (
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
            ) : isCommentsError ? (
              <p className="text-sm text-destructive text-center py-4">
                Failed to load comments. Please try again later.
              </p>
            ) : comments.length > 0 ? (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="p-3 bg-muted rounded-md"
                    data-testid={`comment-${comment.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium flex-shrink-0">
                          {comment.author.profileImageUrl ? (
                            <img
                              src={comment.author.profileImageUrl}
                              alt="Avatar"
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <>
                              {comment.author.firstName || comment.author.lastName ? (
                                <>
                                  {(comment.author.firstName?.[0] || '').toUpperCase()}
                                  {(comment.author.lastName?.[0] || '').toUpperCase()}
                                </>
                              ) : (
                                (comment.author.email?.[0] || '?').toUpperCase()
                              )}
                            </>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">
                              {[comment.author.firstName, comment.author.lastName].filter(Boolean).join(' ') || comment.author.email?.split('@')[0] || 'Unknown User'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(parseDateSafe(comment.createdAt), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                          <p className="text-sm mt-1 whitespace-pre-wrap break-words">
                            {renderCommentContent(comment.content)}
                          </p>
                        </div>
                      </div>
                      {(comment.authorId === user?.id || isEffectiveCompanyAdmin) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0 h-6 w-6"
                          onClick={() => deleteCommentMutation.mutate(comment.id)}
                          disabled={deleteCommentMutation.isPending}
                          data-testid={`button-delete-comment-${comment.id}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No comments yet. Be the first to leave a comment!
              </p>
            )}
          </CardContent>
        </Card>
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
                  <div className="space-y-2">
                    <Label htmlFor="inspectorName">Inspector Name (for timesheet)</Label>
                    <Input
                      id="inspectorName"
                      placeholder="Enter name to appear on timesheet"
                      value={manualEntryInspectorName}
                      onChange={(e) => setManualEntryInspectorName(e.target.value)}
                      data-testid="input-inspector-name"
                    />
                  </div>
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
            budgetAmount: "", budgetedHours: "", baseBudget: "", budgetTrackingMode: "", inheritBillingRates: true,
          });
          setBillingRates([{ ...emptyBillingRate }]);
          setBaseHours([]);
        }
      }}>
        <DialogContent className="max-h-[90vh] max-w-2xl p-0">
          <div className="flex flex-col max-h-[90vh]">
          <DialogHeader className="flex-shrink-0 p-6 pb-0">
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Update project details and settings</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 pt-4">
            <div className="space-y-4">
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
                value={editFormData.contractId || "_none"}
                onValueChange={(v) => setEditFormData({ ...editFormData, contractId: v === "_none" ? "" : v, contractOptionId: "" })}
              >
                <SelectTrigger data-testid="select-edit-contract">
                  <SelectValue placeholder="Select a contract" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No contract</SelectItem>
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
                  value={editFormData.contractOptionId || "_none"}
                  onValueChange={(v) => setEditFormData({ ...editFormData, contractOptionId: v === "_none" ? "" : v })}
                >
                  <SelectTrigger data-testid="select-edit-contract-option">
                    <SelectValue placeholder="Select an awarded option" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
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
                <Label htmlFor="edit-budgetedHours">Budgeted Hours</Label>
                <Input
                  id="edit-budgetedHours"
                  type="number"
                  step="0.5"
                  value={editFormData.budgetedHours}
                  onChange={(e) => setEditFormData({ ...editFormData, budgetedHours: e.target.value })}
                  placeholder="0"
                  data-testid="input-edit-budgeted-hours"
                />
                <p className="text-xs text-muted-foreground">Total hours allocated for this project</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Budget Tracking Mode</Label>
              <Select
                value={editFormData.budgetTrackingMode || "_inherit"}
                onValueChange={(v) => setEditFormData({ ...editFormData, budgetTrackingMode: (v === "_inherit" ? "" : v) as "" | "daily_reports" | "scheduled" | "hybrid" })}
              >
                <SelectTrigger data-testid="select-edit-budget-mode">
                  <SelectValue placeholder="Inherit from contract" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_inherit">Inherit from contract</SelectItem>
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

            {/* Pre-Onboarding Data Section */}
            <div className="space-y-4 pt-2 border-t">
              <div>
                <Label className="text-sm font-medium">Pre-Onboarding Data</Label>
                <p className="text-xs text-muted-foreground">Track hours and amounts from before this project was onboarded</p>
              </div>
              
              {/* Pre-Billed Amount */}
              <div className="space-y-2">
                <Label htmlFor="edit-baseBudget" className="text-xs">Pre-Billed Amount ($)</Label>
                <Input
                  id="edit-baseBudget"
                  type="number"
                  value={editFormData.baseBudget}
                  onChange={(e) => setEditFormData({ ...editFormData, baseBudget: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-edit-base-budget"
                />
                <p className="text-xs text-muted-foreground">Dollar amount already billed before onboarding</p>
              </div>
              
              {/* Base Hours Per Inspector */}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label className="text-xs font-medium">Base Hours by Inspector</Label>
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
                          {billingRates.some(r => r.inspectorName?.trim()) ? (
                            <Select
                              value={entry.inspectorName}
                              onValueChange={(value) => updateBaseHoursEntry(idx, "inspectorName", value)}
                            >
                              <SelectTrigger data-testid={`select-base-inspector-${idx}`}>
                                <SelectValue placeholder="Select inspector from billing rates" />
                              </SelectTrigger>
                              <SelectContent>
                                {billingRates
                                  .filter(r => r.inspectorName?.trim())
                                  .map((rate, i) => (
                                    <SelectItem key={`${rate.inspectorName}-${rate.rate}-${i}`} value={rate.inspectorName || ''}>
                                      {rate.inspectorName} (${rate.rate}/hr)
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              placeholder="Inspector Name (add billing rates first)"
                              value={entry.inspectorName}
                              onChange={(e) => updateBaseHoursEntry(idx, "inspectorName", e.target.value)}
                              data-testid={`input-base-inspector-${idx}`}
                            />
                          )}
                          {entry.inspectorName && (
                            <div className="text-xs mt-1">
                              {(() => {
                                const rateInfo = findInspectorRate(entry.inspectorName);
                                if (rateInfo) {
                                  return <span className="text-green-600 dark:text-green-400">Rate: ${rateInfo.rate}/hr</span>;
                                }
                                return <span className="text-muted-foreground">No rate found for this inspector</span>;
                              })()}
                            </div>
                          )}
                        </div>
                        <div className="col-span-2">
                          <Input
                            placeholder="Already Billed ($)"
                            type="number"
                            value={entry.billedAmount}
                            onChange={(e) => updateBaseHoursEntry(idx, "billedAmount", e.target.value)}
                            data-testid={`input-base-billed-${idx}`}
                          />
                          {entry.billedAmount && parseFloat(entry.billedAmount) > 0 && (
                            <div className="text-xs mt-1">
                              {(() => {
                                const rateInfo = findInspectorRate(entry.inspectorName);
                                const billedAmount = parseFloat(entry.billedAmount) || 0;
                                if (rateInfo) {
                                  const hours = billedAmount / rateInfo.rate;
                                  const currentHours = parseFloat(entry.regularHours) || 0;
                                  const isDifferent = Math.abs(currentHours - hours) > 0.1;
                                  return (
                                    <div className="space-y-1">
                                      <span className="text-muted-foreground">
                                        ${billedAmount.toLocaleString()} ÷ ${rateInfo.rate}/hr = <span className="font-medium text-foreground">{hours.toFixed(1)} hrs</span>
                                      </span>
                                      {isDifferent && (
                                        <div className="flex items-center gap-2 p-1 bg-amber-50 dark:bg-amber-950 rounded border border-amber-200 dark:border-amber-800">
                                          <span className="text-amber-700 dark:text-amber-300 flex-1">Hours differ from calculation</span>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              setBaseHours(baseHours.map((e, i) => 
                                                i === idx ? { ...e, regularHours: hours.toFixed(1), overtimeHours: "0" } : e
                                              ));
                                            }}
                                            data-testid={`button-recalc-hours-${idx}`}
                                          >
                                            Apply Calculated
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                                return <span className="text-amber-600 dark:text-amber-400">Select inspector from billing rates for auto-calculation</span>;
                              })()}
                            </div>
                          )}
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
          </div>
          <DialogFooter className="flex-shrink-0 p-6 pt-4 border-t">
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Daily Report Dialog */}
      <DailyReportDialog
        open={dailyReportDialogOpen}
        onOpenChange={setDailyReportDialogOpen}
        project={project}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "dashboard"] });
        }}
      />
    </PageLayout>
  );
}
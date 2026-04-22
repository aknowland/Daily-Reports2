import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { InspectorSelector } from "@/components/inspector-selector";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Plus,
  Trash2,
  Edit,
  Calendar,
  DollarSign,
  Building2,
  Clock,
  List,
  CalendarDays,
  Paperclip,
  Upload,
  X,
  Download,
  ArrowRightCircle,
  RefreshCw,
  MoreHorizontal,
  LayoutDashboard,
  ArrowLeft,
  Search,
  ChevronLeft,
  ChevronRight,

  Mail,
  FolderPlus,
  Loader2,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useRef } from "react";
import type { ContractWithProjects, Project, Client, ContractAttachment, ProposalWithDetails } from "@shared/schema";
import { ProposalDialog } from "@/components/proposal-dialog";
import { ContractStatusLegend } from "@/components/contract-status-legend";
import { ImportFromEmailDialog } from "@/components/import-from-email-dialog";
import { ClientSelect } from "@/components/client-select";
import { PurchaseOrderSelect } from "@/components/purchase-order-select";
import { format, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { calculateTotalHours, calculateWorkingDays, formatHoursDisplay, getHolidaysInRange } from "@/lib/working-days-calculator";
import { Users, Info, Eye } from "lucide-react";
import { parseDateSafe } from "@/lib/timezone";

type ContractInspectorEntry = {
  title: string;
  inspectorName: string;
  rate: string;
  hours: string;
  scheduleType: "fullTime" | "partTime";
};

type ContractOptionEntry = {
  name: string;
  inspectors: ContractInspectorEntry[];
  awardStatus?: "pending" | "awarded" | "not_awarded";
};

const emptyContractInspector: ContractInspectorEntry = {
  title: "",
  inspectorName: "",
  rate: "",
  hours: "",
  scheduleType: "fullTime",
};

const emptyContractOption: ContractOptionEntry = {
  name: "",
  inspectors: [{ ...emptyContractInspector }],
  awardStatus: "pending",
};

const CONTRACT_STATUS_OPTIONS = [
  { value: "bid_release", label: "Bid Release", variant: "info" as const },
  { value: "bid_received", label: "Bid Received", variant: "info" as const },
  { value: "under_review", label: "Under Review", variant: "warning" as const },
  { value: "awarded", label: "Awarded", variant: "success" as const },
  { value: "not_awarded", label: "Not Awarded", variant: "destructive" as const },
  { value: "cancelled", label: "Cancelled", variant: "muted" as const },
  { value: "in_execution", label: "In Execution", variant: "success" as const },
  { value: "substantial_completion", label: "Substantial Completion", variant: "info" as const },
  { value: "final_closeout", label: "Final Closeout", variant: "muted" as const },
];

const CONTRACT_TYPE_OPTIONS = [
  { value: "lump_sum", label: "Lump Sum" },
  { value: "time_and_materials", label: "Time & Materials" },
  { value: "unit_price", label: "Unit Price" },
  { value: "cost_plus", label: "Cost Plus" },
  { value: "design_build", label: "Design Build" },
  { value: "hourly_rate", label: "Hourly Rate" },
  { value: "other", label: "Other" },
];

type BudgetTrackingMode = "daily_reports" | "scheduled" | "hybrid";

const BUDGET_TRACKING_MODE_OPTIONS = [
  { value: "daily_reports", label: "Daily Reports", description: "Track based on actual logged hours" },
  { value: "scheduled", label: "Scheduled Hours", description: "Track based on rate schedule (FT/PT hours × days)" },
  { value: "hybrid", label: "Hybrid", description: "Show both scheduled and actual side-by-side" },
];

type ContractFormData = {
  contractNumber: string;
  name: string;
  description: string;
  clientId: string;
  purchaseOrderId: string;
  contractType: string;
  status: string;
  originalValue: string;
  currentValue: string;
  budgetedHours: string;
  bidReleaseDate: string;
  bidDueDate: string;
  awardDate: string;
  startDate: string;
  substantialCompletionDate: string;
  finalCloseoutDate: string;
  regularRate: string;
  overtimeRate: string;
  premiumRate: string;
  budgetTrackingMode: BudgetTrackingMode;
  notes: string;
  // Extended fields
  agency: string;
  serviceType: string;
  questionDeadline: string;
  hasJobWalk: boolean;
  jobWalkDateTime: string;
  dsaClass: string;
  addendumCount: string;
  lastAddendumDate: string;
  assignedToUserId: string;
  sharepointFolderUrl: string;
};

const emptyFormData: ContractFormData = {
  contractNumber: "",
  name: "",
  description: "",
  clientId: "",
  purchaseOrderId: "",
  contractType: "lump_sum",
  status: "bid_release",
  originalValue: "",
  currentValue: "",
  budgetedHours: "",
  bidReleaseDate: "",
  bidDueDate: "",
  awardDate: "",
  startDate: "",
  substantialCompletionDate: "",
  finalCloseoutDate: "",
  regularRate: "",
  overtimeRate: "",
  premiumRate: "",
  budgetTrackingMode: "daily_reports",
  notes: "",
  agency: "",
  serviceType: "",
  questionDeadline: "",
  hasJobWalk: false,
  jobWalkDateTime: "",
  dsaClass: "",
  addendumCount: "",
  lastAddendumDate: "",
  assignedToUserId: "",
  sharepointFolderUrl: "",
};

export default function ContractsPage() {
  const { toast } = useToast();
  const { activeCompany, isCompanyAdmin, isEffectiveCompanyAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showImportFromEmailDialog, setShowImportFromEmailDialog] = useState(false);
  const [contractToDelete, setContractToDelete] = useState<ContractWithProjects | null>(null);
  const [contractForNewProject, setContractForNewProject] = useState<ContractWithProjects | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectNumber, setNewProjectNumber] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [editingContract, setEditingContract] = useState<ContractWithProjects | null>(null);
  const [formData, setFormData] = useState<ContractFormData>(emptyFormData);
  const [activeTab, setActiveTab] = useState("list");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("");
  const [assignedUserFilter, setAssignedUserFilter] = useState<string>("all");
  const [dueBefore, setDueBefore] = useState<string>("");
  const [dueAfter, setDueAfter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [archivedSearchQuery, setArchivedSearchQuery] = useState("");
  const [proposalSearchQuery, setProposalSearchQuery] = useState("");
  // Pagination state
  const [contractsDisplayCount, setContractsDisplayCount] = useState(10);
  const [archivedDisplayCount, setArchivedDisplayCount] = useState(10);
  const [proposalsDisplayCount, setProposalsDisplayCount] = useState(10);
  
  // Reset pagination when search/filter changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setContractsDisplayCount(10);
  };
  const handleArchivedSearchChange = (value: string) => {
    setArchivedSearchQuery(value);
    setArchivedDisplayCount(10);
  };
  const handleProposalSearchChange = (value: string) => {
    setProposalSearchQuery(value);
    setProposalsDisplayCount(10);
  };
  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setContractsDisplayCount(10);
  };
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showProposalDialog, setShowProposalDialog] = useState(false);
  const [editingProposal, setEditingProposal] = useState<ProposalWithDetails | null>(null);
  const [convertingProposal, setConvertingProposal] = useState<ProposalWithDetails | null>(null);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [createProjectAfterContract, setCreateProjectAfterContract] = useState(true);
  const [isConverting, setIsConverting] = useState(false);
  const [addToExistingContract, setAddToExistingContract] = useState(false);
  const [selectedExistingContractId, setSelectedExistingContractId] = useState<string>("");
  const [showCreatePOPrompt, setShowCreatePOPrompt] = useState(false);
  const [contractForPO, setContractForPO] = useState<ContractWithProjects | null>(null);
  const [isCreatingPO, setIsCreatingPO] = useState(false);
  const [contractOptions, setContractOptions] = useState<ContractOptionEntry[]>([{ ...emptyContractOption, inspectors: [{ ...emptyContractInspector }] }]);
  
  // Award options dialog state - for partial awards
  const [showAwardOptionsDialog, setShowAwardOptionsDialog] = useState(false);
  // Calendar month navigation
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  // Calendar day side panel
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<Date | null>(null);
  const [pendingAwardContract, setPendingAwardContract] = useState<{
    formData: ContractFormData;
    options: ContractOptionEntry[];
    previousStatus: string;
    contractId: string;
  } | null>(null);
  const [optionAwardSelections, setOptionAwardSelections] = useState<Record<number, boolean>>({});

  const addContractOption = () => {
    setContractOptions([...contractOptions, { ...emptyContractOption, inspectors: [{ ...emptyContractInspector }] }]);
  };

  const removeContractOption = (index: number) => {
    setContractOptions(contractOptions.filter((_, i) => i !== index));
  };

  const updateContractOption = (index: number, field: keyof ContractOptionEntry, value: string) => {
    setContractOptions(contractOptions.map((opt, i) => 
      i === index ? { ...opt, [field]: value } : opt
    ));
  };

  const addContractInspector = (optionIndex: number) => {
    setContractOptions(contractOptions.map((opt, i) => 
      i === optionIndex ? { ...opt, inspectors: [...opt.inspectors, { ...emptyContractInspector }] } : opt
    ));
  };

  const removeContractInspector = (optionIndex: number, inspectorIndex: number) => {
    setContractOptions(contractOptions.map((opt, i) => {
      if (i === optionIndex) {
        return { ...opt, inspectors: opt.inspectors.filter((_, j) => j !== inspectorIndex) };
      }
      return opt;
    }));
  };

  const updateContractInspector = (optionIndex: number, inspectorIndex: number, field: keyof ContractInspectorEntry, value: string) => {
    setContractOptions(contractOptions.map((opt, i) => {
      if (i !== optionIndex) return opt;
      return {
        ...opt,
        inspectors: opt.inspectors.map((ins, j) => 
          j === inspectorIndex ? { ...ins, [field]: value } : ins
        ),
      };
    }));
  };

  const calculateContractOptionTotal = (option: ContractOptionEntry): number => {
    return option.inspectors.reduce((sum, ins) => {
      const rate = parseFloat(ins.rate) || 0;
      const hours = parseFloat(ins.hours) || 0;
      return sum + (rate * hours);
    }, 0);
  };

  const calculateContractInspectorTotal = (inspector: ContractInspectorEntry): number => {
    const rate = parseFloat(inspector.rate) || 0;
    const hours = parseFloat(inspector.hours) || 0;
    return rate * hours;
  };
  
  // Calculate total budget from contract's AWARDED options only
  // Returns 0 if no options are awarded (budget is pending)
  const calculateContractTotalBudget = (contract: ContractWithProjects): number => {
    if (!contract.options || contract.options.length === 0) {
      return parseFloat(contract.currentValue || contract.originalValue || "0") || 0;
    }
    
    // Only count awarded options - options are mutually exclusive
    const awardedOptions = contract.options.filter(o => o.awardStatus === "awarded");
    if (awardedOptions.length === 0) {
      // No options awarded yet - budget is pending/TBD
      return 0;
    }
    
    let total = 0;
    for (const opt of awardedOptions) {
      for (const ins of opt.inspectors || []) {
        total += (parseFloat(ins.rate) || 0) * (parseFloat(ins.hours) || 0);
      }
    }
    return total;
  };
  
  // Get budget display info for contracts with options
  // Returns { isPending, budget, minBudget, maxBudget, optionCount }
  const getContractBudgetInfo = (contract: ContractWithProjects): {
    isPending: boolean;
    budget: number;
    minBudget: number;
    maxBudget: number;
    optionCount: number;
  } => {
    if (!contract.options || contract.options.length === 0) {
      const budget = parseFloat(contract.currentValue || contract.originalValue || "0") || 0;
      return { isPending: false, budget, minBudget: budget, maxBudget: budget, optionCount: 0 };
    }
    
    const awardedOptions = contract.options.filter(o => o.awardStatus === "awarded");
    // Only consider pending options (not not_awarded) for the range
    const pendingOptions = contract.options.filter(o => o.awardStatus === "pending" || !o.awardStatus);
    
    if (awardedOptions.length > 0) {
      // Has awarded options - calculate their total
      let total = 0;
      for (const opt of awardedOptions) {
        for (const ins of opt.inspectors || []) {
          total += (parseFloat(ins.rate) || 0) * (parseFloat(ins.hours) || 0);
        }
      }
      return { isPending: false, budget: total, minBudget: total, maxBudget: total, optionCount: awardedOptions.length };
    }
    
    // No awarded options - check if there are pending options
    if (pendingOptions.length === 0) {
      // All options are not_awarded - no valid budget
      const budget = parseFloat(contract.currentValue || contract.originalValue || "0") || 0;
      return { isPending: false, budget, minBudget: budget, maxBudget: budget, optionCount: 0 };
    }
    
    // Has pending options - show range from ONLY pending options
    const optionTotals = pendingOptions.map(opt => {
      let optTotal = 0;
      for (const ins of opt.inspectors || []) {
        optTotal += (parseFloat(ins.rate) || 0) * (parseFloat(ins.hours) || 0);
      }
      return optTotal;
    });
    
    const minBudget = Math.min(...optionTotals);
    const maxBudget = Math.max(...optionTotals);
    
    return { 
      isPending: true, 
      budget: 0, 
      minBudget, 
      maxBudget, 
      optionCount: pendingOptions.length 
    };
  };
  
  // Calculate budget from options by index selection (for award dialog preview)
  const calculateSelectedOptionsBudget = (options: ContractOptionEntry[], selections: Record<number, boolean>): number => {
    let total = 0;
    options.forEach((opt, idx) => {
      if (selections[idx]) {
        for (const ins of opt.inspectors) {
          total += (parseFloat(ins.rate) || 0) * (parseFloat(ins.hours) || 0);
        }
      }
    });
    return total;
  };
  
  // Handle confirming award selections and saving contract
  const handleConfirmAwardSelections = async () => {
    if (!pendingAwardContract) return;
    
    // At least one option must be awarded
    const anySelected = Object.values(optionAwardSelections).some(v => v);
    if (!anySelected) {
      toast({
        title: "Selection Required",
        description: "Please select at least one option to award.",
        variant: "destructive",
      });
      return;
    }
    
    // Update options with award status based on selections
    const updatedOptions = pendingAwardContract.options.map((opt, idx) => ({
      ...opt,
      awardStatus: optionAwardSelections[idx] ? "awarded" as const : "not_awarded" as const,
    }));
    
    // Now trigger the actual update with award statuses set
    updateMutation.mutate({
      ...pendingAwardContract.formData,
      id: pendingAwardContract.contractId,
      options: updatedOptions,
      previousStatus: pendingAwardContract.previousStatus,
    }, {
      onSuccess: async () => {
        if (pendingFiles.length > 0) {
          await uploadAttachments(pendingAwardContract.contractId, pendingFiles);
        }
      }
    });
    
    // Close the award options dialog
    setShowAwardOptionsDialog(false);
    setPendingAwardContract(null);
    setOptionAwardSelections({});
  };
  
  // Handle creating PO from contract
  const handleCreatePOFromContract = async () => {
    if (!contractForPO || !activeCompany) return;
    
    setIsCreatingPO(true);
    try {
      const totalBudget = calculateContractTotalBudget(contractForPO);
      // Generate unique PO number with timestamp to avoid duplicates
      const timestamp = Date.now().toString(36).toUpperCase();
      const poPayload = {
        poNumber: `PO-${contractForPO.contractNumber}-${timestamp}`,
        clientId: contractForPO.clientId || null,
        totalAmount: totalBudget.toFixed(2),
        description: `Purchase Order for ${contractForPO.name}`,
        status: "active",
        issueDate: new Date().toISOString(), // Use ISO string format for proper serialization
      };
      
      const response = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(poPayload),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create purchase order");
      }
      
      const newPO = await response.json();
      
      // Link the PO to the contract
      const linkResponse = await apiRequest("PATCH", `/api/contracts/${contractForPO.id}`, {
        purchaseOrderId: newPO.id,
      });
      
      if (!linkResponse.ok) {
        // PO was created but linking failed - still notify user
        toast({
          title: "Purchase Order Created",
          description: `PO created but couldn't auto-link to contract. Please link manually.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Purchase Order Created",
          description: `PO ${newPO.poNumber} created and linked to contract.`,
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      
      setShowCreatePOPrompt(false);
      setContractForPO(null);
    } catch (error: any) {
      console.error("Error creating PO:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create purchase order.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingPO(false);
    }
  };

  const { data: contracts = [], isLoading } = useQuery<ContractWithProjects[]>({
    queryKey: ["/api/contracts"],
    enabled: !!activeCompany?.id,
  });

  const { data: companyMembers = [] } = useQuery<any[]>({
    queryKey: ["/api/companies", activeCompany?.id, "members"],
    enabled: !!activeCompany?.id,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: !!activeCompany?.id,
  });

  const { data: clientsList = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients", activeCompany?.id],
    queryFn: async () => {
      const response = await fetch("/api/clients", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch clients");
      return response.json();
    },
    enabled: !!activeCompany?.id,
  });

  const { data: proposals = [], isLoading: proposalsLoading } = useQuery<ProposalWithDetails[]>({
    queryKey: ["/api/proposals"],
    enabled: !!activeCompany?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: ContractFormData & { options: ContractOptionEntry[] }) => {
      const payload = {
        ...data,
        clientId: data.clientId || null,
        purchaseOrderId: data.purchaseOrderId || null,
        bidReleaseDate: data.bidReleaseDate || null,
        bidDueDate: data.bidDueDate || null,
        awardDate: data.awardDate || null,
        startDate: data.startDate || null,
        substantialCompletionDate: data.substantialCompletionDate || null,
        finalCloseoutDate: data.finalCloseoutDate || null,
        questionDeadline: data.questionDeadline || null,
        jobWalkDateTime: data.jobWalkDateTime || null,
        options: data.options.map(opt => ({
          name: opt.name,
          awardStatus: opt.awardStatus || "pending",
          inspectors: opt.inspectors.filter(ins => ins.title.trim() || ins.inspectorName.trim() || ins.rate.trim()),
        })),
      };
      return apiRequest("POST", "/api/contracts", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setShowCreateDialog(false);
      setFormData(emptyFormData);
      setContractOptions([{ ...emptyContractOption, inspectors: [{ ...emptyContractInspector }] }]);
      toast({
        title: "Contract Created",
        description: "New contract has been created.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create contract.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ContractFormData & { id: string; options: ContractOptionEntry[]; previousStatus?: string }) => {
      const payload = {
        ...data,
        clientId: data.clientId || null,
        purchaseOrderId: data.purchaseOrderId || null,
        bidReleaseDate: data.bidReleaseDate || null,
        bidDueDate: data.bidDueDate || null,
        awardDate: data.awardDate || null,
        startDate: data.startDate || null,
        substantialCompletionDate: data.substantialCompletionDate || null,
        finalCloseoutDate: data.finalCloseoutDate || null,
        questionDeadline: data.questionDeadline || null,
        jobWalkDateTime: data.jobWalkDateTime || null,
        options: data.options.map(opt => ({
          name: opt.name,
          awardStatus: opt.awardStatus || "pending",
          inspectors: opt.inspectors.filter(ins => ins.title.trim() || ins.inspectorName.trim() || ins.rate.trim()),
        })),
      };
      // Return both the response and the data for checking status change
      const response = await apiRequest("PATCH", `/api/contracts/${data.id}`, payload);
      const updatedContract = await response.json();
      return { updatedContract, previousStatus: data.previousStatus, newStatus: data.status };
    },
    onSuccess: ({ updatedContract, previousStatus, newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setEditingContract(null);
      setFormData(emptyFormData);
      setContractOptions([{ ...emptyContractOption, inspectors: [{ ...emptyContractInspector }] }]);
      toast({
        title: "Contract Updated",
        description: "Contract has been updated.",
      });
      
      // Check if status changed to "awarded" and contract doesn't have a PO yet
      if (newStatus === "awarded" && previousStatus !== "awarded" && !updatedContract.purchaseOrderId) {
        setContractForPO(updatedContract);
        setShowCreatePOPrompt(true);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update contract.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/contracts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setContractToDelete(null);
      toast({
        title: "Contract Deleted",
        description: "Contract has been deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete contract.",
        variant: "destructive",
      });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return apiRequest("DELETE", `/api/contract-attachments/${attachmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      toast({
        title: "Attachment Deleted",
        description: "File has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete attachment.",
        variant: "destructive",
      });
    },
  });

  const uploadAttachments = async (contractId: string, files: File[]) => {
    if (files.length === 0) return;
    
    setIsUploading(true);
    try {
      const formDataUpload = new FormData();
      files.forEach(file => {
        formDataUpload.append("attachments", file);
      });
      
      const response = await fetch(`/api/contracts/${contractId}/attachments`, {
        method: "POST",
        body: formDataUpload,
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to upload attachments");
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      toast({
        title: "Files Uploaded",
        description: `${files.length} file(s) attached successfully.`,
      });
    } catch (error: any) {
      toast({
        title: "Upload Error",
        description: error.message || "Failed to upload files.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setPendingFiles([]);
    }
  };

  const downloadAttachment = async (attachment: ContractAttachment) => {
    try {
      const response = await fetch(`/api/contract-attachments/${attachment.id}/download`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to get download URL");
      
      const { url, fileName } = await response.json();
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error: any) {
      toast({
        title: "Download Error",
        description: error.message || "Failed to download file.",
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setPendingFiles(prev => [...prev, ...files]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingContract) {
      // Check if status is changing to "awarded" OR if editing an already-awarded contract with multiple options
      const isChangingToAwarded = formData.status === "awarded" && editingContract.status !== "awarded";
      const isAlreadyAwarded = formData.status === "awarded" && editingContract.status === "awarded";
      const hasMultipleOptions = contractOptions.length > 1;
      
      if ((isChangingToAwarded || isAlreadyAwarded) && hasMultipleOptions) {
        // Store pending contract data and show award options dialog
        setPendingAwardContract({
          formData: formData,
          options: contractOptions,
          previousStatus: editingContract.status,
          contractId: editingContract.id,
        });
        // Initialize selections based on current awardStatus (for re-editing) or all selected (for new awards)
        const initialSelections: Record<number, boolean> = {};
        contractOptions.forEach((opt, idx) => {
          // For already-awarded contracts, use existing awardStatus; for new awards, default to true
          initialSelections[idx] = isAlreadyAwarded 
            ? opt.awardStatus === "awarded" 
            : true;
        });
        setOptionAwardSelections(initialSelections);
        setShowAwardOptionsDialog(true);
        return; // Don't save yet - wait for award selection
      }
      
      // For single option or non-award status changes, proceed directly
      // For single-option contracts changing to "awarded", auto-set awardStatus
      const isChangingToAwardedSingleOption = formData.status === "awarded" && editingContract.status !== "awarded" && contractOptions.length === 1;
      const optionsWithAwardStatus = isChangingToAwardedSingleOption
        ? contractOptions.map(opt => ({ ...opt, awardStatus: "awarded" as const }))
        : contractOptions;
      
      updateMutation.mutate({ 
        ...formData, 
        id: editingContract.id, 
        options: optionsWithAwardStatus,
        previousStatus: editingContract.status, // Track previous status for award prompt
      }, {
        onSuccess: async () => {
          if (pendingFiles.length > 0) {
            await uploadAttachments(editingContract.id, pendingFiles);
          }
        }
      });
    } else {
      // For new contracts, we need to create the contract first, then upload files
      try {
        const payload = {
          ...formData,
          clientId: formData.clientId || null,
          purchaseOrderId: formData.purchaseOrderId || null,
          bidReleaseDate: formData.bidReleaseDate || null,
          bidDueDate: formData.bidDueDate || null,
          awardDate: formData.awardDate || null,
          startDate: formData.startDate || null,
          substantialCompletionDate: formData.substantialCompletionDate || null,
          finalCloseoutDate: formData.finalCloseoutDate || null,
          questionDeadline: formData.questionDeadline || null,
          jobWalkDateTime: formData.jobWalkDateTime || null,
          options: contractOptions.map(opt => ({
            name: opt.name,
            inspectors: opt.inspectors.filter(ins => ins.title.trim() || ins.inspectorName.trim() || ins.rate.trim()),
          })),
        };
        const response = await apiRequest("POST", "/api/contracts", payload);
        const newContract = await response.json();
        
        if (pendingFiles.length > 0 && newContract.id) {
          await uploadAttachments(newContract.id, pendingFiles);
        }
        
        queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
        setShowCreateDialog(false);
        setFormData(emptyFormData);
        setContractOptions([{ ...emptyContractOption, inspectors: [{ ...emptyContractInspector }] }]);
        setPendingFiles([]);
        toast({
          title: "Contract Created",
          description: "New contract has been created.",
        });
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to create contract.",
          variant: "destructive",
        });
      }
    }
  };

  const handleEdit = (contract: ContractWithProjects) => {
    setFormData({
      contractNumber: contract.contractNumber,
      name: contract.name,
      description: contract.description || "",
      clientId: contract.clientId || "",
      purchaseOrderId: contract.purchaseOrderId || "",
      contractType: contract.contractType || "lump_sum",
      status: contract.status,
      originalValue: contract.originalValue || "",
      currentValue: contract.currentValue || "",
      budgetedHours: contract.budgetedHours || "",
      bidReleaseDate: contract.bidReleaseDate ? format(parseDateSafe(contract.bidReleaseDate), "yyyy-MM-dd") : "",
      bidDueDate: contract.bidDueDate ? format(parseDateSafe(contract.bidDueDate), "yyyy-MM-dd") : "",
      awardDate: contract.awardDate ? format(parseDateSafe(contract.awardDate), "yyyy-MM-dd") : "",
      startDate: contract.startDate ? format(parseDateSafe(contract.startDate), "yyyy-MM-dd") : "",
      substantialCompletionDate: contract.substantialCompletionDate ? format(parseDateSafe(contract.substantialCompletionDate), "yyyy-MM-dd") : "",
      finalCloseoutDate: contract.finalCloseoutDate ? format(parseDateSafe(contract.finalCloseoutDate), "yyyy-MM-dd") : "",
      regularRate: contract.regularRate || "",
      overtimeRate: contract.overtimeRate || "",
      premiumRate: contract.premiumRate || "",
      budgetTrackingMode: (contract.budgetTrackingMode as BudgetTrackingMode) || "daily_reports",
      notes: contract.notes || "",
      agency: (contract as any).agency || "",
      serviceType: (contract as any).serviceType || "",
      questionDeadline: (contract as any).questionDeadline ? format(parseDateSafe((contract as any).questionDeadline), "yyyy-MM-dd") : "",
      hasJobWalk: (contract as any).hasJobWalk ?? false,
      jobWalkDateTime: (contract as any).jobWalkDateTime ? format(parseDateSafe((contract as any).jobWalkDateTime), "yyyy-MM-dd'T'HH:mm") : "",
      dsaClass: (contract as any).dsaClass || "",
      addendumCount: (contract as any).addendumCount?.toString() || "",
      lastAddendumDate: (contract as any).lastAddendumDate ? format(parseDateSafe((contract as any).lastAddendumDate), "yyyy-MM-dd") : "",
      assignedToUserId: (contract as any).assignedToUserId || "",
      sharepointFolderUrl: (contract as any).sharepointFolderUrl || "",
    });
    
    // Initialize options from contract
    if (contract.options && contract.options.length > 0) {
      setContractOptions(contract.options.map(opt => ({
        name: opt.name || "",
        awardStatus: (opt.awardStatus as "pending" | "awarded" | "not_awarded") || "pending",
        inspectors: (opt.inspectors || []).map(ins => ({
          title: ins.title,
          inspectorName: ins.inspectorName || "",
          rate: ins.rate,
          hours: ins.hours,
          scheduleType: (ins.scheduleType as "fullTime" | "partTime") || "fullTime",
        })),
      })));
    } else {
      setContractOptions([{ ...emptyContractOption, inspectors: [{ ...emptyContractInspector }] }]);
    }
    
    setEditingContract(contract);
  };

  const handleOpenCreateProjectDialog = (contract: ContractWithProjects) => {
    setContractForNewProject(contract);
    setNewProjectName(contract.name);
    setNewProjectNumber(`PRJ-${contract.contractNumber}`);
  };

  const handleCreateProjectFromContract = async () => {
    if (!contractForNewProject || !activeCompany?.id) return;
    setIsCreatingProject(true);
    try {
      await apiRequest("POST", "/api/projects", {
        name: newProjectName,
        projectNumber: newProjectNumber,
        contractId: contractForNewProject.id,
        clientId: contractForNewProject.clientId || null,
        client: contractForNewProject.client?.name || "",
        companyId: activeCompany.id,
        startDate: contractForNewProject.startDate || null,
        substantialCompletionDate: contractForNewProject.substantialCompletionDate || null,
        finalCloseoutDate: contractForNewProject.finalCloseoutDate || null,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setContractForNewProject(null);
      toast({ title: "Project created", description: `"${newProjectName}" is now linked to this contract.` });
    } catch (error: any) {
      toast({ title: "Failed to create project", description: error.message || "Please try again.", variant: "destructive" });
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleImportFromEmail = (data: any) => {
    const newFormData: ContractFormData = {
      ...emptyFormData,
      contractNumber: data.contractNumber || "",
      name: data.name || (data.sourceEmailSubject ? `Contract from: ${data.sourceEmailSubject}` : ""),
      description: data.description || "",
      contractType: (data.contractType || "lump_sum") as ContractFormData["contractType"],
      status: (data.status || "bid_release") as ContractFormData["status"],
      originalValue: data.originalValue || "",
      bidDueDate: data.bidDueDate || "",
      bidReleaseDate: data.bidReleaseDate || "",
      awardDate: data.awardDate || "",
      startDate: data.startDate || "",
      substantialCompletionDate: data.substantialCompletionDate || "",
      finalCloseoutDate: data.finalCloseoutDate || "",
      notes: [
        data.notes,
        data.sourceEmailSubject ? `Imported from email: "${data.sourceEmailSubject}"` : null,
        data.sourceEmailSender ? `From: ${data.sourceEmailSender}` : null,
      ].filter(Boolean).join("\n\n"),
      agency: data.agency || "",
      serviceType: data.serviceType || "",
      questionDeadline: data.questionDeadline || "",
      hasJobWalk: data.hasJobWalk === true,
      jobWalkDateTime: data.jobWalkDateTime || "",
      dsaClass: (data as any).dsaClass || "",
    };
    setFormData(newFormData);
    setContractOptions([{ ...emptyContractOption, inspectors: [{ ...emptyContractInspector }] }]);
    setShowCreateDialog(true);
    toast({
      title: "Email Data Imported",
      description: "The form has been pre-filled with data extracted from the email. Review and confirm before saving.",
    });
  };

  const getStatusBadge = (status: string) => {
    const option = CONTRACT_STATUS_OPTIONS.find(s => s.value === status);
    return option ? (
      <Badge variant={option.variant}>{option.label}</Badge>
    ) : (
      <Badge variant="secondary">{status}</Badge>
    );
  };

  const getContractTypeName = (type: string) => {
    const option = CONTRACT_TYPE_OPTIONS.find(t => t.value === type);
    return option?.label || type;
  };

  // Calculate days until bid due date and return urgency info
  const getBidDueUrgency = (bidDueDate: Date | string | null) => {
    if (!bidDueDate) return null;
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const dueDate = parseDateSafe(bidDueDate);
    dueDate.setHours(0, 0, 0, 0);
    
    const diffTime = dueDate.getTime() - now.getTime();
    const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (daysUntil < 0) {
      return { days: daysUntil, label: "Overdue", color: "bg-red-600 text-white dark:bg-red-700" };
    } else if (daysUntil <= 3) {
      return { days: daysUntil, label: daysUntil === 0 ? "Due Today!" : daysUntil === 1 ? "Due Tomorrow!" : `Due in ${daysUntil} days!`, color: "bg-red-500 text-white dark:bg-red-600" };
    } else if (daysUntil <= 7) {
      return { days: daysUntil, label: `Due in ${daysUntil} days`, color: "bg-orange-500 text-white dark:bg-orange-600" };
    } else if (daysUntil <= 14) {
      return { days: daysUntil, label: `Due in ${daysUntil} days`, color: "bg-yellow-500 text-white dark:bg-yellow-600" };
    } else {
      return { days: daysUntil, label: `Due in ${daysUntil} days`, color: "bg-green-600 text-white dark:bg-green-700" };
    }
  };

  // Check if contract is in bid phase
  const isInBidPhase = (status: string) => {
    return ['bid_release', 'bid_received', 'under_review'].includes(status);
  };

  // Only show bid due badges for pre-review statuses (not under_review or later)
  const shouldShowBidDueBadge = (status: string) => {
    return ['bid_release', 'bid_received'].includes(status);
  };

  // Calculate schedule progress for a contract
  const getScheduleProgress = (contract: ContractWithProjects) => {
    const now = new Date();
    const isComplete = contract.status === 'substantial_completion' || contract.status === 'final_closeout';
    
    if (isComplete) {
      return { progress: 100, status: 'complete' as const, daysInfo: 'Completed' };
    }
    
    if (isInBidPhase(contract.status)) {
      if (contract.startDate) {
        const startDate = parseDateSafe(contract.startDate);
        const daysToStart = differenceInDays(startDate, now);
        return { progress: 0, status: 'upcoming' as const, daysInfo: daysToStart > 0 ? `Starts in ${daysToStart} days` : null };
      }
      return { progress: 0, status: 'upcoming' as const, daysInfo: null };
    }
    
    if (contract.startDate && contract.substantialCompletionDate) {
      const startDate = parseDateSafe(contract.startDate);
      const endDate = parseDateSafe(contract.substantialCompletionDate);
      const totalDuration = endDate.getTime() - startDate.getTime();
      const elapsed = now.getTime() - startDate.getTime();
      
      if (totalDuration <= 0) {
        return { progress: 0, status: 'not_started' as const, daysInfo: null };
      } else if (now < startDate) {
        const daysToStart = differenceInDays(startDate, now);
        return { progress: 0, status: 'upcoming' as const, daysInfo: `Starts in ${daysToStart} days` };
      } else if (now > endDate) {
        const daysOverdue = differenceInDays(now, endDate);
        return { progress: 100, status: 'overdue' as const, daysInfo: `Ended ${daysOverdue} days ago` };
      } else {
        const progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
        const daysRemaining = differenceInDays(endDate, now);
        return { 
          progress, 
          status: progress >= 80 ? 'warning' as const : 'on_track' as const, 
          daysInfo: `${daysRemaining} days remaining` 
        };
      }
    }
    
    return { progress: 0, status: 'not_started' as const, daysInfo: null };
  };

  // Get schedule status color
  const getScheduleStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return 'text-green-600 dark:text-green-400';
      case 'on_track': return 'text-foreground';
      case 'warning': return 'text-orange-600 dark:text-orange-400';
      case 'overdue': return 'text-red-600 dark:text-red-400';
      case 'upcoming': return 'text-blue-600 dark:text-blue-400';
      default: return 'text-muted-foreground';
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
      // Completed/Cancelled (show last)
      'final_closeout': 7,
      'not_awarded': 8,
      'cancelled': 9,
    };
    return priorities[status] ?? 10;
  };

  // Archived statuses (moved to Archive tab)
  const archivedStatuses = ["not_awarded", "cancelled"];
  
  // Active contracts filter options (exclude archived statuses)
  const ACTIVE_STATUS_OPTIONS = CONTRACT_STATUS_OPTIONS.filter(
    s => !archivedStatuses.includes(s.value)
  );

  // Separate active and archived contracts
  const activeContracts = contracts.filter(c => !archivedStatuses.includes(c.status));
  const archivedContracts = contracts.filter(c => archivedStatuses.includes(c.status));

  const filteredContracts = (() => {
    let result = statusFilter === "all" 
      ? activeContracts 
      : activeContracts.filter(c => c.status === statusFilter);
    
    // Apply text search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((c: any) =>
        c.name.toLowerCase().includes(query) ||
        c.contractNumber?.toLowerCase().includes(query) ||
        c.client?.name?.toLowerCase().includes(query) ||
        c.description?.toLowerCase().includes(query) ||
        c.agency?.toLowerCase().includes(query) ||
        c.serviceType?.toLowerCase().includes(query) ||
        c.projects?.some((p: any) => p.name.toLowerCase().includes(query))
      );
    }

    // Apply service type filter
    if (serviceTypeFilter.trim()) {
      const st = serviceTypeFilter.toLowerCase();
      result = result.filter((c: any) => c.serviceType?.toLowerCase().includes(st));
    }

    // Apply assigned user filter
    if (assignedUserFilter !== "all") {
      result = result.filter((c: any) => c.assignedToUserId === assignedUserFilter);
    }

    // Apply due date range filters
    if (dueBefore) {
      const before = new Date(dueBefore);
      result = result.filter((c: any) => c.bidDueDate && new Date(c.bidDueDate) <= before);
    }
    if (dueAfter) {
      const after = new Date(dueAfter);
      result = result.filter((c: any) => c.bidDueDate && new Date(c.bidDueDate) >= after);
    }
    
    // Sort: 1) Bid Released/Received by upcoming bid due date, 2) Under Review by bid due date (oldest first),
    //       3) Awarded by start date, 4) In Execution by progress % descending
    return result.sort((a, b) => {
      // Calculate priority scores (lower = higher priority)
      const getPriority = (contract: ContractWithProjects) => {
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
        return getStatusPriority(contract.status);
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
        const aStart = a.startDate ? parseDateSafe(a.startDate).getTime() : Infinity;
        const bStart = b.startDate ? parseDateSafe(b.startDate).getTime() : Infinity;
        return aStart - bStart;
      }
      
      if (aPriority === 4) {
        // In Execution: sort by schedule progress (highest first - descending)
        const aProgress = getScheduleProgress(a).progress;
        const bProgress = getScheduleProgress(b).progress;
        return bProgress - aProgress;
      }
      
      // Default: sort by status priority
      return getStatusPriority(a.status) - getStatusPriority(b.status);
    });
  })();

  // Filtered archived contracts with search
  const filteredArchivedContracts = (() => {
    let result = archivedContracts;
    
    if (archivedSearchQuery.trim()) {
      const query = archivedSearchQuery.toLowerCase();
      result = result.filter((c) =>
        c.name.toLowerCase().includes(query) ||
        c.contractNumber?.toLowerCase().includes(query) ||
        c.client?.name?.toLowerCase().includes(query) ||
        c.description?.toLowerCase().includes(query) ||
        c.projects?.some(p => p.name.toLowerCase().includes(query))
      );
    }
    
    // Sort by status (not_awarded first), then by name
    return result.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'not_awarded' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  })();

  // Filtered proposals with search
  const filteredProposals = (() => {
    let result = proposals;
    
    if (proposalSearchQuery.trim()) {
      const query = proposalSearchQuery.toLowerCase();
      result = result.filter((p) =>
        p.projectName?.toLowerCase().includes(query) ||
        p.proposalNumber?.toLowerCase().includes(query) ||
        p.clientName?.toLowerCase().includes(query)
      );
    }
    
    // Sort by date (newest first)
    return result.sort((a, b) => {
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bDate - aDate;
    });
  })();

  // Paginated results
  const paginatedContracts = filteredContracts.slice(0, contractsDisplayCount);
  const paginatedArchivedContracts = filteredArchivedContracts.slice(0, archivedDisplayCount);
  const paginatedProposals = filteredProposals.slice(0, proposalsDisplayCount);

  const calendarEvents = contracts.flatMap(contract => {
    const events: { date: Date; title: string; type: string; contract: ContractWithProjects }[] = [];
    if (contract.bidDueDate) {
      events.push({ date: parseDateSafe(contract.bidDueDate), title: `Bid Due: ${contract.name}`, type: "bid_due", contract });
    }
    if (contract.startDate) {
      events.push({ date: parseDateSafe(contract.startDate), title: `Start: ${contract.name}`, type: "start", contract });
    }
    if (contract.substantialCompletionDate) {
      events.push({ date: parseDateSafe(contract.substantialCompletionDate), title: `Completion: ${contract.name}`, type: "completion", contract });
    }
    return events;
  }).sort((a, b) => a.date.getTime() - b.date.getTime());

  const handleConvertProposal = async () => {
    if (!convertingProposal) return;
    
    setIsConverting(true);
    try {
      const isTBD = selectedOptionIndex === -1;
      const selectedOption = isTBD ? null : convertingProposal.options?.[selectedOptionIndex];
      
      // Prepare the option data with all inspectors
      // If TBD is selected, include ALL proposal options with "pending" awardStatus
      // Otherwise, include only the selected option with "awarded" awardStatus
      let optionsToAdd: Array<{
        name: string;
        awardStatus: "pending" | "awarded" | "not_awarded";
        inspectors: Array<{
          title: string;
          inspectorName: string;
          rate: string;
          hours: string;
          scheduleType: string;
        }>;
      }> = [];
      
      if (isTBD && convertingProposal.options) {
        // TBD: Transfer ALL options with pending status
        optionsToAdd = convertingProposal.options.map(opt => ({
          name: opt.name || "",
          awardStatus: "pending" as const,
          inspectors: (opt.inspectors || []).map(ins => ({
            title: ins.title,
            inspectorName: ins.inspectorName || "",
            rate: ins.rate,
            hours: ins.hours,
            scheduleType: ins.scheduleType || "fullTime",
          })),
        }));
      } else if (selectedOption) {
        // Specific option selected: include only that option with awarded status
        optionsToAdd = [{
          name: selectedOption.name || "",
          awardStatus: "awarded" as const,
          inspectors: (selectedOption.inspectors || []).map(ins => ({
            title: ins.title,
            inspectorName: ins.inspectorName || "",
            rate: ins.rate,
            hours: ins.hours,
            scheduleType: ins.scheduleType || "fullTime",
          })),
        }];
      }
      
      let targetContractId: string;
      
      if (addToExistingContract && selectedExistingContractId) {
        // Add options to existing contract
        const addOptionsResponse = await apiRequest("POST", `/api/contracts/${selectedExistingContractId}/add-options`, {
          options: optionsToAdd,
        });
        const updatedContract = await addOptionsResponse.json();
        targetContractId = updatedContract.id;
      } else {
        // Create new contract (original behavior)
        const firstInspector = selectedOption?.inspectors?.[0];
        const regularRate = firstInspector?.rate || "";
        
        // For TBD, calculate total across all options; otherwise use selected option
        const totalValue = isTBD
          ? (convertingProposal.options || []).reduce((total, opt) => {
              return total + (opt.inspectors || []).reduce((sum, ins) => 
                sum + (parseFloat(ins.rate) || 0) * (parseFloat(ins.hours) || 0), 0);
            }, 0)
          : selectedOption?.inspectors?.reduce((sum, ins) => {
              return sum + (parseFloat(ins.rate) || 0) * (parseFloat(ins.hours) || 0);
            }, 0) || 0;
        
        const contractPayload = {
          contractNumber: `C-${convertingProposal.proposalNumber?.replace('PROP-', '') || Date.now()}`,
          name: convertingProposal.projectName,
          description: `Contract created from proposal ${convertingProposal.proposalNumber}`,
          clientId: convertingProposal.clientId || null,
          purchaseOrderId: null,
          contractType: "time_and_materials",
          status: isTBD ? "under_review" : "awarded",
          originalValue: totalValue.toFixed(2),
          currentValue: totalValue.toFixed(2),
          startDate: convertingProposal.startDate || null,
          substantialCompletionDate: convertingProposal.endDate || null,
          regularRate: regularRate,
          overtimeRate: "",
          premiumRate: "",
          notes: `Converted from proposal: ${convertingProposal.proposalNumber}\nClient: ${convertingProposal.clientName}`,
          options: optionsToAdd,
        };
        
        const contractResponse = await apiRequest("POST", "/api/contracts", contractPayload);
        const newContract = await contractResponse.json();
        targetContractId = newContract.id;
      }
      
      // Update proposal status to accepted
      await apiRequest("PATCH", `/api/proposals/${convertingProposal.id}`, { status: "accepted" });
      
      let projectCreated = false;
      
      // Create project if checkbox is checked
      if (createProjectAfterContract && targetContractId) {
        const projectPayload = {
          name: convertingProposal.projectName,
          projectNumber: `PRJ-${convertingProposal.proposalNumber?.replace('PROP-', '') || Date.now()}`,
          client: convertingProposal.clientName,
          contractId: targetContractId,
          companyId: activeCompany?.id,
        };
        
        await apiRequest("POST", "/api/projects", projectPayload);
        projectCreated = true;
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      
      setShowConvertDialog(false);
      setConvertingProposal(null);
      setAddToExistingContract(false);
      setSelectedExistingContractId("");
      setActiveTab("list");
      
      const actionType = addToExistingContract ? "added to existing contract" : "contract created";
      toast({
        title: "Conversion Successful",
        description: projectCreated 
          ? `Proposal ${actionType} and project created.` 
          : `Proposal ${actionType}.`,
      });
    } catch (error: any) {
      console.error("Conversion error:", error);
      toast({
        title: "Conversion Failed",
        description: error.message || "Failed to convert proposal to contract.",
        variant: "destructive",
      });
    } finally {
      setIsConverting(false);
    }
  };

  if (!activeCompany) {
    return (
      <PageLayout title="Contracts">
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Please select a company to view contracts.
          </CardContent>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Contract Management"
      description={`Manage contracts for ${activeCompany?.name || "your company"}`}
    >
      <PageHeader icon={FileText} title="Contracts" subtitle={`Manage contracts for ${activeCompany?.name || "your company"}`}>
        {isEffectiveCompanyAdmin && (
          <>
            <Button 
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10"
              onClick={() => {
                setEditingProposal(null);
                setShowProposalDialog(true);
              }}
              data-testid="button-create-proposal"
            >
              <FileText className="w-4 h-4 mr-2" />
              Create Quick Proposal
            </Button>
            <Button 
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10"
              onClick={() => setShowImportFromEmailDialog(true)}
              data-testid="button-import-from-email"
            >
              <Mail className="w-4 h-4 mr-2" />
              Import from Email
            </Button>
            <Button 
              className="bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] hover:bg-[hsl(36,90%,45%)] font-semibold"
              onClick={() => {
                setFormData(emptyFormData);
                setShowCreateDialog(true);
              }}
              data-testid="button-new-contract"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Contract
            </Button>
          </>
        )}
      </PageHeader>


      <Tabs value={activeTab} onValueChange={(tab) => {
        setActiveTab(tab);
        // Reset pagination when switching tabs
        if (tab === "list") setContractsDisplayCount(10);
        if (tab === "archive") setArchivedDisplayCount(10);
        if (tab === "proposals") setProposalsDisplayCount(10);
      }} className="w-full">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="list" className="gap-2" data-testid="tab-list">
            <List className="w-4 h-4" />
            Contracts
            {activeContracts.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{activeContracts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="proposals" className="gap-2" data-testid="tab-proposals">
            <FileText className="w-4 h-4" />
            Proposals
            {proposals.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{proposals.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="archive" className="gap-2" data-testid="tab-archive">
            <FileText className="w-4 h-4" />
            Archive
            {archivedContracts.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{archivedContracts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2" data-testid="tab-calendar">
            <CalendarDays className="w-4 h-4" />
            Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          {contracts.length > 0 && (
            <div className="flex flex-col gap-2 mb-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, number, agency, service type, client, or project..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-contracts"
                  />
                </div>
                <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                  <SelectTrigger className="w-full sm:w-[180px]" data-testid="filter-status">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {ACTIVE_STATUS_OPTIONS.map(status => (
                      <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ContractStatusLegend />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  placeholder="Filter by service type..."
                  value={serviceTypeFilter}
                  onChange={(e) => { setServiceTypeFilter(e.target.value); setContractsDisplayCount(10); }}
                  className="flex-1"
                  data-testid="input-filter-service-type"
                />
                <Select value={assignedUserFilter} onValueChange={(v) => { setAssignedUserFilter(v); setContractsDisplayCount(10); }}>
                  <SelectTrigger className="w-full sm:w-[180px]" data-testid="filter-assigned-user">
                    <SelectValue placeholder="Assigned to" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Assigned</SelectItem>
                    {companyMembers.map((m: any) => (
                      <SelectItem key={m.userId} value={m.userId}>
                        {m.profile?.firstName || ""} {m.profile?.lastName || ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2 items-center">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Due After</Label>
                    <Input
                      type="date"
                      value={dueAfter}
                      onChange={(e) => { setDueAfter(e.target.value); setContractsDisplayCount(10); }}
                      className="w-36"
                      data-testid="input-filter-due-after"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Due Before</Label>
                    <Input
                      type="date"
                      value={dueBefore}
                      onChange={(e) => { setDueBefore(e.target.value); setContractsDisplayCount(10); }}
                      className="w-36"
                      data-testid="input-filter-due-before"
                    />
                  </div>
                </div>
              </div>
              {(searchQuery || statusFilter !== "all" || serviceTypeFilter || assignedUserFilter !== "all" || dueBefore || dueAfter) && (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchQuery(""); setStatusFilter("all"); setServiceTypeFilter("");
                      setAssignedUserFilter("all"); setDueBefore(""); setDueAfter("");
                      setContractsDisplayCount(10);
                    }}
                    data-testid="button-clear-all-filters"
                  >
                    <X className="w-3 h-3 mr-1" /> Clear All Filters
                  </Button>
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : filteredContracts.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                {searchQuery.trim() || statusFilter !== "all" || serviceTypeFilter || assignedUserFilter !== "all" || dueBefore || dueAfter ? (
                  <>
                    <p>No contracts found matching your filters.</p>
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => { setSearchQuery(""); setStatusFilter("all"); setServiceTypeFilter(""); setAssignedUserFilter("all"); setDueBefore(""); setDueAfter(""); }}
                      data-testid="button-clear-filters"
                    >
                      Clear Filters
                    </Button>
                  </>
                ) : (
                  <>
                    <p>No contracts found.</p>
                    {isEffectiveCompanyAdmin && (
                      <Button 
                        variant="outline" 
                        className="mt-4"
                        onClick={() => setShowCreateDialog(true)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Create Your First Contract
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {paginatedContracts.map(contract => {
                const scheduleInfo = getScheduleProgress(contract);
                
                return (
                <Card 
                  key={contract.id} 
                  className="hover-elevate cursor-pointer" 
                  data-testid={`contract-${contract.id}`}
                  onClick={() => setLocation(`/company/contracts/${contract.id}/dashboard`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-lg">{contract.name}</h3>
                          {getStatusBadge(contract.status)}
                          {/* Bid due date badge for pre-review bid-phase contracts only */}
                          {shouldShowBidDueBadge(contract.status) && contract.bidDueDate && (() => {
                            const urgency = getBidDueUrgency(contract.bidDueDate);
                            return urgency ? (
                              <Badge 
                                className={`${urgency.color} flex items-center gap-1`}
                                data-testid={`badge-bid-due-${contract.id}`}
                              >
                                <Calendar className="w-3 h-3" />
                                {urgency.label}
                              </Badge>
                            ) : null;
                          })()}
                          {/* Days remaining/overdue badge for non-bid phase contracts */}
                          {!isInBidPhase(contract.status) && scheduleInfo.daysInfo && (
                            <Badge 
                              variant="secondary" 
                              className={`text-xs ${getScheduleStatusColor(scheduleInfo.status)}`}
                              data-testid={`badge-schedule-${contract.id}`}
                            >
                              {scheduleInfo.daysInfo}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div className="flex items-center gap-4 flex-wrap">
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {contract.contractNumber}
                            </span>
                            {(contract as any).agency && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {(contract as any).agency}
                              </span>
                            )}
                            {!(contract as any).agency && contract.client && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {contract.client.name}
                              </span>
                            )}
                            {(contract as any).serviceType && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {(contract as any).serviceType}
                              </span>
                            )}
                            {!(contract as any).serviceType && contract.contractType && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {getContractTypeName(contract.contractType)}
                              </span>
                            )}
                          </div>
                          {/* Date range display */}
                          {(contract.startDate || contract.substantialCompletionDate) && (
                            <div className="flex items-center gap-1 text-xs">
                              <Calendar className="w-3 h-3" />
                              <span>{contract.startDate ? format(parseDateSafe(contract.startDate), "MMM d, yyyy") : "TBD"}</span>
                              <span>→</span>
                              <span>{contract.substantialCompletionDate ? format(parseDateSafe(contract.substantialCompletionDate), "MMM d, yyyy") : "TBD"}</span>
                            </div>
                          )}
                          {contract.projects && contract.projects.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-xs">Projects:</span>
                              {contract.projects.map(project => (
                                <Badge 
                                  key={project.id}
                                  variant="outline" 
                                  className="text-xs"
                                  data-testid={`badge-project-${project.id}`}
                                >
                                  {project.name}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {(() => {
                            const budgetInfo = getContractBudgetInfo(contract);
                            // Show budget info - either confirmed or pending range
                            if (budgetInfo.isPending && contract.options && contract.options.length > 0) {
                              return (
                                <div className="flex items-center gap-2">
                                  <DollarSign className="w-3 h-3" />
                                  <span className="text-amber-600 dark:text-amber-400">
                                    Pending Award: ${budgetInfo.minBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    {budgetInfo.minBudget !== budgetInfo.maxBudget && (
                                      <> - ${budgetInfo.maxBudget.toLocaleString('en-US', { minimumFractionDigits: 2 })}</>
                                    )}
                                  </span>
                                </div>
                              );
                            } else if (budgetInfo.budget > 0) {
                              return (
                                <div className="flex items-center gap-4">
                                  <span className="flex items-center gap-1">
                                    <DollarSign className="w-3 h-3" />
                                    Budget: ${budgetInfo.budget.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              );
                            } else if (contract.originalValue || contract.currentValue) {
                              return (
                                <div className="flex items-center gap-4">
                                  {contract.originalValue && (
                                    <span className="flex items-center gap-1">
                                      <DollarSign className="w-3 h-3" />
                                      Original: ${contract.originalValue}
                                    </span>
                                  )}
                                  {contract.currentValue && (
                                    <span className="flex items-center gap-1">
                                      <DollarSign className="w-3 h-3" />
                                      Current: ${contract.currentValue}
                                    </span>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          })()}
                          {contract.options && contract.options.length > 0 && contract.options[0].inspectors && contract.options[0].inspectors.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap mt-1">
                              <Users className="w-3 h-3" />
                              <span className="text-xs">Inspectors:</span>
                              {contract.options[0].inspectors.map((ins, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {ins.title || ins.inspectorName || `Inspector ${idx + 1}`}
                                  {ins.rate && ` @ $${ins.rate}/hr`}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {/* Award status indicator for multi-option contracts */}
                          {contract.options && contract.options.length > 1 && (
                            <div className="flex items-center gap-2 mt-1">
                              {(() => {
                                const awarded = contract.options.filter(o => o.awardStatus === "awarded").length;
                                const notAwarded = contract.options.filter(o => o.awardStatus === "not_awarded").length;
                                const pending = contract.options.filter(o => o.awardStatus === "pending" || !o.awardStatus).length;
                                const total = contract.options.length;
                                
                                if (awarded > 0 || notAwarded > 0) {
                                  return (
                                    <Badge 
                                      variant={awarded === total ? "success" : awarded > 0 ? "warning" : "muted"}
                                      className="text-xs"
                                      data-testid={`award-indicator-${contract.id}`}
                                    >
                                      {awarded === total 
                                        ? `All ${total} options awarded`
                                        : `${awarded} of ${total} options awarded`
                                      }
                                    </Badge>
                                  );
                                } else if (contract.status === "awarded" && pending === total) {
                                  return (
                                    <Badge variant="warning" className="text-xs">
                                      {total} options pending award selection
                                    </Badge>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {isEffectiveCompanyAdmin && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenCreateProjectDialog(contract)}
                                  data-testid={`button-create-project-${contract.id}`}
                                >
                                  <FolderPlus className="w-4 h-4 text-primary" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Create Project from Contract</TooltipContent>
                            </Tooltip>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(contract)}
                              data-testid={`button-edit-${contract.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setContractToDelete(contract)}
                              data-testid={`button-delete-${contract.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Schedule Progress Bar - show for non-bid phase contracts */}
                    {!isInBidPhase(contract.status) && (contract.startDate || contract.substantialCompletionDate) && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Schedule Progress</span>
                          <span className={getScheduleStatusColor(scheduleInfo.status)}>
                            {scheduleInfo.progress.toFixed(0)}%
                          </span>
                        </div>
                        <Progress 
                          value={scheduleInfo.progress} 
                          className={`h-1.5 ${scheduleInfo.status === 'overdue' ? '[&>div]:bg-red-500' : ''}`}
                          data-testid={`progress-schedule-${contract.id}`}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
              })}
              {filteredContracts.length > contractsDisplayCount && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setContractsDisplayCount(prev => prev + 10)}
                    data-testid="button-show-more-contracts"
                  >
                    Show 10 More ({filteredContracts.length - contractsDisplayCount} remaining)
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="archive">
          {archivedContracts.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search archived contracts by name, number, client, or project..."
                  value={archivedSearchQuery}
                  onChange={(e) => handleArchivedSearchChange(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-archived-contracts"
                />
              </div>
            </div>
          )}
          
          {archivedContracts.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No archived contracts.</p>
                <p className="text-sm mt-2">Contracts with "Not Awarded" or "Cancelled" status will appear here.</p>
              </CardContent>
            </Card>
          ) : filteredArchivedContracts.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No archived contracts found matching your search.</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setArchivedSearchQuery("")}
                  data-testid="button-clear-archive-search"
                >
                  Clear Search
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {paginatedArchivedContracts.map(contract => (
                <Card 
                  key={contract.id} 
                  className="hover-elevate cursor-pointer opacity-75" 
                  data-testid={`archived-contract-${contract.id}`}
                  onClick={() => setLocation(`/company/contracts/${contract.id}/dashboard`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-lg">{contract.name}</h3>
                          {getStatusBadge(contract.status)}
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div className="flex items-center gap-4 flex-wrap">
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {contract.contractNumber}
                            </span>
                            {contract.client && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {contract.client.name}
                              </span>
                            )}
                            {contract.contractType && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {getContractTypeName(contract.contractType)}
                              </span>
                            )}
                          </div>
                          {contract.description && (
                            <p className="text-xs line-clamp-1">{contract.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const budgetInfo = getContractBudgetInfo(contract);
                          if (budgetInfo.budget > 0) {
                            return (
                              <Badge variant="outline" className="font-mono">
                                ${budgetInfo.budget.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </Badge>
                            );
                          } else if (contract.currentValue) {
                            return (
                              <Badge variant="outline" className="font-mono">
                                ${parseFloat(contract.currentValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </Badge>
                            );
                          }
                          return null;
                        })()}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/company/contracts/${contract.id}/dashboard`);
                          }}
                          data-testid={`button-view-archived-${contract.id}`}
                        >
                          <LayoutDashboard className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredArchivedContracts.length > archivedDisplayCount && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setArchivedDisplayCount(prev => prev + 10)}
                    data-testid="button-show-more-archived"
                  >
                    Show 10 More ({filteredArchivedContracts.length - archivedDisplayCount} remaining)
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="proposals">
          {proposals.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search proposals by project name, number, or client..."
                  value={proposalSearchQuery}
                  onChange={(e) => handleProposalSearchChange(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-proposals"
                />
              </div>
            </div>
          )}
          
          {proposalsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : proposals.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No proposals found.</p>
                {isEffectiveCompanyAdmin && (
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => {
                      setEditingProposal(null);
                      setShowProposalDialog(true);
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Proposal
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : filteredProposals.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No proposals found matching your search.</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setProposalSearchQuery("")}
                  data-testid="button-clear-proposal-search"
                >
                  Clear Search
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {paginatedProposals.map(proposal => {
                const grandTotal = proposal.options?.reduce((sum, opt) => {
                  const optTotal = opt.inspectors?.reduce((s, ins) => {
                    return s + (parseFloat(ins.rate) || 0) * (parseFloat(ins.hours) || 0);
                  }, 0) || 0;
                  return sum + optTotal;
                }, 0) || 0;

                return (
                  <Card key={proposal.id} className="hover-elevate" data-testid={`proposal-${proposal.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold truncate">{proposal.projectName}</h3>
                            <Badge variant={
                              proposal.status === 'accepted' ? 'success' :
                              proposal.status === 'sent' ? 'info' :
                              proposal.status === 'declined' ? 'destructive' :
                              proposal.status === 'expired' ? 'muted' : 'warning'
                            }>
                              {proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{proposal.clientName}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                            <span>#{proposal.proposalNumber}</span>
                            {proposal.startDate && (
                              <span>{format(parseDateSafe(proposal.startDate), "MMM d, yyyy")} - {proposal.endDate ? format(parseDateSafe(proposal.endDate), "MMM d, yyyy") : 'TBD'}</span>
                            )}
                            <span className="font-medium text-foreground">
                              ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          {proposal.options && proposal.options.length > 0 && (
                            <div className="mt-2 flex gap-2 flex-wrap">
                              {proposal.options.map((opt, idx) => (
                                <Badge key={opt.id} variant="outline" className="text-xs">
                                  Option {idx + 1}: ${opt.inspectors?.reduce((s, i) => s + (parseFloat(i.rate) || 0) * (parseFloat(i.hours) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                data-testid={`button-pdf-menu-proposal-${proposal.id}`}
                              >
                                <FileText className="w-4 h-4 mr-1" />
                                PDF
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {proposal.pdfPath && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    window.open(`/api/proposals/${proposal.id}/pdf/view`, '_blank');
                                  }}
                                  data-testid={`button-view-proposal-${proposal.id}`}
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  View PDF
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    const response = await fetch(`/api/proposals/${proposal.id}/pdf`, {
                                      method: 'POST',
                                      credentials: 'include',
                                    });
                                    if (!response.ok) throw new Error('Failed to generate PDF');
                                    const blob = await response.blob();
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `Proposal-${proposal.proposalNumber}.pdf`;
                                    a.click();
                                    window.URL.revokeObjectURL(url);
                                    queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
                                    toast({ title: "PDF downloaded successfully" });
                                  } catch (error) {
                                    toast({ title: "Failed to generate PDF", variant: "destructive" });
                                  }
                                }}
                                data-testid={`button-download-proposal-${proposal.id}`}
                              >
                                <Download className="w-4 h-4 mr-2" />
                                Download PDF
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    toast({ title: "Regenerating PDF..." });
                                    const response = await fetch(`/api/proposals/${proposal.id}/pdf`, {
                                      method: 'POST',
                                      credentials: 'include',
                                    });
                                    if (!response.ok) throw new Error('Failed to regenerate PDF');
                                    const blob = await response.blob();
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `Proposal-${proposal.proposalNumber}.pdf`;
                                    a.click();
                                    window.URL.revokeObjectURL(url);
                                    queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
                                    toast({ title: "PDF regenerated and downloaded" });
                                  } catch (error) {
                                    toast({ title: "Failed to regenerate PDF", variant: "destructive" });
                                  }
                                }}
                                data-testid={`button-regenerate-proposal-${proposal.id}`}
                              >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Regenerate PDF
                              </DropdownMenuItem>
                              {proposal.pdfPath && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={async () => {
                                      if (confirm("Delete the PDF for this proposal? You can regenerate it later.")) {
                                        try {
                                          await apiRequest("DELETE", `/api/proposals/${proposal.id}/pdf`);
                                          queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
                                          toast({ title: "PDF deleted successfully" });
                                        } catch (error) {
                                          toast({ title: "Failed to delete PDF", variant: "destructive" });
                                        }
                                      }
                                    }}
                                    data-testid={`button-delete-pdf-proposal-${proposal.id}`}
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete PDF
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {isEffectiveCompanyAdmin && (
                            <>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => {
                                  setConvertingProposal(proposal);
                                  setSelectedOptionIndex(-1);
                                  setShowConvertDialog(true);
                                }}
                                data-testid={`button-convert-proposal-${proposal.id}`}
                              >
                                <ArrowRightCircle className="w-4 h-4 mr-1" />
                                Convert
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingProposal(proposal);
                                  setShowProposalDialog(true);
                                }}
                                data-testid={`button-edit-proposal-${proposal.id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={async () => {
                                  if (confirm(`Delete proposal "${proposal.projectName}"?`)) {
                                    try {
                                      await apiRequest("DELETE", `/api/proposals/${proposal.id}`);
                                      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
                                      toast({ title: "Proposal deleted" });
                                    } catch (error) {
                                      toast({ title: "Failed to delete proposal", variant: "destructive" });
                                    }
                                  }
                                }}
                                data-testid={`button-delete-proposal-${proposal.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {filteredProposals.length > proposalsDisplayCount && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setProposalsDisplayCount(prev => prev + 10)}
                    data-testid="button-show-more-proposals"
                  >
                    Show 10 More ({filteredProposals.length - proposalsDisplayCount} remaining)
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Contract Calendar
                </CardTitle>
                <div className="flex items-center gap-2">
                  <ContractStatusLegend />
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
              <div className="flex items-center gap-4 mt-2 text-xs">
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
              {calendarEvents.length === 0 && (
                <p className="text-center text-muted-foreground py-4 mb-4 bg-muted/50 rounded-md">
                  No contract dates scheduled. Add bid due dates, start dates, or completion dates to your contracts to see them here.
                </p>
              )}
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
                            className={`min-h-[100px] p-1 border-r border-b last:border-r-0 cursor-pointer hover-elevate ${
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
                              {dayEvents.map((event, eventIndex) => (
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
          
          {/* Day Summary Side Panel */}
          {selectedCalendarDay && (
            <Card className="mt-4">
              <CardHeader>
                <div className="flex items-center justify-between">
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
                                  </div>
                                </div>
                                <Badge
                                  variant={event.type === 'bid_due' ? 'warning' : event.type === 'start' ? 'success' : 'info'}
                                  className="shrink-0"
                                >
                                  {event.type === 'bid_due' ? 'Bid Due' : event.type === 'start' ? 'Start Date' : 'Completion'}
                                </Badge>
                              </div>
                              {event.contract.description && (
                                <p className="text-sm text-muted-foreground mt-2 line-clamp-2 ml-3">
                                  {event.contract.description}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground ml-3">
                                {event.contract.clientId && (
                                  <span className="flex items-center gap-1">
                                    <Building2 className="w-3 h-3" />
                                    Client assigned
                                  </span>
                                )}
                                {event.contract.projects && event.contract.projects.length > 0 && (
                                  <span className="flex items-center gap-1">
                                    <FileText className="w-3 h-3" />
                                    {event.contract.projects.length} project{event.contract.projects.length !== 1 ? 's' : ''}
                                  </span>
                                )}
                                {getStatusBadge(event.contract.status)}
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
        </TabsContent>
      </Tabs>

      <Dialog open={showCreateDialog || !!editingContract} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setEditingContract(null);
          setFormData(emptyFormData);
          setContractOptions([{ ...emptyContractOption, inspectors: [{ ...emptyContractInspector }] }]);
          setPendingFiles([]);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingContract ? "Edit Contract" : "New Contract"}</DialogTitle>
            <DialogDescription>
              {editingContract ? "Update the contract details below." : "Fill in the contract details to create a new contract."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contractNumber">Contract Number *</Label>
                <Input
                  id="contractNumber"
                  value={formData.contractNumber}
                  onChange={(e) => setFormData({ ...formData, contractNumber: e.target.value })}
                  required
                  data-testid="input-contract-number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Contract Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  data-testid="input-contract-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                data-testid="input-description"
              />
            </div>

            {activeCompany?.id && (
              <div className="space-y-2">
                <Label htmlFor="clientId">Client</Label>
                <ClientSelect
                  value={formData.clientId}
                  onValueChange={(value) => setFormData({ ...formData, clientId: value, purchaseOrderId: "" })}
                  companyId={activeCompany.id}
                  placeholder="Select or create a client"
                  data-testid="select-client"
                />
                <p className="text-xs text-muted-foreground">
                  Link projects to this contract from the project settings.
                </p>
              </div>
            )}

            {formData.clientId && activeCompany?.id && (
              <div className="space-y-2">
                <Label htmlFor="purchaseOrderId">Purchase Order (PO)</Label>
                <PurchaseOrderSelect
                  value={formData.purchaseOrderId}
                  onValueChange={(value) => setFormData({ ...formData, purchaseOrderId: value })}
                  companyId={activeCompany.id}
                  clientId={formData.clientId}
                  placeholder="Select or create a purchase order (optional)"
                  data-testid="select-purchase-order"
                />
                <p className="text-xs text-muted-foreground">
                  Link this contract to a client's purchase order for billing.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contractType">Contract Type</Label>
                <Select value={formData.contractType} onValueChange={(value) => setFormData({ ...formData, contractType: value })}>
                  <SelectTrigger data-testid="select-contract-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_TYPE_OPTIONS.map(type => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_STATUS_OPTIONS.map(status => (
                      <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="originalValue">Original Contract Value</Label>
                <Input
                  id="originalValue"
                  type="text"
                  placeholder="e.g., 500,000"
                  value={formData.originalValue}
                  onChange={(e) => setFormData({ ...formData, originalValue: e.target.value })}
                  data-testid="input-original-value"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currentValue">Current Contract Value</Label>
                <Input
                  id="currentValue"
                  type="text"
                  placeholder="e.g., 525,000"
                  value={formData.currentValue}
                  onChange={(e) => setFormData({ ...formData, currentValue: e.target.value })}
                  data-testid="input-current-value"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budgetedHours">Budgeted Hours</Label>
                <Input
                  id="budgetedHours"
                  type="text"
                  placeholder="e.g., 2000"
                  value={formData.budgetedHours}
                  onChange={(e) => setFormData({ ...formData, budgetedHours: e.target.value })}
                  data-testid="input-budgeted-hours"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Key Dates</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bidReleaseDate">Bid Release Date</Label>
                  <Input
                    id="bidReleaseDate"
                    type="date"
                    value={formData.bidReleaseDate}
                    onChange={(e) => setFormData({ ...formData, bidReleaseDate: e.target.value })}
                    data-testid="input-bid-release-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bidDueDate">Bid Due Date</Label>
                  <Input
                    id="bidDueDate"
                    type="date"
                    value={formData.bidDueDate}
                    onChange={(e) => setFormData({ ...formData, bidDueDate: e.target.value })}
                    data-testid="input-bid-due-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="awardDate">Award Date</Label>
                  <Input
                    id="awardDate"
                    type="date"
                    value={formData.awardDate}
                    onChange={(e) => setFormData({ ...formData, awardDate: e.target.value })}
                    data-testid="input-award-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    data-testid="input-start-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="substantialCompletionDate">Substantial Completion</Label>
                  <Input
                    id="substantialCompletionDate"
                    type="date"
                    value={formData.substantialCompletionDate}
                    onChange={(e) => setFormData({ ...formData, substantialCompletionDate: e.target.value })}
                    data-testid="input-substantial-completion-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="finalCloseoutDate">Final Closeout</Label>
                  <Input
                    id="finalCloseoutDate"
                    type="date"
                    value={formData.finalCloseoutDate}
                    onChange={(e) => setFormData({ ...formData, finalCloseoutDate: e.target.value })}
                    data-testid="input-final-closeout-date"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <h4 className="font-medium text-sm">Bid Details</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="questionDeadline">Questions Due Date</Label>
                  <Input
                    id="questionDeadline"
                    type="date"
                    value={formData.questionDeadline}
                    onChange={(e) => setFormData({ ...formData, questionDeadline: e.target.value })}
                    data-testid="input-question-deadline"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Job Walk</Label>
                  <div className="flex items-center gap-3 h-10">
                    <Checkbox
                      id="hasJobWalk"
                      checked={formData.hasJobWalk}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, hasJobWalk: !!checked, jobWalkDateTime: checked ? formData.jobWalkDateTime : "" })
                      }
                      data-testid="checkbox-has-job-walk"
                    />
                    <label htmlFor="hasJobWalk" className="text-sm cursor-pointer select-none">
                      {formData.hasJobWalk ? "Yes" : "No"}
                    </label>
                  </div>
                </div>
              </div>
              {formData.hasJobWalk && (
                <div className="space-y-2">
                  <Label htmlFor="jobWalkDateTime">Job Walk Date &amp; Time</Label>
                  <Input
                    id="jobWalkDateTime"
                    type="datetime-local"
                    value={formData.jobWalkDateTime}
                    onChange={(e) => setFormData({ ...formData, jobWalkDateTime: e.target.value })}
                    data-testid="input-job-walk-datetime"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="dsaClass">DSA Class</Label>
                <Select
                  value={formData.dsaClass || "none"}
                  onValueChange={(value) => setFormData({ ...formData, dsaClass: value === "none" ? "" : value })}
                >
                  <SelectTrigger id="dsaClass" data-testid="select-dsa-class">
                    <SelectValue placeholder="Select DSA class..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    <SelectItem value="1">Class 1</SelectItem>
                    <SelectItem value="2">Class 2</SelectItem>
                    <SelectItem value="3">Class 3</SelectItem>
                    <SelectItem value="non_dsa">Non-DSA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.startDate && (formData.substantialCompletionDate || formData.finalCloseoutDate) && (() => {
              const endDate = formData.substantialCompletionDate || formData.finalCloseoutDate;
              const workingDays = calculateWorkingDays(formData.startDate, endDate);
              const holidays = getHolidaysInRange(formData.startDate, endDate);
              
              if (workingDays > 0) {
                return (
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-start gap-3">
                        <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Hours Calculation Preview</span>
                            <span className="text-sm text-muted-foreground">
                              Based on Start to {formData.substantialCompletionDate ? "Substantial Completion" : "Final Closeout"}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Working Days:</span>{" "}
                              <span className="font-medium">{workingDays}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Full Time (8 hrs):</span>{" "}
                              <span className="font-medium">{formatHoursDisplay(workingDays * 8)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Part Time (4 hrs):</span>{" "}
                              <span className="font-medium">{formatHoursDisplay(workingDays * 4)}</span>
                            </div>
                          </div>
                          {holidays.length > 0 && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="sm"
                                    className="h-auto p-0 text-xs text-muted-foreground"
                                    data-testid="button-holiday-info"
                                  >
                                    <Info className="h-3 w-3 mr-1" />
                                    {holidays.length} holiday{holidays.length !== 1 ? 's' : ''} excluded
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs">
                                  <div className="space-y-1">
                                    {holidays.map(h => (
                                      <div key={h.date} className="text-xs">
                                        {h.name} ({new Date(h.date + 'T00:00:00').toLocaleDateString()})
                                      </div>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }
              return null;
            })()}

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Budget Tracking</h4>
              <div className="space-y-2">
                <Label htmlFor="budgetTrackingMode">How should budget be tracked?</Label>
                <Select 
                  value={formData.budgetTrackingMode} 
                  onValueChange={(value) => setFormData({ ...formData, budgetTrackingMode: value as BudgetTrackingMode })}
                >
                  <SelectTrigger data-testid="select-budget-tracking-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BUDGET_TRACKING_MODE_OPTIONS.map(mode => (
                      <SelectItem key={mode.value} value={mode.value}>
                        <div className="flex flex-col">
                          <span>{mode.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {BUDGET_TRACKING_MODE_OPTIONS.find(m => m.value === formData.budgetTrackingMode)?.description}
                </p>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Inspector Rate Options
                </h4>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addContractOption}
                  data-testid="button-add-contract-option"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Option
                </Button>
              </div>

              {contractOptions.map((option, optionIndex) => {
                const workingDays = calculateWorkingDays(formData.startDate, formData.substantialCompletionDate || formData.finalCloseoutDate);
                
                return (
                  <Card key={optionIndex} className="relative">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="font-medium text-sm">Option #{optionIndex + 1}</span>
                          <Input
                            value={option.name}
                            onChange={(e) => updateContractOption(optionIndex, "name", e.target.value)}
                            placeholder="Option name (optional)"
                            className="max-w-xs h-8"
                            data-testid={`input-contract-option-name-${optionIndex}`}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                            Total: ${calculateContractOptionTotal(option).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                          {contractOptions.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeContractOption(optionIndex)}
                              data-testid={`button-remove-contract-option-${optionIndex}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {option.inspectors.map((inspector, inspectorIndex) => {
                        const inspectorHours = formData.startDate && (formData.substantialCompletionDate || formData.finalCloseoutDate)
                          ? calculateTotalHours(formData.startDate, formData.substantialCompletionDate || formData.finalCloseoutDate, inspector.scheduleType)
                          : 0;
                        
                        return (
                          <div key={inspectorIndex} className="border rounded-lg p-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">Inspector #{inspectorIndex + 1}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                                  ${calculateContractInspectorTotal(inspector).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                                {option.inspectors.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => removeContractInspector(optionIndex, inspectorIndex)}
                                    data-testid={`button-remove-contract-inspector-${optionIndex}-${inspectorIndex}`}
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Title/Role</Label>
                                <Input
                                  className="h-9"
                                  value={inspector.title}
                                  onChange={(e) => updateContractInspector(optionIndex, inspectorIndex, "title", e.target.value)}
                                  placeholder="e.g., DSA Class 1 Inspector"
                                  data-testid={`input-contract-inspector-title-${optionIndex}-${inspectorIndex}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Inspector Name</Label>
                                <InspectorSelector
                                  value=""
                                  onValueChange={(_, option) => {
                                    if (option) {
                                      updateContractInspector(optionIndex, inspectorIndex, "inspectorName", option.displayName);
                                    }
                                  }}
                                  placeholder={inspector.inspectorName || "Select or type..."}
                                  allowEmpty
                                  allowCreate
                                  className="h-9"
                                  data-testid={`select-contract-inspector-${optionIndex}-${inspectorIndex}`}
                                />
                                <Input
                                  className="h-9 mt-1"
                                  value={inspector.inspectorName}
                                  onChange={(e) => updateContractInspector(optionIndex, inspectorIndex, "inspectorName", e.target.value)}
                                  placeholder="Or type a name..."
                                  data-testid={`input-contract-inspector-name-${optionIndex}-${inspectorIndex}`}
                                />
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Schedule</Label>
                                <div className="flex gap-1">
                                  <Button
                                    type="button"
                                    variant={inspector.scheduleType === "fullTime" ? "default" : "outline"}
                                    size="sm"
                                    className="flex-1 h-9 text-xs px-2"
                                    onClick={() => updateContractInspector(optionIndex, inspectorIndex, "scheduleType", "fullTime")}
                                    data-testid={`button-contract-schedule-full-${optionIndex}-${inspectorIndex}`}
                                  >
                                    FT (8hr)
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={inspector.scheduleType === "partTime" ? "default" : "outline"}
                                    size="sm"
                                    className="flex-1 h-9 text-xs px-2"
                                    onClick={() => updateContractInspector(optionIndex, inspectorIndex, "scheduleType", "partTime")}
                                    data-testid={`button-contract-schedule-part-${optionIndex}-${inspectorIndex}`}
                                  >
                                    PT (4hr)
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Rate ($/hr)</Label>
                                <Input
                                  className="h-9"
                                  type="number"
                                  value={inspector.rate}
                                  onChange={(e) => updateContractInspector(optionIndex, inspectorIndex, "rate", e.target.value)}
                                  placeholder="108.00"
                                  data-testid={`input-contract-inspector-rate-${optionIndex}-${inspectorIndex}`}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Hours</Label>
                                <div className="flex gap-1">
                                  <Input
                                    className="h-9 flex-1"
                                    type="number"
                                    value={inspector.hours}
                                    onChange={(e) => updateContractInspector(optionIndex, inspectorIndex, "hours", e.target.value)}
                                    placeholder="4488"
                                    data-testid={`input-contract-inspector-hours-${optionIndex}-${inspectorIndex}`}
                                  />
                                  {formData.startDate && (formData.substantialCompletionDate || formData.finalCloseoutDate) && inspectorHours > 0 && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-9 px-2 text-xs whitespace-nowrap"
                                          onClick={() => updateContractInspector(optionIndex, inspectorIndex, "hours", String(inspectorHours))}
                                          data-testid={`button-calc-contract-hours-${optionIndex}-${inspectorIndex}`}
                                        >
                                          {formatHoursDisplay(inspectorHours)}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Use calculated hours ({inspector.scheduleType === "fullTime" ? "8" : "4"} hrs/day x {workingDays} days)</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => addContractInspector(optionIndex)}
                        className="w-full"
                        data-testid={`button-add-contract-inspector-${optionIndex}`}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Inspector
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                data-testid="input-notes"
              />
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label>Attachments</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-add-attachment"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Add Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                  data-testid="input-file-upload"
                />
              </div>

              {editingContract?.attachments && editingContract.attachments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Existing files:</p>
                  {editingContract.attachments.map(attachment => (
                    <div key={attachment.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                        <span className="text-sm truncate">{attachment.fileName}</span>
                        {attachment.fileSize && (
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            ({(attachment.fileSize / 1024).toFixed(1)} KB)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => downloadAttachment(attachment)}
                          data-testid={`button-download-${attachment.id}`}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteAttachmentMutation.mutate(attachment.id)}
                          data-testid={`button-delete-attachment-${attachment.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pendingFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Files to upload:</p>
                  {pendingFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-950 rounded-md">
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip className="w-4 h-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePendingFile(index)}
                        data-testid={`button-remove-pending-${index}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setShowCreateDialog(false);
                setEditingContract(null);
                setFormData(emptyFormData);
                setPendingFiles([]);
              }}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-contract"
              >
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingContract ? "Update Contract" : "Create Contract"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!contractToDelete} onOpenChange={(open) => !open && setContractToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contract</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{contractToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => contractToDelete && deleteMutation.mutate(contractToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Project from Contract Dialog */}
      <Dialog open={!!contractForNewProject} onOpenChange={(open) => { if (!open) setContractForNewProject(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-primary" />
              Create Project from Contract
            </DialogTitle>
            <DialogDescription>
              A new project will be created and linked to contract <strong>{contractForNewProject?.contractNumber}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-project-name">Project Name</Label>
              <Input
                id="new-project-name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                data-testid="input-new-project-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-project-number">Project Number</Label>
              <Input
                id="new-project-number"
                value={newProjectNumber}
                onChange={(e) => setNewProjectNumber(e.target.value)}
                placeholder="e.g. PRJ-C001"
                data-testid="input-new-project-number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContractForNewProject(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateProjectFromContract}
              disabled={isCreatingProject || !newProjectName.trim() || !newProjectNumber.trim()}
              data-testid="button-confirm-create-project"
            >
              {isCreatingProject ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</>
              ) : (
                <><FolderPlus className="w-4 h-4 mr-2" />Create Project</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProposalDialog
        open={showProposalDialog}
        onOpenChange={setShowProposalDialog}
        editingProposal={editingProposal}
      />

      <Dialog open={showConvertDialog} onOpenChange={(open) => {
        if (!open) {
          setShowConvertDialog(false);
          setConvertingProposal(null);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Convert Proposal to Contract</DialogTitle>
            <DialogDescription>
              Create a contract and optionally a project from this proposal.
            </DialogDescription>
          </DialogHeader>
          
          {convertingProposal && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-semibold">{convertingProposal.projectName}</h4>
                <p className="text-sm text-muted-foreground">{convertingProposal.clientName}</p>
                <p className="text-xs text-muted-foreground mt-1">#{convertingProposal.proposalNumber}</p>
              </div>
              
              {/* Contract destination toggle */}
              <div className="space-y-3">
                <Label>Contract Destination</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={!addToExistingContract ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setAddToExistingContract(false);
                      setSelectedExistingContractId("");
                    }}
                    data-testid="button-create-new-contract"
                  >
                    Create New Contract
                  </Button>
                  <Button
                    type="button"
                    variant={addToExistingContract ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAddToExistingContract(true)}
                    disabled={contracts.length === 0}
                    data-testid="button-add-to-existing"
                  >
                    Add to Existing Contract
                  </Button>
                </div>
              </div>
              
              {/* Existing contract selector */}
              {addToExistingContract && (
                <div className="space-y-2">
                  <Label>Select Contract</Label>
                  <Select 
                    value={selectedExistingContractId} 
                    onValueChange={setSelectedExistingContractId}
                  >
                    <SelectTrigger data-testid="select-existing-contract">
                      <SelectValue placeholder="Select a contract..." />
                    </SelectTrigger>
                    <SelectContent>
                      {contracts.map((contract) => (
                        <SelectItem key={contract.id} value={contract.id}>
                          {contract.contractNumber} - {contract.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {convertingProposal.options && convertingProposal.options.length > 0 && (
                <div className="space-y-2">
                  <Label>Select Pricing Option</Label>
                  <Select 
                    value={selectedOptionIndex.toString()} 
                    onValueChange={(v) => setSelectedOptionIndex(parseInt(v))}
                  >
                    <SelectTrigger data-testid="select-pricing-option">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="-1">TBD (All options pending award)</SelectItem>
                      {convertingProposal.options.map((opt, idx) => {
                        const optTotal = opt.inspectors?.reduce((s, i) => s + (parseFloat(i.rate) || 0) * (parseFloat(i.hours) || 0), 0) || 0;
                        return (
                          <SelectItem key={opt.id} value={idx.toString()}>
                            Option {idx + 1}{opt.name ? `: ${opt.name}` : ''} - ${optTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {convertingProposal.options?.[selectedOptionIndex] && (
                <div className="p-3 border rounded-lg space-y-2">
                  <p className="text-sm font-medium">Selected Option Details:</p>
                  {convertingProposal.options[selectedOptionIndex].inspectors?.map((ins, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span>{ins.title}: {ins.inspectorName}</span>
                      <span>${(parseFloat(ins.rate) || 0).toFixed(2)}/hr × {ins.hours}hrs = ${((parseFloat(ins.rate) || 0) * (parseFloat(ins.hours) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t flex justify-between font-semibold">
                    <span>Total:</span>
                    <span>
                      ${convertingProposal.options[selectedOptionIndex].inspectors?.reduce((s, i) => s + (parseFloat(i.rate) || 0) * (parseFloat(i.hours) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="create-project" 
                  checked={createProjectAfterContract}
                  onCheckedChange={(checked) => setCreateProjectAfterContract(checked === true)}
                  data-testid="checkbox-create-project"
                />
                <label 
                  htmlFor="create-project" 
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Also create a project linked to this contract
                </label>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setShowConvertDialog(false);
                setConvertingProposal(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConvertProposal}
              disabled={isConverting || (addToExistingContract && !selectedExistingContractId)}
              data-testid="button-confirm-convert"
            >
              {isConverting ? "Converting..." : addToExistingContract ? "Add to Contract" : "Convert to Contract"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Award Options Dialog - for selecting which options to award */}
      <Dialog open={showAwardOptionsDialog} onOpenChange={(open) => {
        if (!open) {
          setShowAwardOptionsDialog(false);
          setPendingAwardContract(null);
          setOptionAwardSelections({});
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Options to Award</DialogTitle>
            <DialogDescription>
              This contract has multiple options. Select which options are being awarded.
            </DialogDescription>
          </DialogHeader>
          
          {pendingAwardContract && (
            <div className="space-y-4">
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {pendingAwardContract.options.map((option, idx) => {
                  const optionTotal = calculateContractOptionTotal(option);
                  return (
                    <div 
                      key={idx}
                      className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                        optionAwardSelections[idx] 
                          ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700" 
                          : "bg-muted/50 border-muted"
                      }`}
                      onClick={() => setOptionAwardSelections(prev => ({
                        ...prev,
                        [idx]: !prev[idx]
                      }))}
                      data-testid={`award-option-${idx}`}
                    >
                      <div className="flex items-start gap-3">
                        <div onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={optionAwardSelections[idx] || false}
                            onCheckedChange={(checked) => setOptionAwardSelections(prev => ({
                              ...prev,
                              [idx]: !!checked
                            }))}
                            className="mt-1"
                            data-testid={`checkbox-award-option-${idx}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              Option {idx + 1}{option.name ? `: ${option.name}` : ""}
                            </span>
                            <Badge variant="secondary">
                              ${optionTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </Badge>
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {option.inspectors.filter(i => i.title).map((ins, i) => (
                              <span key={i} className="mr-2">
                                {ins.title}{ins.inspectorName ? ` (${ins.inspectorName})` : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="pt-3 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {Object.values(optionAwardSelections).filter(v => v).length} of {pendingAwardContract.options.length} options selected
                  </span>
                  <span className="font-semibold">
                    Total: ${calculateSelectedOptionsBudget(pendingAwardContract.options, optionAwardSelections).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setShowAwardOptionsDialog(false);
                setPendingAwardContract(null);
                setOptionAwardSelections({});
              }}
              data-testid="button-cancel-award"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmAwardSelections}
              disabled={updateMutation.isPending || !Object.values(optionAwardSelections).some(v => v)}
              data-testid="button-confirm-award"
            >
              {updateMutation.isPending ? "Saving..." : "Confirm Awards"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Create PO Prompt Dialog - shown when contract is awarded */}
      <Dialog open={showCreatePOPrompt} onOpenChange={(open) => {
        if (!open) {
          setShowCreatePOPrompt(false);
          setContractForPO(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Purchase Order?</DialogTitle>
            <DialogDescription>
              This contract has been awarded. Would you like to create a Purchase Order for it now?
            </DialogDescription>
          </DialogHeader>
          
          {contractForPO && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-semibold">{contractForPO.name}</h4>
                <p className="text-sm text-muted-foreground">#{contractForPO.contractNumber}</p>
                <div className="mt-2 pt-2 border-t">
                  <p className="text-sm font-medium">
                    Budget: ${calculateContractTotalBudget(contractForPO).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              
              <p className="text-sm text-muted-foreground">
                A Purchase Order will be created with the contract's budget amount and automatically linked to this contract.
              </p>
            </div>
          )}
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setShowCreatePOPrompt(false);
                setContractForPO(null);
              }}
              data-testid="button-skip-po"
            >
              Create Later
            </Button>
            <Button 
              onClick={handleCreatePOFromContract}
              disabled={isCreatingPO}
              data-testid="button-create-po-now"
            >
              {isCreatingPO ? "Creating..." : "Create PO Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ImportFromEmailDialog
        open={showImportFromEmailDialog}
        onOpenChange={setShowImportFromEmailDialog}
        onImport={handleImportFromEmail}
      />
    </PageLayout>
  );
}

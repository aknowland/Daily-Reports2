import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
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
} from "lucide-react";
import { Link } from "wouter";
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
import { ClientSelect } from "@/components/client-select";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { calculateTotalHours, calculateWorkingDays, formatHoursDisplay, getHolidaysInRange } from "@/lib/working-days-calculator";
import { Users, Info } from "lucide-react";

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
};

const CONTRACT_STATUS_OPTIONS = [
  { value: "bid_release", label: "Bid Release", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" },
  { value: "bid_received", label: "Bid Received", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300" },
  { value: "under_review", label: "Under Review", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300" },
  { value: "awarded", label: "Awarded", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
  { value: "in_execution", label: "In Execution", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300" },
  { value: "substantial_completion", label: "Substantial Completion", color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300" },
  { value: "final_closeout", label: "Final Closeout", color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" },
];

const CONTRACT_TYPE_OPTIONS = [
  { value: "lump_sum", label: "Lump Sum" },
  { value: "time_and_materials", label: "Time & Materials" },
  { value: "unit_price", label: "Unit Price" },
  { value: "cost_plus", label: "Cost Plus" },
  { value: "design_build", label: "Design Build" },
  { value: "other", label: "Other" },
];

type ContractFormData = {
  contractNumber: string;
  name: string;
  description: string;
  clientId: string;
  contractType: string;
  status: string;
  originalValue: string;
  currentValue: string;
  bidReleaseDate: string;
  bidDueDate: string;
  awardDate: string;
  startDate: string;
  substantialCompletionDate: string;
  finalCloseoutDate: string;
  regularRate: string;
  overtimeRate: string;
  premiumRate: string;
  notes: string;
};

const emptyFormData: ContractFormData = {
  contractNumber: "",
  name: "",
  description: "",
  clientId: "",
  contractType: "lump_sum",
  status: "bid_release",
  originalValue: "",
  currentValue: "",
  bidReleaseDate: "",
  bidDueDate: "",
  awardDate: "",
  startDate: "",
  substantialCompletionDate: "",
  finalCloseoutDate: "",
  regularRate: "",
  overtimeRate: "",
  premiumRate: "",
  notes: "",
};

export default function ContractsPage() {
  const { toast } = useToast();
  const { activeCompany, isCompanyAdmin } = useAuth();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [contractToDelete, setContractToDelete] = useState<ContractWithProjects | null>(null);
  const [editingContract, setEditingContract] = useState<ContractWithProjects | null>(null);
  const [formData, setFormData] = useState<ContractFormData>(emptyFormData);
  const [activeTab, setActiveTab] = useState("list");
  const [statusFilter, setStatusFilter] = useState<string>("all");
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
  const [contractOptions, setContractOptions] = useState<ContractOptionEntry[]>([{ ...emptyContractOption, inspectors: [{ ...emptyContractInspector }] }]);

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

  const { data: contracts = [], isLoading } = useQuery<ContractWithProjects[]>({
    queryKey: ["/api/contracts"],
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
        bidReleaseDate: data.bidReleaseDate ? new Date(data.bidReleaseDate) : null,
        bidDueDate: data.bidDueDate ? new Date(data.bidDueDate) : null,
        awardDate: data.awardDate ? new Date(data.awardDate) : null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        substantialCompletionDate: data.substantialCompletionDate ? new Date(data.substantialCompletionDate) : null,
        finalCloseoutDate: data.finalCloseoutDate ? new Date(data.finalCloseoutDate) : null,
        options: data.options.map(opt => ({
          name: opt.name,
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
    mutationFn: async (data: ContractFormData & { id: string; options: ContractOptionEntry[] }) => {
      const payload = {
        ...data,
        clientId: data.clientId || null,
        bidReleaseDate: data.bidReleaseDate ? new Date(data.bidReleaseDate) : null,
        bidDueDate: data.bidDueDate ? new Date(data.bidDueDate) : null,
        awardDate: data.awardDate ? new Date(data.awardDate) : null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        substantialCompletionDate: data.substantialCompletionDate ? new Date(data.substantialCompletionDate) : null,
        finalCloseoutDate: data.finalCloseoutDate ? new Date(data.finalCloseoutDate) : null,
        options: data.options.map(opt => ({
          name: opt.name,
          inspectors: opt.inspectors.filter(ins => ins.title.trim() || ins.inspectorName.trim() || ins.rate.trim()),
        })),
      };
      return apiRequest("PATCH", `/api/contracts/${data.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setEditingContract(null);
      setFormData(emptyFormData);
      setContractOptions([{ ...emptyContractOption, inspectors: [{ ...emptyContractInspector }] }]);
      toast({
        title: "Contract Updated",
        description: "Contract has been updated.",
      });
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
      updateMutation.mutate({ ...formData, id: editingContract.id, options: contractOptions }, {
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
          bidReleaseDate: formData.bidReleaseDate ? new Date(formData.bidReleaseDate) : null,
          bidDueDate: formData.bidDueDate ? new Date(formData.bidDueDate) : null,
          awardDate: formData.awardDate ? new Date(formData.awardDate) : null,
          startDate: formData.startDate ? new Date(formData.startDate) : null,
          substantialCompletionDate: formData.substantialCompletionDate ? new Date(formData.substantialCompletionDate) : null,
          finalCloseoutDate: formData.finalCloseoutDate ? new Date(formData.finalCloseoutDate) : null,
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
      contractType: contract.contractType || "lump_sum",
      status: contract.status,
      originalValue: contract.originalValue || "",
      currentValue: contract.currentValue || "",
      bidReleaseDate: contract.bidReleaseDate ? format(new Date(contract.bidReleaseDate), "yyyy-MM-dd") : "",
      bidDueDate: contract.bidDueDate ? format(new Date(contract.bidDueDate), "yyyy-MM-dd") : "",
      awardDate: contract.awardDate ? format(new Date(contract.awardDate), "yyyy-MM-dd") : "",
      startDate: contract.startDate ? format(new Date(contract.startDate), "yyyy-MM-dd") : "",
      substantialCompletionDate: contract.substantialCompletionDate ? format(new Date(contract.substantialCompletionDate), "yyyy-MM-dd") : "",
      finalCloseoutDate: contract.finalCloseoutDate ? format(new Date(contract.finalCloseoutDate), "yyyy-MM-dd") : "",
      regularRate: contract.regularRate || "",
      overtimeRate: contract.overtimeRate || "",
      premiumRate: contract.premiumRate || "",
      notes: contract.notes || "",
    });
    
    // Initialize options from contract
    if (contract.options && contract.options.length > 0) {
      setContractOptions(contract.options.map(opt => ({
        name: opt.name || "",
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

  const getStatusBadge = (status: string) => {
    const option = CONTRACT_STATUS_OPTIONS.find(s => s.value === status);
    return option ? (
      <Badge className={option.color}>{option.label}</Badge>
    ) : (
      <Badge variant="secondary">{status}</Badge>
    );
  };

  const getContractTypeName = (type: string) => {
    const option = CONTRACT_TYPE_OPTIONS.find(t => t.value === type);
    return option?.label || type;
  };

  const filteredContracts = statusFilter === "all" 
    ? contracts 
    : contracts.filter(c => c.status === statusFilter);

  const calendarEvents = contracts.flatMap(contract => {
    const events: { date: Date; title: string; type: string; contract: ContractWithProjects }[] = [];
    if (contract.bidDueDate) {
      events.push({ date: new Date(contract.bidDueDate), title: `Bid Due: ${contract.name}`, type: "bid_due", contract });
    }
    if (contract.startDate) {
      events.push({ date: new Date(contract.startDate), title: `Start: ${contract.name}`, type: "start", contract });
    }
    if (contract.substantialCompletionDate) {
      events.push({ date: new Date(contract.substantialCompletionDate), title: `Completion: ${contract.name}`, type: "completion", contract });
    }
    return events;
  }).sort((a, b) => a.date.getTime() - b.date.getTime());

  const handleConvertProposal = async () => {
    if (!convertingProposal) return;
    
    setIsConverting(true);
    try {
      const selectedOption = convertingProposal.options?.[selectedOptionIndex];
      
      // Get the first inspector's rate as the regular rate (or calculate an average)
      const firstInspector = selectedOption?.inspectors?.[0];
      const regularRate = firstInspector?.rate || "";
      
      // Calculate total value from all inspectors in the selected option
      const totalValue = selectedOption?.inspectors?.reduce((sum, ins) => {
        return sum + (parseFloat(ins.rate) || 0) * (parseFloat(ins.hours) || 0);
      }, 0) || 0;
      
      // Copy the selected option to the contract with all inspectors
      const contractOptions = selectedOption ? [{
        name: selectedOption.name || "",
        inspectors: (selectedOption.inspectors || []).map(ins => ({
          title: ins.title,
          inspectorName: ins.inspectorName || "",
          rate: ins.rate,
          hours: ins.hours,
          scheduleType: ins.scheduleType || "fullTime",
        })),
      }] : [];
      
      // Create the contract
      const contractPayload = {
        contractNumber: `C-${convertingProposal.proposalNumber?.replace('PROP-', '') || Date.now()}`,
        name: convertingProposal.projectName,
        description: `Contract created from proposal ${convertingProposal.proposalNumber}`,
        clientId: convertingProposal.clientId || null,
        contractType: "time_and_materials",
        status: "awarded",
        originalValue: totalValue.toFixed(2),
        currentValue: totalValue.toFixed(2),
        startDate: convertingProposal.startDate ? new Date(convertingProposal.startDate) : null,
        substantialCompletionDate: convertingProposal.endDate ? new Date(convertingProposal.endDate) : null,
        regularRate: regularRate,
        overtimeRate: "",
        premiumRate: "",
        notes: `Converted from proposal: ${convertingProposal.proposalNumber}\nClient: ${convertingProposal.clientName}`,
        options: contractOptions,
      };
      
      const contractResponse = await apiRequest("POST", "/api/contracts", contractPayload);
      const newContract = await contractResponse.json();
      
      // Update proposal status to accepted
      await apiRequest("PATCH", `/api/proposals/${convertingProposal.id}`, { status: "accepted" });
      
      let projectCreated = false;
      
      // Create project if checkbox is checked
      if (createProjectAfterContract && newContract?.id) {
        const projectPayload = {
          name: convertingProposal.projectName,
          projectNumber: `PRJ-${convertingProposal.proposalNumber?.replace('PROP-', '') || Date.now()}`,
          client: convertingProposal.clientName,
          contractId: newContract.id,
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
      setActiveTab("list");
      
      toast({
        title: "Conversion Successful",
        description: projectCreated 
          ? "Contract and project created from proposal." 
          : "Contract created from proposal.",
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
      {isCompanyAdmin && (
        <div className="flex justify-end gap-2 mb-4">
          <Button 
            variant="outline"
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
            onClick={() => {
              setFormData(emptyFormData);
              setShowCreateDialog(true);
            }}
            data-testid="button-new-contract"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Contract
          </Button>
        </div>
      )}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="list" className="gap-2" data-testid="tab-list">
            <List className="w-4 h-4" />
            Contracts
          </TabsTrigger>
          <TabsTrigger value="proposals" className="gap-2" data-testid="tab-proposals">
            <FileText className="w-4 h-4" />
            Proposals
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2" data-testid="tab-calendar">
            <CalendarDays className="w-4 h-4" />
            Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <div className="mb-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]" data-testid="filter-status">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {CONTRACT_STATUS_OPTIONS.map(status => (
                  <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
                <p>No contracts found.</p>
                {isCompanyAdmin && (
                  <Button 
                    variant="outline" 
                    className="mt-4"
                    onClick={() => setShowCreateDialog(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Your First Contract
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredContracts.map(contract => (
                <Card key={contract.id} className="hover-elevate" data-testid={`contract-${contract.id}`}>
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
                          {contract.projects && contract.projects.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-xs">Projects:</span>
                              {contract.projects.map(project => (
                                <Badge key={project.id} variant="outline" className="text-xs">{project.name}</Badge>
                              ))}
                            </div>
                          )}
                          {(contract.originalValue || contract.currentValue) && (
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
                          )}
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
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/company/contracts/${contract.id}/dashboard`}>
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid={`button-dashboard-${contract.id}`}
                          >
                            <LayoutDashboard className="w-4 h-4 mr-1" />
                            Dashboard
                          </Button>
                        </Link>
                        {isCompanyAdmin && (
                          <>
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
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="proposals">
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
                {isCompanyAdmin && (
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
          ) : (
            <div className="space-y-3">
              {proposals.map(proposal => {
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
                              proposal.status === 'accepted' ? 'default' :
                              proposal.status === 'sent' ? 'secondary' :
                              proposal.status === 'declined' ? 'destructive' : 'outline'
                            }>
                              {proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{proposal.clientName}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                            <span>#{proposal.proposalNumber}</span>
                            {proposal.startDate && (
                              <span>{format(new Date(proposal.startDate), "MMM d, yyyy")} - {proposal.endDate ? format(new Date(proposal.endDate), "MMM d, yyyy") : 'TBD'}</span>
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
                          {isCompanyAdmin && (
                            <>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => {
                                  setConvertingProposal(proposal);
                                  setSelectedOptionIndex(0);
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
            </div>
          )}
        </TabsContent>

        <TabsContent value="calendar">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Upcoming Dates
              </CardTitle>
            </CardHeader>
            <CardContent>
              {calendarEvents.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No upcoming dates scheduled.</p>
              ) : (
                <div className="space-y-3">
                  {calendarEvents.map((event, index) => (
                    <div 
                      key={`${event.contract.id}-${event.type}-${index}`}
                      className="flex items-center gap-4 p-3 rounded-lg border"
                    >
                      <div className="text-center min-w-[60px]">
                        <div className="text-2xl font-bold">{format(event.date, "d")}</div>
                        <div className="text-xs text-muted-foreground">{format(event.date, "MMM yyyy")}</div>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{event.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {getStatusBadge(event.contract.status)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
                  onValueChange={(value) => setFormData({ ...formData, clientId: value })}
                  companyId={activeCompany.id}
                  placeholder="Select or create a client"
                  data-testid="select-client"
                />
                <p className="text-xs text-muted-foreground">
                  Link projects to this contract from the project settings.
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
                                <Input
                                  className="h-9"
                                  value={inspector.inspectorName}
                                  onChange={(e) => updateContractInspector(optionIndex, inspectorIndex, "inspectorName", e.target.value)}
                                  placeholder="e.g., John Smith"
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
              
              {convertingProposal.options && convertingProposal.options.length > 1 && (
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
              disabled={isConverting}
              data-testid="button-confirm-convert"
            >
              {isConverting ? "Converting..." : "Convert to Contract"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

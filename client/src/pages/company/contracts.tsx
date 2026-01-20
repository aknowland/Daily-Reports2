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
} from "lucide-react";
import { useState, useRef } from "react";
import type { ContractWithProjects, Project, Client, ContractAttachment } from "@shared/schema";
import { format } from "date-fns";

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

  const { data: contracts = [], isLoading } = useQuery<ContractWithProjects[]>({
    queryKey: ["/api/contracts"],
    enabled: !!activeCompany?.id,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: !!activeCompany?.id,
  });

  const { data: clientsList = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    enabled: !!activeCompany?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: ContractFormData) => {
      const payload = {
        ...data,
        clientId: data.clientId || null,
        bidReleaseDate: data.bidReleaseDate ? new Date(data.bidReleaseDate) : null,
        bidDueDate: data.bidDueDate ? new Date(data.bidDueDate) : null,
        awardDate: data.awardDate ? new Date(data.awardDate) : null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        substantialCompletionDate: data.substantialCompletionDate ? new Date(data.substantialCompletionDate) : null,
        finalCloseoutDate: data.finalCloseoutDate ? new Date(data.finalCloseoutDate) : null,
      };
      return apiRequest("POST", "/api/contracts", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setShowCreateDialog(false);
      setFormData(emptyFormData);
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
    mutationFn: async (data: ContractFormData & { id: string }) => {
      const payload = {
        ...data,
        clientId: data.clientId || null,
        bidReleaseDate: data.bidReleaseDate ? new Date(data.bidReleaseDate) : null,
        bidDueDate: data.bidDueDate ? new Date(data.bidDueDate) : null,
        awardDate: data.awardDate ? new Date(data.awardDate) : null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        substantialCompletionDate: data.substantialCompletionDate ? new Date(data.substantialCompletionDate) : null,
        finalCloseoutDate: data.finalCloseoutDate ? new Date(data.finalCloseoutDate) : null,
      };
      return apiRequest("PATCH", `/api/contracts/${data.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setEditingContract(null);
      setFormData(emptyFormData);
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
      updateMutation.mutate({ ...formData, id: editingContract.id }, {
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
        };
        const response = await apiRequest("POST", "/api/contracts", payload);
        const newContract = await response.json();
        
        if (pendingFiles.length > 0 && newContract.id) {
          await uploadAttachments(newContract.id, pendingFiles);
        }
        
        queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
        setShowCreateDialog(false);
        setFormData(emptyFormData);
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
        <div className="flex justify-end mb-4">
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
            List View
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2" data-testid="tab-calendar">
            <CalendarDays className="w-4 h-4" />
            Calendar View
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
                        </div>
                      </div>
                      {isCompanyAdmin && (
                        <div className="flex items-center gap-2">
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
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
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

            <div className="space-y-2">
              <Label htmlFor="clientId">Client Name</Label>
              <Select value={formData.clientId || "none"} onValueChange={(value) => setFormData({ ...formData, clientId: value === "none" ? "" : value })}>
                <SelectTrigger data-testid="select-client">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Client</SelectItem>
                  {clientsList.map(client => (
                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Link projects to this contract from the project settings.
              </p>
            </div>

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

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">Hourly Rates (for Billing)</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="regularRate">Regular Rate ($/hr)</Label>
                  <Input
                    id="regularRate"
                    type="number"
                    step="0.01"
                    value={formData.regularRate}
                    onChange={(e) => setFormData({ ...formData, regularRate: e.target.value })}
                    placeholder="0.00"
                    data-testid="input-regular-rate"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="overtimeRate">Overtime Rate ($/hr)</Label>
                  <Input
                    id="overtimeRate"
                    type="number"
                    step="0.01"
                    value={formData.overtimeRate}
                    onChange={(e) => setFormData({ ...formData, overtimeRate: e.target.value })}
                    placeholder="0.00"
                    data-testid="input-overtime-rate"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="premiumRate">Premium Rate ($/hr)</Label>
                  <Input
                    id="premiumRate"
                    type="number"
                    step="0.01"
                    value={formData.premiumRate}
                    onChange={(e) => setFormData({ ...formData, premiumRate: e.target.value })}
                    placeholder="0.00"
                    data-testid="input-premium-rate"
                  />
                </div>
              </div>
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
    </PageLayout>
  );
}

import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Users, FileText, Clock, Calendar, Info, Link2, Building2, Lightbulb, DollarSign } from "lucide-react";
import { ClientSelect } from "@/components/client-select";
import { useAuth } from "@/hooks/use-auth";
import type { ProposalWithDetails, Contract, Project } from "@shared/schema";
import { calculateTotalHours, calculateWorkingDays, getHolidaysInRange, formatHoursDisplay } from "@/lib/working-days-calculator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InspectorSelector } from "@/components/inspector-selector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

// Rate lookup types for contract billing rates and IOR pay rates
type RateLookupData = {
  contractOptions: {
    id: string;
    optionNumber: number;
    name: string;
    inspectors: { title: string; inspectorName?: string; rate: string; hours: string }[];
  }[];
  iorAgreements: {
    id: string;
    projectId: string;
    projectName: string;
    inspectorId: string;
    inspectorName: string;
    rate: string;
  }[];
  clientRates: { [key: string]: { rate: string; hours: string; title: string; optionName?: string } };
  inspectorPayRates: { [key: string]: { rate: string; inspectorId: string; projectName: string } };
};

type InspectorEntry = {
  title: string;
  inspectorName: string;
  rate: string;
  hours: string;
  scheduleType: "fullTime" | "partTime";
};

type OptionEntry = {
  name: string;
  inspectors: InspectorEntry[];
};

type ScheduleType = "fullTime" | "partTime";

type ProposalFormData = {
  clientId: string;
  clientName: string;
  contractId: string;
  projectId: string;
  projectName: string;
  projectManager: string;
  startDate: string;
  endDate: string;
  totalHours: string;
  scheduleType: ScheduleType;
  rateEscalationNote: string;
  terms: string;
};

const emptyInspector: InspectorEntry = {
  title: "",
  inspectorName: "",
  rate: "",
  hours: "",
  scheduleType: "fullTime",
};

const emptyOption: OptionEntry = {
  name: "",
  inspectors: [{ ...emptyInspector }],
};

const emptyFormData: ProposalFormData = {
  clientId: "",
  clientName: "",
  contractId: "",
  projectId: "",
  projectName: "",
  projectManager: "",
  startDate: "",
  endDate: "",
  totalHours: "",
  scheduleType: "fullTime",
  rateEscalationNote: "*Hourly Rate increase of $3 at the start of every January of the construction/contract period.",
  terms: `1. Knowland Construction Services agrees to provide for continuous inspection of work for compliance with approved contract documents. Project Inspector duties as outlined in Title 24, Part 1, Chapter 4, Sections 4-333 thru 4-342 California Code of Regulations, including DSA Interpretive Regulations A-6, A-7, A-8, and as incorporated in the following paragraphs.

2. Represent the District under the guidance of the designee of the District Superintendent.

3. Attend all planning, pre-construction conference, project meetings, or meetings as required by the District.

4. Monitor and observe all Special Inspections performed by the Districts contracted Testing Lab as required by the Testing and Inspections Sheet and as outlined in the Project Specifications. Maintain and update a log specifying hours spent on the project by Special Inspectors. Perform or monitor testing for Torque, Epoxy, Pull Tests, and other tests as approved by the DSA Field Engineer. Knowland Construction Services shall assist in minimizing unnecessary costs for testing where possible.

5. The District & the Inspector, Knowland Construction Services, shall each defend and hold harmless each other against any losses, liabilities, damages, injuries, claims, costs, or expenses arising out of or connected with the provisions of this agreement and the contract documents.

6. The Agreement shall begin upon written notice by a representative of the District and remain in effect continuously until project closeout, unless terminated in writing. Contract is intended to be an agency agreement and may be terminated in 15 days by either party with or without cause. This Agency Agreement shall be assignable to other schools within the District, and shall apply to other Inspectors as requested and approved by the District. The District shall not employ, contract, or engage in business or mutually beneficial relationships with Inspectors introduced to the District through Knowland Construction Services for a period of two (2) years after the dissolution of any contracts through Knowland Construction Services unless permission is granted prior to such relationships.

7. Knowland Construction Services shall maintain in effect a $1 million General Liability insurance policy, Workman's Compensation as required, and Full Liability Auto Insurance as required. District requests for additional insurances shall be paid additionally by the District at current market rates.

8. Long Beach Unified School District agrees to pay Knowland Construction Services the cost of project services billed at the rate as outlined in the fee schedule within 30 working days of receipt of invoice. KCS shall bill in (4) or (8) hour increments (to include drive time) for each site visit. If Fixed Fee option is selected, KCS shall bill half of the fixed fee amount at 50% project completion and the remaining amount at substantial completion of each project. Overtime shall be billed at 1 1/2 times standard pay or per the local operator's union. Fee schedule shall escalate $3/hr. each January after the contract is approved. KCS will allocate (4) hours per month for KCS administrative fees/ Project Management oversight. Knowland Construction Services (Project Inspectors /Project Managers/ Engineers) shall provide all necessary cell phones, laptop computers, digital cameras, and equipment necessary to maintain proper documentation and administrative functions throughout the duration of the project. The District shall provide all utility lines, office space and furniture on an off-site location. KCS at its own discretion may utilize project managers or project engineers to perform administrative, report writing, DSA Box, and other duties where it is in the interest of the project.

9. When an IOR is on vacation or unable to be at the project for reasons beyond his reasonable control, a Project Manager / Project Engineer will be assigned to oversee the project, and shall be responsible for the accurate reporting of all activities to the Inspector of Record. Hours billed for inspection services shall include only hours worked in support of the project. Other billing arrangements may be as agreed in writing by the District.`,
};

interface ProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProposal?: ProposalWithDetails | null;
}

export function ProposalDialog({ open, onOpenChange, editingProposal }: ProposalDialogProps) {
  const { toast } = useToast();
  const { activeCompany } = useAuth();
  const [formData, setFormData] = useState<ProposalFormData>(emptyFormData);
  const [options, setOptions] = useState<OptionEntry[]>([{ ...emptyOption, inspectors: [{ ...emptyInspector }] }]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch contracts for the company
  const { data: contracts = [] } = useQuery<Contract[]>({
    queryKey: ["/api/contracts"],
    enabled: !!activeCompany?.id && open,
  });

  // Fetch projects for the selected contract
  const { data: contractProjects = [] } = useQuery<Project[]>({
    queryKey: ["/api/contracts", formData.contractId, "projects"],
    enabled: !!formData.contractId && open,
  });

  // Fetch rate lookup data (contract options + IOR agreements) for rate suggestions
  const { data: rateLookup } = useQuery<RateLookupData>({
    queryKey: ["/api/contracts", formData.contractId, "rate-lookup"],
    enabled: !!formData.contractId && open,
  });

  // Helper function to normalize rate for comparison (handles "108" vs "108.00")
  const normalizeRate = (rate: string): number => {
    const num = parseFloat(rate || "0");
    return isNaN(num) ? 0 : num;
  };

  // Helper function to find suggested rate for an inspector based on name/title
  const getSuggestedRate = (inspectorName: string, title: string, currentRate: string) => {
    if (!rateLookup) return null;
    
    const nameKey = inspectorName.toLowerCase().trim();
    const titleKey = title.toLowerCase().trim();
    
    let suggestedRate: string | null = null;
    let source: "contract" | "ior" | null = null;
    let details: string | null = null;
    
    // First check by inspector name in client rates
    if (nameKey && rateLookup.clientRates[nameKey]) {
      suggestedRate = rateLookup.clientRates[nameKey].rate;
      source = "contract";
      details = `From ${rateLookup.clientRates[nameKey].optionName || "contract option"}`;
    }
    // Then check by title in client rates
    else if (titleKey && rateLookup.clientRates[titleKey]) {
      suggestedRate = rateLookup.clientRates[titleKey].rate;
      source = "contract";
      details = `From ${rateLookup.clientRates[titleKey].optionName || "contract option"}`;
    }
    // Check inspector pay rates (IOR agreements)
    else if (nameKey && rateLookup.inspectorPayRates[nameKey]) {
      suggestedRate = rateLookup.inspectorPayRates[nameKey].rate;
      source = "ior";
      details = `IOR rate from ${rateLookup.inspectorPayRates[nameKey].projectName}`;
    }
    
    if (!suggestedRate || !source || !details) return null;
    
    // Use normalized comparison to handle rate formatting differences
    if (normalizeRate(suggestedRate) === normalizeRate(currentRate)) {
      return null; // Already applied
    }
    
    return { rate: suggestedRate, source, details };
  };

  useEffect(() => {
    if (editingProposal) {
      setFormData({
        clientId: editingProposal.clientId || "",
        clientName: editingProposal.clientName,
        contractId: (editingProposal as any).contractId || "",
        projectId: (editingProposal as any).projectId || "",
        projectName: editingProposal.projectName,
        projectManager: editingProposal.projectManager || "",
        startDate: editingProposal.startDate ? new Date(editingProposal.startDate).toISOString().split('T')[0] : "",
        endDate: editingProposal.endDate ? new Date(editingProposal.endDate).toISOString().split('T')[0] : "",
        totalHours: editingProposal.totalHours || "",
        scheduleType: (editingProposal.scheduleType as ScheduleType) || "fullTime",
        rateEscalationNote: editingProposal.rateEscalationNote || "",
        terms: editingProposal.terms || "",
      });
      
      if (editingProposal.options && editingProposal.options.length > 0) {
        setOptions(editingProposal.options.map(opt => ({
          name: opt.name || "",
          inspectors: opt.inspectors.map(ins => ({
            title: ins.title,
            inspectorName: ins.inspectorName || "",
            rate: ins.rate,
            hours: ins.hours,
            scheduleType: (ins.scheduleType as "fullTime" | "partTime") || "fullTime",
          })),
        })));
      }
    } else {
      setFormData(emptyFormData);
      setOptions([{ ...emptyOption, inspectors: [{ ...emptyInspector }] }]);
    }
  }, [editingProposal, open]);

  // Handle contract selection - auto-populate client and dates from contract
  const handleContractChange = (contractId: string) => {
    const contract = contracts.find(c => c.id === contractId);
    if (contract) {
      setFormData(prev => ({
        ...prev,
        contractId,
        projectId: "", // Reset project when contract changes
        // Auto-populate from contract
        clientName: (contract as any).clientName || prev.clientName,
        clientId: (contract as any).clientId || prev.clientId,
        startDate: contract.startDate ? new Date(contract.startDate).toISOString().split('T')[0] : prev.startDate,
        endDate: contract.substantialCompletionDate ? new Date(contract.substantialCompletionDate).toISOString().split('T')[0] : prev.endDate,
      }));
    } else {
      setFormData(prev => ({ ...prev, contractId, projectId: "" }));
    }
  };

  // Handle project selection - auto-populate project name and dates
  const handleProjectChange = (projectId: string) => {
    const project = contractProjects.find(p => p.id === projectId);
    if (project) {
      setFormData(prev => ({
        ...prev,
        projectId,
        projectName: project.name,
        // Optionally override with project-specific dates if they differ from contract
        startDate: (project as any).startDate ? new Date((project as any).startDate).toISOString().split('T')[0] : prev.startDate,
        endDate: (project as any).substantialCompletionDate ? new Date((project as any).substantialCompletionDate).toISOString().split('T')[0] : prev.endDate,
      }));
    } else {
      setFormData(prev => ({ ...prev, projectId }));
    }
  };

  const calculatedData = useMemo(() => {
    const workingDays = calculateWorkingDays(formData.startDate, formData.endDate);
    const calculatedHours = calculateTotalHours(formData.startDate, formData.endDate, formData.scheduleType);
    const holidays = getHolidaysInRange(formData.startDate, formData.endDate);
    return { workingDays, calculatedHours, holidays };
  }, [formData.startDate, formData.endDate, formData.scheduleType]);

  const applyCalculatedHours = () => {
    setFormData(prev => ({ 
      ...prev, 
      totalHours: formatHoursDisplay(calculatedData.calculatedHours) 
    }));
  };

  const handleClientChange = (clientId: string, clientName?: string) => {
    setFormData(prev => ({
      ...prev,
      clientId,
      clientName: clientName || prev.clientName,
    }));
  };

  const addOption = () => {
    setOptions(prev => [...prev, { ...emptyOption, inspectors: [{ ...emptyInspector }] }]);
  };

  const removeOption = (optionIndex: number) => {
    if (options.length > 1) {
      setOptions(prev => prev.filter((_, i) => i !== optionIndex));
    }
  };

  const addInspector = (optionIndex: number) => {
    setOptions(prev => prev.map((opt, i) => 
      i === optionIndex 
        ? { ...opt, inspectors: [...opt.inspectors, { ...emptyInspector }] }
        : opt
    ));
  };

  const removeInspector = (optionIndex: number, inspectorIndex: number) => {
    setOptions(prev => prev.map((opt, i) => {
      if (i !== optionIndex) return opt;
      if (opt.inspectors.length <= 1) return opt;
      return { ...opt, inspectors: opt.inspectors.filter((_, j) => j !== inspectorIndex) };
    }));
  };

  const updateOption = (optionIndex: number, field: keyof OptionEntry, value: string) => {
    setOptions(prev => prev.map((opt, i) => 
      i === optionIndex ? { ...opt, [field]: value } : opt
    ));
  };

  const updateInspector = (optionIndex: number, inspectorIndex: number, field: keyof InspectorEntry, value: string) => {
    setOptions(prev => prev.map((opt, i) => {
      if (i !== optionIndex) return opt;
      return {
        ...opt,
        inspectors: opt.inspectors.map((ins, j) => 
          j === inspectorIndex ? { ...ins, [field]: value } : ins
        ),
      };
    }));
  };

  const calculateOptionTotal = (option: OptionEntry): number => {
    return option.inspectors.reduce((sum, ins) => {
      const rate = parseFloat(ins.rate) || 0;
      const hours = parseFloat(ins.hours) || 0;
      return sum + (rate * hours);
    }, 0);
  };

  const calculateInspectorTotal = (inspector: InspectorEntry): number => {
    const rate = parseFloat(inspector.rate) || 0;
    const hours = parseFloat(inspector.hours) || 0;
    return rate * hours;
  };

  const handleSubmit = async () => {
    if (!formData.clientName.trim()) {
      toast({ title: "Client name is required", variant: "destructive" });
      return;
    }
    if (!formData.projectName.trim()) {
      toast({ title: "Project name is required", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        startDate: formData.startDate ? new Date(formData.startDate).toISOString() : null,
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : null,
        options: options.map(opt => ({
          name: opt.name,
          inspectors: opt.inspectors.filter(ins => ins.title.trim() || ins.rate.trim()),
        })),
      };

      if (editingProposal) {
        await apiRequest("PATCH", `/api/proposals/${editingProposal.id}`, payload);
        toast({ title: "Proposal updated successfully" });
      } else {
        await apiRequest("POST", "/api/proposals", payload);
        toast({ title: "Proposal created successfully" });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      onOpenChange(false);
    } catch (error: any) {
      toast({ 
        title: editingProposal ? "Failed to update proposal" : "Failed to create proposal", 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {editingProposal ? "Edit Proposal" : "Create Quick Proposal"}
          </DialogTitle>
          <DialogDescription>
            Generate a professional proposal for project inspector services
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Contract & Project Linking Section */}
          <Card className="bg-muted/30 border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Link to Existing Contract/Project
                <Badge variant="outline" className="ml-auto">Optional</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contract</Label>
                  <Select
                    value={formData.contractId || undefined}
                    onValueChange={handleContractChange}
                  >
                    <SelectTrigger data-testid="select-proposal-contract">
                      <SelectValue placeholder="Select a contract..." />
                    </SelectTrigger>
                    <SelectContent>
                      {contracts.map(contract => (
                        <SelectItem key={contract.id} value={contract.id}>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            {contract.name}
                            {contract.contractNumber && (
                              <span className="text-xs text-muted-foreground">({contract.contractNumber})</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.contractId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6 px-2"
                      onClick={() => setFormData(prev => ({ ...prev, contractId: "", projectId: "" }))}
                    >
                      Clear contract link
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Project</Label>
                  <Select
                    value={formData.projectId || undefined}
                    onValueChange={handleProjectChange}
                    disabled={!formData.contractId}
                  >
                    <SelectTrigger data-testid="select-proposal-project">
                      <SelectValue placeholder={formData.contractId ? "Select a project..." : "Select contract first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {contractProjects.map(project => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {formData.contractId && (
                <p className="text-xs text-muted-foreground">
                  Linking auto-fills client, dates, and enables rate lookup from contract billing rates
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Client *</Label>
              {activeCompany?.id ? (
                <ClientSelect
                  value={formData.clientId}
                  onValueChange={handleClientChange}
                  companyId={activeCompany.id}
                  placeholder="Select or create a client"
                  data-testid="select-proposal-client"
                />
              ) : (
                <Input
                  value={formData.clientName}
                  onChange={(e) => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
                  placeholder="Enter client name"
                  data-testid="input-proposal-client-name"
                />
              )}
              {formData.clientName && (
                <p className="text-sm text-muted-foreground">Selected: {formData.clientName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name *</Label>
              <Input
                id="projectName"
                data-testid="input-proposal-project-name"
                value={formData.projectName}
                onChange={(e) => setFormData(prev => ({ ...prev, projectName: e.target.value }))}
                placeholder="e.g., Polytechnical HS CTE Building"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectManager">Project Manager</Label>
              <Input
                id="projectManager"
                data-testid="input-proposal-project-manager"
                value={formData.projectManager}
                onChange={(e) => setFormData(prev => ({ ...prev, projectManager: e.target.value }))}
                placeholder="e.g., Austin Knowland"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                data-testid="input-proposal-start-date"
                value={formData.startDate}
                onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                data-testid="input-proposal-end-date"
                value={formData.endDate}
                onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Schedule Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={formData.scheduleType === "fullTime" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormData(prev => ({ ...prev, scheduleType: "fullTime" }))}
                  className="flex-1"
                  data-testid="button-schedule-full-time"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Full Time (8 hrs/day)
                </Button>
                <Button
                  type="button"
                  variant={formData.scheduleType === "partTime" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormData(prev => ({ ...prev, scheduleType: "partTime" }))}
                  className="flex-1"
                  data-testid="button-schedule-part-time"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Part Time (4 hrs/day)
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="totalHours">Total Hours</Label>
              <div className="flex gap-2">
                <Input
                  id="totalHours"
                  data-testid="input-proposal-total-hours"
                  value={formData.totalHours}
                  onChange={(e) => setFormData(prev => ({ ...prev, totalHours: e.target.value }))}
                  placeholder="e.g., 4,488"
                  className="flex-1"
                />
                {formData.startDate && formData.endDate && calculatedData.calculatedHours > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={applyCalculatedHours}
                    className="whitespace-nowrap"
                    data-testid="button-apply-calculated-hours"
                  >
                    Use {formatHoursDisplay(calculatedData.calculatedHours)}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {formData.startDate && formData.endDate && calculatedData.workingDays > 0 && (
            <Card className="bg-muted/50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Hours Calculation Preview</span>
                      <span className="text-sm text-muted-foreground">
                        {formData.scheduleType === "fullTime" ? "Full Time" : "Part Time"} Schedule
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Working Days:</span>{" "}
                        <span className="font-medium">{calculatedData.workingDays}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Hours/Day:</span>{" "}
                        <span className="font-medium">{formData.scheduleType === "fullTime" ? 8 : 4}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Total Hours:</span>{" "}
                        <span className="font-medium text-primary">{formatHoursDisplay(calculatedData.calculatedHours)}</span>
                      </div>
                    </div>
                    {calculatedData.holidays.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="flex items-center gap-1 hover:text-foreground transition-colors">
                              <Info className="h-3 w-3" />
                              {calculatedData.holidays.length} holiday{calculatedData.holidays.length !== 1 ? 's' : ''} excluded
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs">
                            <div className="space-y-1">
                              {calculatedData.holidays.map(h => (
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
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-lg font-semibold flex items-center gap-2">
                <Users className="h-4 w-4" />
                Pricing Options
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOption}
                data-testid="button-add-option"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Option
              </Button>
            </div>

            {options.map((option, optionIndex) => (
              <Card key={optionIndex} className="relative">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="font-medium text-sm">Option #{optionIndex + 1}</span>
                      <Input
                        value={option.name}
                        onChange={(e) => updateOption(optionIndex, "name", e.target.value)}
                        placeholder="Option name (optional)"
                        className="max-w-xs h-8"
                        data-testid={`input-option-name-${optionIndex}`}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-green-600">
                        Total: ${calculateOptionTotal(option).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                      {options.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeOption(optionIndex)}
                          data-testid={`button-remove-option-${optionIndex}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {option.inspectors.map((inspector, inspectorIndex) => {
                    const inspectorHours = formData.startDate && formData.endDate
                      ? calculateTotalHours(formData.startDate, formData.endDate, inspector.scheduleType)
                      : 0;
                    
                    return (
                      <div key={inspectorIndex} className="border rounded-lg p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">Inspector #{inspectorIndex + 1}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-green-600">
                              ${calculateInspectorTotal(inspector).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                            {option.inspectors.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => removeInspector(optionIndex, inspectorIndex)}
                                data-testid={`button-remove-inspector-${optionIndex}-${inspectorIndex}`}
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
                              onChange={(e) => updateInspector(optionIndex, inspectorIndex, "title", e.target.value)}
                              placeholder="e.g., DSA Class 1 Inspector"
                              data-testid={`input-inspector-title-${optionIndex}-${inspectorIndex}`}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Inspector Name</Label>
                            <InspectorSelector
                              value=""
                              onValueChange={(_, option) => {
                                if (option) {
                                  updateInspector(optionIndex, inspectorIndex, "inspectorName", option.displayName);
                                }
                              }}
                              placeholder={inspector.inspectorName || "Select or type..."}
                              allowEmpty
                              allowCreate
                              className="h-9"
                              data-testid={`select-inspector-${optionIndex}-${inspectorIndex}`}
                            />
                            <Input
                              className="h-9 mt-1"
                              value={inspector.inspectorName}
                              onChange={(e) => updateInspector(optionIndex, inspectorIndex, "inspectorName", e.target.value)}
                              placeholder="Or type a name..."
                              data-testid={`input-inspector-name-${optionIndex}-${inspectorIndex}`}
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
                                onClick={() => updateInspector(optionIndex, inspectorIndex, "scheduleType", "fullTime")}
                                data-testid={`button-schedule-full-${optionIndex}-${inspectorIndex}`}
                              >
                                FT (8hr)
                              </Button>
                              <Button
                                type="button"
                                variant={inspector.scheduleType === "partTime" ? "default" : "outline"}
                                size="sm"
                                className="flex-1 h-9 text-xs px-2"
                                onClick={() => updateInspector(optionIndex, inspectorIndex, "scheduleType", "partTime")}
                                data-testid={`button-schedule-part-${optionIndex}-${inspectorIndex}`}
                              >
                                PT (4hr)
                              </Button>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs flex items-center gap-1">
                              Rate ($/hr)
                              {(() => {
                                const suggested = getSuggestedRate(inspector.inspectorName, inspector.title, inspector.rate);
                                if (suggested) {
                                  return (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge 
                                          variant="outline" 
                                          className={`text-[10px] h-4 px-1 cursor-pointer ${
                                            suggested.source === "contract" 
                                              ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100" 
                                              : "bg-green-50 text-green-600 border-green-200 hover:bg-green-100"
                                          }`}
                                          onClick={() => updateInspector(optionIndex, inspectorIndex, "rate", suggested.rate)}
                                          data-testid={`badge-suggested-rate-${optionIndex}-${inspectorIndex}`}
                                        >
                                          <Lightbulb className="h-2.5 w-2.5 mr-0.5" />
                                          ${suggested.rate}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        <p className="font-medium">{suggested.details}</p>
                                        <p className="text-xs text-muted-foreground">Click to apply</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  );
                                }
                                return null;
                              })()}
                            </Label>
                            <Input
                              className="h-9"
                              type="number"
                              value={inspector.rate}
                              onChange={(e) => updateInspector(optionIndex, inspectorIndex, "rate", e.target.value)}
                              placeholder="108.00"
                              data-testid={`input-inspector-rate-${optionIndex}-${inspectorIndex}`}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Hours</Label>
                            <div className="flex gap-1">
                              <Input
                                className="h-9 flex-1"
                                type="number"
                                value={inspector.hours}
                                onChange={(e) => updateInspector(optionIndex, inspectorIndex, "hours", e.target.value)}
                                placeholder="4488"
                                data-testid={`input-inspector-hours-${optionIndex}-${inspectorIndex}`}
                              />
                              {formData.startDate && formData.endDate && inspectorHours > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-9 px-2 text-xs whitespace-nowrap"
                                      onClick={() => updateInspector(optionIndex, inspectorIndex, "hours", String(inspectorHours))}
                                      data-testid={`button-calc-hours-${optionIndex}-${inspectorIndex}`}
                                    >
                                      {formatHoursDisplay(inspectorHours)}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Use calculated hours ({inspector.scheduleType === "fullTime" ? "8" : "4"} hrs/day × {calculatedData.workingDays} days)</p>
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
                    onClick={() => addInspector(optionIndex)}
                    className="w-full"
                    data-testid={`button-add-inspector-${optionIndex}`}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Inspector
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="rateEscalationNote">Rate Escalation Note</Label>
            <Input
              id="rateEscalationNote"
              data-testid="input-proposal-escalation-note"
              value={formData.rateEscalationNote}
              onChange={(e) => setFormData(prev => ({ ...prev, rateEscalationNote: e.target.value }))}
              placeholder="e.g., *Hourly Rate increase of $3 at the start of every January"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="terms">Terms & Conditions</Label>
            <Textarea
              id="terms"
              data-testid="textarea-proposal-terms"
              value={formData.terms}
              onChange={(e) => setFormData(prev => ({ ...prev, terms: e.target.value }))}
              placeholder="Enter contract terms and conditions..."
              className="min-h-[150px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-proposal">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            data-testid="button-save-proposal"
          >
            {isSubmitting ? "Saving..." : editingProposal ? "Update Proposal" : "Create Proposal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

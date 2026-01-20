import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Plus, Trash2, Users, FileText } from "lucide-react";
import { ClientSelect } from "@/components/client-select";
import { useAuth } from "@/hooks/use-auth";
import type { ProposalWithDetails } from "@shared/schema";

type InspectorEntry = {
  title: string;
  inspectorName: string;
  rate: string;
  hours: string;
};

type OptionEntry = {
  name: string;
  inspectors: InspectorEntry[];
};

type ProposalFormData = {
  clientId: string;
  clientName: string;
  projectName: string;
  projectManager: string;
  startDate: string;
  endDate: string;
  totalHours: string;
  rateEscalationNote: string;
  terms: string;
};

const emptyInspector: InspectorEntry = {
  title: "",
  inspectorName: "",
  rate: "",
  hours: "",
};

const emptyOption: OptionEntry = {
  name: "",
  inspectors: [{ ...emptyInspector }],
};

const emptyFormData: ProposalFormData = {
  clientId: "",
  clientName: "",
  projectName: "",
  projectManager: "",
  startDate: "",
  endDate: "",
  totalHours: "",
  rateEscalationNote: "*Hourly Rate increase of $3 at the start of every January of the construction/contract period.",
  terms: `1. Knowland Construction Services agrees to provide for continuous inspection of work for compliance with approved contract documents. Project Inspector duties as outlined in Title 24, Part 1, Chapter 4, Sections 4-333 thru 4-342 California Code of Regulations, including DSA Interpretive Regulations A-6, A-7, A-8.

2. Represent the District under the guidance of the designee of the District Superintendent.

3. Attend all planning, pre-construction conference, project meetings, or meetings as required by the District.

4. Monitor and observe all Special Inspections performed by the Districts contracted Testing Lab as required by the Testing and Inspections Sheet and as outlined in the Project Specifications.

5. The District & the Inspector shall each defend and hold harmless each other against any losses, liabilities, damages, injuries, claims, costs, or expenses arising out of or connected with the provisions of this agreement.

6. The Agreement shall begin upon written notice by a representative of the District and remain in effect continuously until project closeout, unless terminated in writing.

7. Knowland Construction Services shall maintain in effect a $1 million General Liability insurance policy, Workman's Compensation as required, and Full Liability Auto Insurance as required.

8. Client agrees to pay Knowland Construction Services the cost of project services billed at the rate as outlined in the fee schedule within 30 working days of receipt of invoice.

9. When an IOR is on vacation or unable to be at the project for reasons beyond his reasonable control, a Project Manager / Project Engineer will be assigned to oversee the project.`,
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

  useEffect(() => {
    if (editingProposal) {
      setFormData({
        clientId: editingProposal.clientId || "",
        clientName: editingProposal.clientName,
        projectName: editingProposal.projectName,
        projectManager: editingProposal.projectManager || "",
        startDate: editingProposal.startDate ? new Date(editingProposal.startDate).toISOString().split('T')[0] : "",
        endDate: editingProposal.endDate ? new Date(editingProposal.endDate).toISOString().split('T')[0] : "",
        totalHours: editingProposal.totalHours || "",
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
          })),
        })));
      }
    } else {
      setFormData(emptyFormData);
      setOptions([{ ...emptyOption, inspectors: [{ ...emptyInspector }] }]);
    }
  }, [editingProposal, open]);

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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

            <div className="space-y-2">
              <Label htmlFor="totalHours">Total Hours</Label>
              <Input
                id="totalHours"
                data-testid="input-proposal-total-hours"
                value={formData.totalHours}
                onChange={(e) => setFormData(prev => ({ ...prev, totalHours: e.target.value }))}
                placeholder="e.g., 4,488"
              />
            </div>
          </div>

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
                  <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
                    <div className="col-span-3">Title</div>
                    <div className="col-span-3">Inspector Name</div>
                    <div className="col-span-2">Rate ($)</div>
                    <div className="col-span-2">Hours</div>
                    <div className="col-span-1">Total</div>
                    <div className="col-span-1"></div>
                  </div>

                  {option.inspectors.map((inspector, inspectorIndex) => (
                    <div key={inspectorIndex} className="grid grid-cols-12 gap-2 items-center">
                      <Input
                        className="col-span-3 h-9"
                        value={inspector.title}
                        onChange={(e) => updateInspector(optionIndex, inspectorIndex, "title", e.target.value)}
                        placeholder="e.g., DSA Class 1 Inspector"
                        data-testid={`input-inspector-title-${optionIndex}-${inspectorIndex}`}
                      />
                      <Input
                        className="col-span-3 h-9"
                        value={inspector.inspectorName}
                        onChange={(e) => updateInspector(optionIndex, inspectorIndex, "inspectorName", e.target.value)}
                        placeholder="e.g., John Smith"
                        data-testid={`input-inspector-name-${optionIndex}-${inspectorIndex}`}
                      />
                      <Input
                        className="col-span-2 h-9"
                        type="number"
                        value={inspector.rate}
                        onChange={(e) => updateInspector(optionIndex, inspectorIndex, "rate", e.target.value)}
                        placeholder="108.00"
                        data-testid={`input-inspector-rate-${optionIndex}-${inspectorIndex}`}
                      />
                      <Input
                        className="col-span-2 h-9"
                        type="number"
                        value={inspector.hours}
                        onChange={(e) => updateInspector(optionIndex, inspectorIndex, "hours", e.target.value)}
                        placeholder="4488"
                        data-testid={`input-inspector-hours-${optionIndex}-${inspectorIndex}`}
                      />
                      <div className="col-span-1 text-sm font-medium text-right">
                        ${calculateInspectorTotal(inspector).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="col-span-1 flex justify-end">
                        {option.inspectors.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => removeInspector(optionIndex, inspectorIndex)}
                            data-testid={`button-remove-inspector-${optionIndex}-${inspectorIndex}`}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}

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

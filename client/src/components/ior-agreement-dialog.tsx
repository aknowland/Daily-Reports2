import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import type { Project, IorAgreement, User, UserProfile, Contract } from "@shared/schema";
import { InspectorSelector, parseInspectorId } from "@/components/inspector-selector";

type MemberWithUser = { userId: string; role: string; user?: User };
type MemberWithProfile = MemberWithUser & { profile?: UserProfile };

interface IorAgreementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agreement?: IorAgreement | null;
  companyId: string;
  companyName: string;
  defaultContractId?: string;
}

const DEFAULT_TERMS = `Project is on a part-time basis. To be billed in (4) increments per site visit (includes drive time). IOR to provide a Daily Report for each site visit that is billed. Any project paperwork must be uploaded to the KCS portal and stored by the IOR.`;

export function IorAgreementDialog({ 
  open, 
  onOpenChange, 
  agreement, 
  companyId,
  companyName,
  defaultContractId 
}: IorAgreementDialogProps) {
  const { toast } = useToast();
  const isEditing = !!agreement;

  const [formData, setFormData] = useState({
    contractId: "",
    projectId: "",
    inspectorId: "",
    agreementDate: new Date().toISOString().split("T")[0],
    clientName: "",
    consultantName: "",
    agentName: "",
    projectLocation: "",
    dsaAppNumber: "",
    rate: "",
    terms: DEFAULT_TERMS,
  });

  const { data: contracts = [] } = useQuery<Contract[]>({
    queryKey: ["/api/contracts"],
    enabled: open && !!companyId,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/companies", companyId, "projects"],
    enabled: open && !!companyId,
  });

  // Filter projects by selected contract (if any)
  const filteredProjects = formData.contractId
    ? projects.filter(p => p.contractId === formData.contractId)
    : projects;

  const { data: members = [] } = useQuery<MemberWithUser[]>({
    queryKey: ["/api/companies", companyId, "members"],
    enabled: open && !!companyId,
  });

  const { data: memberProfiles = [] } = useQuery<MemberWithProfile[]>({
    queryKey: ["/api/companies", companyId, "members", "profiles"],
    queryFn: async () => {
      const profilePromises = members.map(async (member) => {
        try {
          const res = await fetch(`/api/users/${member.userId}/profile`, { credentials: "include" });
          if (res.ok) {
            const profile = await res.json();
            return { ...member, profile };
          }
        } catch (e) {}
        return member;
      });
      return Promise.all(profilePromises);
    },
    enabled: open && members.length > 0,
  });

  useEffect(() => {
    if (agreement) {
      setFormData({
        contractId: agreement.contractId || "",
        projectId: agreement.projectId || "",
        inspectorId: agreement.inspectorId || "",
        agreementDate: agreement.agreementDate || new Date().toISOString().split("T")[0],
        clientName: agreement.clientName || "",
        consultantName: agreement.consultantName || "",
        agentName: agreement.agentName || "",
        projectLocation: agreement.projectLocation || "",
        dsaAppNumber: agreement.dsaAppNumber || "",
        rate: agreement.rate || "",
        terms: agreement.terms || DEFAULT_TERMS,
      });
    } else {
      setFormData({
        contractId: defaultContractId || "",
        projectId: "",
        inspectorId: "",
        agreementDate: new Date().toISOString().split("T")[0],
        clientName: "",
        consultantName: "",
        agentName: "",
        projectLocation: "",
        dsaAppNumber: "",
        rate: "",
        terms: DEFAULT_TERMS,
      });
    }
  }, [agreement, open, defaultContractId]);

  useEffect(() => {
    if (formData.projectId) {
      const project = projects.find(p => p.id === formData.projectId);
      if (project) {
        setFormData(prev => ({
          ...prev,
          contractId: project.contractId || prev.contractId,
          clientName: project.client || prev.clientName,
          projectLocation: project.address || prev.projectLocation,
          dsaAppNumber: project.projectNumber || prev.dsaAppNumber,
        }));
      }
    }
  }, [formData.projectId, projects]);

  useEffect(() => {
    if (formData.inspectorId && memberProfiles.length > 0) {
      const member = memberProfiles.find(m => m.userId === formData.inspectorId);
      if (member?.profile) {
        const firstName = member.profile.firstName || "";
        const lastName = member.profile.lastName || "";
        const fullName = `${firstName} ${lastName}`.trim();
        const shortName = lastName ? `${firstName.charAt(0)}. ${lastName}` : firstName;
        setFormData(prev => ({
          ...prev,
          consultantName: fullName || prev.consultantName,
          agentName: shortName ? `${shortName} – Agent` : prev.agentName,
        }));
      }
    }
  }, [formData.inspectorId, memberProfiles]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/ior-agreements", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ior-agreements"] });
      toast({ title: "IOR Agreement created successfully" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to create IOR Agreement", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("PATCH", `/api/ior-agreements/${agreement?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ior-agreements"] });
      toast({ title: "IOR Agreement updated successfully" });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to update IOR Agreement", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.projectId || !formData.inspectorId) {
      toast({ title: "Please select a project and inspector", variant: "destructive" });
      return;
    }
    if (isEditing) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-ior-agreement">
            {isEditing ? "Edit IOR Agreement" : "Generate IOR Agreement"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Contract, Project, and Team Member Selection */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contractId">Contract</Label>
              <Select
                value={formData.contractId || "__none__"}
                onValueChange={(value) => setFormData(prev => ({ 
                  ...prev, 
                  contractId: value === "__none__" ? "" : value,
                  projectId: value !== "__none__" ? "" : prev.projectId // Reset project if contract changes
                }))}
              >
                <SelectTrigger data-testid="select-contract">
                  <SelectValue placeholder="Select contract (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">All Projects</SelectItem>
                  {contracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {contract.contractNumber} - {contract.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectId">Project *</Label>
              <Select
                value={formData.projectId}
                onValueChange={(value) => setFormData(prev => ({ ...prev, projectId: value }))}
              >
                <SelectTrigger data-testid="select-project">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {filteredProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inspectorId">Inspector *</Label>
              <InspectorSelector
                value={formData.inspectorId.startsWith("member:") || formData.inspectorId.startsWith("team-inspector:") 
                  ? formData.inspectorId 
                  : formData.inspectorId ? `member:${formData.inspectorId}` : ""}
                onValueChange={(value) => {
                  const parsed = parseInspectorId(value);
                  if (parsed?.type === "member") {
                    setFormData(prev => ({ ...prev, inspectorId: parsed.id }));
                  } else if (parsed?.type === "team-inspector") {
                    setFormData(prev => ({ ...prev, inspectorId: value }));
                  } else {
                    setFormData(prev => ({ ...prev, inspectorId: value }));
                  }
                }}
                placeholder="Select inspector"
                allowCreate
                data-testid="select-inspector"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="agreementDate">Agreement Date</Label>
              <Input
                id="agreementDate"
                type="date"
                value={formData.agreementDate}
                onChange={(e) => setFormData(prev => ({ ...prev, agreementDate: e.target.value }))}
                data-testid="input-agreement-date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate">Rate ($/hr)</Label>
              <Input
                id="rate"
                placeholder="e.g., 63"
                value={formData.rate}
                onChange={(e) => setFormData(prev => ({ ...prev, rate: e.target.value }))}
                data-testid="input-rate"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clientName">Client / District</Label>
              <Input
                id="clientName"
                placeholder="Client name"
                value={formData.clientName}
                onChange={(e) => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
                data-testid="input-client-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dsaAppNumber">DSA App Number</Label>
              <Input
                id="dsaAppNumber"
                placeholder="e.g., #03-120212"
                value={formData.dsaAppNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, dsaAppNumber: e.target.value }))}
                data-testid="input-dsa-number"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="consultantName">Consultant Name</Label>
              <Input
                id="consultantName"
                placeholder="Full name"
                value={formData.consultantName}
                onChange={(e) => setFormData(prev => ({ ...prev, consultantName: e.target.value }))}
                data-testid="input-consultant-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agentName">Agent Name</Label>
              <Input
                id="agentName"
                placeholder="e.g., Bob Nelson – Agent"
                value={formData.agentName}
                onChange={(e) => setFormData(prev => ({ ...prev, agentName: e.target.value }))}
                data-testid="input-agent-name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="projectLocation">Project Location</Label>
            <Input
              id="projectLocation"
              placeholder="Project address or location"
              value={formData.projectLocation}
              onChange={(e) => setFormData(prev => ({ ...prev, projectLocation: e.target.value }))}
              data-testid="input-project-location"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="terms">Terms</Label>
            <Textarea
              id="terms"
              rows={4}
              placeholder="Additional terms..."
              value={formData.terms}
              onChange={(e) => setFormData(prev => ({ ...prev, terms: e.target.value }))}
              data-testid="input-terms"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} data-testid="button-submit-ior">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update Agreement" : "Create Agreement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
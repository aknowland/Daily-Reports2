import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, HardHat, Plus, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User, TeamInspector, CompanyMember } from "@shared/schema";

type MemberWithUser = CompanyMember & { user?: User };

export type InspectorOption = {
  id: string;
  type: "member" | "team-inspector";
  displayName: string;
  email?: string | null;
  title?: string | null;
};

interface InspectorSelectorProps {
  value: string | undefined;
  onValueChange: (value: string, option: InspectorOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
  includeTeamInspectors?: boolean;
  allowEmpty?: boolean;
  allowCreate?: boolean;
}

export function InspectorSelector({
  value,
  onValueChange,
  placeholder = "Select an inspector...",
  disabled = false,
  className,
  "data-testid": testId,
  includeTeamInspectors = true,
  allowEmpty = false,
  allowCreate = true,
}: InspectorSelectorProps) {
  const { activeCompany } = useAuth();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    title: "",
  });

  const { data: members = [], isLoading: membersLoading } = useQuery<MemberWithUser[]>({
    queryKey: ["/api/companies", activeCompany?.id, "members"],
    enabled: !!activeCompany?.id,
  });

  const { data: teamInspectors = [], isLoading: teamInspectorsLoading } = useQuery<TeamInspector[]>({
    queryKey: ["/api/companies", activeCompany?.id, "team-inspectors"],
    enabled: !!activeCompany?.id && includeTeamInspectors,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; email?: string; title?: string }) => {
      const response = await apiRequest("POST", `/api/companies/${activeCompany?.id}/team-inspectors`, data);
      return response.json();
    },
    onSuccess: (newInspector: TeamInspector) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "team-inspectors"] });
      toast({ title: "Inspector created", description: `${newInspector.firstName} ${newInspector.lastName} added to team inspectors.` });
      setShowCreateDialog(false);
      setFormData({ firstName: "", lastName: "", email: "", title: "" });
      const newId = `team-inspector:${newInspector.id}`;
      onValueChange(newId, {
        id: newId,
        type: "team-inspector",
        displayName: `${newInspector.firstName} ${newInspector.lastName}`,
        email: newInspector.email,
        title: newInspector.title,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const isLoading = membersLoading || (includeTeamInspectors && teamInspectorsLoading);

  const options: InspectorOption[] = [
    ...members.map((member) => ({
      id: `member:${member.userId}`,
      type: "member" as const,
      displayName: member.user?.firstName && member.user?.lastName
        ? `${member.user.firstName} ${member.user.lastName}`
        : member.user?.email || member.userId,
      email: member.user?.email,
      title: null,
    })),
    ...(includeTeamInspectors ? teamInspectors.filter(ti => ti.status !== "active").map((ti) => ({
      id: `team-inspector:${ti.id}`,
      type: "team-inspector" as const,
      displayName: `${ti.firstName} ${ti.lastName}`,
      email: ti.email,
      title: ti.title,
    })) : []),
  ];

  const selectedOption = options.find(o => o.id === value);

  const handleChange = (newValue: string) => {
    if (newValue === "__empty__") {
      onValueChange("", null);
      return;
    }
    if (newValue === "__create__") {
      setShowCreateDialog(true);
      return;
    }
    const option = options.find(o => o.id === newValue);
    onValueChange(newValue, option || null);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.firstName || !formData.lastName) return;
    createMutation.mutate({
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email || undefined,
      title: formData.title || undefined,
    });
  };

  return (
    <>
      <Select
        value={value || (allowEmpty ? "__empty__" : undefined)}
        onValueChange={handleChange}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className={className} data-testid={testId}>
          <SelectValue placeholder={isLoading ? "Loading..." : placeholder}>
            {selectedOption && (
              <span className="flex items-center gap-2">
                {selectedOption.type === "member" ? (
                  <Users className="w-3 h-3 text-muted-foreground" />
                ) : (
                  <HardHat className="w-3 h-3 text-muted-foreground" />
                )}
                {selectedOption.displayName}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && (
            <SelectItem value="__empty__">
              <span className="text-muted-foreground">None selected</span>
            </SelectItem>
          )}
          
          {members.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                Active Team Members
              </div>
              {members.map((member) => {
                const id = `member:${member.userId}`;
                const displayName = member.user?.firstName && member.user?.lastName
                  ? `${member.user.firstName} ${member.user.lastName}`
                  : member.user?.email || member.userId;
                
                return (
                  <SelectItem key={id} value={id}>
                    <div className="flex items-center gap-2">
                      <Users className="w-3 h-3 text-muted-foreground" />
                      <span>{displayName}</span>
                      <Badge variant="outline" className="text-xs ml-1 no-default-hover-elevate no-default-active-elevate">
                        Active
                      </Badge>
                    </div>
                  </SelectItem>
                );
              })}
            </>
          )}
          
          {includeTeamInspectors && teamInspectors.filter(ti => ti.status !== "active").length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
                Team Inspectors (Not Yet Joined)
              </div>
              {teamInspectors.filter(ti => ti.status !== "active").map((ti) => {
                const id = `team-inspector:${ti.id}`;
                
                return (
                  <SelectItem key={id} value={id}>
                    <div className="flex items-center gap-2">
                      <HardHat className="w-3 h-3 text-muted-foreground" />
                      <span>{ti.firstName} {ti.lastName}</span>
                      {ti.title && (
                        <span className="text-xs text-muted-foreground">({ti.title})</span>
                      )}
                      <Badge variant="secondary" className="text-xs ml-1 no-default-hover-elevate no-default-active-elevate">
                        Pending
                      </Badge>
                    </div>
                  </SelectItem>
                );
              })}
            </>
          )}
          
          {options.length === 0 && !isLoading && !allowCreate && (
            <div className="px-2 py-4 text-sm text-muted-foreground text-center">
              No inspectors available
            </div>
          )}

          {allowCreate && includeTeamInspectors && (
            <>
              <div className="border-t my-1" />
              <SelectItem value="__create__">
                <div className="flex items-center gap-2 text-primary">
                  <Plus className="w-3 h-3" />
                  <span>Add New Team Inspector</span>
                </div>
              </SelectItem>
            </>
          )}
        </SelectContent>
      </Select>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardHat className="w-5 h-5" />
              Add Team Inspector
            </DialogTitle>
            <DialogDescription>
              Create a profile for an inspector who hasn't joined yet.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="create-firstName">First Name *</Label>
                <Input
                  id="create-firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="John"
                  required
                  data-testid="input-create-inspector-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-lastName">Last Name *</Label>
                <Input
                  id="create-lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Smith"
                  required
                  data-testid="input-create-inspector-last-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john.smith@example.com"
                data-testid="input-create-inspector-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-title">Title / Position</Label>
              <Input
                id="create-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Project Inspector"
                data-testid="input-create-inspector-title"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || !formData.firstName || !formData.lastName}
                data-testid="button-create-inspector-submit"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add Inspector
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function parseInspectorId(compositeId: string): { type: "member" | "team-inspector"; id: string } | null {
  if (compositeId.startsWith("member:")) {
    return { type: "member", id: compositeId.slice(7) };
  }
  if (compositeId.startsWith("team-inspector:")) {
    return { type: "team-inspector", id: compositeId.slice(15) };
  }
  return null;
}

export function getInspectorName(compositeId: string, members: MemberWithUser[], teamInspectors: TeamInspector[]): string {
  const parsed = parseInspectorId(compositeId);
  if (!parsed) return compositeId;

  if (parsed.type === "member") {
    const member = members.find(m => m.userId === parsed.id);
    if (member?.user) {
      return member.user.firstName && member.user.lastName
        ? `${member.user.firstName} ${member.user.lastName}`
        : member.user.email || parsed.id;
    }
  } else {
    const inspector = teamInspectors.find(ti => ti.id === parsed.id);
    if (inspector) {
      if (inspector.status === "active" && inspector.linkedUserId) {
        const member = members.find(m => m.userId === inspector.linkedUserId);
        if (member?.user) {
          return member.user.firstName && member.user.lastName
            ? `${member.user.firstName} ${member.user.lastName}`
            : member.user.email || parsed.id;
        }
      }
      return `${inspector.firstName} ${inspector.lastName}`;
    }
  }
  
  return compositeId;
}

export function resolveInspectorId(storedId: string, teamInspectors: TeamInspector[]): string {
  const parsed = parseInspectorId(storedId);
  if (!parsed) return storedId;

  if (parsed.type === "member") {
    return storedId;
  }

  const inspector = teamInspectors.find(ti => ti.id === parsed.id);
  if (inspector?.status === "active" && inspector.linkedUserId) {
    return `member:${inspector.linkedUserId}`;
  }

  return storedId;
}

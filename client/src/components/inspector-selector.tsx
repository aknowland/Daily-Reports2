import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Users, HardHat } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
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
}: InspectorSelectorProps) {
  const { activeCompany } = useAuth();

  const { data: members = [], isLoading: membersLoading } = useQuery<MemberWithUser[]>({
    queryKey: ["/api/companies", activeCompany?.id, "members"],
    enabled: !!activeCompany?.id,
  });

  const { data: teamInspectors = [], isLoading: teamInspectorsLoading } = useQuery<TeamInspector[]>({
    queryKey: ["/api/companies", activeCompany?.id, "team-inspectors"],
    enabled: !!activeCompany?.id && includeTeamInspectors,
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
    const option = options.find(o => o.id === newValue);
    onValueChange(newValue, option || null);
  };

  return (
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
        
        {options.length === 0 && !isLoading && (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            No inspectors available
          </div>
        )}
      </SelectContent>
    </Select>
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
      // If merged, try to find linked user
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

/**
 * Resolves a stored inspector ID to the current active ID.
 * If a team-inspector has been merged with a member, returns the member ID instead.
 */
export function resolveInspectorId(storedId: string, teamInspectors: TeamInspector[]): string {
  const parsed = parseInspectorId(storedId);
  if (!parsed) return storedId;

  // If it's already a member ID, no resolution needed
  if (parsed.type === "member") {
    return storedId;
  }

  // If it's a team-inspector ID, check if they've been merged
  const inspector = teamInspectors.find(ti => ti.id === parsed.id);
  if (inspector?.status === "active" && inspector.linkedUserId) {
    // Return the linked member ID instead
    return `member:${inspector.linkedUserId}`;
  }

  return storedId;
}

import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Users,
  ArrowLeft,
  AlertCircle,
  Mail,
  Shield,
  Trash2,
  UserPlus,
  HardHat,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import type { CompanyMember, User, Project, Invite } from "@shared/schema";

const KNOWLAND_COMPANY_NAME = "Knowland Construction Services";

type MemberWithUser = CompanyMember & { user?: User };

type InviteWithDetails = Invite & { projects?: Project[] };

export default function CompanyTeamPage() {
  const { toast } = useToast();
  const { activeCompany, isCompanyAdmin, profile } = useAuth();
  const [memberToRemove, setMemberToRemove] = useState<MemberWithUser | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: "",
    role: "inspector" as "inspector" | "admin",
    projectIds: [] as string[],
  });

  const { data: members = [], isLoading, error } = useQuery<MemberWithUser[]>({
    queryKey: ["/api/companies", activeCompany?.id, "members"],
    enabled: !!activeCompany?.id && isCompanyAdmin,
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/companies", activeCompany?.id, "projects"],
    enabled: !!activeCompany?.id && isCompanyAdmin,
  });

  const { data: pendingInvites = [] } = useQuery<InviteWithDetails[]>({
    queryKey: ["/api/admin/invites"],
    enabled: isCompanyAdmin,
    select: (data) => data.filter(inv => inv.companyId === activeCompany?.id && inv.status === "pending"),
  });

  const isKnowlandCompany = activeCompany?.name?.includes("Knowland Construction");

  const createInviteMutation = useMutation({
    mutationFn: async (data: typeof inviteForm & { companyId: string }) => {
      return apiRequest("POST", "/api/admin/invites", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      setShowInviteDialog(false);
      setInviteForm({ email: "", role: "inspector", projectIds: [] });
      toast({
        title: "Invitation Sent",
        description: "The invitation has been sent successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send invitation",
        variant: "destructive",
      });
    },
  });

  const deleteInviteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/invites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({
        title: "Invitation Cancelled",
        description: "The invitation has been cancelled.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to cancel invitation.",
        variant: "destructive",
      });
    },
  });

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCompany?.id) return;
    createInviteMutation.mutate({
      ...inviteForm,
      companyId: activeCompany.id,
    });
  };

  const toggleProject = (projectId: string) => {
    setInviteForm(prev => ({
      ...prev,
      projectIds: prev.projectIds.includes(projectId)
        ? prev.projectIds.filter(id => id !== projectId)
        : [...prev.projectIds, projectId],
    }));
  };

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest("PATCH", `/api/companies/${activeCompany?.id}/members/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-companies"] });
      toast({
        title: "Role Updated",
        description: "Member role has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update member role.",
        variant: "destructive",
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/companies/${activeCompany?.id}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "members"] });
      setMemberToRemove(null);
      toast({
        title: "Member Removed",
        description: "Member has been removed from the company.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove member.",
        variant: "destructive",
      });
    },
  });

  if (!isCompanyAdmin || !activeCompany) {
    return (
      <PageLayout title="Team Members">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="w-12 h-12 text-destructive mb-4" />
              <p className="text-lg font-medium">Access Denied</p>
              <p className="text-muted-foreground">You must be a company admin to view this page</p>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  if (isLoading) {
    return (
      <PageLayout title="Team Members">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-12 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout title="Team Members">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg">
          <div className="flex items-center gap-2 mb-6">
            <Button variant="ghost" size="sm" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="w-12 h-12 text-destructive mb-4" />
              <p className="text-lg font-medium">Failed to load team members</p>
              <p className="text-muted-foreground">Please try again later</p>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Team Members">
      <div className="container px-4 py-6 mx-auto max-w-screen-lg space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" asChild data-testid="button-back">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Dashboard
            </Link>
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="title-team">Team Members</h1>
            <p className="text-muted-foreground">
              Manage team members for {activeCompany.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="flex items-center gap-1 no-default-hover-elevate no-default-active-elevate">
              <Users className="w-3 h-3" />
              {members.length} members
            </Badge>
            <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
              <DialogTrigger asChild>
                <Button data-testid="button-invite-user">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invite User
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Invite Team Member</DialogTitle>
                  <DialogDescription>
                    Send an invitation to join {activeCompany.name}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleInviteSubmit}>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">Email Address</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        placeholder="user@example.com"
                        value={inviteForm.email}
                        onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                        required
                        data-testid="input-invite-email"
                      />
                    </div>

                    {!isKnowlandCompany && (
                      <div className="rounded-md border bg-muted/50 p-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <AlertCircle className="w-4 h-4 text-primary" />
                          Subscription Information
                        </div>
                        <p className="text-xs text-muted-foreground">
                          New users will need an active subscription to create unlimited reports:
                        </p>
                        <div className="text-xs space-y-1 pl-2">
                          <p><strong>Free:</strong> 5 reports/month (no payment required)</p>
                          <p><strong>Independent Pro:</strong> $49/month (unlimited reports)</p>
                          <p><strong>Company User:</strong> $79/month per user</p>
                          <p><strong>Company Account:</strong> $499/month (unlimited users)</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Users can start with Free and upgrade later.
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="invite-role">Role</Label>
                      <Select
                        value={inviteForm.role}
                        onValueChange={(role: "inspector" | "admin") => 
                          setInviteForm({ ...inviteForm, role })
                        }
                      >
                        <SelectTrigger data-testid="select-invite-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inspector">
                            <div className="flex items-center gap-2">
                              <HardHat className="w-4 h-4" />
                              Inspector
                            </div>
                          </SelectItem>
                          <SelectItem value="admin">
                            <div className="flex items-center gap-2">
                              <Shield className="w-4 h-4" />
                              Admin
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {projects.length > 0 && (
                      <div className="space-y-2">
                        <Label>Assign to Projects (optional)</Label>
                        <div className="border rounded-md max-h-32 overflow-y-auto p-2 space-y-1">
                          {projects.map((project) => (
                            <label
                              key={project.id}
                              className="flex items-center gap-2 p-2 rounded hover-elevate cursor-pointer"
                            >
                              <Checkbox
                                checked={inviteForm.projectIds.includes(project.id)}
                                onCheckedChange={() => toggleProject(project.id)}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{project.name}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowInviteDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createInviteMutation.isPending || !inviteForm.email}
                      data-testid="button-send-invite"
                    >
                      {createInviteMutation.isPending && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      Send Invite
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {members.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No team members</p>
              <p className="text-muted-foreground">
                Invite team members to your company
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {members.map((member) => {
              const isCurrentUser = member.userId === profile?.userId;
              const displayName = member.user?.firstName && member.user?.lastName
                ? `${member.user.firstName} ${member.user.lastName}`
                : member.user?.email || "Unknown User";

              return (
                <Card key={member.id} data-testid={`card-member-${member.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate" data-testid={`text-member-name-${member.id}`}>
                            {displayName}
                          </p>
                          {isCurrentUser && (
                            <Badge variant="secondary" className="text-xs">You</Badge>
                          )}
                        </div>
                        {member.user?.email && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <Mail className="w-3 h-3" />
                            <span className="truncate">{member.user.email}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={member.role}
                          onValueChange={(value) => updateRoleMutation.mutate({ userId: member.userId, role: value })}
                          disabled={isCurrentUser || updateRoleMutation.isPending}
                        >
                          <SelectTrigger className="w-32" data-testid={`select-role-${member.id}`}>
                            <Shield className="w-3 h-3 mr-1" />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inspector">Inspector</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        {!isCurrentUser && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setMemberToRemove(member)}
                            data-testid={`button-remove-${member.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pending Invitations Section */}
        {pendingInvites.length > 0 && (
          <div className="space-y-4 mt-8">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Pending Invitations</h2>
              <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">
                {pendingInvites.length}
              </Badge>
            </div>
            {pendingInvites.map((invite) => (
              <Card key={invite.id} className="border-dashed" data-testid={`card-pending-invite-${invite.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <p className="font-medium truncate">{invite.email}</p>
                        <Badge variant="outline" className="text-xs no-default-hover-elevate no-default-active-elevate">
                          {invite.role === "admin" ? (
                            <><Shield className="w-3 h-3 mr-1" />Admin</>
                          ) : (
                            <><HardHat className="w-3 h-3 mr-1" />Inspector</>
                          )}
                        </Badge>
                      </div>
                      {invite.projects && invite.projects.length > 0 && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                          <FolderOpen className="w-3 h-3" />
                          <span>{invite.projects.length} project{invite.projects.length > 1 ? "s" : ""} assigned</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteInviteMutation.mutate(invite.id)}
                      disabled={deleteInviteMutation.isPending}
                      data-testid={`button-cancel-invite-${invite.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {memberToRemove?.user?.firstName || memberToRemove?.user?.email || "this member"} from {activeCompany.name}? They will lose access to all company projects.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => memberToRemove && removeMemberMutation.mutate(memberToRemove.userId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-remove"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}

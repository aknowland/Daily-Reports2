import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Plus,
  Search,
  FolderOpen,
  Edit,
  Trash2,
  MapPin,
  Mail,
  Loader2,
  AlertCircle,
  Users,
  UserPlus,
  X,
  ArrowLeft,
  DollarSign,
  Save,
} from "lucide-react";
import { Link } from "wouter";
import type { Project, ProjectMember, User } from "@shared/schema";

type MemberWithUser = ProjectMember & { user?: User };
type UserWithProfile = User & { profile?: { role: string } };

export default function AdminProjectsPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [showTeamDialog, setShowTeamDialog] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [editingMemberRates, setEditingMemberRates] = useState<{
    [userId: string]: { regularRate: string; overtimeRate: string; premiumRate: string }
  }>({});
  const [formData, setFormData] = useState({
    name: "",
    projectNumber: "",
    client: "",
    address: "",
    distributionEmails: "",
    defaultFolderPath: "",
  });

  const { data: projects, isLoading, error } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: allUsers } = useQuery<UserWithProfile[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: projectMembers, isLoading: loadingMembers } = useQuery<MemberWithUser[]>({
    queryKey: ["/api/projects", selectedProject?.id, "members"],
    enabled: !!selectedProject?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        ...data,
        distributionEmails: data.distributionEmails
          .split(",")
          .map((e) => e.trim())
          .filter((e) => e),
      };
      return apiRequest("POST", "/api/projects", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowDialog(false);
      resetForm();
      toast({
        title: "Project Created",
        description: "The project has been created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create project",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const payload = {
        ...data,
        distributionEmails: data.distributionEmails
          .split(",")
          .map((e) => e.trim())
          .filter((e) => e),
      };
      return apiRequest("PATCH", `/api/projects/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowDialog(false);
      setEditingProject(null);
      resetForm();
      toast({
        title: "Project Updated",
        description: "The project has been updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update project",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Project Deleted",
        description: "The project has been deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete project",
        variant: "destructive",
      });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ projectId, userId }: { projectId: string; userId: string }) => {
      return apiRequest("POST", `/api/projects/${projectId}/members`, { userId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProject?.id, "members"] });
      setSelectedUserId("");
      toast({
        title: "Member Added",
        description: "The team member has been added to this project",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add member",
        variant: "destructive",
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ projectId, userId }: { projectId: string; userId: string }) => {
      return apiRequest("DELETE", `/api/projects/${projectId}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProject?.id, "members"] });
      toast({
        title: "Member Removed",
        description: "The team member has been removed from this project",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to remove member",
        variant: "destructive",
      });
    },
  });

  const updateRatesMutation = useMutation({
    mutationFn: async ({ projectId, userId, rates }: { 
      projectId: string; 
      userId: string; 
      rates: { regularRate?: string; overtimeRate?: string; premiumRate?: string } 
    }) => {
      return apiRequest("PATCH", `/api/projects/${projectId}/members/${userId}/rates`, rates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProject?.id, "members"] });
      toast({
        title: "Rates Updated",
        description: "The inspector's billing rates have been updated",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update rates",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      projectNumber: "",
      client: "",
      address: "",
      distributionEmails: "",
      defaultFolderPath: "",
    });
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name: project.name,
      projectNumber: project.projectNumber,
      client: project.client || "",
      address: project.address || "",
      distributionEmails: (project.distributionEmails as string[])?.join(", ") || "",
      defaultFolderPath: project.defaultFolderPath || "",
    });
    setShowDialog(true);
  };

  const handleManageTeam = (project: Project) => {
    setSelectedProject(project);
    setShowTeamDialog(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProject) {
      updateMutation.mutate({ id: editingProject.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleAddMember = () => {
    if (selectedProject && selectedUserId) {
      addMemberMutation.mutate({ projectId: selectedProject.id, userId: selectedUserId });
    }
  };

  const handleRemoveMember = (userId: string) => {
    if (selectedProject) {
      removeMemberMutation.mutate({ projectId: selectedProject.id, userId });
    }
  };

  const filteredProjects = projects?.filter(
    (project) =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.projectNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const memberUserIds = projectMembers?.map(m => m.userId) || [];
  const availableUsers = allUsers?.filter(u => 
    !memberUserIds.includes(u.id) && u.profile?.role === "inspector"
  ) || [];

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const getInitials = (user?: User) => {
    if (!user) return "?";
    const first = user.firstName?.charAt(0) || "";
    const last = user.lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || user.email?.charAt(0).toUpperCase() || "?";
  };

  const getUserDisplayName = (user?: User) => {
    if (!user) return "Unknown User";
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.email || "Unknown User";
  };

  return (
    <PageLayout title="Projects" isAdmin>
      <div className="container px-4 py-6 mx-auto max-w-screen-xl space-y-6">
        <PageHeader icon={FolderOpen} title="Projects" subtitle={`${projects?.length || 0} total projects`}>
          <Dialog open={showDialog} onOpenChange={(open) => {
            setShowDialog(open);
            if (!open) {
              setEditingProject(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold shadow-sm" data-testid="button-add-project">
                <Plus className="w-4 h-4 mr-2" />
                Add Project
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingProject ? "Edit Project" : "Add New Project"}
                </DialogTitle>
                <DialogDescription>
                  {editingProject
                    ? "Update the project details below"
                    : "Enter the details for the new project"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Project Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Downtown Office Tower"
                    required
                    data-testid="input-project-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="projectNumber">Project Number *</Label>
                  <Input
                    id="projectNumber"
                    value={formData.projectNumber}
                    onChange={(e) => setFormData((prev) => ({ ...prev, projectNumber: e.target.value }))}
                    placeholder="PRJ-2026-001"
                    required
                    data-testid="input-project-number"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client">Client</Label>
                  <Input
                    id="client"
                    value={formData.client}
                    onChange={(e) => setFormData((prev) => ({ ...prev, client: e.target.value }))}
                    placeholder="ABC Construction Company"
                    data-testid="input-project-client"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                    placeholder="123 Main Street, City, State 12345"
                    rows={2}
                    data-testid="input-project-address"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="distributionEmails">Distribution Emails</Label>
                  <Textarea
                    id="distributionEmails"
                    value={formData.distributionEmails}
                    onChange={(e) => setFormData((prev) => ({ ...prev, distributionEmails: e.target.value }))}
                    placeholder="client@example.com, pm@example.com"
                    rows={2}
                    data-testid="input-distribution-emails"
                  />
                  <p className="text-xs text-muted-foreground">
                    Separate multiple emails with commas
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="defaultFolderPath">Default Folder Path</Label>
                  <Input
                    id="defaultFolderPath"
                    value={formData.defaultFolderPath}
                    onChange={(e) => setFormData((prev) => ({ ...prev, defaultFolderPath: e.target.value }))}
                    placeholder="/storage/reports/PRJ-2026-001/"
                    data-testid="input-folder-path"
                  />
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting} data-testid="button-save-project">
                    {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editingProject ? "Update" : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </PageHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-10 max-w-sm"
            data-testid="input-search-projects"
          />
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-4" />
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
              <p className="text-lg font-medium">Failed to load projects</p>
              <p className="text-sm text-muted-foreground mt-1">
                Please try again later
              </p>
            </CardContent>
          </Card>
        ) : filteredProjects?.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              {searchTerm ? (
                <>
                  <p className="text-lg font-medium">No matching projects</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Try adjusting your search
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium">No projects yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add your first project to get started
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjects?.map((project) => (
              <Card 
                key={project.id}
                className="hover-elevate h-full"
                data-testid={`card-project-${project.id}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-2 mb-4">
                    <Link 
                      href={`/reports?project=${project.id}`}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <h3 className="font-semibold truncate hover:text-primary transition-colors">{project.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        #{project.projectNumber}
                        {project.client && ` • ${project.client}`}
                      </p>
                    </Link>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleManageTeam(project)}
                        data-testid={`button-team-project-${project.id}`}
                      >
                        <Users className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(project)}
                        data-testid={`button-edit-project-${project.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(project.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-project-${project.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <Link 
                    href={`/reports?project=${project.id}`}
                    className="block cursor-pointer"
                  >
                    {project.address && (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground mb-2">
                        <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{project.address}</span>
                      </div>
                    )}

                    {(project.distributionEmails as string[])?.length > 0 && (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Mail className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span className="truncate">
                          {(project.distributionEmails as string[]).length} recipient(s)
                        </span>
                      </div>
                    )}
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={showTeamDialog} onOpenChange={(open) => {
          setShowTeamDialog(open);
          if (!open) {
            setSelectedProject(null);
            setSelectedUserId("");
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Manage Team</DialogTitle>
              <DialogDescription>
                {selectedProject?.name} - Add or remove inspectors from this project
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex gap-2">
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="flex-1" data-testid="select-add-member">
                    <SelectValue placeholder="Select an inspector to add" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUsers.length === 0 ? (
                      <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                        No available inspectors
                      </div>
                    ) : (
                      availableUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {getUserDisplayName(user)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button 
                  onClick={handleAddMember}
                  disabled={!selectedUserId || addMemberMutation.isPending}
                  data-testid="button-add-member"
                >
                  {addMemberMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                </Button>
              </div>

              <div className="border rounded-lg">
                <div className="px-4 py-2 border-b bg-muted/50">
                  <h4 className="text-sm font-medium">Team Members & Billing Rates</h4>
                </div>
                <div className="divide-y max-h-96 overflow-y-auto">
                  {loadingMembers ? (
                    <div className="p-4 space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-3">
                          <Skeleton className="w-8 h-8 rounded-full" />
                          <Skeleton className="h-4 flex-1" />
                        </div>
                      ))}
                    </div>
                  ) : projectMembers?.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No team members assigned yet
                    </div>
                  ) : (
                    projectMembers?.map((member) => {
                      const currentRates = editingMemberRates[member.userId] || {
                        regularRate: member.regularRate || '',
                        overtimeRate: member.overtimeRate || '',
                        premiumRate: member.premiumRate || '',
                      };
                      const hasChanges = 
                        currentRates.regularRate !== (member.regularRate || '') ||
                        currentRates.overtimeRate !== (member.overtimeRate || '') ||
                        currentRates.premiumRate !== (member.premiumRate || '');
                      
                      return (
                        <div 
                          key={member.id}
                          className="px-4 py-3 space-y-3"
                          data-testid={`member-${member.userId}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={member.user?.profileImageUrl || undefined} />
                                <AvatarFallback className="text-xs">
                                  {getInitials(member.user)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {getUserDisplayName(member.user)}
                                </p>
                                {member.user?.email && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {member.user.email}
                                  </p>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleRemoveMember(member.userId)}
                              disabled={removeMemberMutation.isPending}
                              data-testid={`button-remove-member-${member.userId}`}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                          
                          <div className="flex items-center gap-2 pl-11">
                            <div className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3 text-muted-foreground" />
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Reg"
                                className="w-20 h-8 text-xs"
                                value={currentRates.regularRate}
                                onChange={(e) => setEditingMemberRates(prev => ({
                                  ...prev,
                                  [member.userId]: {
                                    ...currentRates,
                                    regularRate: e.target.value,
                                  }
                                }))}
                                data-testid={`input-regular-rate-${member.userId}`}
                              />
                            </div>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="OT"
                              className="w-20 h-8 text-xs"
                              value={currentRates.overtimeRate}
                              onChange={(e) => setEditingMemberRates(prev => ({
                                ...prev,
                                [member.userId]: {
                                  ...currentRates,
                                  overtimeRate: e.target.value,
                                }
                              }))}
                              data-testid={`input-overtime-rate-${member.userId}`}
                            />
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Prem"
                              className="w-20 h-8 text-xs"
                              value={currentRates.premiumRate}
                              onChange={(e) => setEditingMemberRates(prev => ({
                                ...prev,
                                [member.userId]: {
                                  ...currentRates,
                                  premiumRate: e.target.value,
                                }
                              }))}
                              data-testid={`input-premium-rate-${member.userId}`}
                            />
                            {hasChanges && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={updateRatesMutation.isPending}
                                onClick={() => {
                                  if (selectedProject) {
                                    updateRatesMutation.mutate({
                                      projectId: selectedProject.id,
                                      userId: member.userId,
                                      rates: currentRates,
                                    });
                                  }
                                }}
                                data-testid={`button-save-rates-${member.userId}`}
                              >
                                {updateRatesMutation.isPending ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Save className="w-3 h-3" />
                                )}
                              </Button>
                            )}
                          </div>
                          <div className="pl-11 text-xs text-muted-foreground">
                            Hourly rates: Regular / Overtime / Premium
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTeamDialog(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageLayout>
  );
}

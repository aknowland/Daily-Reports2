import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Search,
  Users,
  Shield,
  HardHat,
  AlertCircle,
  Loader2,
  FolderOpen,
  Building2,
  Plus,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { Link } from "wouter";
import type { User } from "@shared/models/auth";
import type { UserProfile, Project, Company, CompanyMember } from "@shared/schema";

type UserWithProfile = User & { profile?: UserProfile };

type CompanyMemberWithCompany = CompanyMember & { company: Company };

export default function AdminUsersPage() {
  const { toast } = useToast();
  const { isSystemOwner: currentUserIsSystemOwner, isAdmin: currentUserIsAdmin, user: currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserWithProfile | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserWithProfile | null>(null);
  const [newCompanyId, setNewCompanyId] = useState<string>("");
  const [newCompanyRole, setNewCompanyRole] = useState<"inspector" | "admin">("inspector");

  const { data: users, isLoading, error } = useQuery<UserWithProfile[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: allProjects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: allCompanies = [] } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: userProjectIds, isLoading: isLoadingUserProjects } = useQuery<string[]>({
    queryKey: ["/api/admin/users", selectedUser?.id, "projects"],
    enabled: !!selectedUser && projectDialogOpen,
  });

  const { data: userCompanies = [], isLoading: isLoadingUserCompanies, refetch: refetchUserCompanies } = useQuery<CompanyMemberWithCompany[]>({
    queryKey: ["/api/admin/users", selectedUser?.id, "companies"],
    enabled: !!selectedUser && companyDialogOpen,
  });

  // Initialize selected projects when dialog opens and data loads
  useEffect(() => {
    if (userProjectIds && projectDialogOpen) {
      setSelectedProjectIds(userProjectIds);
    }
  }, [userProjectIds, projectDialogOpen]);

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "inspector" | "admin" | "system_owner" }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Role Updated",
        description: "The user's role has been updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update role",
        variant: "destructive",
      });
    },
  });

  const updateProjectsMutation = useMutation({
    mutationFn: async ({ userId, projectIds }: { userId: string; projectIds: string[] }) => {
      return apiRequest("PUT", `/api/admin/users/${userId}/projects`, { projectIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedUser?.id, "projects"] });
      toast({
        title: "Projects Updated",
        description: "The user's project assignments have been updated",
      });
      setProjectDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update projects",
        variant: "destructive",
      });
    },
  });

  const addCompanyMutation = useMutation({
    mutationFn: async ({ userId, companyId, role }: { userId: string; companyId: string; role: string }) => {
      return apiRequest("POST", `/api/admin/users/${userId}/companies`, { companyId, role });
    },
    onSuccess: () => {
      refetchUserCompanies();
      setNewCompanyId("");
      setNewCompanyRole("inspector");
      toast({
        title: "Company Added",
        description: "The user has been assigned to the company",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add company",
        variant: "destructive",
      });
    },
  });

  const updateCompanyRoleMutation = useMutation({
    mutationFn: async ({ userId, companyId, role }: { userId: string; companyId: string; role: string }) => {
      return apiRequest("PUT", `/api/admin/users/${userId}/companies/${companyId}`, { role });
    },
    onSuccess: () => {
      refetchUserCompanies();
      toast({
        title: "Role Updated",
        description: "The user's company role has been updated",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update role",
        variant: "destructive",
      });
    },
  });

  const removeCompanyMutation = useMutation({
    mutationFn: async ({ userId, companyId }: { userId: string; companyId: string }) => {
      return apiRequest("DELETE", `/api/admin/users/${userId}/companies/${companyId}`);
    },
    onSuccess: () => {
      refetchUserCompanies();
      toast({
        title: "Company Removed",
        description: "The user has been removed from the company",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to remove from company",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      toast({
        title: "User Deleted",
        description: "The user has been permanently deleted",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  const handleDeleteUser = (user: UserWithProfile) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteUser = () => {
    if (userToDelete) {
      deleteUserMutation.mutate(userToDelete.id);
    }
  };

  const handleOpenProjectDialog = (user: UserWithProfile) => {
    setSelectedUser(user);
    setSelectedProjectIds([]);
    setProjectDialogOpen(true);
  };

  const handleOpenCompanyDialog = (user: UserWithProfile) => {
    setSelectedUser(user);
    setNewCompanyId("");
    setNewCompanyRole("inspector");
    setCompanyDialogOpen(true);
  };

  const handleAddCompany = () => {
    if (selectedUser && newCompanyId) {
      addCompanyMutation.mutate({
        userId: selectedUser.id,
        companyId: newCompanyId,
        role: newCompanyRole,
      });
    }
  };

  const handleRemoveCompany = (companyId: string) => {
    if (selectedUser) {
      removeCompanyMutation.mutate({
        userId: selectedUser.id,
        companyId,
      });
    }
  };

  const handleUpdateCompanyRole = (companyId: string, role: "inspector" | "admin") => {
    if (selectedUser) {
      updateCompanyRoleMutation.mutate({
        userId: selectedUser.id,
        companyId,
        role,
      });
    }
  };

  // Get companies that the user is not already a member of
  const availableCompanies = allCompanies.filter(
    (company) => !userCompanies.some((uc) => uc.companyId === company.id)
  );

  const handleProjectToggle = (projectId: string, checked: boolean) => {
    if (checked) {
      setSelectedProjectIds(prev => [...prev, projectId]);
    } else {
      setSelectedProjectIds(prev => prev.filter(id => id !== projectId));
    }
  };

  const handleSaveProjects = () => {
    if (selectedUser) {
      updateProjectsMutation.mutate({
        userId: selectedUser.id,
        projectIds: selectedProjectIds,
      });
    }
  };

  const filteredUsers = users?.filter(
    (user) =>
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getInitials = (user: User) => {
    const first = user.firstName?.charAt(0) || "";
    const last = user.lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || user.email?.charAt(0).toUpperCase() || "U";
  };

  const getDisplayName = (user: User) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.email || "Unknown User";
  };

  return (
    <PageLayout title="Users" isAdmin>
      <div className="container px-4 py-6 mx-auto max-w-screen-xl space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild data-testid="button-back">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Users</h1>
            <p className="text-muted-foreground">
              {users?.length || 0} registered users
            </p>
          </div>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-10"
            data-testid="input-search-users"
          />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Skeleton className="w-12 h-12 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <Skeleton className="h-9 w-28" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
              <p className="text-lg font-medium">Failed to load users</p>
              <p className="text-sm text-muted-foreground mt-1">
                Please try again later
              </p>
            </CardContent>
          </Card>
        ) : filteredUsers?.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              {searchTerm ? (
                <>
                  <p className="text-lg font-medium">No matching users</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Try adjusting your search
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium">No users yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Users will appear here once they sign in
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredUsers?.map((user) => (
              <Card key={user.id} data-testid={`card-user-${user.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={user.profileImageUrl || undefined} alt={getDisplayName(user)} />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {getInitials(user)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{getDisplayName(user)}</p>
                        {user.profile?.role === "system_owner" && (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 no-default-hover-elevate no-default-active-elevate">
                            <Shield className="w-3 h-3 mr-1" />
                            System Owner
                          </Badge>
                        )}
                        {(user.profile?.role === "admin" || user.profile?.role === "owner") && (
                          <Badge variant="secondary" className="bg-primary/10 text-primary dark:bg-primary/20 no-default-hover-elevate no-default-active-elevate">
                            <Shield className="w-3 h-3 mr-1" />
                            System Admin
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenCompanyDialog(user)}
                        data-testid={`button-assign-companies-${user.id}`}
                      >
                        <Building2 className="w-4 h-4 mr-1" />
                        Companies
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenProjectDialog(user)}
                        data-testid={`button-assign-projects-${user.id}`}
                      >
                        <FolderOpen className="w-4 h-4 mr-1" />
                        Projects
                      </Button>
                      
                      <Select
                        value={user.profile?.role === "owner" ? "admin" : (user.profile?.role || "inspector")}
                        onValueChange={(role: string) => 
                          updateRoleMutation.mutate({ userId: user.id, role: role as "inspector" | "admin" | "system_owner" })
                        }
                        disabled={updateRoleMutation.isPending || user.profile?.role === "system_owner" || (user.id === currentUser?.id && (user.profile?.role === "admin" || user.profile?.role === "owner" || user.profile?.role === "system_owner"))}
                      >
                        <SelectTrigger 
                          className="w-36"
                          data-testid={`select-role-${user.id}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inspector">
                            <div className="flex items-center gap-2">
                              <HardHat className="w-4 h-4" />
                              Inspector
                            </div>
                          </SelectItem>
                          {currentUserIsSystemOwner && (
                            <SelectItem value="admin">
                              <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-primary" />
                                System Admin
                              </div>
                            </SelectItem>
                          )}
                          {user.profile?.role === "system_owner" && (
                            <SelectItem value="system_owner">
                              <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-amber-600" />
                                System Owner
                              </div>
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteUser(user)}
                        data-testid={`button-delete-user-${user.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Assign Projects to {selectedUser ? getDisplayName(selectedUser) : "User"}
            </DialogTitle>
            <DialogDescription>
              Select which projects this user should have access to.
            </DialogDescription>
          </DialogHeader>
          
          {isLoadingUserProjects ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : allProjects.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No projects available</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto py-2">
              {allProjects.map((project) => (
                <label
                  key={project.id}
                  className="flex items-center gap-3 p-3 rounded-md border cursor-pointer hover-elevate"
                  data-testid={`checkbox-project-${project.id}`}
                >
                  <Checkbox
                    checked={selectedProjectIds.includes(project.id)}
                    onCheckedChange={(checked) => handleProjectToggle(project.id, !!checked)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{project.name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {project.projectNumber}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProjectDialogOpen(false)}
              data-testid="button-cancel-projects"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveProjects}
              disabled={updateProjectsMutation.isPending}
              data-testid="button-save-projects"
            >
              {updateProjectsMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Manage Companies for {selectedUser ? getDisplayName(selectedUser) : "User"}
            </DialogTitle>
            <DialogDescription>
              Add or remove company memberships and set their role within each company.
            </DialogDescription>
          </DialogHeader>
          
          {isLoadingUserCompanies ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {userCompanies.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Current Companies</p>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {userCompanies.map((membership) => (
                      <div
                        key={membership.companyId}
                        className="flex items-center gap-3 p-3 rounded-md border"
                        data-testid={`company-membership-${membership.companyId}`}
                      >
                        <Building2 className="w-5 h-5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{membership.company?.name || "Unknown Company"}</p>
                        </div>
                        <Select
                          value={membership.role}
                          onValueChange={(role: "inspector" | "admin") => 
                            handleUpdateCompanyRole(membership.companyId, role)
                          }
                          disabled={updateCompanyRoleMutation.isPending}
                        >
                          <SelectTrigger className="w-28" data-testid={`select-company-role-${membership.companyId}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inspector">Inspector</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveCompany(membership.companyId)}
                          disabled={removeCompanyMutation.isPending}
                          data-testid={`button-remove-company-${membership.companyId}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {userCompanies.length === 0 && (
                <div className="py-4 text-center text-muted-foreground">
                  <Building2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>User is not a member of any company</p>
                </div>
              )}

              {availableCompanies.length > 0 && (
                <div className="space-y-2 pt-4 border-t">
                  <p className="text-sm font-medium text-muted-foreground">Add to Company</p>
                  <div className="flex items-center gap-2">
                    <Select value={newCompanyId} onValueChange={setNewCompanyId}>
                      <SelectTrigger className="flex-1" data-testid="select-new-company">
                        <SelectValue placeholder="Select a company..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCompanies.map((company) => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={newCompanyRole} onValueChange={(v) => setNewCompanyRole(v as "inspector" | "admin")}>
                      <SelectTrigger className="w-28" data-testid="select-new-company-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inspector">Inspector</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      onClick={handleAddCompany}
                      disabled={!newCompanyId || addCompanyMutation.isPending}
                      data-testid="button-add-company"
                    >
                      {addCompanyMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {availableCompanies.length === 0 && userCompanies.length > 0 && (
                <p className="text-sm text-muted-foreground text-center pt-4 border-t">
                  User is a member of all available companies
                </p>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCompanyDialogOpen(false)}
              data-testid="button-close-companies"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {userToDelete ? getDisplayName(userToDelete) : "this user"}? 
              This will permanently remove the user and all their data including company memberships, 
              project assignments, and profile information. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteUser}
              disabled={deleteUserMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteUserMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete User"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

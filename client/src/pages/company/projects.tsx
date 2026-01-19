import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  FolderOpen,
  ArrowLeft,
  AlertCircle,
  MapPin,
  Plus,
  Trash2,
  Edit,
  Hash,
  Building2,
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import type { Project } from "@shared/schema";

export default function CompanyProjectsPage() {
  const { toast } = useToast();
  const { activeCompany, isCompanyAdmin, isCompaniesLoading } = useAuth();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    projectNumber: "",
    client: "",
    address: "",
  });

  const { data: projects = [], isLoading, error } = useQuery<Project[]>({
    queryKey: ["/api/companies", activeCompany?.id, "projects"],
    enabled: !!activeCompany?.id && isCompanyAdmin,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/projects", {
        ...data,
        companyId: activeCompany?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowCreateDialog(false);
      setFormData({ name: "", projectNumber: "", client: "", address: "" });
      toast({
        title: "Project Created",
        description: "New project has been created.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create project.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: string }) => {
      return apiRequest("PATCH", `/api/projects/${data.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setEditingProject(null);
      setFormData({ name: "", projectNumber: "", client: "", address: "" });
      toast({
        title: "Project Updated",
        description: "Project has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update project.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setProjectToDelete(null);
      toast({
        title: "Project Deleted",
        description: "Project has been deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete project.",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (project: Project) => {
    setFormData({
      name: project.name,
      projectNumber: project.projectNumber,
      client: project.client || "",
      address: project.address || "",
    });
    setEditingProject(project);
  };

  // Wait for companies data to load before checking permissions
  if (isCompaniesLoading) {
    return (
      <PageLayout title="Company Projects">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!isCompanyAdmin || !activeCompany) {
    return (
      <PageLayout title="Company Projects">
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
      <PageLayout title="Company Projects">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
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
      <PageLayout title="Company Projects">
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
              <p className="text-lg font-medium">Failed to load projects</p>
              <p className="text-muted-foreground">Please try again later</p>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Company Projects">
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
            <h1 className="text-2xl font-bold" data-testid="title-projects">Company Projects</h1>
            <p className="text-muted-foreground">
              Manage projects for {activeCompany.name}
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-project">
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderOpen className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No projects</p>
              <p className="text-muted-foreground mb-4">
                Create your first project to get started
              </p>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first">
                <Plus className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((project) => (
              <Card key={project.id} className="hover-elevate" data-testid={`card-project-${project.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <Link 
                      href={`/reports?project=${project.id}`}
                      className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                    >
                      <FolderOpen className="w-5 h-5 text-muted-foreground" />
                      <CardTitle className="text-lg hover:text-primary transition-colors" data-testid={`text-project-name-${project.id}`}>
                        {project.name}
                      </CardTitle>
                    </Link>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(project)}
                        data-testid={`button-edit-${project.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setProjectToDelete(project)}
                        data-testid={`button-delete-${project.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Link 
                    href={`/reports?project=${project.id}`}
                    className="block cursor-pointer"
                  >
                    <CardDescription className="flex items-center gap-2">
                      <Hash className="w-3 h-3" />
                      {project.projectNumber}
                    </CardDescription>
                  </Link>
                </CardHeader>
                <Link 
                  href={`/reports?project=${project.id}`}
                  className="block cursor-pointer"
                >
                  <CardContent className="space-y-2">
                    {project.client && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building2 className="w-4 h-4" />
                        <span>{project.client}</span>
                      </div>
                    )}
                    {project.address && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-4 h-4" />
                        <span>{project.address}</span>
                      </div>
                    )}
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showCreateDialog || !!editingProject} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setEditingProject(null);
          setFormData({ name: "", projectNumber: "", client: "", address: "" });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProject ? "Edit Project" : "Create Project"}</DialogTitle>
            <DialogDescription>
              {editingProject ? "Update project details" : "Add a new project to your company"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter project name"
                data-testid="input-project-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectNumber">Project Number *</Label>
              <Input
                id="projectNumber"
                value={formData.projectNumber}
                onChange={(e) => setFormData({ ...formData, projectNumber: e.target.value })}
                placeholder="e.g., PRJ-001"
                data-testid="input-project-number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client">Client</Label>
              <Input
                id="client"
                value={formData.client}
                onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                placeholder="Client name"
                data-testid="input-project-client"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Project address"
                data-testid="input-project-address"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setEditingProject(null);
                setFormData({ name: "", projectNumber: "", client: "", address: "" });
              }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingProject) {
                  updateMutation.mutate({ ...formData, id: editingProject.id });
                } else {
                  createMutation.mutate(formData);
                }
              }}
              disabled={!formData.name.trim() || !formData.projectNumber.trim() || createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit"
            >
              {editingProject 
                ? (updateMutation.isPending ? "Saving..." : "Save Changes")
                : (createMutation.isPending ? "Creating..." : "Create Project")
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!projectToDelete} onOpenChange={() => setProjectToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{projectToDelete?.name}"? This will also delete all associated reports and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => projectToDelete && deleteMutation.mutate(projectToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}

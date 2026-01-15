import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  FolderOpen,
  Check,
  ArrowLeft,
  MapPin,
  AlertCircle,
  Building2,
  Hash,
} from "lucide-react";
import { Link } from "wouter";
import type { Project } from "@shared/schema";

export default function MyProjectsPage() {
  const { toast } = useToast();

  const { data: projects = [], isLoading, error } = useQuery<Project[]>({
    queryKey: ["/api/my-projects"],
  });

  const { data: profile } = useQuery<{ activeProjectId?: string; activeCompanyId?: string }>({
    queryKey: ["/api/profile"],
  });

  const switchMutation = useMutation({
    mutationFn: async (projectId: string) => {
      return apiRequest("POST", "/api/switch-project", { projectId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Project Switched",
        description: "You are now viewing the selected project.",
      });
    },
  });

  if (isLoading) {
    return (
      <PageLayout title="My Projects">
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
      <PageLayout title="My Projects">
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
    <PageLayout title="My Projects">
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
            <h1 className="text-2xl font-bold" data-testid="title-my-projects">My Projects</h1>
            <p className="text-muted-foreground">
              Projects you are assigned to
            </p>
          </div>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderOpen className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No projects assigned</p>
              <p className="text-muted-foreground">
                You haven't been assigned to any projects yet
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {projects.map((project) => {
              const isActive = project.id === profile?.activeProjectId;

              return (
                <Card 
                  key={project.id} 
                  className={isActive ? "ring-2 ring-primary" : ""}
                  data-testid={`card-project-${project.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-5 h-5 text-muted-foreground" />
                        <CardTitle className="text-lg" data-testid={`text-project-name-${project.id}`}>
                          {project.name}
                        </CardTitle>
                      </div>
                      {isActive && (
                        <Badge variant="default" data-testid={`badge-active-${project.id}`}>
                          <Check className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="flex items-center gap-2">
                      <Hash className="w-3 h-3" />
                      {project.projectNumber}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
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
                    {!isActive && (
                      <Button
                        variant="outline"
                        className="w-full mt-2"
                        onClick={() => switchMutation.mutate(project.id)}
                        disabled={switchMutation.isPending}
                        data-testid={`button-switch-${project.id}`}
                      >
                        Switch to this Project
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

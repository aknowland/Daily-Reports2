import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FolderOpen, ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { Project } from "@shared/schema";

interface ProjectSwitcherProps {
  activeProjectId?: string | null;
}

export function ProjectSwitcher({ activeProjectId }: ProjectSwitcherProps) {
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/my-projects"],
  });

  const switchMutation = useMutation({
    mutationFn: async (projectId: string | null) => {
      return apiRequest("POST", "/api/switch-project", { projectId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-project"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
    },
  });

  if (isLoading) {
    return null;
  }

  // Show a disabled button when there are no projects
  if (projects.length === 0) {
    return (
      <Button 
        variant="ghost" 
        size="sm" 
        className="gap-2 text-muted-foreground"
        disabled
        data-testid="button-no-projects"
      >
        <FolderOpen className="w-4 h-4 shrink-0" />
        <span className="truncate hidden sm:inline">No Projects</span>
      </Button>
    );
  }

  const activeProject = projects.find(p => p.id === activeProjectId);
  const displayName = activeProject?.name || "Select Project";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-2 max-w-[180px]"
          data-testid="button-project-switcher"
        >
          <FolderOpen className="w-4 h-4 shrink-0" />
          <span className="truncate hidden sm:inline">{displayName}</span>
          <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Switch Project</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.map((project) => {
          const isActive = project.id === activeProjectId;
          
          return (
            <DropdownMenuItem
              key={project.id}
              onClick={() => {
                if (!isActive) {
                  switchMutation.mutate(project.id);
                }
              }}
              className="cursor-pointer"
              data-testid={`dropdown-project-${project.id}`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex flex-col">
                  <span className="truncate font-medium">{project.name}</span>
                  <span className="text-xs text-muted-foreground">{project.projectNumber}</span>
                </div>
                {isActive && <Check className="w-4 h-4 text-primary shrink-0" />}
              </div>
            </DropdownMenuItem>
          );
        })}
        {activeProjectId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => switchMutation.mutate(null)}
              className="cursor-pointer text-muted-foreground"
              data-testid="dropdown-clear-project"
            >
              Clear selection
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

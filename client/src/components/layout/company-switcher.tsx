import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Building2, ChevronDown, Check, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { Company, CompanyMember } from "@shared/schema";

interface CompanyWithMembership extends CompanyMember {
  company?: Company;
}

interface CompanySwitcherProps {
  activeCompanyId?: string | null;
}

export function CompanySwitcher({ activeCompanyId }: CompanySwitcherProps) {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");

  const { data: companies = [], isLoading } = useQuery<CompanyWithMembership[]>({
    queryKey: ["/api/my-companies"],
  });

  const switchMutation = useMutation({
    mutationFn: async (companyId: string) => {
      return apiRequest("POST", "/api/switch-company", { companyId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("POST", "/api/my-companies", { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      setShowCreateDialog(false);
      setNewCompanyName("");
      toast({
        title: "Company Created",
        description: "Your company has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create company.",
        variant: "destructive",
      });
    },
  });

  const handleCreateCompany = () => {
    if (newCompanyName.trim()) {
      createMutation.mutate(newCompanyName.trim());
    }
  };

  // Show create button even if user has no companies yet
  if (isLoading) {
    return null;
  }

  // If user has no companies, show create company button
  if (companies.length === 0) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setShowCreateDialog(true)}
          data-testid="button-create-company"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Create Company</span>
        </Button>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Your Company</DialogTitle>
              <DialogDescription>
                Create a company to start managing projects and reports.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="company-name">Company Name</Label>
                <Input
                  id="company-name"
                  placeholder="Enter company name"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  data-testid="input-company-name"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                  data-testid="button-cancel-company"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateCompany}
                  disabled={!newCompanyName.trim() || createMutation.isPending}
                  data-testid="button-submit-company"
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Single company - just display name with option to create another
  if (companies.length === 1) {
    const company = companies[0]?.company;
    if (!company) return null;
    
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="gap-2 max-w-[200px]"
              data-testid="button-company-menu"
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span className="truncate hidden sm:inline">{company.name}</span>
              <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Company</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="opacity-70">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                <span className="truncate">{company.name}</span>
                <Check className="w-4 h-4 text-primary ml-auto" />
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setShowCreateDialog(true)}
              className="cursor-pointer"
              data-testid="dropdown-create-company"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create New Company
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Company</DialogTitle>
              <DialogDescription>
                Create another company to manage different projects.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="company-name">Company Name</Label>
                <Input
                  id="company-name"
                  placeholder="Enter company name"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  data-testid="input-company-name"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                  data-testid="button-cancel-company"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateCompany}
                  disabled={!newCompanyName.trim() || createMutation.isPending}
                  data-testid="button-submit-company"
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Multiple companies - show switcher with create option
  const activeCompany = companies.find(c => c.companyId === activeCompanyId)?.company;
  const displayName = activeCompany?.name || "Select Company";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2 max-w-[200px]"
            data-testid="button-company-switcher"
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span className="truncate hidden sm:inline">{displayName}</span>
            <ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Switch Company</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {companies.map((item) => {
            const company = item.company;
            if (!company) return null;
            
            const isActive = company.id === activeCompanyId;
            
            return (
              <DropdownMenuItem
                key={company.id}
                onClick={() => {
                  if (!isActive) {
                    switchMutation.mutate(company.id);
                  }
                }}
                className="cursor-pointer"
                data-testid={`dropdown-company-${company.id}`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    <span className="truncate">{company.name}</span>
                  </div>
                  {isActive && <Check className="w-4 h-4 text-primary" />}
                </div>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowCreateDialog(true)}
            className="cursor-pointer"
            data-testid="dropdown-create-company"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New Company
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Company</DialogTitle>
            <DialogDescription>
              Create another company to manage different projects.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="company-name">Company Name</Label>
              <Input
                id="company-name"
                placeholder="Enter company name"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                data-testid="input-company-name"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                data-testid="button-cancel-company"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateCompany}
                disabled={!newCompanyName.trim() || createMutation.isPending}
                data-testid="button-submit-company"
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

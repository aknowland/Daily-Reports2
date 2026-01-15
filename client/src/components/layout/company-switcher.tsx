import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Building2, ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { Company, CompanyMember } from "@shared/schema";

interface CompanyWithMembership extends CompanyMember {
  company?: Company;
}

interface CompanySwitcherProps {
  activeCompanyId?: string | null;
}

export function CompanySwitcher({ activeCompanyId }: CompanySwitcherProps) {
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

  if (isLoading || companies.length === 0) {
    return null;
  }

  if (companies.length === 1) {
    const company = companies[0]?.company;
    if (!company) return null;
    
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
        <Building2 className="w-4 h-4" />
        <span className="hidden sm:inline truncate max-w-[150px]">{company.name}</span>
      </div>
    );
  }

  const activeCompany = companies.find(c => c.companyId === activeCompanyId)?.company;
  const displayName = activeCompany?.name || "Select Company";

  return (
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

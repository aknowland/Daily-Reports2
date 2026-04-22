import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, HardHat, LogOut, Shield } from "lucide-react";
import {
  inspectorNavItems,
  companyAdminNavItems,
  systemAdminNavItems,
  isNavItemActive,
  type NavItem,
} from "./nav-items";

interface SidebarNavProps {
  onNavigate?: () => void;
  variant?: "desktop" | "sheet";
}

export function SidebarNav({ onNavigate, variant = "desktop" }: SidebarNavProps) {
  const { activeCompany, isEffectiveCompanyAdmin, isEffectiveSystemAdmin, logout } = useAuth();
  const [location] = useLocation();
  const [sysAdminOpen, setSysAdminOpen] = useState(false);

  const renderItems = (items: NavItem[], keyPrefix = "") =>
    items.map((item) => {
      const active = isNavItemActive(location, item.href);
      const Icon = item.icon;
      return (
        <Link key={`${keyPrefix}${item.href}`} href={item.href} onClick={onNavigate}>
          <div
            className={cn(
              "group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-[var(--motion-base)]",
              active
                ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            )}
            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {active && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-accent" />
            )}
            <Icon
              className={cn(
                "w-[18px] h-[18px] flex-shrink-0 transition-colors",
                active
                  ? "text-accent"
                  : "text-sidebar-foreground/55 group-hover:text-sidebar-foreground/85"
              )}
            />
            <span className="truncate">{item.label}</span>
          </div>
        </Link>
      );
    });

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="px-3 pt-5 pb-1.5 text-[11px] font-semibold text-sidebar-foreground/45 uppercase tracking-[0.1em]">
      {children}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {variant === "desktop" && (
        <div className="flex items-center gap-2.5 px-5 h-14 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-sm">
            <HardHat className="w-[18px] h-[18px] text-accent-foreground" />
          </div>
          <span className="font-semibold text-[15px] tracking-tight text-sidebar-foreground">
            Field Daily Reports
          </span>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        <SectionLabel>Inspector</SectionLabel>
        {renderItems(inspectorNavItems, "insp-")}

        {isEffectiveCompanyAdmin && activeCompany && (
          <>
            <SectionLabel>{activeCompany.name}</SectionLabel>
            {renderItems(companyAdminNavItems, "co-admin-")}
          </>
        )}

        {isEffectiveSystemAdmin && (
          <>
            <Separator className="my-3 bg-sidebar-border" />
            <Collapsible open={sysAdminOpen} onOpenChange={setSysAdminOpen}>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-sidebar-accent/50 transition-colors">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-sidebar-foreground/55 uppercase tracking-[0.1em]">
                    <Shield className="w-3 h-3" />
                    System Admin
                  </div>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-sidebar-foreground/40 transition-transform duration-200",
                      sysAdminOpen && "rotate-180"
                    )}
                  />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-0.5 mt-0.5">
                {renderItems(systemAdminNavItems, "sys-")}
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </nav>

      <div className="px-3 pb-4 pt-2 border-t border-sidebar-border">
        <Button
          variant="ghost"
          className="w-full justify-start text-destructive/90 hover:text-destructive hover:bg-destructive/10 font-medium"
          onClick={() => {
            onNavigate?.();
            logout();
          }}
          data-testid="nav-logout"
        >
          <LogOut className="w-[18px] h-[18px] mr-3" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

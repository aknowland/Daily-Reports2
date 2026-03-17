import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LogOut, User, Settings, HardHat, Menu, LayoutDashboard, FolderOpen, Users, UserPlus, Building2, FilePlus, Shield, FileText, Receipt, Briefcase, MessageSquare, CalendarCheck, Key, Search } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ProjectSwitcher } from "./project-switcher";
import { ThemeToggle } from "./theme-toggle";
import { ModeToggle } from "./mode-toggle";
import { useAdminMode } from "@/hooks/use-admin-mode";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface HeaderProps {
  title?: string;
  showBackButton?: boolean;
}

export function Header({ title = "Field Daily Reports" }: HeaderProps) {
  const { user, isLoading, isAdmin, isCompanyAdmin, isEffectiveCompanyAdmin, isEffectiveSystemAdmin, activeCompany, logout, profile } = useAuth();
  const [location] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sysAdminOpen, setSysAdminOpen] = useState(false);
  const { isAdminMode } = useAdminMode();
  
  const showSystemAdminFeatures = isEffectiveSystemAdmin;

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "U";
  };

  const getDisplayName = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user?.email || "User";
  };

  const inspectorNavItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/reports/new", label: "New Report", icon: FilePlus },
    { href: "/profile", label: "My Profile", icon: User },
    { href: "/companies", label: "My Companies", icon: Building2 },
    { href: "/my-projects", label: "My Projects", icon: FolderOpen },
  ];

  const companyAdminNavItems = [
    { href: "/company/dashboard", label: "Company Dashboard", icon: LayoutDashboard },
    { href: "/company/team", label: "Team Members", icon: Users },
    { href: "/company/projects", label: "Company Projects", icon: FolderOpen },
    { href: "/company/clients", label: "Clients", icon: Briefcase },
    { href: "/company/contracts", label: "Contracts", icon: FileText },
    { href: "/company/billing-management", label: "Billing", icon: Receipt },
    { href: "/company/meetings", label: "Meetings", icon: CalendarCheck },
    { href: "/company/recruiting", label: "Recruiting", icon: Search },
    { href: "/company/chat", label: "AI Assistant", icon: MessageSquare },
    { href: "/company/api-keys", label: "API Keys", icon: Key },
    { href: "/company/settings", label: "Company Settings", icon: Settings },
  ];

  const systemAdminNavItems = [
    { href: "/admin", label: "Admin Dashboard", icon: LayoutDashboard },
    { href: "/admin/companies", label: "All Companies", icon: Building2 },
    { href: "/admin/projects", label: "All Projects", icon: FolderOpen },
    { href: "/admin/users", label: "All Users", icon: Users },
    { href: "/admin/invites", label: "Invites", icon: UserPlus },
  ];

  const renderNavItems = (items: typeof inspectorNavItems, sectionTitle?: string, keyPrefix = "") => (
    <>
      {sectionTitle && (
        <div className="px-3 py-2 text-xs font-semibold text-white/70 uppercase tracking-wider">
          {sectionTitle}
        </div>
      )}
      {items.map((item) => {
        const isActive = item.href === "/" 
          ? location === "/" 
          : location.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link key={`${keyPrefix}${item.href}`} href={item.href} onClick={() => setSheetOpen(false)}>
            <div
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded transition-colors",
                isActive 
                  ? "bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] font-semibold" 
                  : "text-white/80 hover:text-white hover:bg-white/10"
              )}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </div>
          </Link>
        );
      })}
    </>
  );

  return (
    <header className="sticky top-0 z-40 w-full bg-[hsl(216,32%,15%)] text-white border-b-2 border-[hsl(36,90%,50%)]">
      <div className="flex h-14 items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-2">
          {user && (
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/10" data-testid="button-nav-menu">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 overflow-y-auto bg-[hsl(216,32%,15%)] text-white border-r-2 border-[hsl(36,90%,50%)]">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2 text-white">
                    <div className="w-8 h-8 rounded bg-[hsl(36,90%,50%)] flex items-center justify-center">
                      <HardHat className="w-5 h-5 text-[hsl(216,32%,10%)]" />
                    </div>
                    Field Daily Reports
                  </SheetTitle>
                </SheetHeader>
                <nav className="mt-6 space-y-1">
                  {renderNavItems(inspectorNavItems, undefined, "inspector-")}
                  
                  {isEffectiveCompanyAdmin && activeCompany && (
                    <>
                      <Separator className="my-4 bg-white/15" />
                      {renderNavItems(companyAdminNavItems, `${activeCompany.name}`, "company-admin-")}
                    </>
                  )}
                  
                  {showSystemAdminFeatures && (
                    <>
                      <Separator className="my-4 bg-white/15" />
                      <Collapsible open={sysAdminOpen} onOpenChange={setSysAdminOpen}>
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between px-3 py-2 rounded hover:bg-white/10">
                            <div className="flex items-center gap-2 text-xs font-semibold text-white/70 uppercase tracking-wider">
                              <Shield className="w-3 h-3" />
                              System Admin
                            </div>
                            <ChevronDown className={cn(
                              "w-4 h-4 text-white/40 transition-transform duration-200",
                              sysAdminOpen && "rotate-180"
                            )} />
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-1 mt-1">
                          {systemAdminNavItems.map((item) => {
                            const isActive = location === item.href || 
                              (item.href !== "/admin" && location.startsWith(item.href));
                            const Icon = item.icon;
                            return (
                              <Link key={item.href} href={item.href} onClick={() => setSheetOpen(false)}>
                                <div
                                  className={cn(
                                    "flex items-center gap-3 px-3 py-2 rounded transition-colors",
                                    isActive 
                                      ? "bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] font-semibold" 
                                      : "text-white/80 hover:text-white hover:bg-white/10"
                                  )}
                                  data-testid={`nav-admin-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                                >
                                  <Icon className="w-5 h-5" />
                                  <span className="font-medium">{item.label}</span>
                                </div>
                              </Link>
                            );
                          })}
                        </CollapsibleContent>
                      </Collapsible>
                    </>
                  )}
                </nav>
                
                <Separator className="my-4 bg-white/15" />
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-white/10"
                  onClick={() => {
                    setSheetOpen(false);
                    logout();
                  }}
                  data-testid="nav-logout"
                >
                  <LogOut className="w-5 h-5 mr-3" />
                  Sign out
                </Button>
              </SheetContent>
            </Sheet>
          )}
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer" data-testid="link-home">
              <div className="w-8 h-8 rounded bg-[hsl(36,90%,50%)] flex items-center justify-center">
                <HardHat className="w-5 h-5 text-[hsl(216,32%,10%)]" />
              </div>
              <span className="font-semibold text-lg hidden sm:inline tracking-tight">{title}</span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {(isAdmin || isCompanyAdmin) && <ModeToggle />}
          {user && <ProjectSwitcher activeProjectId={profile?.activeProjectId} />}
          {user && <ThemeToggle />}
          {isLoading ? (
            <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full text-white/80 hover:text-white hover:bg-white/10" data-testid="button-user-menu">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.profileImageUrl || undefined} alt={getDisplayName()} />
                    <AvatarFallback className="bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] text-sm font-medium">
                      {getInitials(user.firstName, user.lastName)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{getDisplayName()}</p>
                    {user.email && (
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile" className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/companies" className="cursor-pointer">
                    <Building2 className="mr-2 h-4 w-4" />
                    Companies
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/my-projects" className="cursor-pointer">
                    <FolderOpen className="mr-2 h-4 w-4" />
                    Projects
                  </Link>
                </DropdownMenuItem>
                {isEffectiveCompanyAdmin && activeCompany && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      {activeCompany.name} Admin
                    </DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <Link href="/company/team" className="cursor-pointer">
                        <Users className="mr-2 h-4 w-4" />
                        Team Members
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/company/projects" className="cursor-pointer">
                        <FolderOpen className="mr-2 h-4 w-4" />
                        Company Projects
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/company/contracts" className="cursor-pointer">
                        <FileText className="mr-2 h-4 w-4" />
                        Contracts
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/company/meetings" className="cursor-pointer">
                        <CalendarCheck className="mr-2 h-4 w-4" />
                        Meetings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/company/settings" className="cursor-pointer">
                        <Settings className="mr-2 h-4 w-4" />
                        Company Settings
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => logout()}
                  className="cursor-pointer text-destructive focus:text-destructive"
                  data-testid="button-logout"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild className="bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] hover:bg-[hsl(36,90%,45%)] font-semibold" data-testid="button-login">
              <a href="/api/login">Sign in</a>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

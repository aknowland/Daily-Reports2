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
import { LogOut, User, Settings, HardHat, Menu, LayoutDashboard, FolderOpen, Users, UserPlus, Building2, ClipboardList, FilePlus, Shield } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { CompanySwitcher } from "./company-switcher";
import { ProjectSwitcher } from "./project-switcher";
import { ModeToggle } from "./mode-toggle";
import { useAdminMode } from "@/hooks/use-admin-mode";
import { Separator } from "@/components/ui/separator";

interface HeaderProps {
  title?: string;
  showBackButton?: boolean;
}

export function Header({ title = "Field Daily Reports" }: HeaderProps) {
  const { user, isLoading, isAdmin, isCompanyAdmin, activeCompany, logout, profile } = useAuth();
  const [location] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { isAdminMode } = useAdminMode();
  
  const showAdminFeatures = isAdmin && isAdminMode;

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
    { href: "/company/requests", label: "Join Requests", icon: ClipboardList },
    { href: "/company/settings", label: "Company Settings", icon: Settings },
  ];

  const systemAdminNavItems = [
    { href: "/admin", label: "Admin Dashboard", icon: LayoutDashboard },
    { href: "/admin/companies", label: "All Companies", icon: Building2 },
    { href: "/admin/projects", label: "All Projects", icon: FolderOpen },
    { href: "/admin/users", label: "All Users", icon: Users },
    { href: "/admin/invites", label: "Invites", icon: UserPlus },
  ];

  const renderNavItems = (items: typeof inspectorNavItems, sectionTitle?: string) => (
    <>
      {sectionTitle && (
        <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {sectionTitle}
        </div>
      )}
      {items.map((item) => {
        const isActive = item.href === "/" 
          ? location === "/" 
          : location.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} onClick={() => setSheetOpen(false)}>
            <div
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                isActive 
                  ? "bg-primary text-primary-foreground" 
                  : "hover-elevate"
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
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-2">
          {user && (
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-nav-menu">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 overflow-y-auto">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                      <HardHat className="w-5 h-5 text-primary-foreground" />
                    </div>
                    Field Daily Reports
                  </SheetTitle>
                </SheetHeader>
                <nav className="mt-6 space-y-1">
                  {renderNavItems(inspectorNavItems)}
                  
                  {isCompanyAdmin && activeCompany && (
                    <>
                      <Separator className="my-4" />
                      {renderNavItems(companyAdminNavItems, `${activeCompany.name}`)}
                    </>
                  )}
                  
                  {showAdminFeatures && (
                    <>
                      <Separator className="my-4" />
                      <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <Shield className="w-3 h-3" />
                        System Admin
                      </div>
                      {systemAdminNavItems.map((item) => {
                        const isActive = location === item.href || 
                          (item.href !== "/admin" && location.startsWith(item.href));
                        const Icon = item.icon;
                        return (
                          <Link key={item.href} href={item.href} onClick={() => setSheetOpen(false)}>
                            <div
                              className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                                isActive 
                                  ? "bg-primary text-primary-foreground" 
                                  : "hover-elevate"
                              )}
                              data-testid={`nav-admin-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                            >
                              <Icon className="w-5 h-5" />
                              <span className="font-medium">{item.label}</span>
                            </div>
                          </Link>
                        );
                      })}
                    </>
                  )}
                </nav>
                
                <Separator className="my-4" />
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-destructive"
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
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <HardHat className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-semibold text-lg hidden sm:inline">{title}</span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && <ModeToggle />}
          {user && <CompanySwitcher activeCompanyId={profile?.activeCompanyId} />}
          {user && <ProjectSwitcher activeProjectId={profile?.activeProjectId} />}
          {isLoading ? (
            <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" data-testid="button-user-menu">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.profileImageUrl || undefined} alt={getDisplayName()} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
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
                {isCompanyAdmin && activeCompany && (
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
                      <Link href="/company/requests" className="cursor-pointer">
                        <ClipboardList className="mr-2 h-4 w-4" />
                        Join Requests
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
            <Button asChild data-testid="button-login">
              <a href="/api/login">Sign in</a>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

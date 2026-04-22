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
import { LogOut, User, Settings, HardHat, Menu, LayoutDashboard, FolderOpen, Users, UserPlus, Building2, FilePlus, Shield, FileText, Receipt, Briefcase, MessageSquare, CalendarCheck, Key, Search, ShieldCheck, Megaphone, Bell, CheckCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ProjectSwitcher } from "./project-switcher";
import { ThemeToggle } from "./theme-toggle";
import { ModeToggle } from "./mode-toggle";
import { useAdminMode } from "@/hooks/use-admin-mode";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { AdminNotification } from "@shared/schema";

interface HeaderProps {
  title?: string;
  showBackButton?: boolean;
}

export function Header({ title = "Field Daily Reports" }: HeaderProps) {
  const { user, isLoading, isAdmin, isCompanyAdmin, isEffectiveCompanyAdmin, isEffectiveSystemAdmin, activeCompany, logout, profile } = useAuth();
  const [location, navigate] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sysAdminOpen, setSysAdminOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { isAdminMode } = useAdminMode();

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/announcements/unread-count"],
    staleTime: 60000,
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: adminNotifCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/admin-notifications/unread-count", activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany?.id) return { count: 0 };
      const res = await fetch(`/api/admin-notifications/unread-count?companyId=${activeCompany.id}`, { credentials: "include" });
      return res.json();
    },
    staleTime: 30000,
    enabled: !!user && (isEffectiveCompanyAdmin || isAdmin) && !!activeCompany?.id,
    refetchInterval: 2 * 60 * 1000,
  });

  const { data: adminNotifications } = useQuery<AdminNotification[]>({
    queryKey: ["/api/admin-notifications", activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany?.id) return [];
      const res = await fetch(`/api/admin-notifications?companyId=${activeCompany.id}`, { credentials: "include" });
      return res.json();
    },
    staleTime: 30000,
    enabled: !!user && (isEffectiveCompanyAdmin || isAdmin) && !!activeCompany?.id && notifOpen,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("PATCH", `/api/admin-notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-notifications/unread-count", activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin-notifications", activeCompany?.id] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin-notifications/read-all", { companyId: activeCompany?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin-notifications/unread-count", activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin-notifications", activeCompany?.id] });
    },
  });

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

  const unreadCount = unreadData?.count ?? 0;
  const adminNotifCount = adminNotifCountData?.count ?? 0;

  const inspectorNavItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/reports/new", label: "New Report", icon: FilePlus },
    { href: "/announcements", label: "Announcements", icon: Megaphone, badge: unreadCount > 0 ? unreadCount : undefined },
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
    { href: "/company/announcements", label: "Announcements", icon: Megaphone },
    { href: "/company/recruiting", label: "Recruiting", icon: Search },
    { href: "/company/cert-expiry", label: "Cert Tracker", icon: ShieldCheck },
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
        <div className="px-3 pt-4 pb-1.5 text-[11px] font-semibold text-sidebar-foreground/50 uppercase tracking-[0.08em]">
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
                "group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-[var(--motion-base)]",
                isActive
                  ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                  : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {isActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-accent" />
              )}
              <Icon className={cn("w-[18px] h-[18px] flex-shrink-0 transition-colors", isActive ? "text-accent" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground/90")} />
              <span className="truncate flex-1">{item.label}</span>
              {"badge" in item && item.badge != null && (
                <span className="ml-auto bg-accent text-accent-foreground text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </>
  );

  const formatRelativeTime = (date: string | Date) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-sidebar/95 surface-glass text-sidebar-foreground border-b border-sidebar-border shadow-sm">
      <div className="flex h-14 items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-2">
          {user && (
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/60" data-testid="button-nav-menu">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 overflow-y-auto bg-sidebar text-sidebar-foreground border-r border-sidebar-border p-0">
                <SheetHeader className="px-5 pt-6 pb-4 border-b border-sidebar-border">
                  <SheetTitle className="flex items-center gap-2.5 text-sidebar-foreground">
                    <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center shadow-sm">
                      <HardHat className="w-5 h-5 text-accent-foreground" />
                    </div>
                    <span className="text-base font-semibold tracking-tight">Field Daily Reports</span>
                  </SheetTitle>
                </SheetHeader>
                <nav className="mt-3 space-y-0.5 px-3 pb-4">
                  {renderNavItems(inspectorNavItems, undefined, "inspector-")}
                  
                  {isEffectiveCompanyAdmin && activeCompany && (
                    <>
                      <Separator className="my-3 bg-sidebar-border" />
                      {renderNavItems(companyAdminNavItems, `${activeCompany.name}`, "company-admin-")}
                    </>
                  )}

                  {showSystemAdminFeatures && (
                    <>
                      <Separator className="my-3 bg-sidebar-border" />
                      <Collapsible open={sysAdminOpen} onOpenChange={setSysAdminOpen}>
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-sidebar-accent/50 transition-colors">
                            <div className="flex items-center gap-2 text-[11px] font-semibold text-sidebar-foreground/60 uppercase tracking-[0.08em]">
                              <Shield className="w-3 h-3" />
                              System Admin
                            </div>
                            <ChevronDown className={cn(
                              "w-4 h-4 text-sidebar-foreground/40 transition-transform duration-200",
                              sysAdminOpen && "rotate-180"
                            )} />
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-0.5 mt-0.5">
                          {systemAdminNavItems.map((item) => {
                            const isActive = location === item.href ||
                              (item.href !== "/admin" && location.startsWith(item.href));
                            const Icon = item.icon;
                            return (
                              <Link key={item.href} href={item.href} onClick={() => setSheetOpen(false)}>
                                <div
                                  className={cn(
                                    "group relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all",
                                    isActive
                                      ? "bg-sidebar-accent text-sidebar-foreground font-medium"
                                      : "text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                                  )}
                                  data-testid={`nav-admin-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                                >
                                  {isActive && (
                                    <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-accent" />
                                  )}
                                  <Icon className={cn("w-[18px] h-[18px] flex-shrink-0", isActive ? "text-accent" : "text-sidebar-foreground/60")} />
                                  <span className="truncate">{item.label}</span>
                                </div>
                              </Link>
                            );
                          })}
                        </CollapsibleContent>
                      </Collapsible>
                    </>
                  )}
                </nav>

                <div className="px-3 pb-6">
                  <Separator className="my-2 bg-sidebar-border" />
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-destructive/90 hover:text-destructive hover:bg-destructive/10 font-medium"
                    onClick={() => {
                      setSheetOpen(false);
                      logout();
                    }}
                    data-testid="nav-logout"
                  >
                    <LogOut className="w-[18px] h-[18px] mr-3" />
                    Sign out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          )}
          <Link href="/">
            <div className="flex items-center gap-2.5 cursor-pointer group" data-testid="link-home">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-sm transition-transform duration-[var(--motion-base)] group-hover:scale-105">
                <HardHat className="w-[18px] h-[18px] text-accent-foreground" />
              </div>
              <span className="font-semibold text-[15px] hidden sm:inline tracking-tight">{title}</span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-1.5">
          {(isAdmin || isCompanyAdmin) && <ModeToggle />}
          {user && <ProjectSwitcher activeProjectId={profile?.activeProjectId} />}
          {user && <ThemeToggle />}

          {/* Admin Notification Bell */}
          {user && (isEffectiveCompanyAdmin || isAdmin) && activeCompany && (
            <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative text-white/80 hover:text-white hover:bg-white/10"
                  data-testid="button-admin-notifications"
                >
                  <Bell className="w-5 h-5" />
                  {adminNotifCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 leading-none" data-testid="badge-admin-notification-count">
                      {adminNotifCount > 99 ? "99+" : adminNotifCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 max-h-[400px] overflow-y-auto">
                <DropdownMenuLabel className="flex items-center justify-between">
                  <span>Notifications</span>
                  {adminNotifCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto py-0.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.preventDefault();
                        markAllReadMutation.mutate();
                      }}
                      data-testid="button-mark-all-notifications-read"
                    >
                      <CheckCheck className="w-3 h-3 mr-1" />
                      Mark all read
                    </Button>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {!adminNotifications || adminNotifications.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-muted-foreground" data-testid="text-no-notifications">
                    No notifications
                  </div>
                ) : (
                  adminNotifications.map((notif) => (
                    <DropdownMenuItem
                      key={notif.id}
                      className={cn(
                        "flex flex-col items-start gap-0.5 px-3 py-2.5 cursor-pointer",
                        !notif.isRead && "bg-blue-50 dark:bg-blue-950/30"
                      )}
                      data-testid={`notification-item-${notif.id}`}
                      onClick={() => {
                        if (!notif.isRead) {
                          markReadMutation.mutate(notif.id);
                        }
                        navigate(notif.link);
                        setNotifOpen(false);
                      }}
                    >
                      <div className="flex items-center gap-2 w-full">
                        {!notif.isRead && (
                          <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                        )}
                        <span className={cn("text-sm font-medium leading-tight", !notif.isRead ? "text-foreground" : "text-muted-foreground pl-4")}>
                          {notif.title}
                        </span>
                      </div>
                      <span className={cn("text-xs leading-snug pl-4", !notif.isRead ? "text-foreground/80" : "text-muted-foreground")}>
                        {notif.message}
                      </span>
                      <span className="text-[10px] text-muted-foreground pl-4 mt-0.5">
                        {formatRelativeTime(notif.createdAt)}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {isLoading ? (
            <div className="w-9 h-9 rounded-full shimmer" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/60" data-testid="button-user-menu">
                  <Avatar className="h-9 w-9 ring-1 ring-sidebar-border">
                    <AvatarImage src={user.profileImageUrl || undefined} alt={getDisplayName()} />
                    <AvatarFallback className="bg-accent text-accent-foreground text-[13px] font-semibold">
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
            <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold shadow-sm" data-testid="button-login">
              <a href="/api/login">Sign in</a>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

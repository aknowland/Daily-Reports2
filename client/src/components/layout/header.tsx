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
import {
  LogOut,
  User,
  Settings,
  HardHat,
  Menu,
  FolderOpen,
  Users,
  Building2,
  FileText,
  CalendarCheck,
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { ProjectSwitcher } from "./project-switcher";
import { ThemeToggle } from "./theme-toggle";
import { ModeToggle } from "./mode-toggle";
import { SidebarNav } from "./sidebar-nav";

interface HeaderProps {
  title?: string;
}

export function Header({ title = "Field Daily Reports" }: HeaderProps) {
  const {
    user,
    isLoading,
    isAdmin,
    isCompanyAdmin,
    isEffectiveCompanyAdmin,
    activeCompany,
    logout,
    profile,
  } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

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

  return (
    <header className="sticky top-0 z-40 w-full bg-background/80 surface-glass border-b border-border">
      <div className="flex h-14 items-center justify-between gap-4 px-4 lg:pl-8">
        <div className="flex items-center gap-2 min-w-0">
          {user && (
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  data-testid="button-nav-menu"
                >
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-72 p-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border"
              >
                <SheetHeader className="px-5 pt-6 pb-4 border-b border-sidebar-border">
                  <SheetTitle className="flex items-center gap-2.5 text-sidebar-foreground text-left">
                    <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center shadow-sm">
                      <HardHat className="w-5 h-5 text-accent-foreground" />
                    </div>
                    <span className="text-base font-semibold tracking-tight">
                      Field Daily Reports
                    </span>
                  </SheetTitle>
                </SheetHeader>
                <SidebarNav onNavigate={() => setSheetOpen(false)} variant="sheet" />
              </SheetContent>
            </Sheet>
          )}
          <Link href="/">
            <div
              className="flex items-center gap-2.5 cursor-pointer group lg:hidden"
              data-testid="link-home"
            >
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-sm transition-transform duration-[var(--motion-base)] group-hover:scale-105">
                <HardHat className="w-[18px] h-[18px] text-accent-foreground" />
              </div>
              <span className="font-semibold text-[15px] hidden sm:inline tracking-tight">
                {title}
              </span>
            </div>
          </Link>
          {title && (
            <h1 className="hidden lg:block text-[15px] font-medium text-muted-foreground tracking-tight truncate">
              {title}
            </h1>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {(isAdmin || isCompanyAdmin) && <ModeToggle />}
          {user && <ProjectSwitcher activeProjectId={profile?.activeProjectId} />}
          {user && <ThemeToggle />}
          {isLoading ? (
            <div className="w-9 h-9 rounded-full shimmer" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  data-testid="button-user-menu"
                >
                  <Avatar className="h-9 w-9 ring-1 ring-border">
                    <AvatarImage
                      src={user.profileImageUrl || undefined}
                      alt={getDisplayName()}
                    />
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
                      <p className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </p>
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
            <Button
              asChild
              className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold shadow-sm"
              data-testid="button-login"
            >
              <a href="/api/login">Sign in</a>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

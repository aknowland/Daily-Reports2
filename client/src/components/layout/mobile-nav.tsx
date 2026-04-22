import { Link, useLocation } from "wouter";
import { Home, FileText, Plus, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface MobileNavProps {
  isAdmin?: boolean;
}

export function MobileNav({ isAdmin }: MobileNavProps) {
  const [location] = useLocation();

  const inspectorItems: NavItem[] = [
    { href: "/", label: "Home", icon: <Home className="w-5 h-5" /> },
    { href: "/reports/new", label: "New Report", icon: <Plus className="w-5 h-5" /> },
    { href: "/reports", label: "Reports", icon: <FileText className="w-5 h-5" /> },
    { href: "/profile", label: "Profile", icon: <User className="w-5 h-5" /> },
  ];

  const adminItems: NavItem[] = [
    { href: "/admin", label: "Dashboard", icon: <Home className="w-5 h-5" /> },
    { href: "/admin/projects", label: "Projects", icon: <FileText className="w-5 h-5" /> },
  ];

  const items = isAdmin ? adminItems : inspectorItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-sidebar/95 surface-glass border-t border-sidebar-border h-[68px] lg:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-full px-2 pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => {
          const isActive =
            location === item.href ||
            (item.href !== "/" && item.href !== "/admin" && location.startsWith(item.href));

          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 px-4 py-2 rounded-lg transition-colors min-w-[72px]",
                  isActive
                    ? "text-accent"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                )}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
              >
                <div className={cn("transition-transform", isActive && "scale-110")}>
                  {item.icon}
                </div>
                <span className="text-[11px] font-medium tracking-wide">{item.label}</span>
                {isActive && (
                  <div className="absolute -bottom-[1px] left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-accent" />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

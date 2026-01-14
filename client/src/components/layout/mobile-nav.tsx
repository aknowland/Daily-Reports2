import { Link, useLocation } from "wouter";
import { Home, FileText, Plus, Settings } from "lucide-react";
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
  ];

  const adminItems: NavItem[] = [
    { href: "/admin", label: "Dashboard", icon: <Home className="w-5 h-5" /> },
    { href: "/admin/projects", label: "Projects", icon: <FileText className="w-5 h-5" /> },
    { href: "/admin/settings", label: "Settings", icon: <Settings className="w-5 h-5" /> },
  ];

  const items = isAdmin ? adminItems : inspectorItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border h-16 lg:hidden">
      <div className="flex items-center justify-around h-full px-2">
        {items.map((item) => {
          const isActive = location === item.href || 
            (item.href !== "/" && item.href !== "/admin" && location.startsWith(item.href));
          
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-lg transition-colors min-w-[72px]",
                  isActive 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                )}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
              >
                {item.icon}
                <span className="text-xs font-medium">{item.label}</span>
                {isActive && (
                  <div className="absolute bottom-0 w-12 h-0.5 bg-primary rounded-t-full" />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

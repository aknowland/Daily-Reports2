import {
  LayoutDashboard,
  FolderOpen,
  Users,
  UserPlus,
  Building2,
  FilePlus,
  FileText,
  Receipt,
  Briefcase,
  MessageSquare,
  CalendarCheck,
  Key,
  Search,
  User,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const inspectorNavItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/reports/new", label: "New Report", icon: FilePlus },
  { href: "/profile", label: "My Profile", icon: User },
  { href: "/companies", label: "My Companies", icon: Building2 },
  { href: "/my-projects", label: "My Projects", icon: FolderOpen },
];

export const companyAdminNavItems: NavItem[] = [
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

export const systemAdminNavItems: NavItem[] = [
  { href: "/admin", label: "Admin Dashboard", icon: LayoutDashboard },
  { href: "/admin/companies", label: "All Companies", icon: Building2 },
  { href: "/admin/projects", label: "All Projects", icon: FolderOpen },
  { href: "/admin/users", label: "All Users", icon: Users },
  { href: "/admin/invites", label: "Invites", icon: UserPlus },
];

export function isNavItemActive(currentPath: string, href: string): boolean {
  if (href === "/") return currentPath === "/";
  if (href === "/admin") return currentPath === "/admin";
  return currentPath.startsWith(href);
}

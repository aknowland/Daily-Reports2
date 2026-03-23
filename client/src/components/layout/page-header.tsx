import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ icon: Icon, title, subtitle, children, className }: PageHeaderProps) {
  return (
    <div className={cn(
      "bg-[hsl(216,42%,13%)] text-white -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 py-5 mb-6 border-b border-[hsl(38,95%,52%)/0.6] shadow-sm",
      className
    )} data-testid="page-header">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="w-10 h-10 rounded-lg bg-[hsl(38,95%,52%)] flex items-center justify-center flex-shrink-0 shadow-sm">
                <Icon className="w-5 h-5 text-[hsl(216,42%,8%)]" />
              </div>
            )}
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="page-header-title">{title}</h1>
              {subtitle && (
                <p className="text-white/70 text-sm mt-0.5" data-testid="page-header-subtitle">{subtitle}</p>
              )}
            </div>
          </div>
          {children && (
            <div className="flex gap-2 flex-wrap">
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  children?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ title, children, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-[hsl(38,95%,52%)] rounded-full" />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

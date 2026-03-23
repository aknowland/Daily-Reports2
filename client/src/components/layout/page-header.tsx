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
      "bg-[hsl(220,55%,16%)] text-white -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 py-4 mb-6 border-b-4 border-[hsl(38,92%,50%)]",
      className
    )} data-testid="page-header">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {Icon && (
              <Icon className="w-5 h-5 text-[hsl(38,92%,50%)] flex-shrink-0" />
            )}
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight uppercase" data-testid="page-header-title">{title}</h1>
              {subtitle && (
                <p className="text-white/70 text-xs mt-0.5 tracking-wide" data-testid="page-header-subtitle">{subtitle}</p>
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
    <div className={cn("flex items-center justify-between py-2 border-b-2 border-border mb-4", className)}>
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 bg-[hsl(38,92%,50%)]" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

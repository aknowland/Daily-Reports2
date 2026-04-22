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
    <div
      className={cn(
        "mb-6 md:mb-8 animate-fade-in-up",
        className
      )}
      data-testid="page-header"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div className="w-11 h-11 rounded-xl bg-accent/12 ring-1 ring-accent/20 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-accent" />
            </div>
          )}
          <div className="min-w-0">
            <h1
              className="text-[22px] sm:text-2xl font-semibold tracking-tight text-foreground leading-tight truncate"
              data-testid="page-header-title"
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className="text-muted-foreground text-sm mt-0.5 truncate"
                data-testid="page-header-subtitle"
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {children && (
          <div className="flex gap-2 flex-wrap flex-shrink-0">
            {children}
          </div>
        )}
      </div>
      <div className="mt-5 h-px bg-gradient-to-r from-border via-border to-transparent" />
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
    <div className={cn("flex items-center justify-between mb-3", className)}>
      <div className="flex items-center gap-2.5">
        <div className="w-1 h-4 bg-accent rounded-full" />
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

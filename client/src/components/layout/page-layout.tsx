import { Header } from "./header";
import { MobileNav } from "./mobile-nav";
import { cn } from "@/lib/utils";

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  showNav?: boolean;
  isAdmin?: boolean;
  className?: string;
}

export function PageLayout({ 
  children, 
  title, 
  showNav = true, 
  isAdmin = false,
  className 
}: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header title={title} />
      <main className={cn(
        "flex-1 pb-20 lg:pb-6",
        className
      )}>
        {children}
      </main>
      {showNav && <MobileNav isAdmin={isAdmin} />}
    </div>
  );
}

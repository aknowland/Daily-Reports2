import { Helmet } from "react-helmet-async";
import { useLocation } from "wouter";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  showNav?: boolean;
  isAdmin?: boolean;
  className?: string;
}

const DEFAULT_DESCRIPTION =
  "Mobile-first daily field reports for construction inspectors. Create reports with photos, digital signatures, and PDF generation.";

export function PageLayout({
  children,
  title,
  description = DEFAULT_DESCRIPTION,
  showNav = true,
  isAdmin = false,
  className,
}: PageLayoutProps) {
  const fullTitle = title ? `${title} | Field Daily Reports` : "Field Daily Reports";
  const { user } = useAuth();
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{fullTitle}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={fullTitle} />
        <meta name="twitter:description" content={description} />
      </Helmet>

      {user && (
        <aside
          className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border z-30"
          data-testid="sidebar"
        >
          <SidebarNav variant="desktop" />
        </aside>
      )}

      <div className={cn("flex flex-col min-h-screen", user && "lg:pl-64")}>
        <Header title={title} />
        <main
          className={cn(
            "flex-1 pb-24 lg:pb-10 px-4 md:px-6 lg:px-8 overflow-x-hidden",
            className
          )}
        >
          <div
            key={location}
            className="max-w-7xl mx-auto py-6 md:py-8 w-full animate-fade-in-up"
          >
            {children}
          </div>
        </main>
        {showNav && <MobileNav isAdmin={isAdmin} />}
      </div>
    </div>
  );
}

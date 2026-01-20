import { Helmet } from "react-helmet-async";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";
import { cn } from "@/lib/utils";

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  showNav?: boolean;
  isAdmin?: boolean;
  className?: string;
}

const DEFAULT_DESCRIPTION = "Mobile-first daily field reports for construction inspectors. Create reports with photos, digital signatures, and PDF generation.";

export function PageLayout({ 
  children, 
  title, 
  description = DEFAULT_DESCRIPTION,
  showNav = true, 
  isAdmin = false,
  className 
}: PageLayoutProps) {
  const fullTitle = title ? `${title} | Field Daily Reports` : "Field Daily Reports";
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
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
      <Header title={title} />
      <main className={cn(
        "flex-1 pb-20 lg:pb-6 px-4 md:px-6 lg:px-8",
        className
      )}>
        <div className="max-w-7xl mx-auto py-4 md:py-6">
          {children}
        </div>
      </main>
      {showNav && <MobileNav isAdmin={isAdmin} />}
    </div>
  );
}

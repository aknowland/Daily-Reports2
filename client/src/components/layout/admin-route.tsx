import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

interface AdminRouteProps {
  children: React.ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { isAdmin, isCompanyAdmin, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  // User must be either a system admin or company admin to access admin routes
  // Note: We check actual role, not admin mode toggle - the mode toggle only affects
  // what data they see, not whether they can access admin pages. This prevents
  // admins from getting locked out when they toggle to inspector mode.
  const canAccessAdminRoutes = isAdmin || isCompanyAdmin;

  useEffect(() => {
    if (!isLoading && !canAccessAdminRoutes) {
      setLocation("/");
    }
  }, [isLoading, canAccessAdminRoutes, setLocation]);

  if (isLoading) {
    return null;
  }

  if (!canAccessAdminRoutes) {
    return null;
  }

  return <>{children}</>;
}

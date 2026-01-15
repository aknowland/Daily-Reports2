import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAdminMode } from "@/hooks/use-admin-mode";

interface AdminRouteProps {
  children: React.ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { isAdminMode } = useAdminMode();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAdminMode) {
      setLocation("/");
    }
  }, [isAdminMode, setLocation]);

  if (!isAdminMode) {
    return null;
  }

  return <>{children}</>;
}

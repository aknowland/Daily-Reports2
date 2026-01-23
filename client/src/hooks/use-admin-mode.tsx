import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAuth } from "./use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface AdminModeContextType {
  isAdminMode: boolean;
  isInspectorMode: boolean;
  toggleMode: () => void;
  setAdminMode: (value: boolean) => void;
}

const AdminModeContext = createContext<AdminModeContextType | null>(null);

export function AdminModeProvider({ children }: { children: ReactNode }) {
  const { profile, isLoading } = useAuth();
  const [isAdminMode, setIsAdminMode] = useState<boolean>(true);
  const [initialized, setInitialized] = useState(false);

  // Initialize from profile when it loads
  useEffect(() => {
    if (!isLoading && profile && !initialized) {
      // Use the preference from database, default to true for admins
      const preferAdminMode = profile.preferAdminMode ?? true;
      setIsAdminMode(preferAdminMode);
      setInitialized(true);
    }
  }, [profile, isLoading, initialized]);

  // Reset initialized when profile changes (e.g., logout then login as different user)
  useEffect(() => {
    if (!profile) {
      setInitialized(false);
    }
  }, [profile]);

  const invalidateRoleBasedQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    queryClient.invalidateQueries({ queryKey: ["/api/my-projects"] });
    queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
    queryClient.invalidateQueries({ queryKey: ["/api/auth/profile"] });
    // This is the main auth query that contains the profile - must invalidate for UI to update
    queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
  }, []);

  const toggleMode = useCallback(async () => {
    const newValue = !isAdminMode;
    setIsAdminMode(newValue);
    
    // Save to database
    try {
      await apiRequest("PATCH", "/api/profile/admin-mode", { preferAdminMode: newValue });
      invalidateRoleBasedQueries();
    } catch (error) {
      console.error("Failed to save admin mode preference:", error);
    }
  }, [isAdminMode, invalidateRoleBasedQueries]);

  const setAdminMode = useCallback(async (value: boolean) => {
    setIsAdminMode(value);
    
    // Save to database
    try {
      await apiRequest("PATCH", "/api/profile/admin-mode", { preferAdminMode: value });
      invalidateRoleBasedQueries();
    } catch (error) {
      console.error("Failed to save admin mode preference:", error);
    }
  }, [invalidateRoleBasedQueries]);

  return (
    <AdminModeContext.Provider
      value={{
        isAdminMode,
        isInspectorMode: !isAdminMode,
        toggleMode,
        setAdminMode,
      }}
    >
      {children}
    </AdminModeContext.Provider>
  );
}

export function useAdminMode() {
  const context = useContext(AdminModeContext);
  if (!context) {
    throw new Error("useAdminMode must be used within an AdminModeProvider");
  }
  return context;
}

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAuth } from "./use-auth";
import { apiRequest } from "@/lib/queryClient";

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

  const toggleMode = useCallback(async () => {
    const newValue = !isAdminMode;
    setIsAdminMode(newValue);
    
    // Save to database
    try {
      await apiRequest("PATCH", "/api/profile/admin-mode", { preferAdminMode: newValue });
    } catch (error) {
      console.error("Failed to save admin mode preference:", error);
    }
  }, [isAdminMode]);

  const setAdminMode = useCallback(async (value: boolean) => {
    setIsAdminMode(value);
    
    // Save to database
    try {
      await apiRequest("PATCH", "/api/profile/admin-mode", { preferAdminMode: value });
    } catch (error) {
      console.error("Failed to save admin mode preference:", error);
    }
  }, []);

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

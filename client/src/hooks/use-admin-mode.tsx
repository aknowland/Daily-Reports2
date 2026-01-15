import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

const ADMIN_MODE_KEY = "fieldReports_adminMode";

interface AdminModeContextType {
  isAdminMode: boolean;
  isInspectorMode: boolean;
  toggleMode: () => void;
  setAdminMode: (value: boolean) => void;
}

const AdminModeContext = createContext<AdminModeContextType | null>(null);

function getInitialMode(): boolean {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(ADMIN_MODE_KEY);
    return stored === "true";
  }
  return true;
}

export function AdminModeProvider({ children }: { children: ReactNode }) {
  const [isAdminMode, setIsAdminMode] = useState<boolean>(getInitialMode);

  useEffect(() => {
    localStorage.setItem(ADMIN_MODE_KEY, String(isAdminMode));
  }, [isAdminMode]);

  const toggleMode = useCallback(() => {
    setIsAdminMode((prev) => !prev);
  }, []);

  const setAdminMode = useCallback((value: boolean) => {
    setIsAdminMode(value);
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

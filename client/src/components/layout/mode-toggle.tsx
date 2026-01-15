import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Shield, HardHat } from "lucide-react";
import { useAdminMode } from "@/hooks/use-admin-mode";
import { useLocation } from "wouter";

export function ModeToggle() {
  const { isAdminMode, toggleMode } = useAdminMode();
  const [location, setLocation] = useLocation();

  const handleToggle = () => {
    const switchingToInspectorMode = isAdminMode;
    const isOnAdminPage = location.startsWith("/admin") || location === "/settings";
    
    toggleMode();
    
    if (switchingToInspectorMode && isOnAdminPage) {
      setLocation("/");
    }
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50">
      <HardHat className={`w-4 h-4 transition-colors ${!isAdminMode ? "text-primary" : "text-muted-foreground"}`} />
      <Switch
        id="admin-mode"
        checked={isAdminMode}
        onCheckedChange={handleToggle}
        data-testid="switch-admin-mode"
      />
      <Shield className={`w-4 h-4 transition-colors ${isAdminMode ? "text-primary" : "text-muted-foreground"}`} />
      <Label htmlFor="admin-mode" className="text-xs font-medium cursor-pointer hidden sm:inline">
        {isAdminMode ? "Admin" : "Inspector"}
      </Label>
    </div>
  );
}

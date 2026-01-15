import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Shield, HardHat } from "lucide-react";
import { useAdminMode } from "@/hooks/use-admin-mode";

export function ModeToggle() {
  const { isAdminMode, toggleMode } = useAdminMode();

  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50">
      <HardHat className={`w-4 h-4 transition-colors ${!isAdminMode ? "text-primary" : "text-muted-foreground"}`} />
      <Switch
        id="admin-mode"
        checked={isAdminMode}
        onCheckedChange={toggleMode}
        data-testid="switch-admin-mode"
      />
      <Shield className={`w-4 h-4 transition-colors ${isAdminMode ? "text-primary" : "text-muted-foreground"}`} />
      <Label htmlFor="admin-mode" className="text-xs font-medium cursor-pointer hidden sm:inline">
        {isAdminMode ? "Admin" : "Inspector"}
      </Label>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { User, ArrowRight } from "lucide-react";

const DISMISS_KEY = "profile-setup-dismissed";
const DISMISS_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export function ProfileSetupPrompt() {
  const { user, profile, isLoading } = useAuth();
  const [location] = useLocation();
  const [showPrompt, setShowPrompt] = useState(false);

  // Don't show on profile page - user might already be setting up their profile
  const isOnProfilePage = location === "/profile";

  useEffect(() => {
    if (isLoading || !user || isOnProfilePage) {
      setShowPrompt(false);
      return;
    }

    const firstName = profile?.firstName || user?.firstName;
    const lastName = profile?.lastName || user?.lastName;
    const isProfileComplete = firstName && lastName && firstName.trim() !== "" && lastName.trim() !== "";

    if (isProfileComplete) {
      setShowPrompt(false);
      return;
    }

    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const dismissedTime = parseInt(dismissedAt, 10);
      if (Date.now() - dismissedTime < DISMISS_DURATION) {
        return;
      }
    }

    setShowPrompt(true);
  }, [user, profile, isLoading, isOnProfilePage]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setShowPrompt(false);
  };

  const handleGoToProfile = () => {
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <Dialog open={showPrompt} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md" 
        data-testid="dialog-profile-setup"
        hideCloseButton
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2" data-testid="profile-setup-header">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle className="text-xl" data-testid="text-profile-setup-title">Complete Your Profile</DialogTitle>
          </div>
          <DialogDescription className="text-left" data-testid="text-profile-setup-description">
            Please set up your name so it appears correctly on daily reports, signatures, and team member lists.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2" data-testid="profile-setup-info">
            <p className="text-sm font-medium" data-testid="text-profile-usage-header">Your name will be used for:</p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1" data-testid="list-profile-usage">
              <li data-testid="text-usage-signatures">Daily report signatures</li>
              <li data-testid="text-usage-headers">PDF report headers</li>
              <li data-testid="text-usage-team">Team member displays</li>
              <li data-testid="text-usage-logs">Activity logs and history</li>
            </ul>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleDismiss}
            data-testid="button-dismiss-profile-setup"
          >
            Remind Me Later
          </Button>
          <Button asChild data-testid="button-go-to-profile" onClick={handleGoToProfile}>
            <Link href="/profile">
              Set Up Profile
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

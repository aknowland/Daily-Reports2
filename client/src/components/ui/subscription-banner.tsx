import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Crown, AlertTriangle } from "lucide-react";

interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  subscriptionType: 'company' | 'independent' | 'free' | null;
  status: string | null;
  currentPeriodEnd: string | null;
  monthlyReportCount: number;
  reportLimit: number | null;
}

export function SubscriptionBanner() {
  const { data: subscriptionStatus, isLoading } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/subscription/status"],
    staleTime: 60000, // Cache for 1 minute
  });

  if (isLoading || !subscriptionStatus) {
    return null;
  }

  // Show nothing if user has active subscription
  if (subscriptionStatus.hasActiveSubscription) {
    return null;
  }

  // Show free tier usage warning if near limit
  const isNearLimit = subscriptionStatus.reportLimit && 
    subscriptionStatus.monthlyReportCount >= (subscriptionStatus.reportLimit * 0.8);
  const isAtLimit = subscriptionStatus.reportLimit && 
    subscriptionStatus.monthlyReportCount >= subscriptionStatus.reportLimit;

  if (isAtLimit) {
    return (
      <Alert variant="destructive" className="mb-4" data-testid="alert-subscription-limit">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Free tier limit reached</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
          <span>
            You've used all {subscriptionStatus.reportLimit} free reports this month.
          </span>
          <Link href="/billing">
            <Button size="sm" variant="outline" className="border-destructive-foreground/50" data-testid="button-upgrade-banner">
              <Crown className="w-4 h-4 mr-1" />
              Upgrade Now
            </Button>
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  if (isNearLimit) {
    return (
      <Alert className="mb-4 border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800" data-testid="alert-subscription-warning">
        <Crown className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800 dark:text-amber-200">Free tier - {subscriptionStatus.reportLimit! - subscriptionStatus.monthlyReportCount} reports remaining</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-4 flex-wrap text-amber-700 dark:text-amber-300">
          <span>
            Upgrade to Independent Pro for unlimited reports.
          </span>
          <Link href="/billing">
            <Button size="sm" variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-200" data-testid="button-upgrade-banner">
              <Crown className="w-4 h-4 mr-1" />
              View Plans
            </Button>
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

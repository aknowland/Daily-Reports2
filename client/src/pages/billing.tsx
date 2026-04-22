import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { 
  Loader2, 
  CreditCard, 
  Check, 
  Crown,
  Building2,
  User,
  ArrowLeft,
  ExternalLink,
  Receipt
} from "lucide-react";
import { Link } from "wouter";
import type { UserProfile } from "@shared/schema";

interface StripePrice {
  id: string;
  unit_amount: number;
  currency: string;
  recurring?: {
    interval: string;
  };
  product: {
    id: string;
    name: string;
    description?: string;
    metadata?: Record<string, string>;
  };
}

interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  subscriptionType: 'company' | 'independent' | 'free' | null;
  status: string | null;
  currentPeriodEnd: string | null;
  monthlyReportCount: number;
  reportLimit: number | null;
}

export default function BillingPage() {
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
  });

  const { data: subscriptionStatus, isLoading: statusLoading } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/subscription/status"],
  });

  const { data: prices, isLoading: pricesLoading } = useQuery<StripePrice[]>({
    queryKey: ["/api/subscription/prices"],
  });

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const response = await apiRequest("POST", "/api/subscription/checkout", { priceId }) as { url: string };
      return response;
    },
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/subscription/portal") as { url: string };
      return response;
    },
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to open billing portal. Please try again.",
        variant: "destructive",
      });
    },
  });

  const isLoading = profileLoading || statusLoading || pricesLoading;

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount / 100);
  };

  const getStatusBadge = () => {
    if (!subscriptionStatus) return null;
    
    if (subscriptionStatus.hasActiveSubscription) {
      return <Badge className="bg-green-600" data-testid="badge-subscription-active">Active</Badge>;
    }
    return <Badge variant="secondary" data-testid="badge-subscription-free">Free Plan</Badge>;
  };

  const getPlanName = () => {
    if (!subscriptionStatus) return "Loading...";
    
    switch (subscriptionStatus.subscriptionType) {
      case 'company':
        return 'Company Account';
      case 'independent':
        return 'Independent Pro';
      case 'free':
      default:
        return 'Independent Free';
    }
  };

  const independentProPrice = prices?.find(p => 
    p.product.metadata?.tier === 'independent_pro' || 
    p.product.name.toLowerCase().includes('independent pro')
  );

  const companyPrice = prices?.find(p => 
    p.product.metadata?.tier === 'company' || 
    p.product.name.toLowerCase().includes('company account')
  );

  if (isLoading) {
    return (
      <PageLayout title="Billing">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Billing & Subscription">
      <div className="max-w-4xl mx-auto space-y-6 p-4 md:p-6">
        <PageHeader icon={Receipt} title="Billing & Subscription" subtitle="Manage your subscription and billing details">
          <Link href="/profile">
            <Button variant="outline" className="" size="sm" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Profile
            </Button>
          </Link>
        </PageHeader>

        <Card data-testid="card-current-plan">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Current Plan</CardTitle>
                  <CardDescription>Your active subscription</CardDescription>
                </div>
              </div>
              {getStatusBadge()}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  {subscriptionStatus?.subscriptionType === 'company' ? (
                    <Building2 className="w-6 h-6 text-primary" />
                  ) : subscriptionStatus?.subscriptionType === 'independent' ? (
                    <Crown className="w-6 h-6 text-amber-500" />
                  ) : (
                    <User className="w-6 h-6 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-semibold" data-testid="text-plan-name">{getPlanName()}</p>
                    {subscriptionStatus?.currentPeriodEnd && (
                      <p className="text-sm text-muted-foreground">
                        Renews {new Date(subscriptionStatus.currentPeriodEnd).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                {subscriptionStatus?.hasActiveSubscription && (
                  <Button 
                    variant="outline" 
                    onClick={() => portalMutation.mutate()}
                    disabled={portalMutation.isPending}
                    data-testid="button-manage-subscription"
                  >
                    {portalMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <ExternalLink className="w-4 h-4 mr-2" />
                    )}
                    Manage
                  </Button>
                )}
              </div>

              {subscriptionStatus?.subscriptionType === 'free' && (
                <div className="p-4 border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Crown className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-200">
                        Free Plan Limits
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        You've used <strong>{subscriptionStatus.monthlyReportCount}</strong> of <strong>{subscriptionStatus.reportLimit}</strong> free reports this month.
                        Upgrade to Pro for unlimited reports.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Separator />

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Available Plans</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Card className={subscriptionStatus?.subscriptionType === 'independent' ? 'border-primary' : ''} data-testid="card-plan-independent-pro">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Crown className="w-8 h-8 text-amber-500" />
                  {subscriptionStatus?.subscriptionType === 'independent' && (
                    <Badge className="bg-primary">Current</Badge>
                  )}
                </div>
                <CardTitle className="mt-4">Independent Pro</CardTitle>
                <CardDescription>
                  Perfect for independent inspectors
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <span className="text-3xl font-bold">
                    {independentProPrice ? formatPrice(independentProPrice.unit_amount) : '$49'}
                  </span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    Unlimited daily reports
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    PDF generation & email distribution
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    Voice-to-text transcription
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    Invoice generation
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    Photo uploads with captions
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                {subscriptionStatus?.subscriptionType !== 'independent' && independentProPrice && (
                  <Button 
                    className="w-full" 
                    onClick={() => checkoutMutation.mutate(independentProPrice.id)}
                    disabled={checkoutMutation.isPending}
                    data-testid="button-upgrade-independent-pro"
                  >
                    {checkoutMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Upgrade to Pro
                  </Button>
                )}
                {subscriptionStatus?.subscriptionType === 'independent' && (
                  <Button variant="secondary" className="w-full" disabled>
                    Current Plan
                  </Button>
                )}
              </CardFooter>
            </Card>

            <Card className={subscriptionStatus?.subscriptionType === 'company' ? 'border-primary' : ''} data-testid="card-plan-company">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Building2 className="w-8 h-8 text-primary" />
                  {subscriptionStatus?.subscriptionType === 'company' && (
                    <Badge className="bg-primary">Current</Badge>
                  )}
                </div>
                <CardTitle className="mt-4">Company Account</CardTitle>
                <CardDescription>
                  For construction companies with teams
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <span className="text-3xl font-bold">
                    {companyPrice ? formatPrice(companyPrice.unit_amount) : '$499'}
                  </span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    Everything in Independent Pro
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    Multi-user team management
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    Project & company organization
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    Role-based access control
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    Company branding on PDFs
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground mt-3">
                  + $79/month per additional user
                </p>
              </CardContent>
              <CardFooter>
                {subscriptionStatus?.subscriptionType !== 'company' && companyPrice && (
                  <Button 
                    className="w-full" 
                    onClick={() => checkoutMutation.mutate(companyPrice.id)}
                    disabled={checkoutMutation.isPending}
                    data-testid="button-upgrade-company"
                  >
                    {checkoutMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    Upgrade to Company
                  </Button>
                )}
                {subscriptionStatus?.subscriptionType === 'company' && (
                  <Button variant="secondary" className="w-full" disabled>
                    Current Plan
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        </div>

        <Card className="bg-muted/30" data-testid="card-free-plan">
          <CardHeader>
            <CardTitle className="text-lg">Independent Free</CardTitle>
            <CardDescription>
              Get started with Field Daily Reports at no cost
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                Up to 5 reports per month
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                Basic PDF generation
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                Photo uploads
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                Digital signatures
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}

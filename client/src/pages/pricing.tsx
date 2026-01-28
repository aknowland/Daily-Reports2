import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, HardHat, ArrowLeft, Loader2 } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface PricingPlan {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  buttonText: string;
  buttonVariant: "default" | "outline";
  popular: boolean;
  priceId: string | null;
}

const pricingPlans: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "$99",
    period: "/month",
    description: "For small teams getting started with digital reporting",
    features: [
      "Up to 3 inspectors",
      "Unlimited daily reports",
      "Photo uploads & signatures",
      "PDF generation & email",
      "Basic project management",
      "Standard support",
    ],
    buttonText: "Get Started",
    buttonVariant: "outline",
    popular: false,
    priceId: "price_starter_monthly",
  },
  {
    id: "professional",
    name: "Professional",
    price: "$299",
    period: "/month",
    description: "For growing companies with advanced needs",
    features: [
      "Up to 10 inspectors",
      "Everything in Starter",
      "Contract & proposal management",
      "Multi-rate billing",
      "Invoice generation",
      "Voice-to-text transcription",
      "Company branding on PDFs",
      "Priority support",
    ],
    buttonText: "Start Free Trial",
    buttonVariant: "default",
    popular: true,
    priceId: "price_professional_monthly",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "$699",
    period: "/month",
    description: "For large organizations with complex requirements",
    features: [
      "Unlimited inspectors",
      "Everything in Professional",
      "Advanced analytics dashboard",
      "API access",
      "Custom integrations",
      "Dedicated account manager",
      "SLA guarantee",
      "Training & onboarding",
    ],
    buttonText: "Contact Sales",
    buttonVariant: "outline",
    popular: false,
    priceId: "price_enterprise_monthly",
  },
];

export default function PricingPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const params = new URLSearchParams(searchParams);
  const companyId = params.get("companyId");
  const companyName = params.get("companyName");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const { data: user } = useQuery<{ id: string } | null>({
    queryKey: ["/api/auth/user"],
  });

  const checkoutMutation = useMutation({
    mutationFn: async ({ priceId, planId }: { priceId: string; planId: string }) => {
      const res = await apiRequest("POST", "/api/stripe/checkout", { 
        priceId,
        companyId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      setLoadingPlan(null);
      toast({
        title: "Error",
        description: error.message || "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSelectPlan = (plan: PricingPlan) => {
    if (!plan.priceId) {
      window.location.href = "mailto:info@knowlandinc.com?subject=Enterprise Plan Inquiry";
      return;
    }

    if (!user) {
      window.location.href = "/api/login";
      return;
    }

    setLoadingPlan(plan.id);
    checkoutMutation.mutate({ priceId: plan.priceId, planId: plan.id });
  };

  const handleSkip = () => {
    if (companyId) {
      setLocation("/company/dashboard");
    } else {
      setLocation("/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-4">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <HardHat className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-semibold text-lg">Field Daily Reports</span>
            </div>
          </Link>
          {user ? (
            <Button variant="outline" onClick={handleSkip} data-testid="button-skip-pricing">
              Skip for now
            </Button>
          ) : (
            <Button asChild data-testid="button-header-login">
              <a href="/api/login">Sign In</a>
            </Button>
          )}
        </div>
      </header>

      <main className="container px-4 py-16 mx-auto max-w-screen-xl">
        {!companyId && (
          <div className="flex items-center gap-2 mb-8">
            <Button variant="ghost" size="sm" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Home
              </Link>
            </Button>
          </div>
        )}

        <div className="text-center space-y-4 mb-12">
          {companyName && (
            <Badge variant="secondary" className="mb-2" data-testid="badge-company-name">
              Setting up: {companyName}
            </Badge>
          )}
          <h1 className="text-4xl font-bold tracking-tight" data-testid="title-pricing">
            Choose Your Plan
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {companyId 
              ? "Select a subscription plan to activate your company account and unlock all features."
              : "Simple, transparent pricing. Start with a free trial and upgrade as you grow."}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3 max-w-5xl mx-auto">
          {pricingPlans.map((plan) => (
            <Card 
              key={plan.name} 
              className={`relative flex flex-col ${plan.popular ? 'border-primary shadow-lg' : ''}`}
              data-testid={`card-plan-${plan.id}`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2" data-testid="badge-popular">
                  Most Popular
                </Badge>
              )}
              <CardHeader>
                <CardTitle className="text-xl" data-testid={`text-plan-name-${plan.id}`}>{plan.name}</CardTitle>
                <CardDescription data-testid={`text-plan-description-${plan.id}`}>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="mb-6" data-testid={`text-plan-price-${plan.id}`}>
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                <ul className="space-y-3" data-testid={`list-plan-features-${plan.id}`}>
                  {plan.features.map((feature, index) => (
                    <li key={feature} className="flex items-start gap-2" data-testid={`text-feature-${plan.id}-${index}`}>
                      <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full" 
                  variant={plan.buttonVariant}
                  onClick={() => handleSelectPlan(plan)}
                  disabled={loadingPlan === plan.id}
                  data-testid={`button-select-${plan.id}`}
                >
                  {loadingPlan === plan.id ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    plan.buttonText
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {companyId && (
          <div className="mt-8 text-center">
            <Button 
              variant="ghost" 
              onClick={handleSkip}
              data-testid="button-skip-below"
            >
              Skip for now - continue with free trial
            </Button>
          </div>
        )}

        <div className="mt-16 text-center">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle>Need a Custom Solution?</CardTitle>
              <CardDescription>
                For enterprise deployments or custom requirements, we offer tailored solutions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild data-testid="button-contact-sales">
                <a href="mailto:info@knowlandinc.com">Contact Our Team</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t border-border py-8 mt-16">
        <div className="container px-4 mx-auto max-w-screen-xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                <HardHat className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-sm text-muted-foreground">
                © 2026 Field Daily Reports. All rights reserved.
              </span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
              <a href="#" className="hover:text-foreground transition-colors">Support</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

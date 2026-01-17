import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, HardHat, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const pricingPlans = [
  {
    name: "Independent Free",
    price: "$0",
    period: "/month",
    description: "Perfect for getting started with basic reporting needs",
    features: [
      "5 reports per month",
      "Photo uploads",
      "Digital signatures",
      "PDF generation",
      "Email distribution",
    ],
    buttonText: "Get Started",
    buttonVariant: "outline" as const,
    popular: false,
  },
  {
    name: "Independent Pro",
    price: "$49",
    period: "/month",
    description: "For independent inspectors who need unlimited reporting",
    features: [
      "Unlimited reports",
      "Photo uploads",
      "Digital signatures",
      "PDF generation",
      "Email distribution",
      "Voice-to-text transcription",
      "Batch PDF export",
      "Invoice generation",
    ],
    buttonText: "Start Free Trial",
    buttonVariant: "default" as const,
    popular: true,
  },
  {
    name: "Company User",
    price: "$79",
    period: "/month per user",
    description: "For team members within a company account",
    features: [
      "Unlimited reports",
      "All Independent Pro features",
      "Project assignments",
      "Team collaboration",
      "Company branding on PDFs",
    ],
    buttonText: "Contact Sales",
    buttonVariant: "outline" as const,
    popular: false,
  },
  {
    name: "Company Account",
    price: "$499",
    period: "/month",
    description: "Complete solution for construction companies",
    features: [
      "Everything in Company User",
      "Unlimited team members",
      "Multi-project management",
      "Admin dashboard",
      "User management",
      "Custom branding",
      "Priority support",
      "API access",
    ],
    buttonText: "Contact Sales",
    buttonVariant: "outline" as const,
    popular: false,
  },
];

export default function PricingPage() {
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
          <Button asChild data-testid="button-header-login">
            <a href="/api/login">Sign In</a>
          </Button>
        </div>
      </header>

      <main className="container px-4 py-16 mx-auto max-w-screen-xl">
        <div className="flex items-center gap-2 mb-8">
          <Button variant="ghost" size="sm" asChild data-testid="button-back">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Home
            </Link>
          </Button>
        </div>

        <div className="text-center space-y-4 mb-12">
          <h1 className="text-4xl font-bold tracking-tight" data-testid="title-pricing">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that fits your needs. Start free and upgrade as you grow.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {pricingPlans.map((plan) => (
            <Card 
              key={plan.name} 
              className={`relative flex flex-col ${plan.popular ? 'border-primary shadow-lg' : ''}`}
              data-testid={`card-plan-${plan.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2" data-testid="badge-popular">
                  Most Popular
                </Badge>
              )}
              <CardHeader>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
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
                  asChild
                  data-testid={`button-plan-${plan.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <a href="/api/login">{plan.buttonText}</a>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

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

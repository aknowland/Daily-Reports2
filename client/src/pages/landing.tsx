import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  HardHat,
  Camera, 
  PenTool, 
  FileText, 
  Mail, 
  Shield,
  CheckCircle,
  ArrowRight
} from "lucide-react";

export default function LandingPage() {
  const features = [
    {
      icon: <Camera className="w-6 h-6" />,
      title: "Photo Documentation",
      description: "Capture and organize site photos with captions directly from your mobile device",
    },
    {
      icon: <PenTool className="w-6 h-6" />,
      title: "Digital Signatures",
      description: "Sign reports with finger or stylus for authenticated submissions",
    },
    {
      icon: <FileText className="w-6 h-6" />,
      title: "Professional PDFs",
      description: "Generate branded US Letter PDFs with company logo and all report details",
    },
    {
      icon: <Mail className="w-6 h-6" />,
      title: "Easy Distribution",
      description: "Email reports to project stakeholders with one tap",
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Secure & Reliable",
      description: "All data stored securely with automatic backups",
    },
    {
      icon: <HardHat className="w-6 h-6" />,
      title: "Built for the Field",
      description: "Mobile-first design optimized for construction site conditions",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <HardHat className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">Field Daily Reports</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild data-testid="button-header-login">
              <a href="/api/login">Sign In</a>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden py-20 md:py-32">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
          <div className="container relative px-4 mx-auto max-w-screen-xl">
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
              <div className="space-y-8">
                <div className="space-y-4">
                  <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
                    Daily Reports
                    <span className="block text-primary">Made Simple</span>
                  </h1>
                  <p className="text-lg text-muted-foreground max-w-lg">
                    The mobile-first solution for construction inspectors to create professional 
                    daily reports with photos, signatures, and instant PDF generation.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Button size="lg" asChild className="h-12" data-testid="button-hero-get-started">
                    <a href="/api/login">
                      Get Started
                      <ArrowRight className="ml-2 w-5 h-5" />
                    </a>
                  </Button>
                  <Button variant="outline" size="lg" asChild className="h-12" data-testid="button-hero-learn-more">
                    <a href="/learn-more">Learn More</a>
                  </Button>
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span>No credit card required</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span>Mobile optimized</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span>Works offline</span>
                  </div>
                </div>
              </div>

              <div className="relative hidden lg:block">
                <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-primary/5 rounded-3xl" />
                <div className="relative bg-card border border-border rounded-2xl shadow-lg p-6 transform rotate-1 hover:rotate-0 transition-transform duration-300">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">Daily Inspection Report</p>
                        <p className="text-sm text-muted-foreground">Project: Downtown Tower</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Date</p>
                        <p className="font-medium">Jan 14, 2026</p>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Weather</p>
                        <p className="font-medium">Clear, 72°F</p>
                      </div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Work Performed</p>
                      <p className="text-sm mt-1">Completed foundation inspection for Section A...</p>
                    </div>
                    <div className="flex gap-2">
                      <div className="w-16 h-16 rounded-lg bg-muted animate-pulse" />
                      <div className="w-16 h-16 rounded-lg bg-muted animate-pulse" />
                      <div className="w-16 h-16 rounded-lg bg-muted animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-muted/30">
          <div className="container px-4 mx-auto max-w-screen-xl">
            <div className="text-center space-y-4 mb-12">
              <h2 className="text-3xl font-bold">Everything You Need</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Powerful features designed specifically for construction field inspectors
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, index) => (
                <Card 
                  key={index} 
                  className="hover-elevate transition-all"
                  data-testid={`card-feature-${index}`}
                >
                  <CardContent className="p-6 space-y-4">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      {feature.icon}
                    </div>
                    <div className="space-y-2">
                      <h3 className="font-semibold text-lg">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container px-4 mx-auto max-w-screen-xl">
            <div className="text-center space-y-6">
              <h2 className="text-3xl font-bold">Ready to Get Started?</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Join construction teams who trust Field Daily Reports for their inspection documentation
              </p>
              <Button size="lg" asChild className="h-12" data-testid="button-cta-get-started">
                <a href="/api/login">
                  Start Creating Reports
                  <ArrowRight className="ml-2 w-5 h-5" />
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
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

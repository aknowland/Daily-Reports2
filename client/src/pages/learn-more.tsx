import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Mic,
  Camera,
  PenTool,
  FileDown,
  Mail,
  Users,
  Building2,
  Clock,
  Receipt,
  Cloud,
  Shield,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const features = [
  {
    icon: FileText,
    title: "Daily Field Reports",
    description: "Create comprehensive daily inspection reports with an intuitive mobile-first interface designed for use in the field.",
    details: [
      "Document work activities, contractors, and headcount",
      "Record weather conditions and site observations",
      "Track visitors, equipment, and materials delivered",
      "Flag issues, delays, and safety incidents",
      "Add detailed notes and observations",
    ],
    badge: "Core Feature",
  },
  {
    icon: Mic,
    title: "Voice-to-Text Dictation",
    description: "Hands-free data entry using your device's microphone and AI-powered transcription. Perfect for when you're on-site and need to document quickly.",
    details: [
      "Record up to 120 seconds of audio per entry",
      "AI transcription converts speech to text",
      "Smart parsing extracts work activities and visitor info",
      "Works with all major text fields in reports",
      "Visual countdown and auto-stop functionality",
    ],
    badge: "AI Powered",
  },
  {
    icon: Camera,
    title: "Photo Documentation",
    description: "Capture and organize site photos with captions to provide visual evidence of work progress, conditions, and any issues encountered.",
    details: [
      "Upload multiple photos per report",
      "Add descriptive captions to each photo",
      "Photos stored securely in cloud storage",
      "View and manage photos in report details",
      "Photos included in generated PDFs",
    ],
    badge: "Visual Records",
  },
  {
    icon: PenTool,
    title: "Digital Signatures",
    description: "Canvas-based signature capture allows inspectors to sign off on reports digitally, providing authentication and accountability.",
    details: [
      "Touch-optimized drawing canvas",
      "Clear and re-sign functionality",
      "Signature timestamp recorded",
      "Included on PDF reports",
      "Legally binding digital signature",
    ],
    badge: "Authentication",
  },
  {
    icon: FileDown,
    title: "PDF Generation",
    description: "Generate professional, branded PDF reports with a constrained 2-page format. Includes weather icons, company logo, and all report data.",
    details: [
      "Professional 'Daily Field Report' layout",
      "Drawn weather icons for conditions",
      "Company branding and logo support",
      "Optimized 2-page format",
      "Download or distribute directly",
    ],
    badge: "Professional Output",
  },
  {
    icon: Mail,
    title: "Email Distribution",
    description: "Send completed reports directly to project stakeholders via email. Configure default recipients per project for streamlined distribution.",
    details: [
      "One-click distribution to project recipients",
      "PDF automatically attached to email",
      "Distribution history tracking",
      "Configure default emails per project",
      "Powered by Resend email service",
    ],
    badge: "Communication",
  },
  {
    icon: Users,
    title: "Team Management",
    description: "Invite and manage team members within your organization. Assign roles, manage project access, and handle join requests.",
    details: [
      "Invite users via email",
      "Assign Inspector or Admin roles",
      "Manage project assignments",
      "Handle join requests",
      "View pending invitations",
    ],
    badge: "Collaboration",
  },
  {
    icon: Building2,
    title: "Multi-Company Support",
    description: "Work across multiple construction companies seamlessly. Switch between companies and maintain separate project portfolios.",
    details: [
      "Belong to multiple companies",
      "Quick company switching in header",
      "Separate project lists per company",
      "Role-based access per company",
      "Company-specific settings and branding",
    ],
    badge: "Flexibility",
  },
  {
    icon: Clock,
    title: "Time Tracking",
    description: "Track work hours including time in, lunch breaks, and time out. Automatically calculate regular and overtime hours for each report.",
    details: [
      "Record time in and time out",
      "Track lunch break duration",
      "Auto-calculate regular hours",
      "Track overtime hours separately",
      "Monthly hours summary for invoices",
    ],
    badge: "Billing Ready",
  },
  {
    icon: Receipt,
    title: "Invoice Generation",
    description: "Generate invoices based on tracked time with date range selection. Unique sequential invoice numbers for professional billing.",
    details: [
      "Select date range for invoicing",
      "Aggregate hours from reports",
      "Sequential invoice numbering",
      "Independent contractor info from profile",
      "Professional PDF invoice output",
    ],
    badge: "Financials",
  },
  {
    icon: Cloud,
    title: "Cloud Storage",
    description: "All files including photos, signatures, and PDFs are stored securely in persistent cloud storage. Access your data from anywhere.",
    details: [
      "Secure cloud-based storage",
      "Automatic file organization",
      "Fast retrieval and viewing",
      "Reliable backup and redundancy",
      "Accessible from any device",
    ],
    badge: "Infrastructure",
  },
  {
    icon: Shield,
    title: "Role-Based Access Control",
    description: "Three-tier access control system ensures users only see and access what they're authorized for. System Admins, Company Admins, and Inspectors each have appropriate permissions.",
    details: [
      "System Admin: Full platform access",
      "Company Admin: Manage company resources",
      "Inspector: View assigned projects and own reports",
      "Inspector mode toggle for admins",
      "Project-level assignment control",
    ],
    badge: "Security",
  },
];

export default function LearnMorePage() {
  const { isAuthenticated } = useAuth();
  
  return (
    <PageLayout title="Learn More">
      <div className="container px-4 py-6 mx-auto max-w-screen-lg space-y-8">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" asChild data-testid="button-back">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              {isAuthenticated ? "Back to Dashboard" : "Back to Home"}
            </Link>
          </Button>
        </div>

        <div className="text-center space-y-4 mb-8">
          <h1 className="text-3xl font-bold" data-testid="title-learn-more">Field Daily Reports</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            A comprehensive mobile-first platform for construction inspectors to document their work efficiently. 
            From voice dictation to PDF generation, everything you need is at your fingertips.
          </p>
        </div>

        <div className="grid gap-6">
          {features.map((feature, index) => (
            <Card key={index} className="overflow-hidden" data-testid={`card-feature-${index}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-primary/10">
                      <feature.icon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl">{feature.title}</CardTitle>
                      <CardDescription className="mt-1">
                        {feature.description}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0 no-default-hover-elevate no-default-active-elevate">
                    {feature.badge}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="grid sm:grid-cols-2 gap-2">
                  {feature.details.map((detail, detailIndex) => (
                    <li key={detailIndex} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-8 text-center space-y-4">
            <h2 className="text-2xl font-bold">Ready to Get Started?</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Start creating professional field reports today. Our mobile-first design 
              makes it easy to document your work right from the job site.
            </p>
            <div className="flex flex-wrap justify-center gap-4 pt-4">
              <Button size="lg" asChild data-testid="button-create-report">
                <Link href="/reports/new">
                  <FileText className="w-5 h-5 mr-2" />
                  Create Your First Report
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild data-testid="button-view-reports">
                <Link href="/reports">
                  View All Reports
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}

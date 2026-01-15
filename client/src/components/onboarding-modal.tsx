import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  FolderOpen,
  FileText,
  Camera,
  PenTool,
  Send,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
} from "lucide-react";

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
}

const steps = [
  {
    title: "Welcome to Field Daily Reports!",
    description: "Let's get you started with a quick overview of the key features.",
    icon: CheckCircle2,
    content: "This app helps construction inspectors create professional daily field reports with photos, signatures, and PDF generation.",
  },
  {
    title: "Join or Create a Company",
    description: "Companies organize your projects and team members.",
    icon: Building2,
    content: "Use the company switcher in the header to create your first company, or wait to be invited to an existing one.",
  },
  {
    title: "Get Assigned to Projects",
    description: "Projects are where your inspection work happens.",
    icon: FolderOpen,
    content: "Once you're part of a company, you'll be assigned to specific construction projects. You can view all your projects from the Projects menu.",
  },
  {
    title: "Create Daily Reports",
    description: "Document your field inspections thoroughly.",
    icon: FileText,
    content: "Each report includes work activities, weather conditions, visitors, issues, safety incidents, and detailed notes about the day's work.",
  },
  {
    title: "Add Photos & Sign",
    description: "Visual documentation and digital signatures.",
    icon: Camera,
    content: "Upload photos with captions to document site conditions, and add your digital signature to complete and authenticate your reports.",
  },
  {
    title: "Generate & Distribute PDFs",
    description: "Share professional reports with stakeholders.",
    icon: Send,
    content: "Generate PDF reports with company branding and distribute them to project stakeholders via email directly from the app.",
  },
];

export function OnboardingModal({ open, onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const { toast } = useToast();

  const completeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/complete-onboarding");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      onComplete();
    },
    onError: () => {
      toast({
        title: "Oops!",
        description: "Failed to save your progress. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeMutation.mutate();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    completeMutation.mutate();
  };

  const step = steps[currentStep];
  const Icon = step.icon;
  const isLastStep = currentStep === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon className="w-8 h-8 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl" data-testid="onboarding-title">
            {step.title}
          </DialogTitle>
          <DialogDescription className="text-center">
            {step.description}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-center text-muted-foreground" data-testid="onboarding-content">
            {step.content}
          </p>
        </div>

        <div className="flex justify-center gap-1 py-2">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`h-2 w-2 rounded-full transition-colors ${
                index === currentStep ? "bg-primary" : "bg-muted"
              }`}
              data-testid={`step-indicator-${index}`}
            />
          ))}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex justify-between w-full gap-2">
            {currentStep > 0 ? (
              <Button
                variant="outline"
                onClick={handlePrev}
                data-testid="button-prev"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            ) : (
              <Button
                variant="ghost"
                onClick={handleSkip}
                className="text-muted-foreground"
                data-testid="button-skip"
              >
                Skip
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={completeMutation.isPending}
              data-testid="button-next"
            >
              {completeMutation.isPending ? (
                "Finishing..."
              ) : isLastStep ? (
                "Get Started"
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

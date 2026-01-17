import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Mail,
  Plus,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Search,
  UserPlus,
  Check,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface NewUserSetupProps {
  open: boolean;
  onComplete: () => void;
}

type Step = "company" | "project" | "done";

export function NewUserSetup({ open, onComplete }: NewUserSetupProps) {
  const [step, setStep] = useState<Step>("company");
  const [companyTab, setCompanyTab] = useState<"create" | "invite" | "request">("create");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [projectClient, setProjectClient] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [companySearchQuery, setCompanySearchQuery] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const { toast } = useToast();

  // Fetch all companies for the dropdown
  const { data: allCompanies = [], isLoading: companiesLoading } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/companies"],
    enabled: companyTab === "request",
  });

  // Filter companies based on search query
  const filteredCompanies = useMemo(() => {
    if (!companySearchQuery.trim()) return allCompanies;
    const query = companySearchQuery.toLowerCase();
    return allCompanies.filter(c => c.name.toLowerCase().includes(query));
  }, [allCompanies, companySearchQuery]);

  const selectedCompany = allCompanies.find(c => c.id === selectedCompanyId);

  const createCompanyMutation = useMutation({
    mutationFn: async (data: { name: string; address?: string; phone?: string; email?: string }) => {
      const response = await apiRequest("POST", "/api/my-companies", data);
      return response;
    },
    onSuccess: (data: any) => {
      setCreatedCompanyId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/my-companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-company"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      setStep("project");
    },
    onError: (error: any) => {
      if (error.existingCompany) {
        toast({
          title: "Company Already Exists",
          description: `A company named "${error.existingCompany.name}" already exists. Use an invite code to join it.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to Create Company",
          description: error.message || "Please try again",
          variant: "destructive",
        });
      }
    },
  });

  const acceptInviteMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await apiRequest("POST", `/api/invites/${token}/accept`);
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-company"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({
        title: "Welcome!",
        description: "You've successfully joined the company.",
      });
      
      // If user was assigned projects via invite, complete onboarding
      // Otherwise, only admins can create projects
      if (data.projectsAssigned > 0) {
        // Already assigned to projects, onboarding complete
        setStep("done");
        setTimeout(() => onComplete(), 1500);
      } else if (data.companyId && data.role === "admin") {
        // Admin with no projects - prompt to create one
        setCreatedCompanyId(data.companyId);
        setStep("project");
      } else {
        // Inspector with no projects - complete onboarding, they'll be assigned later
        setStep("done");
        setTimeout(() => onComplete(), 1500);
      }
    },
    onError: (error: any) => {
      setInviteError(error.message || "Invalid or expired invite code");
    },
  });

  const joinRequestMutation = useMutation({
    mutationFn: async (data: { companyId: string; message?: string }) => {
      const response = await apiRequest("POST", "/api/join-requests", data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-join-requests"] });
      toast({
        title: "Request Sent!",
        description: "Your request to join has been sent to the company admin for approval.",
      });
      // Complete onboarding - they can create personal reports while waiting
      setStep("done");
      setTimeout(() => onComplete(), 1500);
    },
    onError: (error: any) => {
      toast({
        title: "Request Failed",
        description: error.message || "Failed to send join request",
        variant: "destructive",
      });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; projectNumber: string; client?: string; address?: string; companyId?: string }) => {
      return apiRequest("POST", "/api/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Project Created",
        description: "You're all set to create your first report!",
      });
      setStep("done");
      setTimeout(() => onComplete(), 1500);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Project",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleCreateCompany = () => {
    if (!companyName.trim()) {
      toast({
        title: "Company Name Required",
        description: "Please enter a name for your company",
        variant: "destructive",
      });
      return;
    }
    createCompanyMutation.mutate({
      name: companyName.trim(),
      address: companyAddress.trim() || undefined,
      phone: companyPhone.trim() || undefined,
      email: companyEmail.trim() || undefined,
    });
  };

  const handleAcceptInvite = () => {
    if (!inviteCode.trim()) {
      setInviteError("Please enter an invite code");
      return;
    }
    setInviteError("");
    acceptInviteMutation.mutate(inviteCode.trim());
  };

  const handleJoinRequest = () => {
    if (!selectedCompanyId) {
      toast({
        title: "Company Required",
        description: "Please select a company to request to join",
        variant: "destructive",
      });
      return;
    }
    joinRequestMutation.mutate({
      companyId: selectedCompanyId,
      message: requestMessage.trim() || undefined,
    });
  };

  const handleCreateProject = () => {
    if (!projectName.trim()) {
      toast({
        title: "Project Name Required",
        description: "Please enter a name for your project",
        variant: "destructive",
      });
      return;
    }
    if (!projectNumber.trim()) {
      toast({
        title: "Project Number Required",
        description: "Please enter a project number",
        variant: "destructive",
      });
      return;
    }
    createProjectMutation.mutate({
      name: projectName.trim(),
      projectNumber: projectNumber.trim(),
      client: projectClient.trim() || undefined,
      companyId: createdCompanyId || undefined,
      address: projectAddress.trim() || undefined,
    });
  };

  const handleSkipProject = () => {
    setStep("done");
    setTimeout(() => onComplete(), 500);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onComplete(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        {step === "company" && (
          <>
            <DialogHeader>
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-primary" />
                </div>
              </div>
              <DialogTitle className="text-center text-xl" data-testid="setup-title">
                Welcome! Let's Get You Started
              </DialogTitle>
              <DialogDescription className="text-center">
                First, you need to join or create a company to organize your projects.
              </DialogDescription>
            </DialogHeader>

            <Tabs value={companyTab} onValueChange={(v) => setCompanyTab(v as "create" | "invite" | "request")} className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="create" data-testid="tab-create-company">
                  <Plus className="w-4 h-4 mr-2" />
                  Create
                </TabsTrigger>
                <TabsTrigger value="invite" data-testid="tab-use-invite">
                  <Mail className="w-4 h-4 mr-2" />
                  Invite
                </TabsTrigger>
                <TabsTrigger value="request" data-testid="tab-request-join">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Request
                </TabsTrigger>
              </TabsList>

              <TabsContent value="create" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input
                    id="companyName"
                    placeholder="e.g., ABC Construction"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    data-testid="input-company-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyAddress">Address (optional)</Label>
                  <Input
                    id="companyAddress"
                    placeholder="123 Main St, City, State"
                    value={companyAddress}
                    onChange={(e) => setCompanyAddress(e.target.value)}
                    data-testid="input-company-address"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyPhone">Phone (optional)</Label>
                    <Input
                      id="companyPhone"
                      placeholder="(555) 123-4567"
                      value={companyPhone}
                      onChange={(e) => setCompanyPhone(e.target.value)}
                      data-testid="input-company-phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyEmail">Email (optional)</Label>
                    <Input
                      id="companyEmail"
                      type="email"
                      placeholder="info@company.com"
                      value={companyEmail}
                      onChange={(e) => setCompanyEmail(e.target.value)}
                      data-testid="input-company-email"
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreateCompany}
                  disabled={createCompanyMutation.isPending}
                  data-testid="button-create-company"
                >
                  {createCompanyMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Create Company
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </TabsContent>

              <TabsContent value="invite" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">
                  If you received an invite email, enter the invite code or paste the invite link below.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="inviteCode">Invite Code</Label>
                  <Input
                    id="inviteCode"
                    placeholder="Paste invite code or link here"
                    value={inviteCode}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Extract token from URL if pasted
                      const match = value.match(/accept-invite\/([a-zA-Z0-9-]+)/);
                      setInviteCode(match ? match[1] : value);
                      setInviteError("");
                    }}
                    data-testid="input-invite-code"
                  />
                  {inviteError && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {inviteError}
                    </p>
                  )}
                </div>
                <Button
                  className="w-full"
                  onClick={handleAcceptInvite}
                  disabled={acceptInviteMutation.isPending}
                  data-testid="button-accept-invite"
                >
                  {acceptInviteMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    <>
                      Join Company
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </TabsContent>

              <TabsContent value="request" className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">
                  Search for an existing company and request to join. An admin will review your request.
                </p>
                
                <div className="space-y-2">
                  <Label htmlFor="companySearch">Search Company</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="companySearch"
                      placeholder="Type company name..."
                      value={companySearchQuery}
                      onChange={(e) => setCompanySearchQuery(e.target.value)}
                      className="pl-9"
                      data-testid="input-company-search"
                    />
                  </div>
                </div>

                {companiesLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredCompanies.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    {companySearchQuery ? "No companies found matching your search" : "No companies available"}
                  </div>
                ) : (
                  <ScrollArea className="h-[180px] border rounded-md">
                    <div className="p-2 space-y-1">
                      {filteredCompanies.map((company) => (
                        <button
                          key={company.id}
                          type="button"
                          onClick={() => setSelectedCompanyId(company.id)}
                          className={`w-full text-left px-3 py-2 rounded-md flex items-center justify-between transition-colors ${
                            selectedCompanyId === company.id
                              ? "bg-primary text-primary-foreground"
                              : "hover-elevate"
                          }`}
                          data-testid={`company-option-${company.id}`}
                        >
                          <span className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            {company.name}
                          </span>
                          {selectedCompanyId === company.id && (
                            <Check className="w-4 h-4" />
                          )}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                {selectedCompany && (
                  <div className="p-3 bg-muted/50 rounded-md">
                    <p className="text-sm font-medium">Selected: {selectedCompany.name}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="requestMessage">Message (optional)</Label>
                  <Input
                    id="requestMessage"
                    placeholder="Why do you want to join?"
                    value={requestMessage}
                    onChange={(e) => setRequestMessage(e.target.value)}
                    data-testid="input-request-message"
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={handleJoinRequest}
                  disabled={joinRequestMutation.isPending || !selectedCompanyId}
                  data-testid="button-request-join"
                >
                  {joinRequestMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending Request...
                    </>
                  ) : (
                    <>
                      Request to Join
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </TabsContent>
            </Tabs>
          </>
        )}

        {step === "project" && (
          <>
            <DialogHeader>
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <FolderOpen className="w-8 h-8 text-primary" />
                </div>
              </div>
              <DialogTitle className="text-center text-xl" data-testid="setup-project-title">
                Create Your First Project
              </DialogTitle>
              <DialogDescription className="text-center">
                Projects organize your daily reports for each job site.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="projectName">Project Name *</Label>
                <Input
                  id="projectName"
                  placeholder="e.g., Downtown Office Building"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  data-testid="input-project-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="projectNumber">Project Number *</Label>
                <Input
                  id="projectNumber"
                  placeholder="e.g., PRJ-2024-001"
                  value={projectNumber}
                  onChange={(e) => setProjectNumber(e.target.value)}
                  data-testid="input-project-number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="projectClient">Client (optional)</Label>
                <Input
                  id="projectClient"
                  placeholder="e.g., City of Springfield"
                  value={projectClient}
                  onChange={(e) => setProjectClient(e.target.value)}
                  data-testid="input-project-client"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="projectAddress">Address (optional)</Label>
                <Input
                  id="projectAddress"
                  placeholder="456 Construction Ave"
                  value={projectAddress}
                  onChange={(e) => setProjectAddress(e.target.value)}
                  data-testid="input-project-address"
                />
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 mt-6">
              <Button
                variant="ghost"
                onClick={handleSkipProject}
                className="text-muted-foreground"
                data-testid="button-skip-project"
              >
                Skip for Now
              </Button>
              <Button
                onClick={handleCreateProject}
                disabled={createProjectMutation.isPending}
                data-testid="button-create-project"
              >
                {createProjectMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create Project
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "done" && (
          <>
            <DialogHeader>
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <DialogTitle className="text-center text-xl" data-testid="setup-done-title">
                You're All Set!
              </DialogTitle>
              <DialogDescription className="text-center">
                You can now start creating daily field reports.
              </DialogDescription>
            </DialogHeader>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Building2,
  Plus,
  Check,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  AlertCircle,
  Clock,
  UserPlus,
} from "lucide-react";
import { Link } from "wouter";
import type { Company, CompanyMember, JoinRequest } from "@shared/schema";

interface CompanyWithMembership extends CompanyMember {
  company?: Company;
}

interface ExistingCompanyInfo {
  id: string;
  name: string;
}

interface JoinRequestWithCompany extends JoinRequest {
  company?: Company;
}

interface JoinRequestWithUser extends JoinRequest {
  user?: { id: string; email?: string | null; firstName?: string | null; lastName?: string | null };
}

export default function MyCompaniesPage() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [showManageRequestsDialog, setShowManageRequestsDialog] = useState(false);
  const [selectedCompanyForRequests, setSelectedCompanyForRequests] = useState<Company | null>(null);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [existingCompany, setExistingCompany] = useState<ExistingCompanyInfo | null>(null);
  const [joinMessage, setJoinMessage] = useState("");

  const { data: companies = [], isLoading, error } = useQuery<CompanyWithMembership[]>({
    queryKey: ["/api/my-companies"],
  });

  const { data: profile } = useQuery<{ activeCompanyId?: string }>({
    queryKey: ["/api/profile"],
  });

  const { data: joinRequests = [] } = useQuery<JoinRequestWithCompany[]>({
    queryKey: ["/api/my-join-requests"],
  });

  const { data: companyJoinRequests = [], refetch: refetchCompanyRequests } = useQuery<JoinRequestWithUser[]>({
    queryKey: ["/api/companies", selectedCompanyForRequests?.id, "join-requests"],
    enabled: !!selectedCompanyForRequests,
  });

  const switchMutation = useMutation({
    mutationFn: async (companyId: string) => {
      return apiRequest("POST", "/api/switch-company", { companyId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Company Switched",
        description: "You are now viewing the selected company.",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/my-companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        credentials: "include",
      });
      
      if (!res.ok) {
        const data = await res.json();
        if (res.status === 409 && data.existingCompany) {
          throw { status: 409, ...data };
        }
        throw new Error(data.message || "Failed to create company");
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/profile"] });
      setShowCreateDialog(false);
      setNewCompanyName("");
      toast({
        title: "Company Created",
        description: "Your company has been created successfully.",
      });
    },
    onError: (error: any) => {
      if (error.status === 409 && error.existingCompany) {
        setExistingCompany(error.existingCompany);
        setShowCreateDialog(false);
        
        if (error.isAlreadyMember) {
          toast({
            title: "Already a Member",
            description: `You are already a member of "${error.existingCompany.name}".`,
          });
        } else if (error.hasPendingRequest) {
          toast({
            title: "Request Pending",
            description: `You already have a pending request to join "${error.existingCompany.name}".`,
          });
        } else {
          setShowJoinDialog(true);
        }
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to create company.",
          variant: "destructive",
        });
      }
    },
  });

  const joinRequestMutation = useMutation({
    mutationFn: async ({ companyId, message }: { companyId: string; message?: string }) => {
      return apiRequest("POST", "/api/join-requests", { companyId, message });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-join-requests"] });
      setShowJoinDialog(false);
      setExistingCompany(null);
      setJoinMessage("");
      setNewCompanyName("");
      toast({
        title: "Request Sent",
        description: "Your request to join the company has been submitted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send join request.",
        variant: "destructive",
      });
    },
  });

  const handleCreateCompany = () => {
    if (newCompanyName.trim()) {
      createMutation.mutate(newCompanyName.trim());
    }
  };

  const handleJoinRequest = () => {
    if (existingCompany) {
      joinRequestMutation.mutate({ companyId: existingCompany.id, message: joinMessage.trim() || undefined });
    }
  };

  const approveMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return apiRequest("POST", `/api/join-requests/${requestId}/approve`);
    },
    onSuccess: () => {
      refetchCompanyRequests();
      queryClient.invalidateQueries({ queryKey: ["/api/my-companies"] });
      toast({
        title: "Request Approved",
        description: "The user has been added to the company.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve request.",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return apiRequest("POST", `/api/join-requests/${requestId}/reject`);
    },
    onSuccess: () => {
      refetchCompanyRequests();
      toast({
        title: "Request Rejected",
        description: "The join request has been rejected.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject request.",
        variant: "destructive",
      });
    },
  });

  const handleManageRequests = (company: Company) => {
    setSelectedCompanyForRequests(company);
    setShowManageRequestsDialog(true);
  };

  if (isLoading) {
    return (
      <PageLayout title="My Companies">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout title="My Companies">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg">
          <div className="flex items-center gap-2 mb-6">
            <Button variant="ghost" size="sm" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="w-12 h-12 text-destructive mb-4" />
              <p className="text-lg font-medium">Failed to load companies</p>
              <p className="text-muted-foreground">Please try again later</p>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="My Companies">
      <div className="container px-4 py-6 mx-auto max-w-screen-lg space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" asChild data-testid="button-back">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Dashboard
            </Link>
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="title-my-companies">My Companies</h1>
            <p className="text-muted-foreground">
              Companies you are affiliated with
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-company">
            <Plus className="w-4 h-4 mr-2" />
            Create Company
          </Button>
        </div>

        {joinRequests.filter(r => r.status === "pending").length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-500" />
                Pending Join Requests
              </CardTitle>
              <CardDescription>
                Waiting for approval from company admins
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {joinRequests.filter(r => r.status === "pending").map((request) => (
                  <div 
                    key={request.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                    data-testid={`pending-request-${request.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{request.company?.name || "Unknown Company"}</p>
                        <p className="text-sm text-muted-foreground">
                          Requested {new Date(request.createdAt || Date.now()).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">
                      <Clock className="w-3 h-3 mr-1" />
                      Pending
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {companies.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No companies yet</p>
              <p className="text-muted-foreground mb-4">
                Create your first company to get started
              </p>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-company">
                <Plus className="w-4 h-4 mr-2" />
                Create Company
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {companies.map((item) => {
              const company = item.company;
              if (!company) return null;

              const isActive = company.id === profile?.activeCompanyId;

              return (
                <Card 
                  key={company.id} 
                  className={isActive ? "ring-2 ring-primary" : ""}
                  data-testid={`card-company-${company.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-muted-foreground" />
                        <CardTitle className="text-lg" data-testid={`text-company-name-${company.id}`}>
                          {company.name}
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        {isActive && (
                          <Badge variant="default" data-testid={`badge-active-${company.id}`}>
                            <Check className="w-3 h-3 mr-1" />
                            Active
                          </Badge>
                        )}
                        <Badge variant="secondary" data-testid={`badge-role-${company.id}`}>
                          {item.role === "admin" ? "Company Admin" : "Inspector"}
                        </Badge>
                      </div>
                    </div>
                    <CardDescription>
                      Member since {new Date(item.joinedAt || Date.now()).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {company.address && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="w-4 h-4" />
                        <span>{company.address}</span>
                      </div>
                    )}
                    {company.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Phone className="w-4 h-4" />
                        <span>{company.phone}</span>
                      </div>
                    )}
                    {company.email && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="w-4 h-4" />
                        <span>{company.email}</span>
                      </div>
                    )}
                    <div className="flex flex-col gap-2 mt-2">
                      {item.role === "admin" && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => handleManageRequests(company)}
                          data-testid={`button-manage-requests-${company.id}`}
                        >
                          <UserPlus className="w-4 h-4 mr-2" />
                          Manage Join Requests
                        </Button>
                      )}
                      {!isActive && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => switchMutation.mutate(company.id)}
                          disabled={switchMutation.isPending}
                          data-testid={`button-switch-${company.id}`}
                        >
                          Switch to this Company
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Company</DialogTitle>
            <DialogDescription>
              Create a company to manage projects and reports.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="company-name">Company Name</Label>
              <Input
                id="company-name"
                placeholder="Enter company name"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                data-testid="input-company-name"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                data-testid="button-cancel-company"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateCompany}
                disabled={!newCompanyName.trim() || createMutation.isPending}
                data-testid="button-submit-company"
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showJoinDialog} onOpenChange={(open) => {
        setShowJoinDialog(open);
        if (!open) {
          setExistingCompany(null);
          setJoinMessage("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Company Already Exists</DialogTitle>
            <DialogDescription>
              A company named "{existingCompany?.name}" already exists. Would you like to request to join it?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
              <Building2 className="w-10 h-10 text-muted-foreground" />
              <div>
                <p className="font-medium">{existingCompany?.name}</p>
                <p className="text-sm text-muted-foreground">Request to join as an inspector</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="join-message">Message (optional)</Label>
              <Textarea
                id="join-message"
                placeholder="Introduce yourself or explain why you want to join..."
                value={joinMessage}
                onChange={(e) => setJoinMessage(e.target.value)}
                rows={3}
                data-testid="input-join-message"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowJoinDialog(false);
                setExistingCompany(null);
                setJoinMessage("");
              }}
              data-testid="button-cancel-join"
            >
              Cancel
            </Button>
            <Button
              onClick={handleJoinRequest}
              disabled={joinRequestMutation.isPending}
              data-testid="button-submit-join"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              {joinRequestMutation.isPending ? "Sending..." : "Request to Join"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showManageRequestsDialog} onOpenChange={(open) => {
        setShowManageRequestsDialog(open);
        if (!open) {
          setSelectedCompanyForRequests(null);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pending Join Requests</DialogTitle>
            <DialogDescription>
              People who want to join {selectedCompanyForRequests?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4 max-h-96 overflow-y-auto">
            {companyJoinRequests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <UserPlus className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No pending requests</p>
              </div>
            ) : (
              companyJoinRequests.map((request) => (
                <div 
                  key={request.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                  data-testid={`request-${request.id}`}
                >
                  <div className="flex-1">
                    <p className="font-medium">
                      {request.user?.firstName && request.user?.lastName 
                        ? `${request.user.firstName} ${request.user.lastName}`
                        : request.user?.email || "Unknown User"}
                    </p>
                    {request.user?.email && (
                      <p className="text-sm text-muted-foreground">{request.user.email}</p>
                    )}
                    {request.message && (
                      <p className="text-sm mt-2 text-muted-foreground italic">"{request.message}"</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Requested {new Date(request.createdAt || Date.now()).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rejectMutation.mutate(request.id)}
                      disabled={rejectMutation.isPending || approveMutation.isPending}
                      data-testid={`button-reject-${request.id}`}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate(request.id)}
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                      data-testid={`button-approve-${request.id}`}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowManageRequestsDialog(false);
                setSelectedCompanyForRequests(null);
              }}
              data-testid="button-close-manage"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
} from "lucide-react";
import { Link } from "wouter";
import type { Company, CompanyMember } from "@shared/schema";

interface CompanyWithMembership extends CompanyMember {
  company?: Company;
}

export default function MyCompaniesPage() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");

  const { data: companies = [], isLoading, error } = useQuery<CompanyWithMembership[]>({
    queryKey: ["/api/my-companies"],
  });

  const { data: profile } = useQuery<{ activeCompanyId?: string }>({
    queryKey: ["/api/profile"],
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
      return apiRequest("POST", "/api/my-companies", { name });
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
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create company.",
        variant: "destructive",
      });
    },
  });

  const handleCreateCompany = () => {
    if (newCompanyName.trim()) {
      createMutation.mutate(newCompanyName.trim());
    }
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
                          {item.role === "admin" ? "Admin" : "Inspector"}
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
                    {!isActive && (
                      <Button
                        variant="outline"
                        className="w-full mt-2"
                        onClick={() => switchMutation.mutate(company.id)}
                        disabled={switchMutation.isPending}
                        data-testid={`button-switch-${company.id}`}
                      >
                        Switch to this Company
                      </Button>
                    )}
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
    </PageLayout>
  );
}

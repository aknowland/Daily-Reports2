import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, CheckCircle, XCircle, Shield, HardHat, FolderOpen, LogIn, Building2 } from "lucide-react";

interface InviteInfo {
  email: string;
  role: "inspector" | "admin" | "client";
  isCompanyAdmin?: boolean;
  isClientPortal?: boolean;
  projectIds: string[];
}

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [accepted, setAccepted] = useState(false);

  const { data: invite, isLoading, error } = useQuery<InviteInfo>({
    queryKey: [`/api/invites/${token}`],
    enabled: !!token,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/invites/${token}/accept`);
      return res.json();
    },
    onSuccess: (data: any) => {
      setAccepted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/profile"] });
      const redirectPath = data?.isClientPortal ? "/client-portal" : "/";
      setTimeout(() => {
        setLocation(redirectPath);
      }, 2000);
    },
  });

  useEffect(() => {
    if (invite && isAuthenticated && !accepted && !acceptMutation.isPending) {
      acceptMutation.mutate();
    }
  }, [invite, isAuthenticated, accepted]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : "This invitation is invalid or has expired";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <XCircle className="w-12 h-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Invalid Invitation</h2>
            <p className="text-muted-foreground text-center">{errorMessage}</p>
            <Button 
              variant="outline" 
              className="mt-6"
              onClick={() => setLocation("/")}
              data-testid="button-go-home"
            >
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="w-12 h-12 text-green-600 mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {invite?.isClientPortal ? "Welcome to the Client Portal!" : "Welcome to the team!"}
            </h2>
            <p className="text-muted-foreground text-center">
              {invite?.isClientPortal 
                ? "Your portal access has been activated. Redirecting to your project dashboard..."
                : "Your invitation has been accepted. Redirecting you to the dashboard..."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>You've Been Invited</CardTitle>
            <CardDescription>
              Please sign in to accept this invitation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  {invite?.isClientPortal ? (
                    <FolderOpen className="w-5 h-5 text-primary" />
                  ) : invite?.role === "admin" ? (
                    <Shield className="w-5 h-5 text-primary" />
                  ) : invite?.isCompanyAdmin ? (
                    <Building2 className="w-5 h-5 text-primary" />
                  ) : (
                    <HardHat className="w-5 h-5 text-primary" />
                  )}
                </div>
                <div>
                  <p className="font-medium">Role: {invite?.isClientPortal ? "Client Portal Access" : invite?.role === "admin" ? "System Administrator" : invite?.isCompanyAdmin ? "Company Administrator" : "Inspector"}</p>
                  <p className="text-sm text-muted-foreground">{invite?.email}</p>
                </div>
              </div>

              {invite?.projectIds && invite.projectIds.length > 0 && (
                <div className="p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <FolderOpen className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Assigned Projects</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    You will be added to {invite.projectIds.length} project{invite.projectIds.length > 1 ? "s" : ""}
                  </p>
                </div>
              )}
            </div>

            <Button 
              className="w-full" 
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-sign-in-accept"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Sign In to Accept
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (acceptMutation.isPending) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Accepting invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (acceptMutation.isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <XCircle className="w-12 h-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Failed to Accept</h2>
            <p className="text-muted-foreground text-center">
              {acceptMutation.error instanceof Error 
                ? acceptMutation.error.message 
                : "There was an error accepting this invitation"}
            </p>
            <Button 
              variant="outline" 
              className="mt-6"
              onClick={() => acceptMutation.mutate()}
              data-testid="button-retry"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}

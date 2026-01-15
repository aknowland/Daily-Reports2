import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  ClipboardList,
  ArrowLeft,
  AlertCircle,
  Mail,
  Check,
  X,
  UserPlus,
} from "lucide-react";
import { Link } from "wouter";
import type { JoinRequest, User } from "@shared/schema";

type JoinRequestWithUser = JoinRequest & { user?: User };

export default function CompanyRequestsPage() {
  const { toast } = useToast();
  const { activeCompany, isCompanyAdmin } = useAuth();

  const { data: requests = [], isLoading, error } = useQuery<JoinRequestWithUser[]>({
    queryKey: ["/api/companies", activeCompany?.id, "join-requests"],
    enabled: !!activeCompany?.id && isCompanyAdmin,
  });

  const approveMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return apiRequest("POST", `/api/join-requests/${requestId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "join-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "members"] });
      toast({
        title: "Request Approved",
        description: "User has been added to the company.",
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
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id, "join-requests"] });
      toast({
        title: "Request Rejected",
        description: "Join request has been rejected.",
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

  const pendingRequests = requests.filter(r => r.status === "pending");

  if (!isCompanyAdmin || !activeCompany) {
    return (
      <PageLayout title="Join Requests">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="w-12 h-12 text-destructive mb-4" />
              <p className="text-lg font-medium">Access Denied</p>
              <p className="text-muted-foreground">You must be a company admin to view this page</p>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  if (isLoading) {
    return (
      <PageLayout title="Join Requests">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-12 w-full" />
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
      <PageLayout title="Join Requests">
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
              <p className="text-lg font-medium">Failed to load join requests</p>
              <p className="text-muted-foreground">Please try again later</p>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Join Requests">
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
            <h1 className="text-2xl font-bold" data-testid="title-requests">Join Requests</h1>
            <p className="text-muted-foreground">
              Manage join requests for {activeCompany.name}
            </p>
          </div>
          {pendingRequests.length > 0 && (
            <Badge variant="default" className="flex items-center gap-1">
              <ClipboardList className="w-3 h-3" />
              {pendingRequests.length} pending
            </Badge>
          )}
        </div>

        {pendingRequests.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <UserPlus className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No pending requests</p>
              <p className="text-muted-foreground">
                Join requests from users will appear here
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pendingRequests.map((request) => {
              const displayName = request.user?.firstName && request.user?.lastName
                ? `${request.user.firstName} ${request.user.lastName}`
                : request.user?.email || "Unknown User";

              return (
                <Card key={request.id} data-testid={`card-request-${request.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium" data-testid={`text-request-name-${request.id}`}>
                          {displayName}
                        </p>
                        {request.user?.email && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                            <Mail className="w-3 h-3" />
                            <span className="truncate">{request.user.email}</span>
                          </div>
                        )}
                        {request.message && (
                          <p className="text-sm mt-2 text-muted-foreground italic">
                            "{request.message}"
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          Requested {new Date(request.createdAt || Date.now()).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => rejectMutation.mutate(request.id)}
                          disabled={rejectMutation.isPending || approveMutation.isPending}
                          data-testid={`button-reject-${request.id}`}
                        >
                          <X className="w-4 h-4 mr-1" />
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

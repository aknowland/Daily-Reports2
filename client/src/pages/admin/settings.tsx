import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  Upload,
  Image,
  Building,
  Loader2,
  Check,
  X,
  Lock,
  ArrowLeft,
  Shield,
  ShieldCheck,
  Users,
  Download,
  Network,
} from "lucide-react";
import architectureDiagram from "@assets/field-daily-reports-architecture-diagram.png";
import { Link } from "wouter";
import { Switch } from "@/components/ui/switch";
import type { Company, User, UserProfile } from "@shared/schema";

interface ActiveCompany extends Company {
  isCompanyAdmin: boolean;
}

interface UserWithProfile extends User {
  profile?: UserProfile;
}

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: activeCompany, isLoading: companyLoading } = useQuery<ActiveCompany | null>({
    queryKey: ["/api/my-company"],
  });

  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");

  useEffect(() => {
    if (activeCompany) {
      setCompanyName(activeCompany.name || "");
      setCompanyAddress(activeCompany.address || "");
      setCompanyPhone(activeCompany.phone || "");
      setCompanyEmail(activeCompany.email || "");
    }
  }, [activeCompany]);

  const isSystemOwner = user?.profile?.role === "system_owner";
  const isSystemAdmin = user?.profile?.role === "admin" || user?.profile?.role === "owner" || isSystemOwner;
  const canEdit = activeCompany?.isCompanyAdmin === true;

  // Only fetch users if the current user is a system admin
  const { data: allUsers, isLoading: usersLoading } = useQuery<UserWithProfile[]>({
    queryKey: ["/api/admin/users"],
    enabled: isSystemAdmin,
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Role Updated",
        description: "User role has been updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update user role",
        variant: "destructive",
      });
    },
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (data: { name?: string; address?: string; phone?: string; email?: string }) => {
      return apiRequest("PATCH", "/api/my-company", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-company"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-companies"] });
      toast({
        title: "Company Updated",
        description: "Company information has been saved successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update company",
        variant: "destructive",
      });
    },
  });

  const handleSaveCompany = () => {
    updateCompanyMutation.mutate({
      name: companyName,
      address: companyAddress,
      phone: companyPhone,
      email: companyEmail,
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (PNG, JPG, etc.)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);

      const response = await fetch("/api/admin/logo", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to upload logo");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/my-company"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-companies"] });
      toast({
        title: "Logo Uploaded",
        description: "Your company logo has been updated",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload logo",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Only show "no company" message if user is not a system admin and has no company
  // System admins can still access this page to manage other system admins
  if (!activeCompany && !companyLoading && !isSystemAdmin) {
    return (
      <PageLayout title="Settings" isAdmin={isSystemAdmin}>
        <div className="container px-4 py-6 mx-auto max-w-2xl">
          <Card>
            <CardContent className="py-8 text-center">
              <Building className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No company selected. Please create or join a company first.
              </p>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Settings" isAdmin={isSystemAdmin}>
      <div className="container px-4 py-6 mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild data-testid="button-back">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            {canEdit 
              ? "Configure company branding and application settings"
              : "View company information (read-only)"
            }
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building className="w-5 h-5" />
              Company Information
              {!canEdit && <Lock className="w-4 h-4 text-muted-foreground" />}
            </CardTitle>
            <CardDescription>
              {canEdit 
                ? "This information will appear on generated PDF reports"
                : "Contact your company administrator to update this information"
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {companyLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Your Company Name"
                    disabled={!canEdit}
                    data-testid="input-company-name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyAddress">Address</Label>
                  <Input
                    id="companyAddress"
                    value={companyAddress}
                    onChange={(e) => setCompanyAddress(e.target.value)}
                    placeholder="Company Address"
                    disabled={!canEdit}
                    data-testid="input-company-address"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyPhone">Phone</Label>
                    <Input
                      id="companyPhone"
                      value={companyPhone}
                      onChange={(e) => setCompanyPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      disabled={!canEdit}
                      data-testid="input-company-phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyEmail">Email</Label>
                    <Input
                      id="companyEmail"
                      value={companyEmail}
                      onChange={(e) => setCompanyEmail(e.target.value)}
                      placeholder="info@company.com"
                      disabled={!canEdit}
                      data-testid="input-company-email"
                    />
                  </div>
                </div>

                {canEdit && (
                  <Button
                    onClick={handleSaveCompany}
                    disabled={updateCompanyMutation.isPending}
                    className="w-full"
                    data-testid="button-save-company"
                  >
                    {updateCompanyMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4 mr-2" />
                    )}
                    Save Company Information
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {canEdit && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Image className="w-5 h-5" />
                Company Logo
              </CardTitle>
              <CardDescription>
                Upload your company logo to appear on PDF report headers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeCompany?.logoPath ? (
                <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                  <img
                    src={activeCompany.logoPath}
                    alt="Company logo"
                    className="max-h-16 max-w-48 object-contain"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Current Logo</p>
                    <p className="text-xs text-muted-foreground">
                      Click upload to replace
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 border-2 border-dashed rounded-lg">
                  <Image className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No logo uploaded</p>
                </div>
              )}

              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={uploading}
                  data-testid="input-logo-upload"
                />
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  {uploading ? "Uploading..." : "Upload Logo"}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Recommended: PNG with transparent background, max 5MB.
                The logo will be displayed at approximately 2 inches wide in PDF headers.
              </p>
            </CardContent>
          </Card>
        )}

        {isSystemAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                System Admin Management
              </CardTitle>
              <CardDescription>
                Manage users with system-wide administrator privileges
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {usersLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : allUsers && allUsers.length > 0 ? (
                <div className="space-y-2">
                  {allUsers.map((u) => {
                    const isCurrentUser = u.id === user?.id;
                    const userIsSystemOwner = u.profile?.role === "system_owner";
                    const userIsSystemAdmin = u.profile?.role === "admin" || u.profile?.role === "owner" || userIsSystemOwner;
                    const displayName = u.profile?.firstName && u.profile?.lastName
                      ? `${u.profile.firstName} ${u.profile.lastName}`
                      : u.firstName && u.lastName 
                        ? `${u.firstName} ${u.lastName}`
                        : u.email || "Unknown User";
                    
                    return (
                      <div
                        key={u.id}
                        className="flex items-center justify-between gap-3 p-3 bg-muted/50 rounded-lg"
                        data-testid={`user-row-${u.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2 rounded-full ${userIsSystemOwner ? "bg-amber-100 dark:bg-amber-900/30" : userIsSystemAdmin ? "bg-primary/10" : "bg-muted"}`}>
                            {userIsSystemOwner ? (
                              <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            ) : userIsSystemAdmin ? (
                              <ShieldCheck className="w-4 h-4 text-primary" />
                            ) : (
                              <Users className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{displayName}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {u.email || "No email"}
                              {isCurrentUser && " (You)"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {userIsSystemOwner ? (
                            <span className="text-sm font-medium text-amber-600 dark:text-amber-400">
                              System Owner
                            </span>
                          ) : (
                            <>
                              <span className="text-sm text-muted-foreground">
                                System Admin
                              </span>
                              {isSystemOwner ? (
                                <Switch
                                  checked={userIsSystemAdmin}
                                  disabled={isCurrentUser || userIsSystemOwner || updateUserRoleMutation.isPending}
                                  onCheckedChange={(checked) => {
                                    updateUserRoleMutation.mutate({
                                      userId: u.id,
                                      role: checked ? "admin" : "inspector",
                                    });
                                  }}
                                  data-testid={`switch-admin-${u.id}`}
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground px-2">
                                  {userIsSystemAdmin ? "Yes" : "No"}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No users found</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                System Owners (highest level) can promote/demote System Admins. 
                System Admins have full access to all companies, projects, and settings.
                {isSystemOwner ? " Toggle the switch to grant or revoke System Admin access." : " Only System Owners can modify these settings."}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">PDF Settings</CardTitle>
            <CardDescription>
              Configure how PDFs are generated
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div>
                <p className="font-medium">Paper Size</p>
                <p className="text-sm text-muted-foreground">US Letter (8.5" × 11")</p>
              </div>
              <div className="text-sm text-muted-foreground">
                Default
              </div>
            </div>
          </CardContent>
        </Card>

        {isSystemAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Network className="w-5 h-5" />
                System Architecture
              </CardTitle>
              <CardDescription>
                Visual diagram showing how the system components connect
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border rounded-lg overflow-hidden bg-slate-800 dark:bg-slate-900">
                <img
                  src={architectureDiagram}
                  alt="Field Daily Reports System Architecture Diagram"
                  className="w-full h-auto"
                  data-testid="img-architecture-diagram"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  Shows user roles, entity relationships, and workflow connections
                </p>
                <Button
                  variant="outline"
                  asChild
                >
                  <a href={architectureDiagram} download="field-daily-reports-architecture.png" data-testid="button-download-diagram">
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}

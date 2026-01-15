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
} from "lucide-react";
import type { Company } from "@shared/schema";

interface ActiveCompany extends Company {
  isCompanyAdmin: boolean;
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

  const isAdmin = user?.profile?.role === "admin";
  const canEdit = activeCompany?.isCompanyAdmin === true;

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

  if (!activeCompany && !companyLoading) {
    return (
      <PageLayout title="Settings" isAdmin={isAdmin}>
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
    <PageLayout title="Settings" isAdmin={isAdmin}>
      <div className="container px-4 py-6 mx-auto max-w-2xl space-y-6">
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
      </div>
    </PageLayout>
  );
}

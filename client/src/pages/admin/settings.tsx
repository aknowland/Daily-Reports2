import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Upload,
  Image,
  Building,
  Loader2,
  Check,
  X,
} from "lucide-react";
import type { AppSetting } from "@shared/schema";

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: settings, isLoading } = useQuery<AppSetting[]>({
    queryKey: ["/api/admin/settings"],
  });

  const logoSetting = settings?.find((s) => s.key === "company_logo");
  const companyNameSetting = settings?.find((s) => s.key === "company_name");

  const [companyName, setCompanyName] = useState(companyNameSetting?.value || "");

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      return apiRequest("POST", "/api/admin/settings", { key, value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({
        title: "Settings Updated",
        description: "Your settings have been saved successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update settings",
        variant: "destructive",
      });
    },
  });

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

      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
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

  const handleSaveCompanyName = () => {
    updateSettingMutation.mutate({ key: "company_name", value: companyName });
  };

  return (
    <PageLayout title="Settings" isAdmin>
      <div className="container px-4 py-6 mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Configure company branding and application settings
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building className="w-5 h-5" />
              Company Information
            </CardTitle>
            <CardDescription>
              This information will appear on generated PDF reports
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-32" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <div className="flex gap-2">
                    <Input
                      id="companyName"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Your Company Name"
                      className="flex-1"
                      data-testid="input-company-name"
                    />
                    <Button
                      onClick={handleSaveCompanyName}
                      disabled={updateSettingMutation.isPending}
                      data-testid="button-save-company-name"
                    >
                      {updateSettingMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

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
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <>
                {logoSetting?.value ? (
                  <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                    <img
                      src={logoSetting.value}
                      alt="Company logo"
                      className="max-h-16 max-w-48 object-contain"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Current Logo</p>
                      <p className="text-xs text-muted-foreground">
                        Click upload to replace
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateSettingMutation.mutate({ key: "company_logo", value: "" })}
                      data-testid="button-remove-logo"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Remove
                    </Button>
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
              </>
            )}
          </CardContent>
        </Card>

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

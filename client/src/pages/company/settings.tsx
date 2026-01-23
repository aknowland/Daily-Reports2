import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  Settings,
  ArrowLeft,
  AlertCircle,
  Building2,
  Phone,
  Mail,
  MapPin,
  Upload,
  Trash2,
  Image,
  Loader2,
  Bell,
  CheckCircle,
  RefreshCw,
} from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect, useRef } from "react";
import type { Company } from "@shared/schema";

export default function CompanySettingsPage() {
  const { toast } = useToast();
  const { activeCompany, isCompanyAdmin } = useAuth();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
  });

  const { data: company, isLoading, error } = useQuery<Company>({
    queryKey: ["/api/companies", activeCompany?.id],
    enabled: !!activeCompany?.id && isCompanyAdmin,
  });

  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name || "",
        phone: company.phone || "",
        email: company.email || "",
        address: company.address || "",
      });
    }
  }, [company]);

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("PATCH", "/api/my-company", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-company"] });
      toast({
        title: "Settings Saved",
        description: "Company settings have been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update settings.",
        variant: "destructive",
      });
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("logo", file);
      const response = await fetch(`/api/companies/${activeCompany?.id}/logo`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to upload logo");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id] });
      toast({
        title: "Logo Uploaded",
        description: "Company logo has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload logo.",
        variant: "destructive",
      });
    },
  });

  const deleteLogoMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/companies/${activeCompany?.id}/logo`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id] });
      toast({
        title: "Logo Removed",
        description: "Company logo has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove logo.",
        variant: "destructive",
      });
    },
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadLogoMutation.mutate(file);
    }
  };

  if (!isCompanyAdmin || !activeCompany) {
    return (
      <PageLayout title="Company Settings">
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
      <PageLayout title="Company Settings">
        <div className="container px-4 py-6 mx-auto max-w-screen-lg space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Button variant="ghost" size="sm" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-60" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout title="Company Settings">
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
              <p className="text-lg font-medium">Failed to load company settings</p>
              <p className="text-muted-foreground">Please try again later</p>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Company Settings">
      <div className="container px-4 py-6 mx-auto max-w-screen-lg space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" asChild data-testid="button-back">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Dashboard
            </Link>
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-bold" data-testid="title-settings">Company Settings</h1>
          <p className="text-muted-foreground">
            Manage settings for {activeCompany.name}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="w-5 h-5" />
              Company Logo
            </CardTitle>
            <CardDescription>
              Upload your company logo to display on PDF reports
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 border rounded-lg flex items-center justify-center bg-muted overflow-hidden">
                {company?.logoPath ? (
                  <img 
                    src={company.logoPath} 
                    alt="Company logo" 
                    className="w-full h-full object-contain"
                    data-testid="img-company-logo"
                  />
                ) : (
                  <Image className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                  data-testid="input-logo-file"
                />
                <Button
                  variant="outline"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadLogoMutation.isPending}
                  data-testid="button-upload-logo"
                >
                  {uploadLogoMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  {company?.logoPath ? "Change Logo" : "Upload Logo"}
                </Button>
                {company?.logoPath && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteLogoMutation.mutate()}
                    disabled={deleteLogoMutation.isPending}
                    className="text-destructive hover:bg-destructive/10"
                    data-testid="button-delete-logo"
                  >
                    {deleteLogoMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Recommended: Square image, at least 200x200 pixels. Max file size: 5MB.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Company Information
            </CardTitle>
            <CardDescription>
              Update your company's basic information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Company Name
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter company name"
                data-testid="input-company-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Phone
              </Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="Enter phone number"
                data-testid="input-company-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Enter company email"
                data-testid="input-company-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address" className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Address
              </Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Enter company address"
                data-testid="input-company-address"
              />
            </div>
            <div className="pt-4">
              <Button
                onClick={() => updateMutation.mutate(formData)}
                disabled={!formData.name.trim() || updateMutation.isPending}
                data-testid="button-save-settings"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <NotificationsCard />
      </div>
    </PageLayout>
  );
}

// Separate component for contract notifications management
function NotificationsCard() {
  const { toast } = useToast();
  const [lastResult, setLastResult] = useState<{
    processed: number;
    statusUpdates: { contractName: string; oldStatus: string; newStatus: string }[];
    notificationsSent: { contractName: string; dateType: string; daysBefore: number }[];
    errors: { error: string }[];
  } | null>(null);

  const processNotificationsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/contracts/process-notifications");
      return response.json();
    },
    onSuccess: (data) => {
      setLastResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      
      const totalActions = (data.statusUpdates?.length || 0) + (data.notificationsSent?.length || 0);
      if (totalActions > 0) {
        toast({
          title: "Notifications Processed",
          description: `${data.statusUpdates?.length || 0} status updates, ${data.notificationsSent?.length || 0} notifications sent.`,
        });
      } else {
        toast({
          title: "Check Complete",
          description: "No notifications needed at this time.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process notifications.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Contract Notifications
        </CardTitle>
        <CardDescription>
          Automatically update contract statuses and send email reminders for upcoming dates
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium">Notification Schedule:</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>Contract Start Date: 30, 14, 7 days before</li>
            <li>Substantial Completion: 120, 90, 60, 30, 14, 3 days before</li>
            <li>Final Closeout: 10, 3 days before</li>
          </ul>
        </div>
        
        <Button
          onClick={() => processNotificationsMutation.mutate()}
          disabled={processNotificationsMutation.isPending}
          className="w-full"
          data-testid="button-process-notifications"
        >
          {processNotificationsMutation.isPending ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Check & Send Notifications Now
            </>
          )}
        </Button>

        {lastResult && (
          <div className="text-sm space-y-2 pt-2 border-t">
            <p className="font-medium">Last Check Results:</p>
            <p className="text-muted-foreground">
              Contracts processed: {lastResult.processed}
            </p>
            {lastResult.statusUpdates && lastResult.statusUpdates.length > 0 && (
              <div>
                <p className="font-medium text-green-600">Status Updates:</p>
                <ul className="text-muted-foreground">
                  {lastResult.statusUpdates.map((update, i) => (
                    <li key={i}>
                      {update.contractName}: {update.oldStatus} → {update.newStatus}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {lastResult.notificationsSent && lastResult.notificationsSent.length > 0 && (
              <div>
                <p className="font-medium text-blue-600">Notifications Sent:</p>
                <ul className="text-muted-foreground">
                  {lastResult.notificationsSent.map((notif, i) => (
                    <li key={i}>
                      {notif.contractName}: {notif.dateType.replace('_', ' ')} ({notif.daysBefore} days)
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {lastResult.errors && lastResult.errors.length > 0 && (
              <div>
                <p className="font-medium text-destructive">Errors:</p>
                <ul className="text-destructive/80">
                  {lastResult.errors.map((err, i) => (
                    <li key={i}>{err.error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

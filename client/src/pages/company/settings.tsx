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
} from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import type { Company } from "@shared/schema";

export default function CompanySettingsPage() {
  const { toast } = useToast();
  const { activeCompany, isCompanyAdmin } = useAuth();
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
      return apiRequest("PATCH", `/api/companies/${activeCompany?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-companies"] });
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
      </div>
    </PageLayout>
  );
}

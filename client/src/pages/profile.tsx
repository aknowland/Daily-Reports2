import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Loader2, 
  Save, 
  User, 
  Mail, 
  Award, 
  Shield, 
  Plus, 
  X,
  ArrowLeft,
  Building2,
  CreditCard,
  ChevronRight
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { updateUserProfileSchema, type UserProfile, type UpdateUserProfile } from "@shared/schema";

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [certifications, setCertifications] = useState<string[]>([]);
  const [newCertification, setNewCertification] = useState("");

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
  });

  const form = useForm<UpdateUserProfile>({
    resolver: zodResolver(updateUserProfileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      title: "",
      licenseNumber: "",
      licenseState: "",
      certifications: [],
      contractorCompanyName: "",
      contractorAddress: "",
      contractorPhone: "",
      contractorEmail: "",
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        firstName: profile.firstName || user?.firstName || "",
        lastName: profile.lastName || user?.lastName || "",
        phone: profile.phone || "",
        title: profile.title || "",
        licenseNumber: profile.licenseNumber || "",
        licenseState: profile.licenseState || "",
        certifications: profile.certifications || [],
        contractorCompanyName: profile.contractorCompanyName || "",
        contractorAddress: profile.contractorAddress || "",
        contractorPhone: profile.contractorPhone || "",
        contractorEmail: profile.contractorEmail || "",
      });
      setCertifications(profile.certifications || []);
    }
  }, [profile, form, user]);

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateUserProfile) => {
      return apiRequest("PATCH", "/api/profile", {
        ...data,
        certifications,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Profile Updated",
        description: "Your profile has been saved successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getInitials = () => {
    const first = profile?.firstName || user?.firstName || "";
    const last = profile?.lastName || user?.lastName || "";
    return ((first.charAt(0) || "") + (last.charAt(0) || "")).toUpperCase() || "U";
  };

  const getDisplayName = () => {
    const firstName = profile?.firstName || user?.firstName;
    const lastName = profile?.lastName || user?.lastName;
    if (firstName && lastName) {
      return `${firstName} ${lastName}`;
    }
    if (firstName) return firstName;
    if (lastName) return lastName;
    return user?.email || "User";
  };

  const addCertification = () => {
    if (newCertification.trim() && !certifications.includes(newCertification.trim())) {
      setCertifications([...certifications, newCertification.trim()]);
      setNewCertification("");
    }
  };

  const removeCertification = (cert: string) => {
    setCertifications(certifications.filter(c => c !== cert));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCertification();
    }
  };

  const onSubmit = (data: UpdateUserProfile) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <PageLayout title="Profile">
        <div className="flex items-center justify-center py-12" data-testid="loading-profile">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Profile">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild data-testid="button-back">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
        <Card data-testid="card-user-info">
          <CardHeader>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16" data-testid="avatar-user">
                <AvatarImage src={user?.profileImageUrl || undefined} alt={getDisplayName()} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xl font-medium">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <CardTitle className="text-xl" data-testid="text-user-name">{getDisplayName()}</CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1" data-testid="text-user-email">
                  <Mail className="w-4 h-4" />
                  {user?.email}
                </CardDescription>
                <Badge variant="secondary" className="mt-2" data-testid="badge-user-role">
                  <Shield className="w-3 h-3 mr-1" />
                  {profile?.role === "system_owner" ? "System Owner" : (profile?.role === "admin" || profile?.role === "owner") ? "System Admin" : "Inspector"}
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Link href="/billing">
          <Card className="cursor-pointer hover-elevate" data-testid="card-billing-link">
            <CardHeader className="flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Billing & Subscription</CardTitle>
                  <CardDescription>Manage your subscription plan and billing</CardDescription>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardHeader>
          </Card>
        </Link>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card data-testid="card-contact-info">
              <CardHeader>
                <CardTitle className="flex items-center gap-2" data-testid="title-contact-info">
                  <User className="w-5 h-5" />
                  Contact Information
                </CardTitle>
                <CardDescription data-testid="desc-contact-info">
                  Your name and contact details for field operations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-first-name">First Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="John"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-first-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-last-name">Last Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Smith"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-last-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-title">Job Title</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Senior Field Inspector"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-title"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-phone">Phone Number</FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            placeholder="(555) 123-4567"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-phone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <FormLabel data-testid="label-email">Email</FormLabel>
                  <Input
                    type="email"
                    value={profile?.email || user?.email || ""}
                    disabled
                    className="bg-muted"
                    data-testid="input-email"
                  />
                  <p className="text-xs text-muted-foreground">
                    Email is set from your invitation and cannot be changed
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-credentials">
              <CardHeader>
                <CardTitle className="flex items-center gap-2" data-testid="title-credentials">
                  <Award className="w-5 h-5" />
                  Licenses & Certifications
                </CardTitle>
                <CardDescription data-testid="desc-credentials">
                  Your professional credentials and certifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="licenseNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-license-number">License Number</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., INS-12345"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-license-number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="licenseState"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-license-state">License State/Region</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., California"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-license-state"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="text-sm font-medium" data-testid="label-certifications">Certifications</div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a certification (e.g., OSHA 30, ICC, ACI)"
                      value={newCertification}
                      onChange={(e) => setNewCertification(e.target.value)}
                      onKeyPress={handleKeyPress}
                      data-testid="input-new-certification"
                    />
                    <Button 
                      type="button" 
                      variant="secondary" 
                      size="icon"
                      onClick={addCertification}
                      disabled={!newCertification.trim()}
                      data-testid="button-add-certification"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {certifications.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3" data-testid="list-certifications">
                      {certifications.map((cert, index) => (
                        <div key={index} className="inline-flex items-center gap-1" data-testid={`certification-item-${index}`}>
                          <Badge variant="secondary" data-testid={`certification-badge-${index}`}>
                            {cert}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeCertification(cert)}
                            data-testid={`button-remove-certification-${index}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {certifications.length === 0 && (
                    <p className="text-sm text-muted-foreground" data-testid="text-no-certifications">
                      No certifications added yet. Add your professional certifications above.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-contractor">
              <CardHeader>
                <CardTitle className="flex items-center gap-2" data-testid="title-contractor">
                  <Building2 className="w-5 h-5" />
                  Independent Contractor Information
                </CardTitle>
                <CardDescription data-testid="desc-contractor">
                  If you're an independent contractor, add your company information for invoicing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="contractorCompanyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel data-testid="label-contractor-company">Company Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Smith Inspections LLC"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-contractor-company"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contractorAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel data-testid="label-contractor-address">Business Address</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="123 Main St, Suite 100&#10;City, State 12345"
                          rows={2}
                          {...field}
                          value={field.value || ""}
                          data-testid="input-contractor-address"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="contractorPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-contractor-phone">Business Phone</FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            placeholder="(555) 123-4567"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-contractor-phone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contractorEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel data-testid="label-contractor-email">Business Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="billing@yourcompany.com"
                            {...field}
                            value={field.value || ""}
                            data-testid="input-contractor-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                className="min-w-32"
                data-testid="button-save-profile"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Profile
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </PageLayout>
  );
}

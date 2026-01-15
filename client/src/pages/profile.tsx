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
  AlertCircle
} from "lucide-react";
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
      phone: "",
      title: "",
      licenseNumber: "",
      licenseState: "",
      emergencyContact: "",
      emergencyPhone: "",
      certifications: [],
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        phone: profile.phone || "",
        title: profile.title || "",
        licenseNumber: profile.licenseNumber || "",
        licenseState: profile.licenseState || "",
        emergencyContact: profile.emergencyContact || "",
        emergencyPhone: profile.emergencyPhone || "",
        certifications: profile.certifications || [],
      });
      setCertifications(profile.certifications || []);
    }
  }, [profile, form]);

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
    const first = user?.firstName?.charAt(0) || "";
    const last = user?.lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "U";
  };

  const getDisplayName = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
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
                  {profile?.role === "admin" ? "Administrator" : "Inspector"}
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Card data-testid="card-contact-info">
              <CardHeader>
                <CardTitle className="flex items-center gap-2" data-testid="title-contact-info">
                  <User className="w-5 h-5" />
                  Contact Information
                </CardTitle>
                <CardDescription data-testid="desc-contact-info">
                  Your contact details for field operations and emergencies
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium" data-testid="label-emergency-contact">
                    <AlertCircle className="w-4 h-4 text-muted-foreground" />
                    Emergency Contact
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="emergencyContact"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              placeholder="Contact name"
                              {...field}
                              value={field.value || ""}
                              data-testid="input-emergency-contact"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="emergencyPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              type="tel"
                              placeholder="Contact phone"
                              {...field}
                              value={field.value || ""}
                              data-testid="input-emergency-phone"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
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

import { useState, useEffect, useRef } from "react";
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
  ChevronRight,
  Moon,
  Sun,
  FileText,
  GraduationCap,
  Users,
  Camera,
  Trash2,
  FileDown,
  Sparkles
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/hooks/use-theme";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { updateUserProfileSchema, type UserProfile, type UpdateUserProfile } from "@shared/schema";

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [certifications, setCertifications] = useState<string[]>([]);
  const [newCertification, setNewCertification] = useState("");
  const [education, setEducation] = useState<{degree: string; school: string; status?: string}[]>([]);
  const [newEducation, setNewEducation] = useState<{degree: string; school: string; status: string}>({degree: "", school: "", status: ""});
  const [references, setReferences] = useState<{name: string; title: string; organization: string; email?: string; phone?: string}[]>([]);
  const [newReference, setNewReference] = useState<{name: string; title: string; organization: string; email: string; phone: string}>({name: "", title: "", organization: "", email: "", phone: ""});
  const photoInputRef = useRef<HTMLInputElement>(null);

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
      bio: "",
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
        bio: profile.bio || "",
        contractorCompanyName: profile.contractorCompanyName || "",
        contractorAddress: profile.contractorAddress || "",
        contractorPhone: profile.contractorPhone || "",
        contractorEmail: profile.contractorEmail || "",
      });
      setCertifications(profile.certifications || []);
      setEducation(profile.education || []);
      setReferences(profile.references || []);
    }
  }, [profile, form, user]);

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateUserProfile) => {
      return apiRequest("PATCH", "/api/profile", {
        ...data,
        certifications,
        education,
        references,
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

  const photoUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/profile/photo", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({ title: "Photo Uploaded", description: "Your profile photo has been updated." });
    },
  });

  const photoDeleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/profile/photo");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({ title: "Photo Removed", description: "Your profile photo has been removed." });
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

  const addEducation = () => {
    if (newEducation.degree.trim() && newEducation.school.trim()) {
      setEducation([...education, {
        degree: newEducation.degree.trim(),
        school: newEducation.school.trim(),
        status: newEducation.status.trim() || undefined,
      }]);
      setNewEducation({degree: "", school: "", status: ""});
    }
  };

  const removeEducation = (index: number) => {
    setEducation(education.filter((_, i) => i !== index));
  };

  const addReference = () => {
    if (newReference.name.trim() && newReference.title.trim() && newReference.organization.trim()) {
      setReferences([...references, {
        name: newReference.name.trim(),
        title: newReference.title.trim(),
        organization: newReference.organization.trim(),
        email: newReference.email.trim() || undefined,
        phone: newReference.phone.trim() || undefined,
      }]);
      setNewReference({name: "", title: "", organization: "", email: "", phone: ""});
    }
  };

  const removeReference = (index: number) => {
    setReferences(references.filter((_, i) => i !== index));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      photoUploadMutation.mutate(file);
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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Button variant="ghost" size="sm" asChild data-testid="button-back">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to Dashboard
            </Link>
          </Button>
          {profile && (
            <Button
              variant="default"
              size="sm"
              onClick={() => window.open(`/api/resume/generate/${profile.userId}`, '_blank')}
              data-testid="button-generate-resume"
            >
              <FileDown className="w-4 h-4 mr-1" />
              Generate Resume
            </Button>
          )}
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
                  <p className="text-xs text-muted-foreground mt-1">Free for Knowland Inspectors</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </CardHeader>
          </Card>
        </Link>

        <Card data-testid="card-appearance">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                {theme === "dark" ? (
                  <Moon className="w-5 h-5 text-foreground" />
                ) : (
                  <Sun className="w-5 h-5 text-foreground" />
                )}
              </div>
              <div>
                <CardTitle className="text-base">Appearance</CardTitle>
                <CardDescription>
                  {theme === "dark" ? "Dark mode is enabled" : "Light mode is enabled"}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-muted-foreground" />
              <Switch
                checked={theme === "dark"}
                onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                data-testid="switch-dark-mode"
              />
              <Moon className="w-4 h-4 text-muted-foreground" />
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

            <Card data-testid="card-profile-photo">
              <CardHeader>
                <CardTitle className="flex items-center gap-2" data-testid="title-profile-photo">
                  <Camera className="w-5 h-5" />
                  Profile Photo
                </CardTitle>
                <CardDescription data-testid="desc-profile-photo">
                  Upload a portrait photo for your resume
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-6">
                  <Avatar className="h-24 w-24" data-testid="avatar-profile-photo">
                    {profile?.profilePhotoPath ? (
                      <AvatarImage src={profile.profilePhotoPath} alt="Profile photo" />
                    ) : null}
                    <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-medium">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoChange}
                      data-testid="input-photo-upload"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoUploadMutation.isPending}
                      data-testid="button-upload-photo"
                    >
                      {photoUploadMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Camera className="w-4 h-4 mr-2" />
                      )}
                      Upload Photo
                    </Button>
                    {profile?.profilePhotoPath && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => photoDeleteMutation.mutate()}
                        disabled={photoDeleteMutation.isPending}
                        data-testid="button-remove-photo"
                      >
                        {photoDeleteMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4 mr-2" />
                        )}
                        Remove Photo
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-profile-summary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2" data-testid="title-profile-summary">
                  <FileText className="w-5 h-5" />
                  Profile Summary
                </CardTitle>
                <CardDescription data-testid="desc-profile-summary">
                  A brief professional summary for your resume
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <FormLabel data-testid="label-bio">Bio</FormLabel>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isGeneratingBio}
                          onClick={async () => {
                            setIsGeneratingBio(true);
                            try {
                              const res = await apiRequest("POST", "/api/profile/generate-bio");
                              const data = await res.json();
                              if (data.bio) {
                                field.onChange(data.bio);
                                toast({ title: "Bio generated", description: "Review and edit the AI-generated bio, then save your profile." });
                              }
                            } catch (err) {
                              toast({ title: "Error", description: "Failed to generate bio. Please try again.", variant: "destructive" });
                            } finally {
                              setIsGeneratingBio(false);
                            }
                          }}
                          data-testid="button-generate-bio"
                        >
                          {isGeneratingBio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          {isGeneratingBio ? "Generating..." : "AI Generate"}
                        </Button>
                      </div>
                      <FormControl>
                        <Textarea
                          placeholder="Write a brief professional summary..."
                          rows={4}
                          {...field}
                          value={field.value || ""}
                          data-testid="input-bio"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card data-testid="card-education">
              <CardHeader>
                <CardTitle className="flex items-center gap-2" data-testid="title-education">
                  <GraduationCap className="w-5 h-5" />
                  Education
                </CardTitle>
                <CardDescription data-testid="desc-education">
                  Your educational background
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {education.length > 0 && (
                  <div className="space-y-3" data-testid="list-education">
                    {education.map((edu, index) => (
                      <div key={index} className="flex items-start justify-between gap-2 p-3 rounded-md border" data-testid={`education-item-${index}`}>
                        <div className="flex-1">
                          <div className="font-medium text-sm" data-testid={`text-education-degree-${index}`}>{edu.degree}</div>
                          <div className="text-sm text-muted-foreground" data-testid={`text-education-school-${index}`}>{edu.school}</div>
                          {edu.status && (
                            <Badge variant="secondary" className="mt-1" data-testid={`badge-education-status-${index}`}>
                              {edu.status}
                            </Badge>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeEducation(index)}
                          data-testid={`button-remove-education-${index}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {education.length === 0 && (
                  <p className="text-sm text-muted-foreground" data-testid="text-no-education">
                    No education entries added yet.
                  </p>
                )}

                <Separator />

                <div className="space-y-3">
                  <div className="text-sm font-medium">Add Education</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      placeholder="Degree (e.g., B.S. Civil Engineering)"
                      value={newEducation.degree}
                      onChange={(e) => setNewEducation({...newEducation, degree: e.target.value})}
                      data-testid="input-new-education-degree"
                    />
                    <Input
                      placeholder="School"
                      value={newEducation.school}
                      onChange={(e) => setNewEducation({...newEducation, school: e.target.value})}
                      data-testid="input-new-education-school"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., In Progress"
                      value={newEducation.status}
                      onChange={(e) => setNewEducation({...newEducation, status: e.target.value})}
                      data-testid="input-new-education-status"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={addEducation}
                      disabled={!newEducation.degree.trim() || !newEducation.school.trim()}
                      data-testid="button-add-education"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-references">
              <CardHeader>
                <CardTitle className="flex items-center gap-2" data-testid="title-references">
                  <Users className="w-5 h-5" />
                  References
                </CardTitle>
                <CardDescription data-testid="desc-references">
                  Professional references for your resume
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {references.length > 0 && (
                  <div className="space-y-3" data-testid="list-references">
                    {references.map((ref, index) => (
                      <div key={index} className="flex items-start justify-between gap-2 p-3 rounded-md border" data-testid={`reference-item-${index}`}>
                        <div className="flex-1">
                          <div className="font-medium text-sm" data-testid={`text-reference-name-${index}`}>{ref.name}</div>
                          <div className="text-sm text-muted-foreground" data-testid={`text-reference-title-${index}`}>{ref.title}</div>
                          <div className="text-sm text-muted-foreground" data-testid={`text-reference-org-${index}`}>{ref.organization}</div>
                          {ref.email && (
                            <div className="text-xs text-muted-foreground mt-1" data-testid={`text-reference-email-${index}`}>
                              <Mail className="w-3 h-3 inline mr-1" />{ref.email}
                            </div>
                          )}
                          {ref.phone && (
                            <div className="text-xs text-muted-foreground" data-testid={`text-reference-phone-${index}`}>
                              {ref.phone}
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeReference(index)}
                          data-testid={`button-remove-reference-${index}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {references.length === 0 && (
                  <p className="text-sm text-muted-foreground" data-testid="text-no-references">
                    No references added yet.
                  </p>
                )}

                <Separator />

                <div className="space-y-3">
                  <div className="text-sm font-medium">Add Reference</div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input
                      placeholder="Name"
                      value={newReference.name}
                      onChange={(e) => setNewReference({...newReference, name: e.target.value})}
                      data-testid="input-new-reference-name"
                    />
                    <Input
                      placeholder="Title"
                      value={newReference.title}
                      onChange={(e) => setNewReference({...newReference, title: e.target.value})}
                      data-testid="input-new-reference-title"
                    />
                    <Input
                      placeholder="Organization"
                      value={newReference.organization}
                      onChange={(e) => setNewReference({...newReference, organization: e.target.value})}
                      data-testid="input-new-reference-organization"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Email (optional)"
                      type="email"
                      value={newReference.email}
                      onChange={(e) => setNewReference({...newReference, email: e.target.value})}
                      data-testid="input-new-reference-email"
                    />
                    <Input
                      placeholder="Phone (optional)"
                      type="tel"
                      value={newReference.phone}
                      onChange={(e) => setNewReference({...newReference, phone: e.target.value})}
                      data-testid="input-new-reference-phone"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={addReference}
                      disabled={!newReference.name.trim() || !newReference.title.trim() || !newReference.organization.trim()}
                      data-testid="button-add-reference"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
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

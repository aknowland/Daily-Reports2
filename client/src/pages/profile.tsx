import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PageLayout } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
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
  Sparkles,
  Pencil,
  ChevronUp,
  ChevronDown,
  Check,
  Upload,
  UserCircle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/hooks/use-theme";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "wouter";
import { updateUserProfileSchema, type UserProfile, type UpdateUserProfile, type CertEntry, normalizeCerts } from "@shared/schema";

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [certifications, setCertifications] = useState<CertEntry[]>([]);
  const [newCertification, setNewCertification] = useState("");
  const [newCertExpiresAt, setNewCertExpiresAt] = useState("");
  const [newCertNumber, setNewCertNumber] = useState("");
  const [education, setEducation] = useState<{degree: string; school: string; status?: string}[]>([]);
  const [newEducation, setNewEducation] = useState<{degree: string; school: string; status: string}>({degree: "", school: "", status: ""});
  const [references, setReferences] = useState<{name: string; title: string; organization: string; email?: string; phone?: string}[]>([]);
  const [newReference, setNewReference] = useState<{name: string; title: string; organization: string; email: string; phone: string}>({name: "", title: "", organization: "", email: "", phone: ""});
  const [jobHistory, setJobHistory] = useState<{title: string; company: string; client?: string; projectName?: string; projectNumber?: string; projectValue?: string; startDate?: string; endDate?: string; description?: string}[]>([]);
  const [newJob, setNewJob] = useState<{title: string; company: string; client: string; projectName: string; projectNumber: string; projectValue: string; startDate: string; endDate: string; description: string}>({title: "", company: "", client: "", projectName: "", projectNumber: "", projectValue: "", startDate: "", endDate: "", description: ""});
  const [editingJobIndex, setEditingJobIndex] = useState<number | null>(null);
  const [editingJob, setEditingJob] = useState<{title: string; company: string; client: string; projectName: string; projectNumber: string; projectValue: string; startDate: string; endDate: string; description: string}>({title: "", company: "", client: "", projectName: "", projectNumber: "", projectValue: "", startDate: "", endDate: "", description: ""});
  const [editingRefIndex, setEditingRefIndex] = useState<number | null>(null);
  const [editingRef, setEditingRef] = useState<{name: string; title: string; organization: string; email: string; phone: string}>({name: "", title: "", organization: "", email: "", phone: ""});
  const [isGeneratingBio, setIsGeneratingBio] = useState(false);
  const [showResumePreview, setShowResumePreview] = useState(false);
  const [resumeData, setResumeData] = useState<any>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
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
        certifications: normalizeCerts(profile.certifications),
        bio: profile.bio || "",
        contractorCompanyName: profile.contractorCompanyName || "",
        contractorAddress: profile.contractorAddress || "",
        contractorPhone: profile.contractorPhone || "",
        contractorEmail: profile.contractorEmail || "",
      });
      setCertifications(normalizeCerts(profile.certifications));
      setEducation(profile.education || []);
      setReferences(profile.references || []);
      setJobHistory(profile.jobHistory || []);
    }
  }, [profile, form, user]);

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateUserProfile) => {
      return apiRequest("PATCH", "/api/profile", {
        ...data,
        certifications,
        education,
        references,
        jobHistory,
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

  const resumeParseMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("resume", file);
      const res = await fetch("/api/profile/parse-resume", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Upload failed" }));
        throw new Error(err.message || "Failed to parse resume");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResumeData(data);
      setShowResumePreview(true);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to parse resume",
        variant: "destructive",
      });
    },
  });

  const applyResumeData = () => {
    if (!resumeData) return;

    if (resumeData.firstName) form.setValue("firstName", resumeData.firstName);
    if (resumeData.lastName) form.setValue("lastName", resumeData.lastName);
    if (resumeData.title) form.setValue("title", resumeData.title);
    if (resumeData.phone) form.setValue("phone", resumeData.phone);
    if (resumeData.bio) form.setValue("bio", resumeData.bio);
    if (resumeData.licenseNumber) form.setValue("licenseNumber", resumeData.licenseNumber);
    if (resumeData.licenseState) form.setValue("licenseState", resumeData.licenseState);
    if (resumeData.contractorCompanyName) form.setValue("contractorCompanyName", resumeData.contractorCompanyName);

    if (resumeData.certifications?.length > 0) {
      setCertifications(normalizeCerts(resumeData.certifications));
    }
    if (resumeData.education?.length > 0) {
      setEducation(resumeData.education.map((e: any) => ({
        degree: e.degree || "",
        school: e.school || "",
        status: e.status || "",
      })));
    }
    if (resumeData.references?.length > 0) {
      setReferences(resumeData.references.map((r: any) => ({
        name: r.name || "",
        title: r.title || "",
        organization: r.organization || "",
        email: r.email || "",
        phone: r.phone || "",
      })));
    }
    if (resumeData.jobHistory?.length > 0) {
      setJobHistory(resumeData.jobHistory.map((j: any) => ({
        title: j.title || "",
        company: j.company || "",
        client: j.client || "",
        projectName: j.projectName || "",
        projectNumber: j.projectNumber || "",
        projectValue: j.projectValue || "",
        startDate: j.startDate || "",
        endDate: j.endDate || "",
        description: j.description || "",
      })));
    }

    setShowResumePreview(false);
    setResumeData(null);
    toast({
      title: "Resume Data Applied",
      description: "Your profile fields have been updated. Review and save to keep the changes.",
    });
  };

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
    const name = newCertification.trim();
    if (name && !certifications.some(c => c.name === name)) {
      setCertifications([...certifications, {
        name,
        expiresAt: newCertExpiresAt || null,
        certNumber: newCertNumber.trim() || undefined,
      }]);
      setNewCertification("");
      setNewCertExpiresAt("");
      setNewCertNumber("");
    }
  };

  const removeCertification = (certName: string) => {
    setCertifications(certifications.filter(c => c.name !== certName));
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

  const addJob = () => {
    if (newJob.title.trim() && newJob.company.trim()) {
      setJobHistory([...jobHistory, {
        title: newJob.title.trim(),
        company: newJob.company.trim(),
        client: newJob.client.trim() || undefined,
        projectName: newJob.projectName.trim() || undefined,
        projectNumber: newJob.projectNumber.trim() || undefined,
        projectValue: newJob.projectValue.trim() || undefined,
        startDate: newJob.startDate.trim() || undefined,
        endDate: newJob.endDate.trim() || undefined,
        description: newJob.description.trim() || undefined,
      }]);
      setNewJob({title: "", company: "", client: "", projectName: "", projectNumber: "", projectValue: "", startDate: "", endDate: "", description: ""});
    }
  };

  const removeJob = (index: number) => {
    setJobHistory(jobHistory.filter((_, i) => i !== index));
    if (editingJobIndex === index) setEditingJobIndex(null);
  };

  const startEditJob = (index: number) => {
    const job = jobHistory[index];
    setEditingJobIndex(index);
    setEditingJob({
      title: job.title || "",
      company: job.company || "",
      client: job.client || "",
      projectName: job.projectName || "",
      projectNumber: job.projectNumber || "",
      projectValue: job.projectValue || "",
      startDate: job.startDate || "",
      endDate: job.endDate || "",
      description: job.description || "",
    });
  };

  const saveEditJob = () => {
    if (editingJobIndex === null || !editingJob.title.trim() || !editingJob.company.trim()) return;
    const updated = [...jobHistory];
    updated[editingJobIndex] = {
      title: editingJob.title.trim(),
      company: editingJob.company.trim(),
      client: editingJob.client.trim() || undefined,
      projectName: editingJob.projectName.trim() || undefined,
      projectNumber: editingJob.projectNumber.trim() || undefined,
      projectValue: editingJob.projectValue.trim() || undefined,
      startDate: editingJob.startDate.trim() || undefined,
      endDate: editingJob.endDate.trim() || undefined,
      description: editingJob.description.trim() || undefined,
    };
    setJobHistory(updated);
    setEditingJobIndex(null);
  };

  const moveJob = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= jobHistory.length) return;
    const updated = [...jobHistory];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setJobHistory(updated);
    if (editingJobIndex === index) setEditingJobIndex(newIndex);
    else if (editingJobIndex === newIndex) setEditingJobIndex(index);
  };

  const startEditRef = (index: number) => {
    const ref = references[index];
    setEditingRefIndex(index);
    setEditingRef({
      name: ref.name || "",
      title: ref.title || "",
      organization: ref.organization || "",
      email: ref.email || "",
      phone: ref.phone || "",
    });
  };

  const saveEditRef = () => {
    if (editingRefIndex === null || !editingRef.name.trim() || !editingRef.title.trim() || !editingRef.organization.trim()) return;
    const updated = [...references];
    updated[editingRefIndex] = {
      name: editingRef.name.trim(),
      title: editingRef.title.trim(),
      organization: editingRef.organization.trim(),
      email: editingRef.email.trim() || undefined,
      phone: editingRef.phone.trim() || undefined,
    };
    setReferences(updated);
    setEditingRefIndex(null);
  };

  const moveRef = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= references.length) return;
    const updated = [...references];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setReferences(updated);
    if (editingRefIndex === index) setEditingRefIndex(newIndex);
    else if (editingRefIndex === newIndex) setEditingRefIndex(index);
  };

  const removeReference = (index: number) => {
    setReferences(references.filter((_, i) => i !== index));
    if (editingRefIndex === index) setEditingRefIndex(null);
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
        <PageHeader icon={UserCircle} title="My Profile">
          <input
            ref={resumeInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                resumeParseMutation.mutate(file);
                e.target.value = "";
              }
            }}
            data-testid="input-resume-upload"
          />
          <Button
            variant="outline"
            className="border-white/30 text-white hover:bg-white/10"
            onClick={() => resumeInputRef.current?.click()}
            disabled={resumeParseMutation.isPending}
            data-testid="button-upload-resume"
          >
            {resumeParseMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-1" />
            )}
            {resumeParseMutation.isPending ? "Parsing..." : "Import Resume"}
          </Button>
          {profile && (
            <Button
              className="bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] hover:bg-[hsl(36,90%,45%)] font-semibold"
              onClick={() => window.open(`/api/resume/generate/${profile.userId}`, '_blank')}
              data-testid="button-generate-resume"
            >
              <FileDown className="w-4 h-4 mr-1" />
              Generate Resume
            </Button>
          )}
        </PageHeader>
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
                  <div className="text-sm font-medium" data-testid="label-certifications">Certifications &amp; Licenses</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Input
                      placeholder="Certification name (e.g., OSHA 30)"
                      value={newCertification}
                      onChange={(e) => setNewCertification(e.target.value)}
                      onKeyPress={handleKeyPress}
                      data-testid="input-new-certification"
                    />
                    <Input
                      placeholder="Cert # (optional)"
                      value={newCertNumber}
                      onChange={(e) => setNewCertNumber(e.target.value)}
                      data-testid="input-new-cert-number"
                    />
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input
                          type="date"
                          title="Expiration date (optional)"
                          value={newCertExpiresAt}
                          onChange={(e) => setNewCertExpiresAt(e.target.value)}
                          data-testid="input-new-cert-expiry"
                        />
                      </div>
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
                  </div>
                  {certifications.length > 0 && (
                    <div className="space-y-1 mt-3" data-testid="list-certifications">
                      {certifications.map((cert, index) => {
                        const daysUntil = cert.expiresAt
                          ? Math.ceil((new Date(cert.expiresAt).getTime() - Date.now()) / 86400000)
                          : null;
                        const isExpired = daysUntil !== null && daysUntil <= 0;
                        const isExpiringSoon = daysUntil !== null && daysUntil > 0 && daysUntil <= 60;
                        return (
                          <div key={index} className="flex items-center justify-between rounded border px-3 py-2 text-sm" data-testid={`certification-item-${index}`}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium" data-testid={`certification-name-${index}`}>{cert.name}</span>
                              {cert.certNumber && <span className="text-muted-foreground text-xs">#{cert.certNumber}</span>}
                              {cert.expiresAt && (
                                <Badge
                                  variant={isExpired ? "destructive" : isExpiringSoon ? "outline" : "secondary"}
                                  className={isExpiringSoon ? "border-amber-500 text-amber-700 dark:text-amber-400" : ""}
                                  data-testid={`certification-expiry-badge-${index}`}
                                >
                                  {isExpired ? "EXPIRED" : isExpiringSoon ? `Exp. soon` : "Exp."} {cert.expiresAt}
                                </Badge>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeCertification(cert.name)}
                              data-testid={`button-remove-certification-${index}`}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        );
                      })}
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

            <Card data-testid="card-job-history">
              <CardHeader>
                <CardTitle className="flex items-center gap-2" data-testid="title-job-history">
                  <Building2 className="w-5 h-5" />
                  Job History
                </CardTitle>
                <CardDescription data-testid="desc-job-history">
                  Past positions and work experience not captured by current projects
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {jobHistory.length > 0 && (
                  <div className="space-y-3" data-testid="list-job-history">
                    {jobHistory.map((job, index) => (
                      <div key={index} className="rounded-md border" data-testid={`job-history-item-${index}`}>
                        {editingJobIndex === index ? (
                          <div className="p-3 space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input placeholder="Job Title" value={editingJob.title} onChange={(e) => setEditingJob({...editingJob, title: e.target.value})} data-testid="input-edit-job-title" />
                              <Input placeholder="Company / Organization" value={editingJob.company} onChange={(e) => setEditingJob({...editingJob, company: e.target.value})} data-testid="input-edit-job-company" />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input placeholder="Client Name (optional)" value={editingJob.client} onChange={(e) => setEditingJob({...editingJob, client: e.target.value})} data-testid="input-edit-job-client" />
                              <Input placeholder="Project Name (optional)" value={editingJob.projectName} onChange={(e) => setEditingJob({...editingJob, projectName: e.target.value})} data-testid="input-edit-job-project" />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input placeholder="Project Number (optional)" value={editingJob.projectNumber} onChange={(e) => setEditingJob({...editingJob, projectNumber: e.target.value})} data-testid="input-edit-job-project-number" />
                              <Input placeholder="Project Value (e.g. $20 Million)" value={editingJob.projectValue} onChange={(e) => setEditingJob({...editingJob, projectValue: e.target.value})} data-testid="input-edit-job-project-value" />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input placeholder="Start Date (e.g. Jan 2020)" value={editingJob.startDate} onChange={(e) => setEditingJob({...editingJob, startDate: e.target.value})} data-testid="input-edit-job-start" />
                              <Input placeholder="End Date (e.g. Dec 2023 or Present)" value={editingJob.endDate} onChange={(e) => setEditingJob({...editingJob, endDate: e.target.value})} data-testid="input-edit-job-end" />
                            </div>
                            <Textarea placeholder="Brief description (optional)" rows={2} value={editingJob.description} onChange={(e) => setEditingJob({...editingJob, description: e.target.value})} data-testid="input-edit-job-description" />
                            <div className="flex gap-2 justify-end">
                              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingJobIndex(null)} data-testid="button-cancel-edit-job">Cancel</Button>
                              <Button type="button" variant="default" size="sm" onClick={saveEditJob} disabled={!editingJob.title.trim() || !editingJob.company.trim()} data-testid="button-save-edit-job">
                                <Check className="w-4 h-4 mr-1" /> Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 p-3">
                            <div className="flex flex-col gap-0.5">
                              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveJob(index, "up")} disabled={index === 0} data-testid={`button-move-job-up-${index}`}>
                                <ChevronUp className="w-3 h-3" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveJob(index, "down")} disabled={index === jobHistory.length - 1} data-testid={`button-move-job-down-${index}`}>
                                <ChevronDown className="w-3 h-3" />
                              </Button>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm" data-testid={`text-job-title-${index}`}>{job.title}</div>
                              <div className="text-xs text-muted-foreground mt-0.5" data-testid={`text-job-details-${index}`}>
                                {[
                                  job.company,
                                  job.client ? `Client: ${job.client}` : null,
                                  job.projectName ? `Project: ${job.projectName}${job.projectNumber ? ` (${job.projectNumber})` : ""}` : null,
                                  job.projectValue || null,
                                  (job.startDate || job.endDate) ? `${job.startDate || "?"} - ${job.endDate || "Present"}` : null,
                                ].filter(Boolean).join("  |  ")}
                              </div>
                              {job.description && (
                                <div className="text-xs text-muted-foreground mt-1" data-testid={`text-job-desc-${index}`}>{job.description}</div>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button type="button" variant="ghost" size="icon" onClick={() => startEditJob(index)} data-testid={`button-edit-job-${index}`}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeJob(index)} data-testid={`button-remove-job-${index}`}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {jobHistory.length === 0 && (
                  <p className="text-sm text-muted-foreground" data-testid="text-no-job-history">
                    No job history added yet.
                  </p>
                )}

                <Separator />

                <div className="space-y-3">
                  <div className="text-sm font-medium">Add Position</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      placeholder="Job Title"
                      value={newJob.title}
                      onChange={(e) => setNewJob({...newJob, title: e.target.value})}
                      data-testid="input-new-job-title"
                    />
                    <Input
                      placeholder="Company / Organization"
                      value={newJob.company}
                      onChange={(e) => setNewJob({...newJob, company: e.target.value})}
                      data-testid="input-new-job-company"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      placeholder="Client Name (optional)"
                      value={newJob.client}
                      onChange={(e) => setNewJob({...newJob, client: e.target.value})}
                      data-testid="input-new-job-client"
                    />
                    <Input
                      placeholder="Project Name (optional)"
                      value={newJob.projectName}
                      onChange={(e) => setNewJob({...newJob, projectName: e.target.value})}
                      data-testid="input-new-job-project"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      placeholder="Project Number (optional)"
                      value={newJob.projectNumber}
                      onChange={(e) => setNewJob({...newJob, projectNumber: e.target.value})}
                      data-testid="input-new-job-project-number"
                    />
                    <Input
                      placeholder="Project Value (e.g. $20 Million)"
                      value={newJob.projectValue}
                      onChange={(e) => setNewJob({...newJob, projectValue: e.target.value})}
                      data-testid="input-new-job-project-value"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      placeholder="Start Date (e.g. Jan 2020)"
                      value={newJob.startDate}
                      onChange={(e) => setNewJob({...newJob, startDate: e.target.value})}
                      data-testid="input-new-job-start"
                    />
                    <Input
                      placeholder="End Date (e.g. Dec 2023 or Present)"
                      value={newJob.endDate}
                      onChange={(e) => setNewJob({...newJob, endDate: e.target.value})}
                      data-testid="input-new-job-end"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Brief description (optional)"
                      rows={2}
                      value={newJob.description}
                      onChange={(e) => setNewJob({...newJob, description: e.target.value})}
                      data-testid="input-new-job-description"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={addJob}
                      disabled={!newJob.title.trim() || !newJob.company.trim()}
                      data-testid="button-add-job"
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
                      <div key={index} className="rounded-md border" data-testid={`reference-item-${index}`}>
                        {editingRefIndex === index ? (
                          <div className="p-3 space-y-3">
                            <div className="grid gap-3 sm:grid-cols-3">
                              <Input placeholder="Name" value={editingRef.name} onChange={(e) => setEditingRef({...editingRef, name: e.target.value})} data-testid="input-edit-ref-name" />
                              <Input placeholder="Title" value={editingRef.title} onChange={(e) => setEditingRef({...editingRef, title: e.target.value})} data-testid="input-edit-ref-title" />
                              <Input placeholder="Organization" value={editingRef.organization} onChange={(e) => setEditingRef({...editingRef, organization: e.target.value})} data-testid="input-edit-ref-organization" />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Input placeholder="Email (optional)" type="email" value={editingRef.email} onChange={(e) => setEditingRef({...editingRef, email: e.target.value})} data-testid="input-edit-ref-email" />
                              <Input placeholder="Phone (optional)" type="tel" value={editingRef.phone} onChange={(e) => setEditingRef({...editingRef, phone: e.target.value})} data-testid="input-edit-ref-phone" />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingRefIndex(null)} data-testid="button-cancel-edit-ref">Cancel</Button>
                              <Button type="button" variant="default" size="sm" onClick={saveEditRef} disabled={!editingRef.name.trim() || !editingRef.title.trim() || !editingRef.organization.trim()} data-testid="button-save-edit-ref">
                                <Check className="w-4 h-4 mr-1" /> Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2 p-3">
                            <div className="flex flex-col gap-0.5">
                              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveRef(index, "up")} disabled={index === 0} data-testid={`button-move-ref-up-${index}`}>
                                <ChevronUp className="w-3 h-3" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveRef(index, "down")} disabled={index === references.length - 1} data-testid={`button-move-ref-down-${index}`}>
                                <ChevronDown className="w-3 h-3" />
                              </Button>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm" data-testid={`text-reference-name-${index}`}>{ref.name}</div>
                              <div className="text-sm text-muted-foreground" data-testid={`text-reference-title-${index}`}>{ref.title}</div>
                              <div className="text-sm text-muted-foreground" data-testid={`text-reference-org-${index}`}>{ref.organization}</div>
                              {ref.email && (
                                <div className="text-xs text-muted-foreground mt-1" data-testid={`text-reference-email-${index}`}>
                                  <Mail className="w-3 h-3 inline mr-1" />{ref.email}
                                </div>
                              )}
                              {ref.phone && (
                                <div className="text-xs text-muted-foreground" data-testid={`text-reference-phone-${index}`}>{ref.phone}</div>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button type="button" variant="ghost" size="icon" onClick={() => startEditRef(index)} data-testid={`button-edit-ref-${index}`}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeReference(index)} data-testid={`button-remove-reference-${index}`}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
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

      <Dialog open={showResumePreview} onOpenChange={setShowResumePreview}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Resume Data Preview
            </DialogTitle>
            <DialogDescription>
              Review the extracted data below. Click "Apply to Profile" to fill in your profile fields. You can edit them before saving.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            {resumeData && (
              <div className="space-y-4 text-sm">
                {(resumeData.firstName || resumeData.lastName) && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Name</p>
                    <p>{[resumeData.firstName, resumeData.lastName].filter(Boolean).join(" ")}</p>
                  </div>
                )}
                {resumeData.title && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Title</p>
                    <p>{resumeData.title}</p>
                  </div>
                )}
                {resumeData.bio && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Professional Summary</p>
                    <p className="whitespace-pre-wrap">{resumeData.bio}</p>
                  </div>
                )}
                {(resumeData.phone || resumeData.email) && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Contact</p>
                    {resumeData.phone && <p>Phone: {resumeData.phone}</p>}
                    {resumeData.email && <p>Email: {resumeData.email}</p>}
                  </div>
                )}
                {(resumeData.licenseNumber || resumeData.licenseState) && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">License</p>
                    <p>{[resumeData.licenseNumber, resumeData.licenseState].filter(Boolean).join(" - ")}</p>
                  </div>
                )}
                {resumeData.certifications?.length > 0 && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Certifications ({resumeData.certifications.length})</p>
                    <div className="flex flex-wrap gap-1">
                      {normalizeCerts(resumeData.certifications).map((cert, i) => (
                        <Badge key={i} variant="secondary">{cert.name}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {resumeData.education?.length > 0 && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Education ({resumeData.education.length})</p>
                    <div className="space-y-1">
                      {resumeData.education.map((edu: any, i: number) => (
                        <p key={i}>{edu.degree} - {edu.school}{edu.status ? ` (${edu.status})` : ""}</p>
                      ))}
                    </div>
                  </div>
                )}
                {resumeData.jobHistory?.length > 0 && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Work History ({resumeData.jobHistory.length})</p>
                    <div className="space-y-2">
                      {resumeData.jobHistory.map((job: any, i: number) => (
                        <div key={i} className="border-l-2 border-border pl-3">
                          <p className="font-medium">{job.title}</p>
                          <p className="text-muted-foreground">{job.company}{job.startDate ? ` (${job.startDate} - ${job.endDate || "Present"})` : ""}</p>
                          {job.description && <p className="mt-1">{job.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {resumeData.references?.length > 0 && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">References ({resumeData.references.length})</p>
                    <div className="space-y-1">
                      {resumeData.references.map((ref: any, i: number) => (
                        <p key={i}>{ref.name} - {ref.title}, {ref.organization}</p>
                      ))}
                    </div>
                  </div>
                )}
                {resumeData.contractorCompanyName && (
                  <div>
                    <p className="font-medium text-muted-foreground mb-1">Company</p>
                    <p>{resumeData.contractorCompanyName}</p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowResumePreview(false); setResumeData(null); }} data-testid="button-cancel-resume">
              Cancel
            </Button>
            <Button onClick={applyResumeData} data-testid="button-apply-resume">
              <Check className="w-4 h-4 mr-1" />
              Apply to Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

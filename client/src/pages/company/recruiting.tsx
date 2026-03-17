import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Search,
  Download,
  Loader2,
  Phone,
  MapPin,
  Award,
  Calendar,
  MessageSquare,
  UserPlus,
  Filter,
  X,
  HardHat,
  AlertCircle,
  Clock,
  Send,
  Upload,
  ArrowUpDown,
  CheckCircle2,
  Mail,
} from "lucide-react";
import { Link } from "wouter";
import { useState, useMemo, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { InspectorCandidate, InspectorCandidateNote } from "@shared/schema";
import type { User } from "@shared/models/auth";

type NoteWithUser = InspectorCandidateNote & { user?: User };

type RecruitingStatus = "prospect" | "contacted" | "interested" | "not_available" | "not_interested" | "hired";

const STATUS_OPTIONS = [
  { value: "prospect", label: "Prospect", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  { value: "contacted", label: "Contacted", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  { value: "interested", label: "Interested", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  { value: "not_available", label: "Not Available", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300" },
  { value: "not_interested", label: "Not Interested", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  { value: "hired", label: "Hired", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" },
];

function getStatusBadge(status: string) {
  const opt = STATUS_OPTIONS.find(o => o.value === status);
  return opt || { value: status, label: status, color: "bg-gray-100 text-gray-700" };
}

function formatAvailDate(d: string | Date | null): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getAvailabilityInfo(availableBy: string | Date | null) {
  if (!availableBy) return null;
  const date = typeof availableBy === 'string' ? new Date(availableBy) : availableBy;
  const now = new Date();
  const days = Math.ceil((date.getTime() - now.getTime()) / 86400000);
  if (days <= 0) return { label: "Available Now", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", days };
  if (days <= 30) return { label: `Avail. ${formatAvailDate(date)}`, color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300", days };
  if (days <= 90) return { label: `Avail. ${formatAvailDate(date)}`, color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", days };
  return { label: `Avail. ${formatAvailDate(date)}`, color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", days };
}

export default function CompanyRecruitingPage() {
  const { toast } = useToast();
  const { activeCompany, isEffectiveCompanyAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [countyFilter, setCountyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name_asc");
  const [selectedCandidate, setSelectedCandidate] = useState<InspectorCandidate | null>(null);
  const [newNote, setNewNote] = useState("");
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [isUploadingAvailability, setIsUploadingAvailability] = useState(false);
  const availabilityInputRef = useRef<HTMLInputElement>(null);

  const { data: candidates = [], isLoading } = useQuery<InspectorCandidate[]>({
    queryKey: ["/api/recruiting/candidates"],
    enabled: !!activeCompany?.id && isEffectiveCompanyAdmin,
  });

  const { data: notes = [], isLoading: isNotesLoading } = useQuery<NoteWithUser[]>({
    queryKey: ["/api/recruiting/candidates", selectedCandidate?.id, "notes"],
    queryFn: async () => {
      const res = await fetch(`/api/recruiting/candidates/${selectedCandidate!.id}/notes`, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch notes");
      return res.json();
    },
    enabled: !!selectedCandidate?.id,
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/recruiting/import");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates"] });
      setShowImportConfirm(false);
      toast({
        title: "Import Complete",
        description: `${data.imported} new inspectors imported, ${data.updated} updated. Total: ${data.total}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import DSA inspector list",
        variant: "destructive",
      });
    },
  });

  const updateCandidateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; status?: string; availableBy?: string | null; timeBase?: string | null }) => {
      return apiRequest("PATCH", `/api/recruiting/candidates/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates"] });
      toast({ title: "Updated" });
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      return apiRequest("POST", `/api/recruiting/candidates/${id}/notes`, { note });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates", selectedCandidate?.id, "notes"] });
      setNewNote("");
      toast({ title: "Note added" });
    },
    onError: () => {
      toast({ title: "Failed to add note", variant: "destructive" });
    },
  });

  async function handleAvailabilityUpload(file: File) {
    setIsUploadingAvailability(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/recruiting/import-availability', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(err.message);
      }
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/recruiting/candidates"] });
      toast({
        title: "Availability Import Complete",
        description: `${data.updated} updated, ${data.created} new, ${data.skipped} skipped. Total: ${data.total}`,
      });
    } catch (error: any) {
      toast({
        title: "Availability Import Failed",
        description: error.message || "Failed to import availability list",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAvailability(false);
      if (availabilityInputRef.current) availabilityInputRef.current.value = '';
    }
  }

  const counties = useMemo(() => {
    const set = new Set(candidates.map(c => c.county).filter(Boolean));
    return Array.from(set).sort() as string[];
  }, [candidates]);

  const filteredAndSortedCandidates = useMemo(() => {
    const now = new Date();
    let filtered = candidates.filter(c => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = `${c.firstName} ${c.lastName}`.toLowerCase();
        const cert = c.certNumber?.toLowerCase() || '';
        const county = c.county?.toLowerCase() || '';
        const email = c.availabilityEmail?.toLowerCase() || '';
        if (!name.includes(q) && !cert.includes(q) && !county.includes(q) && !email.includes(q)) return false;
      }
      if (classFilter !== "all") {
        if (classFilter === "class1" && !c.class1) return false;
        if (classFilter === "class2" && !c.class2) return false;
        if (classFilter === "class3" && !c.class3) return false;
      }
      if (countyFilter !== "all" && c.county !== countyFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (availabilityFilter !== "all") {
        const ab = c.availableBy ? new Date(c.availableBy) : null;
        if (availabilityFilter === "now") {
          if (!ab || ab > now) return false;
        } else if (availabilityFilter === "30days") {
          if (!ab || ab > new Date(now.getTime() + 30 * 86400000)) return false;
        } else if (availabilityFilter === "90days") {
          if (!ab || ab > new Date(now.getTime() + 90 * 86400000)) return false;
        } else if (availabilityFilter === "has_data") {
          if (!ab) return false;
        }
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (sortBy === "name_asc") return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
      if (sortBy === "name_desc") return `${b.lastName} ${b.firstName}`.localeCompare(`${a.lastName} ${a.firstName}`);
      if (sortBy === "available_soonest") {
        const aDate = a.availableBy ? new Date(a.availableBy).getTime() : Infinity;
        const bDate = b.availableBy ? new Date(b.availableBy).getTime() : Infinity;
        return aDate - bDate;
      }
      if (sortBy === "cert_expiry") {
        const aExp = a.certExpDate || 'zzzz';
        const bExp = b.certExpDate || 'zzzz';
        return aExp.localeCompare(bExp);
      }
      return 0;
    });

    return filtered;
  }, [candidates, searchQuery, classFilter, countyFilter, statusFilter, availabilityFilter, sortBy]);

  const hasActiveFilters = classFilter !== "all" || countyFilter !== "all" || statusFilter !== "all" || availabilityFilter !== "all" || searchQuery.trim() !== "";

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    candidates.forEach(c => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    return counts;
  }, [candidates]);

  const availableNowCount = useMemo(() => {
    const now = new Date();
    return candidates.filter(c => c.availableBy && new Date(c.availableBy) <= now).length;
  }, [candidates]);

  if (!activeCompany || !isEffectiveCompanyAdmin) {
    return (
      <PageLayout>
        <PageHeader title="Recruiting" icon={HardHat} />
        <div className="p-4">
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Company admin access required to view recruiting pipeline.</p>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader
        title="Inspector Recruiting"
        icon={HardHat}
        backHref="/company/dashboard"
      />

      <div className="p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-wrap gap-2">
            {candidates.length > 0 && (
              <>
                <Badge variant="outline" className="text-xs" data-testid="badge-total-candidates">
                  {candidates.length} inspectors
                </Badge>
                {statusCounts.prospect > 0 && (
                  <Badge variant="outline" className="text-xs bg-slate-50 dark:bg-slate-900">
                    {statusCounts.prospect} prospects
                  </Badge>
                )}
                {statusCounts.contacted > 0 && (
                  <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-950">
                    {statusCounts.contacted} contacted
                  </Badge>
                )}
                {statusCounts.interested > 0 && (
                  <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950">
                    {statusCounts.interested} interested
                  </Badge>
                )}
                {statusCounts.hired > 0 && (
                  <Badge variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-950">
                    {statusCounts.hired} hired
                  </Badge>
                )}
                {availableNowCount > 0 && (
                  <Badge variant="outline" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-300 dark:border-green-700" data-testid="badge-available-now">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {availableNowCount} available now
                  </Badge>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <input
              type="file"
              accept=".xlsx"
              ref={availabilityInputRef}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAvailabilityUpload(file);
              }}
              data-testid="input-availability-file"
            />
            <Button
              variant="outline"
              onClick={() => availabilityInputRef.current?.click()}
              disabled={isUploadingAvailability}
              data-testid="button-import-availability"
            >
              {isUploadingAvailability ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {isUploadingAvailability ? "Importing..." : "Import Availability"}
            </Button>
            <Button
              onClick={() => setShowImportConfirm(true)}
              className="bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] hover:bg-[hsl(36,90%,45%)] font-semibold"
              data-testid="button-import-dsa"
            >
              <Download className="w-4 h-4 mr-2" />
              Import from DSA
            </Button>
          </div>
        </div>

        {candidates.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, cert #, county, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-candidates"
              />
            </div>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-full sm:w-[140px]" data-testid="select-class-filter">
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                <SelectItem value="class1">Class 1</SelectItem>
                <SelectItem value="class2">Class 2</SelectItem>
                <SelectItem value="class3">Class 3</SelectItem>
              </SelectContent>
            </Select>
            <Select value={countyFilter} onValueChange={setCountyFilter}>
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-county-filter">
                <SelectValue placeholder="County" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Counties</SelectItem>
                {counties.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
              <SelectTrigger className="w-full sm:w-[170px]" data-testid="select-availability-filter">
                <SelectValue placeholder="Availability" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Availability</SelectItem>
                <SelectItem value="now">Available Now</SelectItem>
                <SelectItem value="30days">Within 30 Days</SelectItem>
                <SelectItem value="90days">Within 90 Days</SelectItem>
                <SelectItem value="has_data">Has Availability</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-[170px]" data-testid="select-sort">
                <ArrowUpDown className="w-3 h-3 mr-1" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Name A–Z</SelectItem>
                <SelectItem value="name_desc">Name Z–A</SelectItem>
                <SelectItem value="available_soonest">Available Soonest</SelectItem>
                <SelectItem value="cert_expiry">Cert Expiry Soonest</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearchQuery(""); setClassFilter("all"); setCountyFilter("all"); setStatusFilter("all"); setAvailabilityFilter("all"); }}
                className="text-muted-foreground"
                data-testid="button-clear-filters"
              >
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <HardHat className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No inspectors imported yet</h3>
              <p className="text-muted-foreground mb-4">
                Import DSA-certified inspectors from the California Division of the State Architect registry to start building your recruiting pipeline.
              </p>
              <div className="flex gap-2 justify-center flex-wrap">
                <Button
                  onClick={() => setShowImportConfirm(true)}
                  className="bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] hover:bg-[hsl(36,90%,45%)] font-semibold"
                  data-testid="button-import-empty"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Import from DSA
                </Button>
                <Button
                  variant="outline"
                  onClick={() => availabilityInputRef.current?.click()}
                  disabled={isUploadingAvailability}
                  data-testid="button-import-availability-empty"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import Availability List
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {hasActiveFilters && (
              <p className="text-sm text-muted-foreground">
                Showing {filteredAndSortedCandidates.length} of {candidates.length} inspectors
              </p>
            )}
            <div className="space-y-2">
              {filteredAndSortedCandidates.map(candidate => {
                const statusInfo = getStatusBadge(candidate.status);
                const availInfo = getAvailabilityInfo(candidate.availableBy);
                return (
                  <Card
                    key={candidate.id}
                    className="cursor-pointer hover:border-[hsl(36,90%,50%)]/50 transition-colors"
                    onClick={() => setSelectedCandidate(candidate)}
                    data-testid={`card-candidate-${candidate.id}`}
                  >
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm sm:text-base truncate" data-testid={`text-candidate-name-${candidate.id}`}>
                              {candidate.firstName} {candidate.lastName}
                            </h3>
                            <Select
                              value={candidate.status}
                              onValueChange={(val) => {
                                updateCandidateMutation.mutate({ id: candidate.id, status: val });
                              }}
                            >
                              <SelectTrigger
                                className={`h-6 text-xs px-2 py-0 w-auto border-0 ${statusInfo.color}`}
                                data-testid={`select-status-${candidate.id}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent onClick={(e) => e.stopPropagation()}>
                                {STATUS_OPTIONS.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value} data-testid={`option-status-${opt.value}-${candidate.id}`}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {availInfo && (
                              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${availInfo.color}`} data-testid={`badge-availability-${candidate.id}`}>
                                <Calendar className="w-2.5 h-2.5" />
                                {availInfo.label}
                              </span>
                            )}
                            {candidate.timeBase && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                                {candidate.timeBase === 'full_time' ? 'FT' : 'PT'}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                            {candidate.certNumber && (
                              <span className="flex items-center gap-1">
                                <Award className="w-3 h-3" />
                                Cert #{candidate.certNumber}
                              </span>
                            )}
                            {candidate.county && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {candidate.county}
                              </span>
                            )}
                            {(candidate.phone || candidate.availabilityPhone) && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {candidate.phone || candidate.availabilityPhone}
                              </span>
                            )}
                            {candidate.certExpDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Exp: {candidate.certExpDate}
                              </span>
                            )}
                            {candidate.availabilityEmail && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {candidate.availabilityEmail}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {candidate.class1 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">C1</Badge>
                          )}
                          {candidate.class2 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">C2</Badge>
                          )}
                          {candidate.class3 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">C3</Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {filteredAndSortedCandidates.length === 0 && hasActiveFilters && (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Filter className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No inspectors match the current filters.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}
      </div>

      <AlertDialog open={showImportConfirm} onOpenChange={setShowImportConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import DSA Inspector List</AlertDialogTitle>
            <AlertDialogDescription>
              This will fetch the current list of Class 1, 2, and 3 certified inspectors from the California DSA registry.
              {candidates.length > 0
                ? " Existing records will be updated with the latest data. Your notes and status changes will be preserved."
                : " This may take a moment."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending}
              className="bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] hover:bg-[hsl(36,90%,45%)]"
              data-testid="button-confirm-import"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                "Import"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={!!selectedCandidate} onOpenChange={(open) => { if (!open) { setSelectedCandidate(null); setNewNote(""); } }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedCandidate && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <HardHat className="w-5 h-5 text-[hsl(36,90%,50%)]" />
                  {selectedCandidate.firstName} {selectedCandidate.lastName}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Status</Label>
                  <Select
                    value={selectedCandidate.status}
                    onValueChange={(val) => {
                      updateCandidateMutation.mutate({ id: selectedCandidate.id, status: val });
                      setSelectedCandidate({ ...selectedCandidate, status: val as RecruitingStatus });
                    }}
                  >
                    <SelectTrigger className="mt-1" data-testid="select-detail-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="border rounded-lg p-4 space-y-4" data-testid="section-availability">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[hsl(36,90%,50%)]" />
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Availability</Label>
                    {(() => {
                      const info = getAvailabilityInfo(selectedCandidate.availableBy);
                      if (info) return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${info.color}`}>{info.label}</span>;
                      return null;
                    })()}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Available By</Label>
                      <Input
                        type="date"
                        value={selectedCandidate.availableBy ? (() => { try { const d = new Date(selectedCandidate.availableBy); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; } catch { return ''; } })() : ''}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          updateCandidateMutation.mutate({ id: selectedCandidate.id, availableBy: val });
                          setSelectedCandidate({ ...selectedCandidate, availableBy: val ? new Date(val + 'T12:00:00') : null });
                        }}
                        className="mt-1"
                        data-testid="input-available-by"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Time Base</Label>
                      <Select
                        value={selectedCandidate.timeBase || "none"}
                        onValueChange={(val) => {
                          const tb = val === "none" ? null : val;
                          updateCandidateMutation.mutate({ id: selectedCandidate.id, timeBase: tb });
                          setSelectedCandidate({ ...selectedCandidate, timeBase: tb });
                        }}
                      >
                        <SelectTrigger className="mt-1" data-testid="select-time-base">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not Set</SelectItem>
                          <SelectItem value="full_time">Full-Time</SelectItem>
                          <SelectItem value="part_time">Part-Time</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {!selectedCandidate.availableBy && !selectedCandidate.timeBase && !selectedCandidate.availabilityEmail && !(selectedCandidate.availabilityCounties && (selectedCandidate.availabilityCounties as string[]).length > 0) && (
                    <p className="text-xs text-muted-foreground">
                      No availability data — import the DSA Availability List to populate or set manually above.
                    </p>
                  )}
                  {selectedCandidate.availabilityCounties && (selectedCandidate.availabilityCounties as string[]).length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Available Counties</Label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(selectedCandidate.availabilityCounties as string[]).map(county => (
                          <Badge key={county} variant="outline" className="text-[10px]">
                            {county}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedCandidate.availabilityEmail && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Email (from availability list)</Label>
                      <p className="font-medium mt-1 text-sm">
                        <a href={`mailto:${selectedCandidate.availabilityEmail}`} className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {selectedCandidate.availabilityEmail}
                        </a>
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Cert #</Label>
                    <p className="font-medium mt-1">{selectedCandidate.certNumber || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Expires</Label>
                    <p className="font-medium mt-1">{selectedCandidate.certExpDate || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">County</Label>
                    <p className="font-medium mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      {selectedCandidate.county || "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Phone</Label>
                    <p className="font-medium mt-1 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-muted-foreground" />
                      {selectedCandidate.phone ? (
                        <a href={`tel:${selectedCandidate.phone}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                          {selectedCandidate.phone}
                        </a>
                      ) : "—"}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Classes</Label>
                  <div className="flex gap-2 mt-1">
                    {selectedCandidate.class1 && (
                      <Badge className="bg-[hsl(216,32%,20%)] text-white">Class 1</Badge>
                    )}
                    {selectedCandidate.class2 && (
                      <Badge className="bg-[hsl(216,32%,30%)] text-white">Class 2</Badge>
                    )}
                    {selectedCandidate.class3 && (
                      <Badge className="bg-[hsl(216,32%,40%)] text-white">Class 3</Badge>
                    )}
                    {!selectedCandidate.class1 && !selectedCandidate.class2 && !selectedCandidate.class3 && (
                      <span className="text-muted-foreground text-sm">No classes</span>
                    )}
                  </div>
                </div>

                {selectedCandidate.status === "hired" && (
                  <div>
                    <Link href={`/company/team?addInspector=true&firstName=${encodeURIComponent(selectedCandidate.firstName)}&lastName=${encodeURIComponent(selectedCandidate.lastName)}&phone=${encodeURIComponent(selectedCandidate.phone || '')}&certNumber=${encodeURIComponent(selectedCandidate.certNumber || '')}&county=${encodeURIComponent(selectedCandidate.county || '')}`}>
                      <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                        data-testid="button-add-to-team"
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        Add to Team
                      </Button>
                    </Link>
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Notes</Label>
                  </div>

                  <div className="flex gap-2 mb-3">
                    <Textarea
                      placeholder="Add a note..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      className="min-h-[60px] text-sm"
                      data-testid="textarea-new-note"
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (newNote.trim() && selectedCandidate) {
                          addNoteMutation.mutate({ id: selectedCandidate.id, note: newNote.trim() });
                        }
                      }}
                      disabled={!newNote.trim() || addNoteMutation.isPending}
                      className="shrink-0 self-end bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] hover:bg-[hsl(36,90%,45%)]"
                      data-testid="button-add-note"
                    >
                      {addNoteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>

                  {isNotesLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No notes yet</p>
                  ) : (
                    <ScrollArea className="max-h-[300px]">
                      <div className="space-y-3">
                        {notes.map(note => (
                          <div key={note.id} className="border rounded-lg p-3 text-sm" data-testid={`note-${note.id}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-xs">
                                {note.user?.firstName && note.user?.lastName
                                  ? `${note.user.firstName} ${note.user.lastName}`
                                  : note.user?.email || "Unknown"}
                              </span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {note.createdAt ? new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                              </span>
                            </div>
                            <p className="text-muted-foreground whitespace-pre-wrap">{note.note}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </PageLayout>
  );
}

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Mail,
  ChevronRight,
  ArrowLeft,
  Loader2,
  ExternalLink,
  Search,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface OutlookEmail {
  id: string;
  subject: string;
  sender: string;
  senderEmail: string;
  receivedAt: string;
  bodyPreview: string;
  hasAttachments: boolean;
}

interface ExtractedContract {
  contractNumber: string | null;
  name: string | null;
  description: string | null;
  clientName: string | null;
  contractType: string | null;
  status: string | null;
  originalValue: string | null;
  bidDueDate: string | null;
  bidReleaseDate: string | null;
  awardDate: string | null;
  startDate: string | null;
  substantialCompletionDate: string | null;
  finalCloseoutDate: string | null;
  notes: string | null;
  agency: string | null;
  serviceType: string | null;
  questionDeadline: string | null;
  hasJobWalk: boolean | null;
  jobWalkDateTime: string | null;
  dsaClass: string | null;
}

type Step = "email-list" | "extracting" | "review";

interface ImportFromEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (data: ExtractedContract & { sourceEmailSubject: string; sourceEmailSender: string }) => void;
}

export function ImportFromEmailDialog({ open, onOpenChange, onImport }: ImportFromEmailDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("email-list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<OutlookEmail | null>(null);
  const [extracted, setExtracted] = useState<ExtractedContract | null>(null);

  const { data: status, isLoading: statusLoading } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/outlook/status"],
    enabled: open,
    staleTime: 30000,
  });

  const { data: emails, isLoading: emailsLoading, refetch: refetchEmails } = useQuery<OutlookEmail[]>({
    queryKey: ["/api/outlook/emails"],
    enabled: open && status?.connected === true,
    staleTime: 60000,
  });

  const extractMutation = useMutation({
    mutationFn: async ({ email }: { email: OutlookEmail }) => {
      // Fetch full body first
      const detail = await apiRequest("GET", `/api/outlook/emails/${email.id}`);
      const detailData = await detail.json();

      // Then extract
      const response = await apiRequest("POST", "/api/outlook/extract-contract", {
        emailText: detailData.body || detailData.bodyPreview,
        subject: detailData.subject,
        sender: detailData.sender,
      });
      const data = await response.json();
      return { extracted: data.extracted as ExtractedContract, email: detailData };
    },
    onSuccess: ({ extracted, email }) => {
      setExtracted(extracted);
      setStep("review");
    },
    onError: (error: any) => {
      toast({
        title: "Extraction Failed",
        description: error.message || "Could not extract contract data from this email.",
        variant: "destructive",
      });
      setStep("email-list");
    },
  });

  useEffect(() => {
    if (!open) {
      setStep("email-list");
      setSearchQuery("");
      setSelectedEmail(null);
      setExtracted(null);
    }
  }, [open]);

  const handleSelectEmail = (email: OutlookEmail) => {
    setSelectedEmail(email);
    setStep("extracting");
    extractMutation.mutate({ email });
  };

  const handleConfirm = () => {
    if (!extracted || !selectedEmail) return;
    onImport({
      ...extracted,
      sourceEmailSubject: selectedEmail.subject,
      sourceEmailSender: selectedEmail.sender,
    });
    onOpenChange(false);
  };

  const filteredEmails = (emails || []).filter((e) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.subject.toLowerCase().includes(q) ||
      e.sender.toLowerCase().includes(q) ||
      e.senderEmail.toLowerCase().includes(q) ||
      e.bodyPreview.toLowerCase().includes(q)
    );
  });

  const formatDate = (iso: string) => {
    try {
      return format(parseISO(iso), "MMM d, yyyy");
    } catch {
      return iso;
    }
  };

  const isLoading = statusLoading || (status?.connected && emailsLoading);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Import from Email
          </DialogTitle>
          <DialogDescription>
            {step === "email-list" && "Select an Outlook email to extract contract details."}
            {step === "extracting" && "AI is analyzing the email..."}
            {step === "review" && "Review and confirm the extracted contract data."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Not connected state */}
          {!statusLoading && !status?.connected && (
            <div className="py-8 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Mail className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Connect Your Outlook Account</h3>
                <p className="text-muted-foreground text-sm max-w-sm">
                  To import contracts from email, you need to connect your Microsoft Outlook account first.
                  Click below to authorize access.
                </p>
              </div>
              <Alert className="max-w-sm">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This requires a Microsoft Outlook integration. Please ask your workspace administrator to connect the Outlook integration in Replit.
                </AlertDescription>
              </Alert>
              <Button
                variant="outline"
                onClick={() => refetchEmails()}
                data-testid="button-retry-outlook-connection"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry Connection
              </Button>
            </div>
          )}

          {/* Loading status */}
          {statusLoading && (
            <div className="py-8 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Checking Outlook connection...</p>
            </div>
          )}

          {/* Email list step */}
          {!statusLoading && status?.connected && step === "email-list" && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search emails..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-email-search"
                />
              </div>

              {emailsLoading && (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-3 rounded-lg border space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  ))}
                </div>
              )}

              {!emailsLoading && filteredEmails.length === 0 && (
                <div className="py-8 text-center text-muted-foreground">
                  <Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No emails found</p>
                </div>
              )}

              {!emailsLoading && filteredEmails.length > 0 && (
                <div className="space-y-2">
                  {filteredEmails.map((email) => (
                    <button
                      key={email.id}
                      onClick={() => handleSelectEmail(email)}
                      className="w-full text-left p-3 rounded-lg border hover:bg-accent hover:border-primary/30 transition-colors group"
                      data-testid={`email-item-${email.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm truncate">{email.subject || "(No Subject)"}</span>
                            {email.hasAttachments && (
                              <Badge variant="outline" className="text-xs shrink-0">📎</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mb-1">
                            <span className="font-medium">{email.sender}</span>
                            {email.senderEmail && email.senderEmail !== email.sender && (
                              <span className="ml-1">&lt;{email.senderEmail}&gt;</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{email.bodyPreview}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(email.receivedAt)}
                          </span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Extracting step */}
          {step === "extracting" && (
            <div className="py-12 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-primary animate-pulse" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Analyzing Email</h3>
                <p className="text-muted-foreground text-sm max-w-xs">
                  AI is reading the email and extracting contract information. This takes a few seconds.
                </p>
              </div>
              {selectedEmail && (
                <div className="text-xs text-muted-foreground border rounded-md p-2 max-w-sm truncate">
                  📧 {selectedEmail.subject}
                </div>
              )}
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}

          {/* Review step */}
          {step === "review" && extracted && (
            <div className="space-y-4">
              <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700 dark:text-green-400">
                  Contract data extracted from: <strong>{selectedEmail?.subject}</strong>
                  <br />
                  <span className="text-xs">Fields highlighted in blue were auto-filled. You can edit them in the next step.</span>
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <ExtractedField label="Contract Number" value={extracted.contractNumber} />
                <ExtractedField label="Contract Name" value={extracted.name} />
                <ExtractedField label="Client" value={extracted.clientName} />
                <ExtractedField label="Contract Type" value={extracted.contractType?.replace(/_/g, " ")} />
                <ExtractedField label="Status" value={extracted.status?.replace(/_/g, " ")} />
                <ExtractedField label="Budget / Value" value={extracted.originalValue ? `$${extracted.originalValue}` : null} />
                <ExtractedField label="Agency" value={extracted.agency} />
                <ExtractedField label="Service Type" value={extracted.serviceType} />
                <ExtractedField
                  label="DSA Class"
                  value={
                    extracted.dsaClass === "1" ? "Class 1" :
                    extracted.dsaClass === "2" ? "Class 2" :
                    extracted.dsaClass === "3" ? "Class 3" :
                    extracted.dsaClass === "non_dsa" ? "Non-DSA" :
                    null
                  }
                />
                <ExtractedField label="Bid Release Date" value={extracted.bidReleaseDate} />
                <ExtractedField label="Bid Due Date" value={extracted.bidDueDate} />
                <ExtractedField label="Question Deadline" value={extracted.questionDeadline} />
                <ExtractedField
                  label="Job Walk Required"
                  value={extracted.hasJobWalk === true ? "Yes" : extracted.hasJobWalk === false ? "No" : null}
                />
                {extracted.hasJobWalk && (
                  <ExtractedField label="Job Walk Date / Time" value={extracted.jobWalkDateTime} />
                )}
                <ExtractedField label="Award Date" value={extracted.awardDate} />
                <ExtractedField label="Start Date" value={extracted.startDate} />
                <ExtractedField label="Substantial Completion" value={extracted.substantialCompletionDate} />
                <ExtractedField label="Final Closeout" value={extracted.finalCloseoutDate} />
              </div>

              {extracted.description && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</span>
                  <p className="text-sm bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-md p-2">{extracted.description}</p>
                </div>
              )}

              {extracted.notes && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</span>
                  <p className="text-sm bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-md p-2">{extracted.notes}</p>
                </div>
              )}

              {!extracted.contractNumber && !extracted.name && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    The AI could not extract contract details from this email. You can still proceed and fill in the form manually, or go back and select a different email.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 mt-2">
          {step === "email-list" && (
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-email-import">
              Cancel
            </Button>
          )}

          {step === "extracting" && (
            <Button
              variant="outline"
              onClick={() => {
                extractMutation.reset();
                setStep("email-list");
                setSelectedEmail(null);
              }}
              data-testid="button-cancel-extraction"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}

          {step === "review" && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("email-list");
                  setSelectedEmail(null);
                  setExtracted(null);
                }}
                data-testid="button-back-to-emails"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Choose Different Email
              </Button>
              <Button onClick={handleConfirm} data-testid="button-confirm-import">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Use This Data
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExtractedField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <p className="text-sm bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded px-2 py-1 font-medium">
        {value}
      </p>
    </div>
  );
}

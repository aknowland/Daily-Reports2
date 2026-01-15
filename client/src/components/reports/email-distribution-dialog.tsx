import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Mail, X, Plus, Loader2, Send } from "lucide-react";

interface EmailDistributionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  projectName?: string;
  defaultEmails?: string[];
}

export function EmailDistributionDialog({
  open,
  onOpenChange,
  reportId,
  projectName,
  defaultEmails = [],
}: EmailDistributionDialogProps) {
  const [emails, setEmails] = useState<string[]>(defaultEmails);
  const [currentEmail, setCurrentEmail] = useState("");
  const [message, setMessage] = useState("");
  const { toast } = useToast();

  const distributeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/reports/${reportId}/distribute`, {
        recipients: emails,
        message: message || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Report Sent",
        description: `Report emailed successfully to ${emails.length} recipient${emails.length === 1 ? '' : 's'}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/reports", reportId] });
      onOpenChange(false);
      setEmails([]);
      setMessage("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send",
        description: error.message || "Could not send the report. Please try again.",
        variant: "destructive",
      });
    },
  });

  const addEmail = () => {
    const trimmed = currentEmail.trim().toLowerCase();
    if (trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && !emails.includes(trimmed)) {
      setEmails([...emails, trimmed]);
      setCurrentEmail("");
    }
  };

  const removeEmail = (email: string) => {
    setEmails(emails.filter(e => e !== email));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEmail();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email Report
          </DialogTitle>
          <DialogDescription>
            Send the PDF report{projectName ? ` for ${projectName}` : ''} via email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="recipients">Recipients</Label>
            <div className="flex gap-2">
              <Input
                id="recipients"
                type="email"
                placeholder="Enter email address"
                value={currentEmail}
                onChange={(e) => setCurrentEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                data-testid="input-email-recipient"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={addEmail}
                disabled={!currentEmail.trim()}
                data-testid="button-add-email"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {emails.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {emails.map((email) => (
                  <Badge key={email} variant="secondary" className="gap-1">
                    {email}
                    <button
                      type="button"
                      onClick={() => removeEmail(email)}
                      className="ml-1 hover:text-destructive"
                      data-testid={`button-remove-email-${email}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message (Optional)</Label>
            <Textarea
              id="message"
              placeholder="Add a personal message to include with the report..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              data-testid="input-email-message"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-email"
          >
            Cancel
          </Button>
          <Button
            onClick={() => distributeMutation.mutate()}
            disabled={emails.length === 0 || distributeMutation.isPending}
            data-testid="button-send-email"
          >
            {distributeMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useQuery as useAuthQuery } from "@tanstack/react-query";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Bot,
  Shield,
} from "lucide-react";

type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  companyId: string;
  createdByUserId: string;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
};

type ApiKeyWithRaw = ApiKey & { rawKey?: string };

export default function ApiKeysPage() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyCreated, setNewKeyCreated] = useState<ApiKeyWithRaw | null>(null);

  const { data: profile } = useAuthQuery<any>({ queryKey: ["/api/profile"] });
  const { data: companies } = useAuthQuery<any[]>({ queryKey: ["/api/companies"] });

  const adminCompany = companies?.find((c: any) => c.role === "admin" || c.role === "owner");
  const companyId = adminCompany?.companyId || adminCompany?.company?.id;

  const { data: keys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/api-keys", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/api-keys?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load API keys");
      return res.json();
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/api-keys", { name, companyId });
      return res.json() as Promise<ApiKeyWithRaw>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys", companyId] });
      setNewKeyCreated(data);
      setNewKeyName("");
      setShowCreateDialog(false);
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to create API key", variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      await apiRequest("DELETE", `/api/api-keys/${keyId}?companyId=${companyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys", companyId] });
      setShowRevokeDialog(null);
      toast({ title: "API Key Revoked", description: "The key has been permanently revoked." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to revoke key", variant: "destructive" });
    },
  });

  const copyToClipboard = (text: string, label = "Copied") => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: label, description: "Copied to clipboard" });
    });
  };

  const openApiSpecUrl = `${window.location.origin}/api/v1/openapi.json`;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  if (!companyId) {
    return (
      <PageLayout>
        <PageHeader icon={Key} title="API Keys" subtitle="Manage API keys for Custom GPT integration" />
        <div className="container px-4 py-8 mx-auto max-w-3xl">
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              You must be a company admin to manage API keys.
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <PageHeader icon={Key} title="API Keys" subtitle="Connect your Custom GPT to access project data" />

      <div className="container px-4 py-6 mx-auto max-w-3xl space-y-6">

        {/* How it works */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="w-4 h-4 text-[hsl(36,90%,50%)]" />
              Set Up Your Custom GPT Action
            </CardTitle>
            <CardDescription>
              Use these steps to connect this app to a Custom GPT in ChatGPT
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-3">
              {[
                { step: "1", text: "Create an API key below and copy it" },
                { step: "2", text: "In ChatGPT, go to Explore GPTs → Create → Configure → Add Action" },
                { step: "3", text: "Import the OpenAPI schema using the URL below" },
                { step: "4", text: "Under Authentication, choose API Key → Bearer and paste your key" },
              ].map(({ step, text }) => (
                <div key={step} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] text-xs font-bold flex items-center justify-center">
                    {step}
                  </span>
                  <span className="text-muted-foreground">{text}</span>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">OpenAPI Schema URL</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-3 py-2 rounded border truncate" data-testid="text-openapi-url">
                  {openApiSpecUrl}
                </code>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(openApiSpecUrl, "URL Copied")} data-testid="button-copy-openapi-url">
                  <Copy className="w-3 h-3" />
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={openApiSpecUrl} target="_blank" rel="noopener noreferrer" data-testid="link-openapi-spec">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key revealed banner */}
        {newKeyCreated && (
          <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-semibold">
                <CheckCircle className="w-4 h-4" />
                API Key Created — Save it now, it won't be shown again
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white dark:bg-black px-3 py-2 rounded border font-mono truncate" data-testid="text-new-api-key">
                  {newKeyCreated.rawKey}
                </code>
                <Button size="sm" onClick={() => copyToClipboard(newKeyCreated.rawKey!, "API Key Copied")} data-testid="button-copy-new-key">
                  <Copy className="w-3 h-3 mr-1" />
                  Copy
                </Button>
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setNewKeyCreated(null)}>
                I've saved my key, dismiss this
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Keys list */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shield className="w-4 h-4" />
                  Active API Keys
                </CardTitle>
                <CardDescription>Keys are scoped to your company's data only</CardDescription>
              </div>
              <Button
                size="sm"
                className="bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] hover:bg-[hsl(36,90%,45%)] font-semibold"
                onClick={() => setShowCreateDialog(true)}
                data-testid="button-create-key"
              >
                <Plus className="w-4 h-4 mr-1" />
                New Key
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading keys...
              </div>
            ) : keys.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No API keys yet. Create one to connect your Custom GPT.
              </div>
            ) : (
              <div className="divide-y">
                {keys.map((key) => (
                  <div key={key.id} className="flex items-center justify-between py-3 gap-4" data-testid={`row-api-key-${key.id}`}>
                    <div className="min-w-0">
                      <div className="font-medium text-sm" data-testid={`text-key-name-${key.id}`}>{key.name}</div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <code className="text-xs text-muted-foreground font-mono" data-testid={`text-key-prefix-${key.id}`}>
                          {key.keyPrefix}...
                        </code>
                        <span className="text-xs text-muted-foreground">
                          Created {formatDate(key.createdAt)}
                        </span>
                        {key.lastUsedAt && (
                          <span className="text-xs text-muted-foreground">
                            Last used {formatDate(key.lastUsedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="outline" className="text-green-600 border-green-600/30 bg-green-50 dark:bg-green-950/20 text-xs">
                        Active
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setShowRevokeDialog(key.id)}
                        data-testid={`button-revoke-key-${key.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* What the GPT can access */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What Your GPT Can Access</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            {[
              { label: "Projects", desc: "List and view all projects in your company" },
              { label: "Daily Reports", desc: "Read reports filtered by project, date range, or report ID" },
              { label: "Contracts", desc: "View contract names, statuses, and associated projects" },
              { label: "Summary", desc: "Get a high-level activity overview for quick status checks" },
            ].map(({ label, desc }) => (
              <div key={label} className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <div><span className="font-medium text-foreground">{label}</span> — {desc}</div>
              </div>
            ))}
            <p className="pt-2 text-xs border-t mt-3">All access is read-only. API keys cannot create, modify, or delete any data.</p>
          </CardContent>
        </Card>
      </div>

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Give your key a descriptive name (e.g. "My Construction GPT"). You'll only see the key value once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="key-name">Key Name</Label>
              <Input
                id="key-name"
                placeholder="e.g. My Construction GPT"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newKeyName.trim()) createMutation.mutate(newKeyName.trim()); }}
                data-testid="input-key-name"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(newKeyName.trim())}
              disabled={!newKeyName.trim() || createMutation.isPending}
              className="bg-[hsl(36,90%,50%)] text-[hsl(216,32%,10%)] hover:bg-[hsl(36,90%,45%)] font-semibold"
              data-testid="button-confirm-create-key"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation dialog */}
      <Dialog open={!!showRevokeDialog} onOpenChange={() => setShowRevokeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              Revoke API Key
            </DialogTitle>
            <DialogDescription>
              This will permanently revoke the key. Any GPT or integration using it will stop working immediately. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevokeDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => showRevokeDialog && revokeMutation.mutate(showRevokeDialog)}
              disabled={revokeMutation.isPending}
              data-testid="button-confirm-revoke"
            >
              {revokeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Revoke Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}

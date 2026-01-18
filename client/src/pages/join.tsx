import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound, ArrowRight, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function JoinPage() {
  const [, setLocation] = useLocation();
  const [inviteCode, setInviteCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const code = inviteCode.trim().toUpperCase();
    if (!code || code.length !== 8) {
      setError("Please enter a valid 8-character invite code");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`/api/invites/code/${code}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Failed to find invite");
        setIsLoading(false);
        return;
      }

      setLocation(`/accept-invite/${data.token}`);
    } catch (err) {
      setError("Failed to lookup invite code. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Join with Invite Code</CardTitle>
          <CardDescription>
            Enter the 8-character invite code from your invitation email
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="inviteCode">Invite Code</Label>
              <Input
                id="inviteCode"
                type="text"
                placeholder="ABC12DEF"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                maxLength={8}
                className="text-center text-2xl font-mono tracking-widest uppercase"
                autoComplete="off"
                autoFocus
                data-testid="input-invite-code"
              />
              <p className="text-xs text-muted-foreground text-center">
                The code is case-insensitive
              </p>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || inviteCode.length !== 8}
              data-testid="button-submit-code"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Looking up...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>

            <div className="text-center pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setLocation("/")}
                data-testid="button-go-home"
              >
                Back to Home
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

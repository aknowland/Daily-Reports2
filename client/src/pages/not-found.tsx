import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HardHat, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <HardHat className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold mb-2">404</h1>
          <p className="text-xl font-medium mb-2">Page Not Found</p>
          <p className="text-muted-foreground mb-6">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="outline" asChild data-testid="button-go-back">
              <a onClick={() => window.history.back()} className="cursor-pointer">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Back
              </a>
            </Button>
            <Button asChild data-testid="button-go-home">
              <Link href="/">
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

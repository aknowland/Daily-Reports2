import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Megaphone, Calendar, CheckCircle2 } from "lucide-react";
import type { InspectorAnnouncement } from "@shared/schema";

type FeedEntry = InspectorAnnouncement & { isRead: boolean };

export default function AnnouncementsFeedPage() {
  const { data: announcements = [], isLoading } = useQuery<FeedEntry[]>({
    queryKey: ["/api/announcements/feed"],
    staleTime: 30000,
  });

  const readMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/announcements/${id}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/feed"] });
    },
  });

  // Auto-mark all visible unread announcements as read when the page opens
  useEffect(() => {
    if (announcements.length === 0) return;
    const unread = announcements.filter((a) => !a.isRead);
    unread.forEach((a) => {
      readMutation.mutate(a.id);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcements.length]);

  return (
    <PageLayout>
      <PageHeader title="Announcements">
        <span className="text-sm text-muted-foreground">
          Company announcements from your admin team
        </span>
      </PageHeader>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : announcements.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Megaphone className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No announcements</p>
            <p className="text-sm text-muted-foreground">
              Your company hasn't sent any announcements yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => (
            <Card
              key={a.id}
              className={a.isRead ? "" : "border-amber-400 dark:border-amber-600"}
              data-testid={`card-announcement-${a.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {!a.isRead && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-1" />
                      )}
                      <h3 className="font-semibold" data-testid={`text-announcement-title-${a.id}`}>
                        {a.title}
                      </h3>
                      {a.isRead && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-sm mt-2 whitespace-pre-wrap">{a.body}</p>
                    <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {a.sentAt
                          ? new Date(a.sentAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                              timeZone: "America/Los_Angeles",
                            })
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageLayout>
  );
}

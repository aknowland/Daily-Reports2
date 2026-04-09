import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { format } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  CloudSun,
  AlertTriangle,
  Camera,
  FileText,
  Shield,
  MapPin,
  Clock,
  FolderKanban,
  Download,
  ClipboardList,
  HardHat,
  LogOut,
} from "lucide-react";

interface MeetingMinute {
  id: string;
  title: string;
  meetingDate: string;
  meetingType: string;
  pdfPath: string | null;
}

interface ProjectDetail {
  project: {
    id: string;
    name: string;
    projectNumber: string | null;
    address: string | null;
    client: string | null;
    startDate: string | null;
    substantialCompletionDate: string | null;
  };
  company: {
    name: string | null;
    logoPath: string | null;
  };
  schedule: {
    progress: number;
    startDate: string | null;
    endDate: string | null;
  };
  reports: Array<{
    id: string;
    date: string;
    reportNumber: string | null;
    weather: string | null;
    temperature: string | null;
    inspectorName: string | null;
    status: string;
    pdfPath: string | null;
  }>;
  totalReports: number;
  photos: Array<{
    id: string;
    url: string;
    caption: string | null;
    reportDate: string;
  }>;
  issues: Array<{
    description?: string;
    issue?: string;
    status?: string;
    reportDate: string;
  }>;
  safetyIncidents: Array<{
    description?: string;
    incident?: string;
    reportDate: string;
  }>;
  weatherSummary: Array<{
    date: string;
    weather: string | null;
    temperature: string | null;
  }>;
  hoursUsed: number;
  budgetedHours: number | null;
  meetingMinutes: MeetingMinute[];
}

function getReportStatusClasses(status: string) {
  switch (status) {
    case "submitted":
    case "signed":
      return "bg-green-600/15 text-green-700 border-green-600/30";
    case "draft":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getIssueStatusClasses(status: string) {
  switch (status?.toLowerCase()) {
    case "open":
      return "bg-red-600/15 text-red-700 border-red-600/30";
    case "resolved":
    case "closed":
      return "bg-green-600/15 text-green-700 border-green-600/30";
    case "in_progress":
    case "in progress":
      return "bg-amber-600/15 text-amber-700 border-amber-600/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatDateSafe(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "MMM d, yyyy");
  } catch {
    return "—";
  }
}

function formatDateShort(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "MMM d");
  } catch {
    return "—";
  }
}

function getWeatherLabel(condition: string | null) {
  if (!condition) return "Unknown";
  return condition
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function SectionHeader({ title, children, className = "" }: { title: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between mb-3 ${className}`}>
      <h3 className="text-base font-semibold uppercase tracking-wider text-[hsl(220,55%,16%)] dark:text-foreground border-l-4 border-[hsl(38,92%,50%)] pl-3">
        {title}
      </h3>
      {children}
    </div>
  );
}

function PortalHeader({ companyName, companyLogo }: { companyName: string; companyLogo: string | null }) {
  return (
    <header className="sticky top-0 z-40 w-full bg-[hsl(220,55%,16%)] text-white border-b-4 border-[hsl(38,92%,50%)]">
      <div className="flex h-14 items-center justify-between gap-4 px-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          {companyLogo ? (
            <img src={companyLogo} alt={companyName} className="h-8 w-8 object-contain" />
          ) : (
            <div className="w-8 h-8 bg-[hsl(38,92%,50%)] flex items-center justify-center flex-shrink-0">
              <HardHat className="w-5 h-5 text-[hsl(220,55%,10%)]" />
            </div>
          )}
          <span className="font-bold text-sm tracking-widest uppercase hidden sm:inline">{companyName || "Client Portal"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/client-portal">
            <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/10" data-testid="button-back-portal">
              <ArrowLeft className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Portal</span>
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="text-white/80 hover:text-white hover:bg-white/10"
            onClick={() => { window.location.href = "/api/logout"; }}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

export default function PortalProjectPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const { data, isLoading } = useQuery<ProjectDetail>({
    queryKey: ["/api/client-portal/projects", projectId],
    enabled: !!projectId,
  });

  const visiblePhotos =
    data?.photos && !showAllPhotos
      ? data.photos.slice(0, 12)
      : data?.photos || [];

  const lightboxPhotos = (data?.photos || []).map((p, i) => ({
    id: i,
    path: p.url,
    caption: p.caption,
    reportDate: formatDateSafe(p.reportDate),
  }));

  const last7Weather = (data?.weatherSummary || []).slice(0, 7);
  const companyName = data?.company?.name || "";
  const companyLogo = data?.company?.logoPath || null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" data-testid="portal-project-loading">
        <PortalHeader companyName={companyName} companyLogo={companyLogo} />
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-6">
          <Card className="rounded-none shadow-sm">
            <CardContent className="p-5 space-y-4">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-4 w-1/3" />
            </CardContent>
          </Card>
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-5 w-40" />
              <Card className="rounded-none shadow-sm">
                <CardContent className="p-5 space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background" data-testid="portal-project-error">
        <PortalHeader companyName={companyName} companyLogo={companyLogo} />
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6">
          <Card className="rounded-none shadow-sm">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">
                Unable to load project details. Please try again later.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { project, schedule, reports, photos, issues, safetyIncidents, weatherSummary } = data;
  const hoursUsed = data.hoursUsed ?? 0;
  const budgetedHours = data.budgetedHours ?? null;
  const hoursPercent = budgetedHours && budgetedHours > 0 ? Math.min(100, Math.round((hoursUsed / budgetedHours) * 100)) : null;
  const meetingMinutes = data.meetingMinutes ?? [];

  return (
    <div className="min-h-screen bg-background" data-testid="portal-project">
      <PortalHeader companyName={companyName} companyLogo={companyLogo} />

      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-8">
        <Card className="rounded-none shadow-sm" data-testid="card-project-overview">
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1">
                <h2
                  className="text-lg font-semibold text-[hsl(216,32%,15%)] dark:text-foreground"
                  data-testid="text-project-name"
                >
                  {project.name}
                </h2>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span data-testid="text-project-location">{project.address || "N/A"}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                  <span data-testid="text-project-created">
                    Started {formatDateSafe(project.startDate)}
                  </span>
                </div>
              </div>
              {project.client && (
                <span
                  className="text-sm text-muted-foreground flex-shrink-0"
                  data-testid="text-project-client"
                >
                  {project.client}
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Schedule Progress</span>
                <span className="font-medium" data-testid="text-schedule-progress">
                  {schedule.progress}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-[hsl(36,90%,50%)] rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(0, schedule.progress))}%`,
                  }}
                  data-testid="progress-bar-schedule"
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatDateSafe(schedule.startDate)}</span>
                <span>{formatDateSafe(schedule.endDate)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Hours Summary Card */}
        {(budgetedHours !== null || hoursUsed > 0) && (
          <Card className="rounded-none shadow-sm" data-testid="card-hours-summary">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Hours Summary</h3>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Hours Used</span>
                <span className="font-semibold" data-testid="text-hours-used">
                  {hoursUsed.toFixed(1)} hrs
                  {budgetedHours !== null && ` / ${budgetedHours.toFixed(0)} budgeted`}
                </span>
              </div>
              {hoursPercent !== null && (
                <>
                  <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${hoursPercent >= 90 ? "bg-red-500" : hoursPercent >= 75 ? "bg-amber-500" : "bg-[hsl(36,90%,50%)]"}`}
                      style={{ width: `${hoursPercent}%` }}
                      data-testid="progress-bar-hours"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-right" data-testid="text-hours-percent">
                    {hoursPercent}% of budget used
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <div>
          <SectionHeader title="Recent Reports">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <FileText className="w-4 h-4" />
              <span data-testid="text-report-count">{data.totalReports} reports</span>
            </div>
          </SectionHeader>
          {reports.length === 0 ? (
            <Card className="rounded-none shadow-sm">
              <CardContent className="p-6 text-center text-muted-foreground" data-testid="empty-reports">
                No reports submitted yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {reports.map((report) => (
                <Card
                  key={report.id}
                  className="rounded-none shadow-sm"
                  data-testid={`card-report-${report.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded bg-[hsl(36,90%,50%)]/10 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-[hsl(36,90%,50%)]" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="font-medium text-sm"
                              data-testid={`text-report-date-${report.id}`}
                            >
                              {formatDateSafe(report.date)}
                            </span>
                            <Badge
                              variant="outline"
                              className={`${getReportStatusClasses(report.status)} capitalize text-xs no-default-hover-elevate no-default-active-elevate`}
                              data-testid={`badge-report-status-${report.id}`}
                            >
                              {report.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                            <span data-testid={`text-report-inspector-${report.id}`}>
                              {report.inspectorName}
                            </span>
                            {report.weather && (
                              <span className="flex items-center gap-1">
                                <CloudSun className="w-3 h-3" />
                                {getWeatherLabel(report.weather)}
                                {report.temperature != null && ` ${report.temperature}°`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {report.pdfPath && (
                        <a
                          href={report.pdfPath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0"
                          data-testid={`link-report-pdf-${report.id}`}
                        >
                          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                            <Download className="w-3.5 h-3.5" />
                            PDF
                          </Button>
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionHeader title="Photos">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground" data-testid="text-photo-count">
                {photos.length} photos
              </span>
              {photos.length > 12 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllPhotos(!showAllPhotos)}
                  data-testid="button-toggle-photos"
                >
                  {showAllPhotos ? "Show Less" : "View All"}
                </Button>
              )}
            </div>
          </SectionHeader>
          {photos.length === 0 ? (
            <Card className="rounded-none shadow-sm">
              <CardContent className="p-6 text-center text-muted-foreground" data-testid="empty-photos">
                No photos available.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {visiblePhotos.map((photo, index) => (
                <div
                  key={index}
                  className="group cursor-pointer"
                  onClick={() => {
                    setLightboxIndex(index);
                    setLightboxOpen(true);
                  }}
                  data-testid={`photo-thumbnail-${index}`}
                >
                  <Card className="rounded-none shadow-sm hover-elevate">
                    <div className="aspect-square bg-muted">
                      <img
                        src={photo.url}
                        alt={photo.caption || "Project photo"}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <CardContent className="p-2">
                      {photo.caption && (
                        <p
                          className="text-xs font-medium truncate"
                          data-testid={`text-photo-caption-${index}`}
                        >
                          {photo.caption}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatDateShort(photo.reportDate)}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Meeting Minutes */}
        <div>
          <SectionHeader title="Meeting Minutes">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ClipboardList className="w-4 h-4" />
              <span data-testid="text-meetings-count">{meetingMinutes.length} {meetingMinutes.length === 1 ? "meeting" : "meetings"}</span>
            </div>
          </SectionHeader>
          {meetingMinutes.length === 0 ? (
            <Card className="rounded-none shadow-sm">
              <CardContent className="p-6 text-center text-muted-foreground" data-testid="empty-meetings">
                No meeting minutes available.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {meetingMinutes.map((meeting) => (
                <Card key={meeting.id} className="rounded-none shadow-sm" data-testid={`card-meeting-${meeting.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                          <ClipboardList className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm capitalize" data-testid={`text-meeting-title-${meeting.id}`}>
                            {meeting.meetingType.replace(/_/g, " ")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateSafe(meeting.meetingDate)}
                          </p>
                        </div>
                      </div>
                      {meeting.pdfPath && (
                        <a
                          href={meeting.pdfPath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0"
                          data-testid={`link-meeting-pdf-${meeting.id}`}
                        >
                          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                            <Download className="w-3.5 h-3.5" />
                            PDF
                          </Button>
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionHeader title="Issues">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <AlertTriangle className="w-4 h-4" />
              <span data-testid="text-issue-count">{issues.length} issues</span>
            </div>
          </SectionHeader>
          {issues.length === 0 ? (
            <Card className="rounded-none shadow-sm">
              <CardContent className="p-6 text-center text-muted-foreground" data-testid="empty-issues">
                No issues reported.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {issues.map((issue, index) => (
                <Card
                  key={index}
                  className="rounded-none shadow-sm"
                  data-testid={`card-issue-${index}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-8 h-8 rounded bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                        </div>
                        <div className="min-w-0">
                          <p
                            className="text-sm"
                            data-testid={`text-issue-description-${index}`}
                          >
                            {issue.description || issue.issue}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-muted-foreground">
                              {formatDateSafe(issue.reportDate)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`${getIssueStatusClasses(issue.status || "")} capitalize text-xs flex-shrink-0 no-default-hover-elevate no-default-active-elevate`}
                        data-testid={`badge-issue-status-${index}`}
                      >
                        {issue.status?.replace(/_/g, " ") || "Unknown"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionHeader title="Safety Incidents">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Shield className="w-4 h-4" />
              <span data-testid="text-safety-count">{safetyIncidents.length} incidents</span>
            </div>
          </SectionHeader>
          {safetyIncidents.length === 0 ? (
            <Card className="rounded-none shadow-sm">
              <CardContent className="p-6 text-center text-muted-foreground" data-testid="empty-safety">
                No safety incidents reported.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {safetyIncidents.map((incident, index) => (
                <Card
                  key={index}
                  className="rounded-none shadow-sm border-red-500/30"
                  data-testid={`card-safety-${index}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Shield className="w-4 h-4 text-red-600" />
                      </div>
                      <div className="min-w-0">
                        <p
                          className="text-sm text-red-700 dark:text-red-400"
                          data-testid={`text-safety-description-${index}`}
                        >
                          {incident.description || incident.incident}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDateSafe(incident.reportDate)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionHeader title="Weather Summary">
            <span className="text-sm text-muted-foreground">Last 7 days</span>
          </SectionHeader>
          {last7Weather.length === 0 ? (
            <Card className="rounded-none shadow-sm">
              <CardContent className="p-6 text-center text-muted-foreground" data-testid="empty-weather">
                No weather data available.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {last7Weather.map((w, index) => (
                <Card
                  key={index}
                  className="rounded-none shadow-sm"
                  data-testid={`card-weather-${index}`}
                >
                  <CardContent className="p-3 text-center space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {formatDateShort(w.date)}
                    </p>
                    <CloudSun className="w-5 h-5 mx-auto text-[hsl(36,90%,50%)]" />
                    <p className="text-xs capitalize" data-testid={`text-weather-condition-${index}`}>
                      {getWeatherLabel(w.weather)}
                    </p>
                    {w.temperature != null && (
                      <p
                        className="text-sm font-semibold"
                        data-testid={`text-weather-temp-${index}`}
                      >
                        {w.temperature}°
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <PhotoLightbox
        photos={lightboxPhotos}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
      />
    </div>
  );
}

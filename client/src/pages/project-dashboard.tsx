import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useParams, Link } from "wouter";
import {
  ArrowLeft,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Users,
  Activity,
  Image,
  AlertCircle,
  ShieldAlert,
  Cloud,
  Sun,
  CloudRain,
  Wind,
  Snowflake,
  MapPin,
  Building2,
  Hash,
  Flag,
  Mail,
} from "lucide-react";
import { format } from "date-fns";

type ProjectDashboardData = {
  project: {
    id: string;
    name: string;
    projectNumber: string;
    address: string | null;
    client: string | null;
    clientInfo: {
      name: string;
      contactName: string | null;
      contactEmail: string | null;
    } | null;
    startDate: string | null;
    substantialCompletionDate: string | null;
    finalCloseoutDate: string | null;
    distributionEmails: string[] | null;
  };
  schedule: {
    progress: number;
    status: 'not_started' | 'on_track' | 'warning' | 'overdue' | 'complete';
    daysRemaining: number | null;
    daysOverdue: number | null;
    startDate: string | null;
    endDate: string | null;
  };
  hours: {
    budgeted: number;
    baseBudget: number;
    used: number;
    remaining: number;
    progress: number;
    status: 'under' | 'on_track' | 'warning' | 'over';
    breakdown: {
      regular: number;
      overtime: number;
      premium: number;
    };
  };
  dailyReports: {
    id: string;
    date: string;
    status: string;
    weatherType: string | null;
    regularHours: string | null;
    otHours: string | null;
    signedAt: string | null;
  }[];
  activityTimeline: {
    id: string;
    type: 'report';
    date: string;
    title: string;
    description: string;
    status: string | null;
    inspectorId: string;
  }[];
  photoGallery: {
    id: string;
    path: string;
    caption: string | null;
    reportDate: string;
    createdAt: string | null;
  }[];
  issuesSummary: {
    totalCount: number;
    recentIssues: {
      id: string;
      date: string;
      details: string | null;
    }[];
  };
  safetySummary: {
    totalCount: number;
    recentIncidents: {
      id: string;
      date: string;
      details: string | null;
    }[];
  };
  weatherSummary: {
    totalReports: number;
    breakdown: {
      type: string;
      count: number;
      percentage: number;
    }[];
    recentWeather: {
      date: string;
      type: string | null;
      notes: string | null;
    }[];
  };
  teamOverview: {
    inspectorId: string;
    name: string;
    regular: number;
    overtime: number;
    premium: number;
    reportCount: number;
    totalHours: number;
  }[];
  upcomingMilestones: {
    date: string;
    label: string;
    type: string;
    daysUntil: number;
    isPast: boolean;
  }[];
};

const getWeatherIcon = (type: string | null) => {
  switch (type?.toLowerCase()) {
    case 'clear':
    case 'sunny':
      return <Sun className="w-4 h-4 text-yellow-500" />;
    case 'cloudy':
    case 'overcast':
    case 'partly_cloudy':
      return <Cloud className="w-4 h-4 text-gray-500" />;
    case 'rain':
    case 'rainy':
      return <CloudRain className="w-4 h-4 text-blue-500" />;
    case 'windy':
      return <Wind className="w-4 h-4 text-cyan-500" />;
    case 'snow':
    case 'snowy':
      return <Snowflake className="w-4 h-4 text-blue-300" />;
    default:
      return <Cloud className="w-4 h-4 text-gray-400" />;
  }
};

const getScheduleStatusColor = (status: string) => {
  switch (status) {
    case 'on_track':
      return 'bg-green-500';
    case 'warning':
      return 'bg-yellow-500';
    case 'overdue':
      return 'bg-red-500';
    case 'complete':
      return 'bg-blue-500';
    default:
      return 'bg-gray-500';
  }
};

const getHoursStatusColor = (status: string) => {
  switch (status) {
    case 'under':
      return 'bg-green-500';
    case 'on_track':
      return 'bg-blue-500';
    case 'warning':
      return 'bg-yellow-500';
    case 'over':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
};

export default function ProjectDashboardPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery<ProjectDashboardData>({
    queryKey: ['/api/projects', id, 'dashboard'],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <PageLayout title="Project Dashboard">
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error || !data) {
    return (
      <PageLayout title="Project Dashboard">
        <div className="flex flex-col items-center justify-center py-12">
          <AlertCircle className="w-12 h-12 text-destructive mb-4" />
          <h2 className="text-lg font-semibold">Failed to load project dashboard</h2>
          <p className="text-muted-foreground">Please try again later</p>
          <Button asChild className="mt-4">
            <Link href="/my-projects">Back to Projects</Link>
          </Button>
        </div>
      </PageLayout>
    );
  }

  const { project, schedule, hours, dailyReports, activityTimeline, photoGallery, issuesSummary, safetySummary, weatherSummary, teamOverview, upcomingMilestones } = data;

  return (
    <PageLayout title={project.name}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/my-projects">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Projects
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate" data-testid="text-project-name">{project.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-1">
              {project.projectNumber && (
                <span className="flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  {project.projectNumber}
                </span>
              )}
              {project.client && (
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {project.client}
                </span>
              )}
              {project.address && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {project.address}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card data-testid="card-schedule-progress">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Schedule Progress</CardTitle>
              <Calendar className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{Math.round(schedule.progress)}%</span>
                  <Badge variant={schedule.status === 'on_track' ? 'default' : schedule.status === 'warning' ? 'secondary' : schedule.status === 'overdue' ? 'destructive' : 'outline'}>
                    {schedule.status.replace('_', ' ')}
                  </Badge>
                </div>
                <Progress value={schedule.progress} className={getScheduleStatusColor(schedule.status)} />
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  {schedule.startDate && (
                    <div>
                      <span className="font-medium">Start:</span>{' '}
                      {format(new Date(schedule.startDate), 'MMM d, yyyy')}
                    </div>
                  )}
                  {schedule.endDate && (
                    <div>
                      <span className="font-medium">End:</span>{' '}
                      {format(new Date(schedule.endDate), 'MMM d, yyyy')}
                    </div>
                  )}
                </div>
                {schedule.daysRemaining !== null && schedule.daysRemaining > 0 && (
                  <div className="text-sm">
                    <span className="font-medium text-green-600">{schedule.daysRemaining}</span> days remaining
                  </div>
                )}
                {schedule.daysOverdue !== null && schedule.daysOverdue > 0 && (
                  <div className="text-sm text-red-600">
                    <span className="font-medium">{schedule.daysOverdue}</span> days overdue
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-hours-budget">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Hours Budget</CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{hours.used.toFixed(1)} hrs</span>
                  <Badge variant={hours.status === 'under' || hours.status === 'on_track' ? 'default' : hours.status === 'warning' ? 'secondary' : 'destructive'}>
                    {hours.status === 'under' ? 'On Track' : hours.status.replace('_', ' ')}
                  </Badge>
                </div>
                {hours.budgeted > 0 && (
                  <>
                    <Progress value={Math.min(hours.progress, 100)} className={getHoursStatusColor(hours.status)} />
                    <div className="text-xs text-muted-foreground">
                      {hours.remaining.toFixed(1)} hrs remaining of {hours.budgeted.toFixed(1)} budgeted
                    </div>
                  </>
                )}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center p-2 bg-muted rounded">
                    <div className="font-medium">{hours.breakdown.regular.toFixed(1)}</div>
                    <div className="text-muted-foreground">Regular</div>
                  </div>
                  <div className="text-center p-2 bg-muted rounded">
                    <div className="font-medium">{hours.breakdown.overtime.toFixed(1)}</div>
                    <div className="text-muted-foreground">OT</div>
                  </div>
                  <div className="text-center p-2 bg-muted rounded">
                    <div className="font-medium">{hours.breakdown.premium.toFixed(1)}</div>
                    <div className="text-muted-foreground">Premium</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-daily-reports">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Daily Reports</CardTitle>
              <FileText className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-2">{dailyReports.length}</div>
              <div className="text-sm text-muted-foreground mb-3">Total reports submitted</div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {dailyReports.slice(0, 5).map((report) => (
                  <Link
                    key={report.id}
                    href={`/reports/${report.id}`}
                    className="flex items-center justify-between text-xs p-2 bg-muted rounded hover-elevate cursor-pointer"
                  >
                    <span>{format(new Date(report.date), 'MMM d, yyyy')}</span>
                    <div className="flex items-center gap-2">
                      {getWeatherIcon(report.weatherType)}
                      <Badge variant="outline" className="text-xs">
                        {parseFloat(report.regularHours || '0').toFixed(1)} hrs
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {upcomingMilestones.length > 0 && (
            <Card data-testid="card-milestones">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Upcoming Milestones</CardTitle>
                <Flag className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {upcomingMilestones.slice(0, 5).map((milestone, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {milestone.isPast ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : milestone.daysUntil <= 7 ? (
                          <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        ) : (
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className={milestone.isPast ? 'text-muted-foreground' : ''}>{milestone.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {milestone.isPast ? (
                          <span className="text-green-600">Completed</span>
                        ) : (
                          `${milestone.daysUntil} days`
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {teamOverview.length > 0 && (
            <Card data-testid="card-team-overview">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Team Hours</CardTitle>
                <Users className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {teamOverview.slice(0, 5).map((inspector) => (
                    <div key={inspector.inspectorId} className="flex items-center justify-between text-sm">
                      <span className="truncate max-w-[120px]">{inspector.name}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {inspector.reportCount} reports
                        </Badge>
                        <span className="font-medium">{inspector.totalHours.toFixed(1)} hrs</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card data-testid="card-weather-summary">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Weather Summary</CardTitle>
              <Cloud className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {weatherSummary.breakdown.slice(0, 5).map((weather) => (
                  <div key={weather.type} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {getWeatherIcon(weather.type)}
                      <span className="capitalize">{weather.type.replace('_', ' ')}</span>
                    </div>
                    <span className="text-muted-foreground">{weather.percentage}%</span>
                  </div>
                ))}
                {weatherSummary.breakdown.length === 0 && (
                  <p className="text-sm text-muted-foreground">No weather data available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card data-testid="card-issues">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Issues Reported</CardTitle>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-muted-foreground" />
                {issuesSummary.totalCount > 0 && (
                  <Badge variant="secondary">{issuesSummary.totalCount}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {issuesSummary.recentIssues.length > 0 ? (
                <div className="space-y-3 max-h-40 overflow-y-auto">
                  {issuesSummary.recentIssues.map((issue) => (
                    <div key={issue.id} className="text-sm p-2 bg-muted rounded">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(issue.date), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <p className="text-xs line-clamp-2">{issue.details || 'No details provided'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  No issues reported
                </p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-safety">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Safety Incidents</CardTitle>
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                {safetySummary.totalCount > 0 && (
                  <Badge variant="destructive">{safetySummary.totalCount}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {safetySummary.recentIncidents.length > 0 ? (
                <div className="space-y-3 max-h-40 overflow-y-auto">
                  {safetySummary.recentIncidents.map((incident) => (
                    <div key={incident.id} className="text-sm p-2 bg-red-50 dark:bg-red-950 rounded border border-red-200 dark:border-red-800">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(incident.date), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <p className="text-xs line-clamp-2">{incident.details || 'No details provided'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  No safety incidents reported
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card data-testid="card-activity">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
              <Activity className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {activityTimeline.length > 0 ? (
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {activityTimeline.map((activity) => (
                    <Link
                      key={activity.id}
                      href={`/reports/${activity.id}`}
                      className="flex items-start gap-3 text-sm p-2 bg-muted rounded hover-elevate cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{activity.title}</p>
                        <p className="text-xs text-muted-foreground">{activity.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(activity.date), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {activity.status}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No recent activity</p>
              )}
            </CardContent>
          </Card>

          {photoGallery.length > 0 && (
            <Card data-testid="card-photos">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Recent Photos</CardTitle>
                <Image className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {photoGallery.slice(0, 6).map((photo) => (
                    <div
                      key={photo.id}
                      className="aspect-square bg-muted rounded overflow-hidden"
                    >
                      <img
                        src={photo.path}
                        alt={photo.caption || 'Project photo'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {project.distributionEmails && project.distributionEmails.length > 0 && (
          <Card data-testid="card-distribution">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Distribution List</CardTitle>
              <Mail className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {project.distributionEmails.map((email, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {email}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
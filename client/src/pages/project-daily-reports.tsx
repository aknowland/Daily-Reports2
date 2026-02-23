import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { PageLayout } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  FileText,
  Search,
  ArrowUpDown,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Sun,
  Cloud,
  CloudRain,
  Wind,
  Snowflake,
  ChevronDown,
  Filter,
  X,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { parseDateSafe } from "@/lib/timezone";

function getWeatherIcon(weatherType: string | null) {
  switch (weatherType) {
    case "clear": return <Sun className="w-4 h-4 text-yellow-500" />;
    case "cloudy": return <Cloud className="w-4 h-4 text-gray-400" />;
    case "rain": return <CloudRain className="w-4 h-4 text-blue-400" />;
    case "wind": return <Wind className="w-4 h-4 text-teal-400" />;
    case "snow": return <Snowflake className="w-4 h-4 text-blue-200" />;
    default: return <Sun className="w-4 h-4 text-yellow-500" />;
  }
}

type DailyReportItem = {
  id: string;
  date: string;
  inspectorId: string;
  inspectorName: string;
  weatherType: string | null;
  regularHours: string | null;
  otHours: string | null;
  status: string | null;
  workPerformed: string | null;
  notes: string | null;
  issuesFlag: boolean | null;
  safetyFlag: boolean | null;
  reportNumber: number | null;
};

type DailyReportsResponse = {
  reports: DailyReportItem[];
  total: number;
  inspectors: { id: string; name: string }[];
};

const PAGE_SIZE = 10;

export default function ProjectDailyReportsPage() {
  const { id } = useParams<{ id: string }>();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [inspectorFilter, setInspectorFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const queryString = useCallback(() => {
    const params = new URLSearchParams();
    params.set("offset", "0");
    params.set("limit", String(limit));
    params.set("sortBy", "date");
    params.set("sortOrder", sortOrder);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (inspectorFilter) params.set("inspectorId", inspectorFilter);
    if (searchText) params.set("search", searchText);
    return params.toString();
  }, [limit, sortOrder, startDate, endDate, inspectorFilter, searchText]);

  const { data, isLoading, isFetching } = useQuery<DailyReportsResponse>({
    queryKey: [`/api/projects/${id}/daily-reports?${queryString()}`],
    enabled: !!id,
  });

  const projectQuery = useQuery<{ name: string; projectNumber: string }>({
    queryKey: ["/api/projects", id],
  });

  const reports = data?.reports || [];
  const total = data?.total || 0;
  const inspectors = data?.inspectors || [];
  const hasMore = reports.length < total;

  const activeFilterCount = [startDate, endDate, inspectorFilter, searchText].filter(Boolean).length;

  const resetPagination = () => setLimit(PAGE_SIZE);

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setInspectorFilter("");
    setSearchText("");
    setSearchInput("");
    resetPagination();
  };

  const handleSearch = () => {
    setSearchText(searchInput);
    resetPagination();
  };

  const loadMore = () => {
    setLimit((prev) => prev + PAGE_SIZE);
  };

  return (
    <PageLayout title="Daily Reports">
      <PageHeader
        icon={FileText}
        title="Daily Reports"
        subtitle={projectQuery.data ? `${projectQuery.data.name}${projectQuery.data.projectNumber ? ` (#${projectQuery.data.projectNumber})` : ""}` : undefined}
      >
        <Link href={`/project/${id}/dashboard`}>
          <Button variant="outline" className="border-white/30 text-white hover:bg-white/10" data-testid="button-back-to-dashboard">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <Badge variant="secondary" data-testid="badge-total-count">
          {total} {total === 1 ? "report" : "reports"}
        </Badge>
      </PageHeader>
      <div className="max-w-4xl mx-auto p-4 space-y-4">

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px] flex gap-2">
            <Input
              placeholder="Search notes, work performed..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              className="flex-1"
              data-testid="input-search"
            />
            <Button variant="outline" size="icon" onClick={handleSearch} data-testid="button-search">
              <Search />
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
            data-testid="button-toggle-filters"
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="default" className="ml-1">{activeFilterCount}</Badge>
            )}
          </Button>
          <Select
            value={sortOrder}
            onValueChange={(val) => { setSortOrder(val as "asc" | "desc"); resetPagination(); }}
          >
            <SelectTrigger className="w-[160px]" data-testid="select-sort-order">
              <ArrowUpDown className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Newest First</SelectItem>
              <SelectItem value="asc">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {showFilters && (
          <Card data-testid="card-filters">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-medium">Filter Reports</span>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1" data-testid="button-clear-filters">
                    <X className="w-3 h-3" />
                    Clear All
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Start Date</label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); resetPagination(); }}
                    data-testid="input-start-date"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">End Date</label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); resetPagination(); }}
                    data-testid="input-end-date"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Inspector</label>
                  <Select
                    value={inspectorFilter}
                    onValueChange={(val) => { setInspectorFilter(val === "all" ? "" : val); resetPagination(); }}
                  >
                    <SelectTrigger data-testid="select-inspector-filter">
                      <SelectValue placeholder="All Inspectors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Inspectors</SelectItem>
                      {inspectors.map((i) => (
                        <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-md" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground" data-testid="text-no-reports">
                {activeFilterCount > 0 ? "No reports match your filters" : "No daily reports submitted yet"}
              </p>
              {activeFilterCount > 0 && (
                <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters} data-testid="button-clear-filters-empty">
                  Clear Filters
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2" data-testid="list-daily-reports">
            {reports.map((report) => {
              const regHrs = parseFloat(report.regularHours || "0");
              const otHrs = parseFloat(report.otHours || "0");
              const totalHrs = regHrs + otHrs;

              return (
                <Link key={report.id} href={`/reports/${report.id}`}>
                  <Card className="hover-elevate cursor-pointer" data-testid={`card-report-${report.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex flex-col items-center justify-center w-12 h-12 rounded-md bg-muted text-center shrink-0">
                            <span className="text-xs text-muted-foreground leading-none">
                              {format(parseDateSafe(report.date), "MMM")}
                            </span>
                            <span className="text-lg font-bold leading-none">
                              {format(parseDateSafe(report.date), "d")}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm" data-testid={`text-report-date-${report.id}`}>
                                {format(parseDateSafe(report.date), "EEEE, MMM d, yyyy")}
                              </span>
                              {report.reportNumber && (
                                <Badge variant="outline" className="text-xs">#{report.reportNumber}</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5" data-testid={`text-report-inspector-${report.id}`}>
                              {report.inspectorName}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          {report.issuesFlag && (
                            <Badge variant="destructive" className="text-xs gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Issue
                            </Badge>
                          )}
                          {report.safetyFlag && (
                            <Badge variant="destructive" className="text-xs gap-1">
                              <ShieldAlert className="w-3 h-3" />
                              Safety
                            </Badge>
                          )}
                          {getWeatherIcon(report.weatherType)}
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span data-testid={`text-report-hours-${report.id}`}>{totalHrs.toFixed(1)} hrs</span>
                          </div>
                          <Badge
                            variant={report.status === "submitted" ? "default" : "secondary"}
                            className="text-xs"
                            data-testid={`badge-report-status-${report.id}`}
                          >
                            {report.status || "draft"}
                          </Badge>
                        </div>
                      </div>
                      {report.workPerformed && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2" data-testid={`text-report-work-${report.id}`}>
                          {report.workPerformed}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {hasMore && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={isFetching}
              className="gap-2"
              data-testid="button-view-more"
            >
              {isFetching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              View More ({total - reports.length} remaining)
            </Button>
          </div>
        )}

        {!isLoading && reports.length > 0 && (
          <p className="text-center text-xs text-muted-foreground pb-4" data-testid="text-showing-count">
            Showing {reports.length} of {total} reports
          </p>
        )}
      </div>
    </PageLayout>
  );
}

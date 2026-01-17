import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { PageLayout } from "@/components/layout/page-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  FileText, 
  Users, 
  FolderKanban, 
  ClipboardList, 
  FileSpreadsheet, 
  Folder, 
  File,
  Download,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  Share2
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

interface SharePointSite {
  id: string;
  name: string;
  displayName: string;
  webUrl: string;
}

interface SharePointDrive {
  id: string;
  name: string;
  driveType: string;
}

interface SharePointItem {
  id: string;
  name: string;
  webUrl: string;
  size?: number;
  folder?: { childCount: number };
  file?: { mimeType: string };
  lastModifiedDateTime: string;
  lastModifiedBy?: {
    user?: {
      displayName: string;
    };
  };
}

export default function CompanyDashboard() {
  const { profile, activeCompany } = useAuth();
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [selectedDriveId, setSelectedDriveId] = useState<string>("");
  const [currentPath, setCurrentPath] = useState<string>("");

  const { data: reportStats, isLoading: statsLoading } = useQuery<{
    total: number;
    thisMonth: number;
    pending: number;
    submitted: number;
  }>({
    queryKey: ["/api/reports/stats"],
  });

  const { data: projects, isLoading: projectsLoading } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const { data: sharePointStatus } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/sharepoint/status"],
  });

  const { data: sites, isLoading: sitesLoading, refetch: refetchSites } = useQuery<SharePointSite[]>({
    queryKey: ["/api/sharepoint/sites"],
    enabled: sharePointStatus?.connected === true,
  });

  const { data: drives, isLoading: drivesLoading } = useQuery<SharePointDrive[]>({
    queryKey: ["/api/sharepoint/sites", selectedSiteId, "drives"],
    queryFn: async () => {
      const res = await fetch(`/api/sharepoint/sites/${selectedSiteId}/drives`);
      if (!res.ok) throw new Error("Failed to fetch drives");
      return res.json();
    },
    enabled: !!selectedSiteId,
  });

  const { data: items, isLoading: itemsLoading, refetch: refetchItems } = useQuery<SharePointItem[]>({
    queryKey: ["/api/sharepoint/sites", selectedSiteId, "items", { driveId: selectedDriveId, path: currentPath }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedDriveId) params.set("driveId", selectedDriveId);
      if (currentPath) params.set("path", currentPath);
      const url = `/api/sharepoint/sites/${selectedSiteId}/items${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json();
    },
    enabled: !!selectedSiteId,
  });

  const handleDownload = async (itemId: string) => {
    try {
      const response = await fetch(`/api/sharepoint/sites/${selectedSiteId}/items/${itemId}/download`);
      const data = await response.json();
      if (data.downloadUrl) {
        window.open(data.downloadUrl, "_blank");
      }
    } catch (error) {
      console.error("Error downloading file:", error);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const getFileIcon = (item: SharePointItem) => {
    if (item.folder) {
      return <Folder className="w-5 h-5 text-amber-500" />;
    }
    const ext = item.name.split(".").pop()?.toLowerCase();
    if (["doc", "docx"].includes(ext || "")) {
      return <FileText className="w-5 h-5 text-blue-600" />;
    }
    if (["xls", "xlsx"].includes(ext || "")) {
      return <FileSpreadsheet className="w-5 h-5 text-green-600" />;
    }
    if (["pdf"].includes(ext || "")) {
      return <FileText className="w-5 h-5 text-red-600" />;
    }
    return <File className="w-5 h-5 text-muted-foreground" />;
  };

  return (
    <PageLayout title="Company Dashboard">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="title-company-dashboard">
              {activeCompany?.name || "Company"} Dashboard
            </h1>
            <p className="text-muted-foreground">
              Overview of your company's activity and documents
            </p>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card data-testid="card-stat-reports">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{reportStats?.total || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-stat-this-month">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{reportStats?.thisMonth || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-stat-projects">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {projectsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">
                  {projects?.filter((p: any) => p.status === "active").length || 0}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-stat-pending">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Reports</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{reportStats?.pending || 0}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/reports">
            <Card className="cursor-pointer hover-elevate" data-testid="card-quick-reports">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-primary/10 p-3">
                  <ClipboardList className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">View Reports</h3>
                  <p className="text-sm text-muted-foreground">Manage daily field reports</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/company/team">
            <Card className="cursor-pointer hover-elevate" data-testid="card-quick-team">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-blue-500/10 p-3">
                  <Users className="h-6 w-6 text-blue-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Team Members</h3>
                  <p className="text-sm text-muted-foreground">Manage your team</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>

          <Link href="/company/projects">
            <Card className="cursor-pointer hover-elevate" data-testid="card-quick-projects">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-lg bg-amber-500/10 p-3">
                  <FolderKanban className="h-6 w-6 text-amber-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Projects</h3>
                  <p className="text-sm text-muted-foreground">View company projects</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* SharePoint Document Library */}
        <Card data-testid="card-sharepoint">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <Share2 className="h-6 w-6 text-[#0078d4]" />
                <div>
                  <CardTitle>Document Library</CardTitle>
                  <CardDescription>Access your SharePoint documents</CardDescription>
                </div>
              </div>
              {sharePointStatus?.connected && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => refetchItems()}
                  data-testid="button-refresh-docs"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!sharePointStatus?.connected ? (
              <div className="text-center py-8">
                <Share2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">SharePoint Not Connected</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Connect your SharePoint account to access documents directly from this dashboard.
                </p>
                <p className="text-xs text-muted-foreground">
                  Contact your administrator to set up the SharePoint integration.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Site and Drive Selection */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="text-sm font-medium mb-2 block">SharePoint Site</label>
                    <Select 
                      value={selectedSiteId} 
                      onValueChange={(value) => {
                        setSelectedSiteId(value);
                        setSelectedDriveId("");
                        setCurrentPath("");
                      }}
                    >
                      <SelectTrigger data-testid="select-site">
                        <SelectValue placeholder="Select a site..." />
                      </SelectTrigger>
                      <SelectContent>
                        {sitesLoading ? (
                          <div className="p-2">Loading sites...</div>
                        ) : sites?.length === 0 ? (
                          <div className="p-2 text-muted-foreground">No sites found</div>
                        ) : (
                          sites?.map((site) => (
                            <SelectItem key={site.id} value={site.id}>
                              {site.displayName || site.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedSiteId && (
                    <div className="flex-1">
                      <label className="text-sm font-medium mb-2 block">Document Library</label>
                      <Select 
                        value={selectedDriveId} 
                        onValueChange={(value) => {
                          setSelectedDriveId(value);
                          setCurrentPath("");
                        }}
                      >
                        <SelectTrigger data-testid="select-drive">
                          <SelectValue placeholder="Select a library..." />
                        </SelectTrigger>
                        <SelectContent>
                          {drivesLoading ? (
                            <div className="p-2">Loading libraries...</div>
                          ) : (
                            drives?.map((drive) => (
                              <SelectItem key={drive.id} value={drive.id}>
                                {drive.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Breadcrumb */}
                {currentPath && (
                  <div className="flex items-center gap-2 text-sm">
                    <button 
                      className="text-sm text-primary hover:underline"
                      onClick={() => setCurrentPath("")}
                    >
                      Root
                    </button>
                    {currentPath.split("/").map((part, index, arr) => (
                      <div key={index} className="flex items-center gap-2">
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        <button 
                          className="text-sm text-primary hover:underline"
                          onClick={() => setCurrentPath(arr.slice(0, index + 1).join("/"))}
                        >
                          {part}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* File List */}
                {selectedSiteId ? (
                  itemsLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : items?.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Folder className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No files found in this location</p>
                    </div>
                  ) : (
                    <div className="border rounded-lg divide-y">
                      {items?.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-4 p-3 hover:bg-muted/50 transition-colors"
                          data-testid={`file-item-${item.id}`}
                        >
                          {getFileIcon(item)}
                          <div className="flex-1 min-w-0">
                            {item.folder ? (
                              <button
                                className="text-left font-medium hover:underline truncate block w-full"
                                onClick={() => setCurrentPath(currentPath ? `${currentPath}/${item.name}` : item.name)}
                              >
                                {item.name}
                              </button>
                            ) : (
                              <span className="font-medium truncate block">{item.name}</span>
                            )}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {item.file && <span>{formatFileSize(item.size)}</span>}
                              {item.folder && <span>{item.folder.childCount} items</span>}
                              <span>•</span>
                              <span>
                                Modified {format(new Date(item.lastModifiedDateTime), "MMM d, yyyy")}
                              </span>
                              {item.lastModifiedBy?.user?.displayName && (
                                <>
                                  <span>•</span>
                                  <span>{item.lastModifiedBy.user.displayName}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.file && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDownload(item.id)}
                                data-testid={`button-download-${item.id}`}
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                            >
                              <a href={item.webUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Select a SharePoint site to view documents</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}

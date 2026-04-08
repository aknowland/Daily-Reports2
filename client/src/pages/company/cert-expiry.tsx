import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/page-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, Clock, Search, ShieldCheck } from "lucide-react";
import { useState, useMemo } from "react";
import { Link } from "wouter";

type CertWithExpiry = {
  name: string;
  expiresAt: string | null;
  certNumber?: string;
  daysUntilExpiry: number | null;
};

type InspectorCertRow = {
  id: string;
  name: string;
  type: "user" | "team";
  certifications: CertWithExpiry[];
};

function statusFor(daysUntil: number | null) {
  if (daysUntil === null) return "no-expiry";
  if (daysUntil <= 0) return "expired";
  if (daysUntil <= 7) return "critical";
  if (daysUntil <= 30) return "warning";
  if (daysUntil <= 60) return "upcoming";
  return "ok";
}

const STATUS_ORDER: Record<string, number> = {
  expired: 0, critical: 1, warning: 2, upcoming: 3, ok: 4, "no-expiry": 5,
};

export default function CertExpiryPage() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data, isLoading } = useQuery<InspectorCertRow[]>({
    queryKey: ["/api/cert-expiry"],
  });

  const flatRows = useMemo(() => {
    if (!data) return [];
    const rows: Array<{ inspector: InspectorCertRow; cert: CertWithExpiry; status: string }> = [];
    for (const insp of data) {
      for (const cert of insp.certifications) {
        rows.push({ inspector: insp, cert, status: statusFor(cert.daysUntilExpiry) });
      }
    }
    rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
    return rows;
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return flatRows.filter((r) => {
      const matchSearch = !q
        || r.inspector.name.toLowerCase().includes(q)
        || r.cert.name.toLowerCase().includes(q)
        || (r.cert.certNumber || "").toLowerCase().includes(q);
      const matchStatus = filterStatus === "all" || r.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [flatRows, search, filterStatus]);

  const counts = useMemo(() => {
    const c = { expired: 0, critical: 0, warning: 0, upcoming: 0, ok: 0, "no-expiry": 0 };
    for (const r of flatRows) c[r.status as keyof typeof c] = (c[r.status as keyof typeof c] || 0) + 1;
    return c;
  }, [flatRows]);

  const urgentCount = counts.expired + counts.critical + counts.warning;

  function StatusBadge({ status, daysUntil }: { status: string; daysUntil: number | null }) {
    if (status === "expired") return <Badge variant="destructive" data-testid="badge-expired">EXPIRED</Badge>;
    if (status === "critical") return <Badge variant="outline" className="border-red-500 text-red-600 dark:text-red-400" data-testid="badge-critical">Expires in {daysUntil}d</Badge>;
    if (status === "warning") return <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400" data-testid="badge-warning">Expires in {daysUntil}d</Badge>;
    if (status === "upcoming") return <Badge variant="outline" className="border-blue-500 text-blue-700 dark:text-blue-400" data-testid="badge-upcoming">Expires in {daysUntil}d</Badge>;
    if (status === "ok") return <Badge variant="secondary" data-testid="badge-ok">Expires in {daysUntil}d</Badge>;
    return <Badge variant="outline" className="text-muted-foreground" data-testid="badge-no-expiry">No expiry set</Badge>;
  }

  function StatusIcon({ status }: { status: string }) {
    if (status === "expired" || status === "critical") return <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    if (status === "warning") return <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
    if (status === "upcoming") return <Clock className="w-4 h-4 text-blue-500 flex-shrink-0" />;
    if (status === "ok") return <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />;
    return <ShieldCheck className="w-4 h-4 text-muted-foreground flex-shrink-0" />;
  }

  const filterButtons = [
    { key: "all", label: "All", count: flatRows.length },
    { key: "expired", label: "Expired", count: counts.expired },
    { key: "critical", label: "≤7 Days", count: counts.critical },
    { key: "warning", label: "≤30 Days", count: counts.warning },
    { key: "upcoming", label: "≤60 Days", count: counts.upcoming },
    { key: "ok", label: "OK", count: counts.ok },
    { key: "no-expiry", label: "No Date", count: counts["no-expiry"] },
  ];

  return (
    <PageLayout>
      <PageHeader
        title="Certification Expiry Tracker"
        subtitle="Monitor license and certification expiration across all inspectors"
      />

      <div className="p-4 sm:p-6 space-y-4 max-w-5xl">
        {/* Summary bar */}
        {!isLoading && urgentCount > 0 && (
          <div className="flex items-center gap-2 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3 text-sm text-amber-800 dark:text-amber-300" data-testid="alert-urgent-certs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span><strong>{urgentCount}</strong> certification{urgentCount !== 1 ? "s" : ""} require attention (expired or expiring within 30 days).</span>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by inspector name or certification…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-cert-search"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {filterButtons.map((btn) => (
              <button
                key={btn.key}
                onClick={() => setFilterStatus(btn.key)}
                className={`px-3 py-1.5 text-xs rounded border font-medium transition-colors ${
                  filterStatus === btn.key
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border-transparent"
                    : "border-border hover:bg-muted"
                }`}
                data-testid={`filter-${btn.key}`}
              >
                {btn.label}
                {btn.count > 0 && (
                  <span className="ml-1.5 opacity-70">{btn.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-4">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground" data-testid="empty-cert-list">
                <ShieldCheck className="w-10 h-10 mb-3 opacity-30" />
                <p className="font-medium">No certifications found</p>
                <p className="text-sm mt-1">
                  {flatRows.length === 0
                    ? "Add certifications with expiry dates to your inspector profiles to track them here."
                    : "Try adjusting your search or filter."}
                </p>
                {flatRows.length === 0 && (
                  <div className="mt-4 flex gap-3 text-xs">
                    <Link href="/profile" className="underline underline-offset-2">My Profile</Link>
                    <Link href="/company/team" className="underline underline-offset-2">Team Inspectors</Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="divide-y" data-testid="cert-list">
                {/* Header */}
                <div className="hidden sm:grid grid-cols-[1fr_1.5fr_1fr_auto] gap-4 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <span>Inspector</span>
                  <span>Certification</span>
                  <span>Expiry</span>
                  <span>Status</span>
                </div>
                {filtered.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid sm:grid-cols-[1fr_1.5fr_1fr_auto] gap-2 sm:gap-4 px-4 py-3 items-center hover:bg-muted/30 transition-colors"
                    data-testid={`cert-row-${idx}`}
                  >
                    <div className="flex items-center gap-2">
                      <StatusIcon status={row.status} />
                      <div>
                        <span className="font-medium text-sm" data-testid={`cert-inspector-name-${idx}`}>{row.inspector.name}</span>
                        <span className={`ml-2 text-xs px-1 py-0.5 rounded ${row.inspector.type === "user" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"}`}>
                          {row.inspector.type === "user" ? "Member" : "Team"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="text-sm" data-testid={`cert-name-${idx}`}>{row.cert.name}</span>
                      {row.cert.certNumber && (
                        <span className="text-xs text-muted-foreground ml-2">#{row.cert.certNumber}</span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground" data-testid={`cert-expiry-${idx}`}>
                      {row.cert.expiresAt || "—"}
                    </div>
                    <div>
                      <StatusBadge status={row.status} daysUntil={row.cert.daysUntilExpiry} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Automated email alerts are sent to company admins at 60, 30, 7 days before expiry and on the expiry date.
          Update certifications in{" "}
          <Link href="/profile" className="underline underline-offset-2">your profile</Link> or{" "}
          <Link href="/company/team" className="underline underline-offset-2">Team Inspector profiles</Link>.
        </p>
      </div>
    </PageLayout>
  );
}

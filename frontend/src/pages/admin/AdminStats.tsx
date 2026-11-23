import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Clock3,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "../../api";
import { Button, Card, Pill } from "../../components/ui";
import { Loading } from "../../components/feedback/Loading";
import { ChallengeStatusChart } from "../../components/QuestCharts";

const labels: Record<string, string> = {
  xp_change: "XP changed",
  point_award: "XP awarded",
  point_award_approved: "XP approval approved",
  point_award_rejected: "XP approval rejected",
  account_created: "Account created",
  game_created: "Game created",
  programme_update: "Programme updated",
  scratch_card_configured: "Scratch card configured",
  game_updated: "Game updated",
  game_deleted: "Game archived",
  game_assignment_reassigned: "Game reassigned",
  game_assignment_revoked: "Game assignment revoked",
  game_restored: "Game restored",
  point_award_requested: "Point award requested",
  map_event_saved: "Map event saved",
};
const pretty = (a: string) =>
  labels[a] || a.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const relativeTime = (value: string) => {
  const d = new Date(value),
    ms = Date.now() - d.getTime(),
    m = Math.floor(ms / 60000),
    h = Math.floor(ms / 3600000),
    days = Math.floor(ms / 86400000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export function AdminStats() {
  const [d, setD] = useState<any>();
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<any[]>([]);
  const [auditOpen, setAuditOpen] = useState(false);
  const [meta, setMeta] = useState<any>({
    total: 0,
    page: 1,
    limit: 8,
    hasMore: false,
    actions: [],
  });
  const [filters, setFilters] = useState({
    q: "",
    action: "",
    actor: "",
    target: "",
    since: "",
    until: "",
  });
  const [loading, setLoading] = useState(false);
  const load = async () => {
    try {
      setError("");
      setD(await api<any>("/admin/overview/"));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load programme statistics.",
      );
    }
  };
  const loadLogs = async (page = 1, next = filters) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        ...next,
        page: String(page),
        limit: "8",
      });
      const r = await api<any>(`/admin/audit/?${q}`);
      setLogs(r.items || []);
      setMeta(r);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load audit activity.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const metrics = useMemo(
    () => [
      ["Participants", Number(d?.participants || 0).toLocaleString()],
      ["Collective XP", Number(d?.collectiveXp || 0).toLocaleString()],
      ["Active challenges", Number(d?.activeChallenges || 0).toLocaleString()],
      [
        "Attendance today",
        `${Number(d?.attendanceToday || 0).toLocaleString()} / ${Number(d?.attendanceRegistered || d?.participants || 0).toLocaleString()}`,
      ],
    ],
    [d],
  );
  const attendanceChart = [
    { label: "Checked in", value: Number(d?.attendanceToday || 0) },
    {
      label: "Not checked in",
      value: Math.max(
        0,
        Number(d?.attendanceRegistered || d?.participants || 0) -
          Number(d?.attendanceToday || 0),
      ),
    },
  ];
  const challengeChart = [
    { label: "Completed", value: Number(d?.challengeStatus?.completed || 0) },
    { label: "Active", value: Number(d?.challengeStatus?.active || 0) },
    { label: "Total so far", value: Number(d?.challengeStatus?.total || 0) },
  ];
  if (!d)
    return error ? (
      <div className="page">
        <Card className="error-card">
          <strong>{error}</strong>
          <p className="muted">The page could not load its programme data.</p>
          <div className="top-actions">
            <Button
              variant="secondary"
              icon={RefreshCw}
              onClick={() => {
                setD(undefined);
                void load();
                if (auditOpen) void loadLogs();
              }}
            >
              Refresh page
            </Button>
          </div>
        </Card>
      </div>
    ) : (
      <Loading />
    );
  return (
    <div className="page admin-stats-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">STATS & INSIGHT</span>
          <h2>Programme pulse</h2>
          <p>
            Live operational metrics with a clear view of participation and
            challenge progress.
          </p>
        </div>
        <Pill icon={ShieldCheck}>Audit-ready</Pill>
      </div>
      <div className="stats-hero-grid">
        {metrics.map(([label, value], i) => (
          <Card key={label} className={`stats-metric stats-metric-${i + 1}`}>
            <span className="eyebrow">{label}</span>
            <strong>{value}</strong>
          </Card>
        ))}
      </div>
      <section className="stats-chart-grid">
        <Card className="stats-chart-card">
          <div className="section-head">
            <div>
              <span className="eyebrow">ATTENDANCE</span>
              <h3>Today’s attendance</h3>
              <p className="muted">
                Checked in against all registered young people in this
                programme.
              </p>
            </div>
            <BarChart3 />
          </div>
          <ChallengeStatusChart data={attendanceChart} />
          <strong className="stats-chart-summary">
            {Number(d?.attendanceRate || 0).toLocaleString()}% attended today
          </strong>
        </Card>
        <Card className="stats-chart-card">
          <div className="section-head">
            <div>
              <span className="eyebrow">CHALLENGES</span>
              <h3>Challenge lifecycle</h3>
              <p className="muted">
                Completed, active and total challenges so far.
              </p>
            </div>
            <BarChart3 />
          </div>
          <ChallengeStatusChart data={challengeChart} />
        </Card>
      </section>
      <section
        className={`stats-collapsible ${auditOpen ? "is-open" : "is-closed"}`}
      >
        <button
          type="button"
          className="stats-collapsible-trigger"
          onClick={() => {
            const next = !auditOpen;
            setAuditOpen(next);
            if (next && !logs.length) void loadLogs();
          }}
        >
          <div>
            <span className="eyebrow">AUDIT TRAIL</span>
            <h3>Administrative activity</h3>
            <p className="muted">Load the audit trail only when you need it.</p>
          </div>
          <span>{auditOpen ? "Hide" : "Load audit trail"}</span>
        </button>
      </section>
      {auditOpen && (
        <Card className="audit-card">
          <div className="section-head">
            <div>
              <span className="eyebrow">AUDIT TRAIL</span>
              <h3>Administrative activity</h3>
              <p className="muted">
                Search and filter changes by action, actor, target or date.
              </p>
            </div>
            <Button
              variant="secondary"
              icon={RefreshCw}
              onClick={() => loadLogs(meta.page)}
            >
              Refresh
            </Button>
          </div>
          <div className="audit-filters">
            <label className="audit-search">
              <Search size={17} />
              <input
                placeholder="Search action, actor or target…"
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              />
            </label>
            <label>
              <span>Action</span>
              <select
                value={filters.action}
                onChange={(e) => {
                  const f = { ...filters, action: e.target.value };
                  setFilters(f);
                  loadLogs(1, f);
                }}
              >
                <option value="">All actions</option>
                {(meta.actions || []).map((a: string) => (
                  <option key={a} value={a}>
                    {pretty(a)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Actor</span>
              <input
                value={filters.actor}
                onChange={(e) =>
                  setFilters({ ...filters, actor: e.target.value })
                }
              />
            </label>
            <label>
              <span>Target</span>
              <input
                value={filters.target}
                onChange={(e) =>
                  setFilters({ ...filters, target: e.target.value })
                }
              />
            </label>
            <Button icon={Filter} onClick={() => loadLogs(1)}>
              Apply
            </Button>
          </div>
          <div className="audit-list">
            {logs.map((x: any) => (
              <div className="audit-row" key={x.id}>
                <span className="audit-icon">
                  <Clock3 size={16} />
                </span>
                <div>
                  <strong>{pretty(x.action)}</strong>
                  <span>
                    {x.actor__username || "System"}
                    {x.target ? ` · ${x.target}` : ""}
                  </span>
                  {x.summary && Object.keys(x.summary).length > 0 && (
                    <small>
                      {Object.entries(x.summary)
                        .map(([k, v]) => `${pretty(k)}: ${String(v)}`)
                        .join(" · ")}
                    </small>
                  )}
                  <time
                    dateTime={x.created_at}
                    title={new Date(x.created_at).toLocaleString()}
                  >
                    {relativeTime(x.created_at)} ·{" "}
                    {new Date(x.created_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              </div>
            ))}
            {!logs.length && !loading && (
              <div className="empty-state">
                No audit entries match these filters.
              </div>
            )}
          </div>
          <div className="audit-pagination">
            <Button
              variant="secondary"
              icon={ChevronLeft}
              disabled={meta.page <= 1 || loading}
              onClick={() => loadLogs(meta.page - 1)}
            >
              Previous
            </Button>
            <span>
              Page {meta.page} · {meta.total || 0} results
            </span>
            <Button
              variant="secondary"
              icon={ChevronRight}
              disabled={!meta.hasMore || loading}
              onClick={() => loadLogs(meta.page + 1)}
            >
              Next
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

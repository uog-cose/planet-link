import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { Button, Card, Pill } from "../../components/ui";
import {
  CheckCircle2,
  MapPinned,
  Target,
  Trophy,
  Users,
  ArrowRight,
  AlertTriangle,
  Activity as ActivityIcon,
  Gift,
} from "lucide-react";
import { AttendancePanel } from "../../components/attendance/AttendancePanel";
import { EventMap } from "../../components/EventMap";
import { Loading } from "../../components/feedback/Loading";
import { useLiveDashboard } from "../../hooks/useLiveDashboard";
import { CollapsibleCard } from "../../components/CollapsibleCard";

export function Worker() {
  const [d, setD] = useState<any>();
  const [groupMeters, setGroupMeters] = useState<any[]>([]);
  const pageReadyAnnounced = useRef(false);
  const refresh = useCallback(() => {
    api("/admin/overview/")
      .then(setD)
      .catch(() => {});
    api<any>("/staff/groups/")
      .then((r) => setGroupMeters(Array.isArray(r.items) ? r.items : []))
      .catch(() => setGroupMeters([]));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useLiveDashboard("dashboard", refresh, undefined, Boolean(d));
  useEffect(() => {
    if (!d || pageReadyAnnounced.current) return;
    pageReadyAnnounced.current = true;
    const frame = window.requestAnimationFrame(() =>
      window.dispatchEvent(
        new CustomEvent("yq-page-ready", {
          detail: { route: "worker-dashboard" },
        }),
      ),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [d]);
  if (!d) return <Loading />;

  const event = d.currentEvent || d.nextEvent || d.lastEvent;
  const people = Array.isArray(d.playerAnalytics) ? d.playerAnalytics : [];
  const attention = Array.isArray(d.needsAttention?.players)
    ? d.needsAttention.players
    : [];
  const recent = Array.isArray(d.recentXp) ? d.recentXp : [];
  const metrics = [
    {
      label: "Participants",
      value: Number(d.participants || 0).toLocaleString(),
      icon: Users,
      tone: "mint",
    },
    {
      label: "Collective XP",
      value: Number(d.collectiveXp || 0).toLocaleString(),
      icon: Target,
      tone: "sun",
    },
    {
      label: "Groups",
      value: Number(d.groups || 0).toLocaleString(),
      icon: Users,
      tone: "lilac",
    },
    {
      label: "Attendance today",
      value: Number(d.attendanceToday || 0).toLocaleString(),
      icon: CheckCircle2,
      tone: "aqua",
    },
  ];

  return (
    <div className="page worker-dashboard-page">
      <section className="dashboard-command-hero">
        <div>
          <span className="eyebrow">FIELD OPERATIONS</span>
          <h2>Keep every quest moving.</h2>
          <p className="muted">
            Attendance, player progress, points and events in one operational
            view.
          </p>
        </div>
        <div className="dashboard-command-actions">
          <Link className="button primary" to="/worker/points">
            Award points <ArrowRight size={17} />
          </Link>
          <Link className="button secondary" to="/worker/map-event">
            <MapPinned size={17} /> Event map
          </Link>
        </div>
      </section>

      <section
        className="metric-grid dashboard-metric-grid"
        aria-label="Programme totals"
      >
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <Card className={`dashboard-metric tone-${tone}`} key={label}>
            <span className="metric-icon">
              <Icon size={20} />
            </span>
            <span className="eyebrow">{label}</span>
            <strong className="metric">{value}</strong>
            <span className="metric-spark" aria-hidden="true" />
          </Card>
        ))}
      </section>

      <section className="worker-dashboard-columns">
        <CollapsibleCard
          defaultOpen={false}
          title="Attendance check-in"
          description="Open the current session QR for young people to scan."
          summary="Session QR"
          icon={Target}
          className="worker-attendance-card tone-mint"
        >
          <div className="section-head">
            <div>
              <span className="eyebrow">TODAY</span>
              <h3>Attendance pulse</h3>
              <p className="muted">
                Check people in and spot gaps before the session drifts.
              </p>
            </div>
            <ActivityIcon size={23} />
          </div>
          <AttendancePanel />
        </CollapsibleCard>
        <CollapsibleCard
          title="Follow-up queue"
          description="People who may need a check-in"
          summary={`${attention.length} flagged`}
          icon={AlertTriangle}
          className="worker-attention-card tone-sun"
        >
          <div className="section-head">
            <div>
              <span className="eyebrow">NEEDS A LOOK</span>
              <h3>Follow-up queue</h3>
            </div>
            <Pill>{attention.length}</Pill>
          </div>
          {attention.length ? (
            attention.slice(0, 6).map((x: any) => (
              <div className="worker-list-row" key={x.id}>
                <span className="worker-list-avatar">
                  {x.gamertag?.[0] || "?"}
                </span>
                <div>
                  <strong>{x.gamertag}</strong>
                  <small>
                    {(Array.isArray(x.reasons) ? x.reasons : [])
                      .map((r: string) =>
                        r === "attendance"
                          ? "Attendance overdue"
                          : "No recent points",
                      )
                      .join(" · ") || "Check in when convenient"}
                  </small>
                </div>
                <b>{x.streak || 0}d</b>
              </div>
            ))
          ) : (
            <div className="worker-empty">
              <CheckCircle2 size={24} />
              <span>Everyone is currently on track.</span>
            </div>
          )}
        </CollapsibleCard>
      </section>

      <section
        className="worker-group-meter-section"
        aria-label="Group jackpot progress"
      >
        <div className="section-head">
          <div>
            <span className="eyebrow">INDEPENDENT GROUP GOALS</span>
            <h3>Group progress</h3>
            <p className="muted">
              Every group works towards its own targets. Leaderboard uses actual
              group XP.
            </p>
          </div>
          <Link className="button secondary" to="/groups">
            Manage groups <ArrowRight size={16} />
          </Link>
        </div>
        {groupMeters.length ? (
          <div className="worker-group-meter-grid">
            {[...groupMeters]
              .sort((a, b) => Number(b.xp || 0) - Number(a.xp || 0))
              .map((g: any, index: number) => {
                const next = g.nextTier;
                const target = next ? Number(next.xp) : null;
                const progress = target
                  ? Math.max(
                      0,
                      Math.min(100, (Number(g.xp || 0) / target) * 100),
                    )
                  : 100;
                return (
                  <Card className="worker-group-meter" key={g.id}>
                    <div className="worker-group-meter-head">
                      <div>
                        <span className="eyebrow">
                          {index === 0
                            ? "LEADING ON TOTAL XP"
                            : `GROUP ${index + 1}`}
                        </span>
                        <h4>{g.name}</h4>
                      </div>
                      <strong>{Number(g.xp || 0).toLocaleString()} XP</strong>
                    </div>
                    {next ? (
                      <>
                        <div
                          className="worker-group-meter-bar"
                          role="progressbar"
                          aria-label={`${g.name} progress to ${next.name}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(progress)}
                        >
                          <span style={{ width: `${progress}%` }} />
                        </div>
                        <div className="worker-group-meter-foot">
                          <span>
                            {Number(g.pointsToNext || 0).toLocaleString()} XP to{" "}
                            {next.name}
                          </span>
                          <span>{Math.round(progress)}%</span>
                        </div>
                        {next.prize && (
                          <small className="muted">
                            Next prize: {next.prize}
                          </small>
                        )}
                      </>
                    ) : (
                      <div className="worker-empty">
                        <Trophy size={19} />
                        <span>
                          {(g.tierTargets || []).length
                            ? "All configured tiers reached"
                            : "No jackpot targets configured yet."}
                        </span>
                      </div>
                    )}
                  </Card>
                );
              })}
          </div>
        ) : (
          <Card className="worker-empty">
            <Users size={22} />
            <span>No groups configured yet.</span>
          </Card>
        )}
      </section>

      <section className="worker-dashboard-columns worker-dashboard-columns-wide">
        <CollapsibleCard
          title="Young people at a glance"
          description="Player progress and current streaks"
          summary={`${people.length} shown`}
          icon={Users}
          className="worker-people-card tone-aqua"
        >
          <div className="section-head">
            <div>
              <span className="eyebrow">PLAYER PROGRESS</span>
              <h3>Young people at a glance</h3>
            </div>
            <Users size={22} />
          </div>
          <div className="worker-progress-table">
            {people.slice(0, 10).map((x: any) => (
              <div className="worker-list-row" key={x.id}>
                <span className="worker-list-avatar">
                  {x.gamertag?.[0] || "?"}
                </span>
                <div>
                  <strong>{x.gamertag}</strong>
                  <small>
                    {x.gamesCompleted || 0} games · {x.streak || 0}d streak
                    {x.needsHelp ? " · Needs check-in" : ""}
                  </small>
                </div>
                <b>{Number(x.xp || 0).toLocaleString()} XP</b>
              </div>
            ))}
          </div>
        </CollapsibleCard>
        <CollapsibleCard
          title="Latest XP activity"
          description="Recent movement across the programme"
          summary={`${recent.length} updates`}
          icon={Trophy}
          className="worker-activity-card tone-lilac"
        >
          <div className="section-head">
            <div>
              <span className="eyebrow">RECENT MOVEMENT</span>
              <h3>Latest XP activity</h3>
            </div>
            <Trophy size={22} />
          </div>
          {recent.length ? (
            recent.map((x: any, i: number) => (
              <div className="worker-list-row" key={i}>
                <span className="worker-list-avatar soft">
                  {x.target__gamertag?.[0] || "?"}
                </span>
                <div>
                  <strong>{x.target__gamertag || "Young person"}</strong>
                  <small>{x.reason || "XP update"}</small>
                </div>
                <b className={Number(x.amount) < 0 ? "negative" : ""}>
                  {Number(x.amount) > 0 ? "+" : ""}
                  {x.amount} XP
                </b>
              </div>
            ))
          ) : (
            <div className="worker-empty">
              <Trophy size={24} />
              <span>No recent XP activity.</span>
            </div>
          )}
        </CollapsibleCard>
      </section>

      <Card className="worker-tools-card">
        <div className="section-head">
          <div>
            <span className="eyebrow">TOOLS</span>
            <h3>Choose what to manage</h3>
            <p className="muted">
              Open the area you need instead of keeping every control on the
              dashboard.
            </p>
          </div>
          <ArrowRight size={21} />
        </div>
        <div className="dashboard-action-grid">
          <Link to="/groups">
            Groups <Users size={17} />
          </Link>
          <Link to="/worker/accounts">
            People <Users size={17} />
          </Link>
          <Link to="/worker/skills">
            Skills <Target size={17} />
          </Link>
          <Link to="/worker/games">
            Games <Trophy size={17} />
          </Link>
          <Link to="/worker/scratch-cards">
            Scratch cards <Gift size={17} />
          </Link>
        </div>
      </Card>
    </div>
  );
}

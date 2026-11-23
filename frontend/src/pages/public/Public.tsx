import { useCallback, useEffect, useRef, useState } from "react";
import {
  Expand,
  Gamepad2,
  Minimize,
  MapPinned,
  Target,
  Trophy,
  TrendingUp,
  Users,
} from "lucide-react";
import { api } from "../../api";
import { Card } from "../../components/ui";
import { Loading } from "../../components/feedback/Loading";
import { EventMap } from "../../components/EventMap";
import { PublicProgramPicker } from "../../components/PublicProgramPicker";
import { useLiveDashboard } from "../../hooks/useLiveDashboard";
import { t } from "../../i18n";
import {
  ChallengeStatusChart,
  HighRisersChart,
  GroupRaceChart,
} from "../../components/QuestCharts";

type PublicGroup = {
  name: string;
  xp: number;
  targetXp?: number;
  progress?: number;
  rank?: number;
  ranked?: boolean;
  averageXpPerMember?: number;
  averageMembers?: number;
  eligibleMembers?: number;
  members?: number;
  skills?: number;
  achievements?: number;
  challenges?: number;
};
type PublicData = {
  programme?: string;
  location?: string;
  targetXp?: number;
  collectiveXp?: number;
  groups?: PublicGroup[];
  groupMetrics?: PublicGroup[];
  groupLeaderboards?: Record<string, PublicGroup[]>;
  highRisers?: Array<{ name: string; xp: number; skills: number }>;
  stats?: {
    participants?: number;
    skillsCompleted?: number;
    challengesCompleted?: number;
    attendanceToday?: number;
    attendanceRegistered?: number;
    attendanceRate?: number;
  };
  challengeProgress?: { total?: number; active?: number; completed?: number };
  currentEvent?: any;
  nextEvent?: any;
  lastEvent?: any;
  events?: any[];
  theme?: string;
  themeConfig?: Record<string, string>;
  layout?: any;
  visibility?: Record<string, boolean>;
  mapAccessGranted?: boolean;
  instances?: Array<{ id: number; name: string; location?: string }>;
  instanceId?: number;
};
function initialMapAccess() {
  const match = window.location.pathname.match(
    /^\/public\/map\/(\d+)\/([A-Za-z0-9]{6,16})$/,
  );
  return match
    ? { instanceId: match[1], mapAccess: match[2].toUpperCase() }
    : {
        instanceId:
          new URLSearchParams(window.location.search).get("instanceId") || "",
        mapAccess:
          new URLSearchParams(window.location.search).get("mapAccess") || "",
      };
}

export function Public() {
  const [d, setD] = useState<PublicData>();
  const initial = initialMapAccess();
  const [instanceId, setInstanceId] = useState(initial.instanceId);
  const [mapAccess] = useState(initial.mapAccess);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [slide, setSlide] = useState(0);
  const [groupPeriod, setGroupPeriod] = useState<'weekly' | 'monthly' | 'overall'>('overall');
  const requestRef = useRef<AbortController | null>(null);
  const seq = useRef(0);
  const refresh = useCallback(
    (clear = true) => {
      const s = ++seq.current;
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      const q = new URLSearchParams();
      if (instanceId) q.set("instanceId", instanceId);
      if (mapAccess) q.set("mapAccess", mapAccess);
      q.set("_", String(Date.now()));
      if (clear) setD(undefined);
      setError("");
      api<PublicData>(`/public/?${q.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((x) => {
          if (controller.signal.aborted || s !== seq.current) return;
          setD(x);
        })
        .catch((e) => {
          if (controller.signal.aborted || s !== seq.current) return;
          setError(e instanceof Error ? e.message : t("errorBody"));
        });
      return () => controller.abort();
    },
    [instanceId, mapAccess],
  );
  useEffect(() => {
    const clean = refresh(true);
    return () => {
      clean?.();
      requestRef.current?.abort();
    };
  }, [refresh]);
  useLiveDashboard("public", () => refresh(false), instanceId, Boolean(d));
  useEffect(() => {
    const id = window.setInterval(() => setSlide((v) => (v + 1) % 3), 6500);
    return () => window.clearInterval(id);
  }, []);
  if (!d)
    return (
      <main className="public-display">
        <div className="public-load-state">
          <Loading />
          {error && <div className="error public-load-error">{error}</div>}
        </div>
      </main>
    );
  const v = d.visibility || {},
    groupMetrics = d.groupMetrics || d.groups || [],
    risers = d.highRisers || [],
    event = mapAccess ? d.currentEvent || d.nextEvent || d.lastEvent : null,
    events = d.events || [];
  const selectedGroupLeaderboard = d.groupLeaderboards?.[groupPeriod] || groupMetrics;
  const groupPeriodLabel = groupPeriod === 'weekly' ? 'This week' : groupPeriod === 'monthly' ? 'This month' : 'Overall';
  const target = Number(d.targetXp || 1),
    xp = Number(d.collectiveXp || 0);
  const stats = d.stats || {};
  const challengeProgress = d.challengeProgress || {};
  const raceData = groupMetrics.map((g: any) => ({
    name: g.name,
    xp: Number(g.xp || 0),
    remaining: Math.max(0, Number(g.targetXp || target) - Number(g.xp || 0)),
  }));
  const riserChart = risers
    .slice(0, 5)
    .map((x: any) => ({
      name: String(x.name || "Player").slice(0, 12),
      xp: Number(x.xp || 0),
    }));
  const selectInstance = (next: string) => {
    if (!next || next === String(d.instanceId)) return;
    setInstanceId(next);
    const url = new URL(window.location.href);
    url.searchParams.set("instanceId", next);
    window.history.replaceState(null, "", url.pathname + url.search);
  };
  async function toggle() {
    if (!document.fullscreenElement)
      await document.documentElement.requestFullscreen?.();
    else await document.exitFullscreen?.();
  }
  return (
    <main className="public-display public-display-v3">
      <header className="public-v3-header">
        <div className="public-brand">
          <img src="/youth-quest-icon-192.png" alt="" width={42} height={42} />
          <div>
            <b>{d.programme || "Youth Quest"}</b>
            <small>{d.location || "Live community board"}</small>
          </div>
        </div>
        <div className="public-board-status">
          <span>Community board</span>
        </div>
        {d.instances?.length ? (
          <PublicProgramPicker
            items={d.instances}
            value={String(d.instanceId || instanceId || "")}
            onChange={selectInstance}
          />
        ) : null}
      </header>
      <section className="public-v3-hero public-race-hero">
        <div>
          {v.programme !== false && (
            <>
              <span className="eyebrow">LIVE QUEST RACE</span>
              <h1>One community. Shared progress. Real momentum.</h1>
            </>
          )}
          {v.location !== false && (
            <p>{d.location || "Community progress board"}</p>
          )}
        </div>
        {v.collectiveXp !== false && (
          <div className="public-hero-score">
            <strong>{xp.toLocaleString()} XP</strong>
            {v.targetXp !== false && (
              <span>{target.toLocaleString()} XP total target</span>
            )}
            <div className="public-score-track">
              <i
                style={{
                  width: `${Math.min(100, Math.round((xp / Math.max(1, target)) * 100))}%`,
                }}
              />
            </div>
          </div>
        )}
      </section>
      <section className="public-v3-stats">
        {v.participants !== false && (
          <div>
            <Users />
            <strong>{Number(stats.participants || 0).toLocaleString()}</strong>
            <span>Participants</span>
          </div>
        )}
        {v.challengesCompleted !== false && (
          <div>
            <Trophy />
            <strong>
              {Number(stats.challengesCompleted || 0).toLocaleString()}
            </strong>
            <span>Challenges</span>
          </div>
        )}
        {v.groups !== false && (
          <div>
            <TrendingUp />
            <strong>{groupMetrics.length.toLocaleString()}</strong>
            <span>Groups racing</span>
          </div>
        )}
        {v.attendance !== false && (
          <div>
            <Users />
            <strong>
              {Number(stats.attendanceRate || 0).toLocaleString()}%
            </strong>
            <span>Attendance</span>
          </div>
        )}
      </section>
      <section className="public-v3-grid public-race-grid">
        {v.groups !== false && (
          <Card className="public-v3-groups public-group-race-card">
            <div className="section-head">
              <div>
                <span className="eyebrow">THE GROUP RACE</span>
                <h2>Group progress</h2>
                <p className="muted">
                  Collective XP stays visible, while group rankings use average XP per eligible member to keep different-sized groups fair.
                </p>
              </div>
              <Trophy />
            </div>
            <GroupRaceChart data={raceData} />
            <div className="public-period-tabs" role="group" aria-label="Group leaderboard period">
              {(['weekly', 'monthly', 'overall'] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  className={groupPeriod === period ? "is-active" : ""}
                  onClick={() => setGroupPeriod(period)}
                  aria-pressed={groupPeriod === period}
                >
                  {period === 'weekly' ? 'Weekly' : period === 'monthly' ? 'Monthly' : 'Overall'}
                </button>
              ))}
            </div>
            <p className="muted public-leaderboard-period-label">{groupPeriodLabel} group ranking · average XP per eligible member</p>
            <div className="public-group-detail-grid">
              {selectedGroupLeaderboard.map((g: any, i: number) => (
                <div key={`${g.id || g.name}-${i}`}>
                  <strong>
                    {g.ranked ? `${g.rank}. ` : ""}{g.name}
                  </strong>
                  <span>
                    {Number(g.xp || 0).toLocaleString()} XP ·{" "}
                    {Number(g.averageXpPerMember || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} average XP/member ·{" "}
                    {Number(g.eligibleMembers || 0)} eligible
                    {!g.ranked ? " · not yet eligible to rank" : ""}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
        {v.highRisers !== false && (
          <Card className="public-v3-risers public-high-risers-card">
            <div className="section-head">
              <div>
                <span className="eyebrow">WEEKLY HIGH RISERS</span>
                <h2>Weekly progress</h2>
                <p className="muted">A snapshot of this week’s XP gains.</p>
              </div>
              <TrendingUp />
            </div>
            <HighRisersChart data={riserChart} />
          </Card>
        )}
        {v.challengeProgress !== false && (
          <Card className="public-challenge-progress-card">
            <div className="section-head">
              <div>
                <span className="eyebrow">CHALLENGE PROGRESS</span>
                <h2>Challenge activity</h2>
                <p className="muted">
                  Completed, in progress and still to explore.
                </p>
              </div>
              <Gamepad2 />
            </div>
            <ChallengeStatusChart
              data={[
                {
                  label: "Completed",
                  value: Number(challengeProgress.completed || 0),
                },
                {
                  label: "In progress",
                  value: Number(challengeProgress.active || 0),
                },
                {
                  label: "Not started",
                  value: Math.max(
                    0,
                    Number(challengeProgress.total || 0) -
                      Number(challengeProgress.completed || 0) -
                      Number(challengeProgress.active || 0),
                  ),
                },
              ]}
            />
          </Card>
        )}
        {v.attendance !== false && (
          <Card className="public-attendance-card">
            <div className="section-head">
              <div>
                <span className="eyebrow">ATTENDANCE</span>
                <h2>Today’s check-in</h2>
                <p className="muted">
                  {Number(stats.attendanceToday || 0).toLocaleString()} of{" "}
                  {Number(
                    stats.attendanceRegistered || stats.participants || 0,
                  ).toLocaleString()}{" "}
                  registered players checked in.
                </p>
              </div>
              <Users />
            </div>
            <div className="public-attendance-meter">
              <i
                style={{
                  width: `${Math.min(100, Number(stats.attendanceRate || 0))}%`,
                }}
              />
            </div>
            <strong>
              {Number(stats.attendanceRate || 0).toLocaleString()}%
            </strong>
          </Card>
        )}
        {mapAccess && d.mapAccessGranted && event ? (
          <Card className="public-v3-event">
            <div className="section-head">
              <div>
                <span className="eyebrow">EVENT MAP</span>
                <h2>{event.title}</h2>
                <p className="muted">
                  {event.locationName || "Private event details"}
                </p>
              </div>
              <MapPinned />
            </div>
            <EventMap
              value={event}
              events={events}
              onDirections={() =>
                event.directionsUrl &&
                window.open(
                  event.directionsUrl,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            />
          </Card>
        ) : null}
      </section>
      <footer className="public-v3-footer">
        <span>Approved collective data only</span>
        <span>Auto-refreshing community board</span>
      </footer>
      <div className={`public-slide-dots slide-${slide}`} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <button
        className="icon-btn fullscreen-control visible"
        aria-label={fullscreen ? t("exitFullscreen") : t("fullscreen")}
        title={fullscreen ? t("exitFullscreen") : t("fullscreen")}
        onClick={toggle}
      >
        {fullscreen ? <Minimize size={20} /> : <Expand size={20} />}
      </button>
    </main>
  );
}

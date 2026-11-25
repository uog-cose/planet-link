import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Clock,
  Flame,
  Gamepad2,
  Gift,
  MapPinned,
  Sparkles,
  Star,
  Trophy,
  Users,
  WifiOff,
  CheckCircle2,
  LockKeyhole,
  CalendarCheck,
  Zap,
  Target,
} from "lucide-react";
import { api } from "../../api";
import { useLiveDashboard } from "../../hooks/useLiveDashboard";
import { Card, Pill } from "../../components/ui";
import { Loading } from "../../components/feedback/Loading";
import { PointsQrCard } from "../../components/points/PointsQrCard";
import { EventMap } from "../../components/EventMap";
import { t } from "../../i18n";

type D = any;

function Countdown({
  until,
  prefix = "Ends in",
}: {
  until?: string | null;
  prefix?: string;
}) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const tick = () => {
      if (!until) return setLabel("");
      const ms = new Date(until).getTime() - Date.now();
      if (ms <= 0) return setLabel("Ending now");
      const totalMinutes = Math.ceil(ms / 60000);
      const d = Math.floor(totalMinutes / 1440);
      const h = Math.floor((totalMinutes % 1440) / 60);
      const m = totalMinutes % 60;
      // Use days for long windows; show the more useful hours/minutes for anything under a day.
      setLabel(
        d >= 1
          ? `${prefix} ${d}d${h ? ` ${h}h` : ""}`
          : `${prefix} ${h ? `${h}h` : ""}${h && m ? " " : ""}${m ? `${m}m` : "<1m"}`,
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [until, prefix]);
  return label ? <Pill icon={Clock}>{label}</Pill> : null;
}

export function YouthDashboard() {
  const [data, setData] = useState<D | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [activeTheme, setActiveTheme] = useState<string>(
    () => document.documentElement.dataset.theme || "meadow",
  );
  const ready = useRef(false);
  const refresh = useCallback(async () => {
    try {
      setError("");
      setData(await api<D>("/dashboard/"));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load your dashboard.",
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
    const on = () => setOffline(false),
      off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [refresh]);
  useLiveDashboard("dashboard", refresh, undefined, Boolean(data));

  // React to Theme Studio previews immediately, and to the saved programme theme
  // applied after authentication/navigation. This keeps the dashboard artwork in sync.
  useEffect(() => {
    const syncTheme = (event?: Event) => {
      const detail = (event as CustomEvent<{ theme?: string }> | undefined)
        ?.detail;
      let stored = "";
      try {
        stored = localStorage.getItem("yq-active-theme") || "";
      } catch {}
      const candidate =
        detail?.theme ||
        document.documentElement.dataset.theme ||
        stored ||
        "meadow";
      const resolved = [
        "space",
        "cleaning",
        "music",
        "arts",
        "games",
        "meadow",
        "sunrise",
        "ocean",
        "twilight",
      ].includes(candidate)
        ? candidate
        : "meadow";
      // applyTheme() dispatches this event. The listener must never call applyTheme()
      // again, or it recursively dispatches itself and can lock the UI.
      setActiveTheme(resolved);
    };
    syncTheme();
    window.addEventListener("yq-theme-applied", syncTheme);
    return () => window.removeEventListener("yq-theme-applied", syncTheme);
  }, []);

  useEffect(() => {
    if (!data || ready.current) return;
    ready.current = true;
    const frame = window.requestAnimationFrame(() =>
      window.dispatchEvent(
        new CustomEvent("yq-page-ready", {
          detail: { route: "youth-dashboard" },
        }),
      ),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [data]);

  const remainingAttempts = (x: any) => {
    if (
      x?.attemptsRemaining != null &&
      Number.isFinite(Number(x.attemptsRemaining))
    )
      return Math.max(0, Number(x.attemptsRemaining));
    if (x?.retries != null && x?.attemptsUsed != null)
      return Math.max(0, Number(x.retries) - Number(x.attemptsUsed));
    return null;
  };

  const activeAssignedGames = useMemo(
    () =>
      (data?.challenges || []).filter(
        (x: any) => x.status === "live" || x.status === "upcoming",
      ),
    [data],
  );
  const assignedGameCount = activeAssignedGames.length;

  const next = useMemo(() => {
    const active = [...activeAssignedGames];
    return (
      active.sort((a: any, b: any) => {
        const aEnd = a.endAt
          ? new Date(a.endAt).getTime()
          : Number.POSITIVE_INFINITY;
        const bEnd = b.endAt
          ? new Date(b.endAt).getTime()
          : Number.POSITIVE_INFINITY;
        if (aEnd !== bEnd) return aEnd - bEnd;
        return (
          new Date(a.startAt || 0).getTime() -
          new Date(b.startAt || 0).getTime()
        );
      })[0] || null
    );
  }, [data]);
  if (!data)
    return error ? (
      <div className="page">
        <Card className="error-card">
          <strong>{error}</strong>
          <button className="btn btn-secondary" onClick={() => refresh()}>
            Try again
          </button>
        </Card>
      </div>
    ) : (
      <Loading />
    );

  const configuredMilestones = Array.isArray(data.programme?.milestones)
    ? data.programme.milestones
    : Array.isArray(data.awards)
      ? data.awards
      : [];
  const milestones = configuredMilestones.filter(
    (m: any) => m && String(m.tier || "").trim() && Number(m.xp) > 0,
  );
  const lifetime = Number(data.profile?.lifetimeXp || 0);
  const target = Math.max(
    1,
    Number(
      data.programme?.target_xp ||
        data.programme?.theme_config?.questChampionXp ||
        500000,
    ),
  );
  const rewardAvailable = Boolean(data.rewardAvailable);
  const event = data.currentEvent || data.nextEvent || data.lastEvent;
  const firstName =
    String(data.profile?.gamertag || "")
      .trim()
      .split(/\s+/)[0] || "there";

  const themedArtwork = [
    "space",
    "cleaning",
    "music",
    "arts",
    "games",
  ].includes(activeTheme);
  const dashboardStyle = {
    "--theme-bg-image": themedArtwork
      ? `url("/quest-media/themes/backgrounds/${activeTheme}-background.jpg")`
      : `url("/quest-media/graphics/youth-dashboard-bg.png")`,
    "--theme-banner-image": themedArtwork
      ? `url("/quest-media/themes/banners/${activeTheme}-banner.jpg")`
      : "none",
  } as CSSProperties;

  const team = (data.groups || [])[0];
  const teamXp = Number(data.profile?.groupXp ?? team?.xp ?? 0);
  const teamTarget = Math.max(1, Number(team?.targetXp || target));
  const teamAverageXp = Number(team?.averageXpPerMember ?? 0);
  const teamProgress = Math.max(
    0,
    Math.min(100, Number(team?.progress ?? (teamAverageXp / teamTarget) * 100)),
  );
  const teamMilestones = Array.isArray(team?.milestones)
    ? [...team.milestones].sort(
        (a: any, b: any) => Number(a.xp || 0) - Number(b.xp || 0),
      )
    : [];
  const teamMilestonesDone = teamMilestones.filter(
    (milestone: any) => milestone.unlocked,
  ).length;
  const sortedMilestones = [...milestones].sort(
    (a: any, b: any) => Number(a.xp || 0) - Number(b.xp || 0),
  );
  const nextMilestone = sortedMilestones.find(
    (m: any) => Number(m.xp || 0) > lifetime,
  ) || null;
  const personalTarget = Math.max(1, Number(nextMilestone?.xp || target));
  const personalBase = sortedMilestones
    .filter((m: any) => Number(m.xp || 0) < personalTarget)
    .reduce((v: number, m: any) => Math.max(v, Number(m.xp || 0)), 0);
  const personalProgress = Math.max(
    0,
    Math.min(
      100,
      ((lifetime - personalBase) / Math.max(1, personalTarget - personalBase)) *
        100,
    ),
  );
  const doneCount = milestones.filter(
    (m: any) => lifetime >= Number(m.xp || 0),
  ).length;

  return (
    <div
      className="youth-page youth-dashboard-v3"
      data-active-theme={activeTheme}
      style={dashboardStyle}
    >
      <main className="page yq-kid-home">
        {offline && (
          <div className="yq-kid-offline">
            <WifiOff size={18} />
            <span>
              <strong>You're offline!</strong> Your progress will refresh when
              you're back.
            </span>
          </div>
        )}

        <section className="yq-kid-hero">
          <div className="yq-kid-hero-copy">
            <span className="yq-kid-kicker">
              <Sparkles size={15} /> YOUR ADVENTURE STARTS HERE
            </span>
            <h1>Hey, {firstName}!</h1>
            <p>Ready for your next little win?</p>
            <div className="yq-kid-hero-actions">
              {next ? (
                <Link
                  className="yq-kid-button yq-kid-button-main"
                  to={`/games/${next.assignmentId}`}
                >
                  <Gamepad2 size={19} />
                  {next.status === "live"
                    ? "Play your challenge"
                    : "See your next challenge"}
                  <ArrowRight size={17} />
                </Link>
              ) : (
                <Link className="yq-kid-button yq-kid-button-main" to="/games">
                  <Gamepad2 size={19} />
                  Find an adventure
                  <ArrowRight size={17} />
                </Link>
              )}
              {rewardAvailable && (
                <Link
                  className="yq-kid-button yq-kid-button-light"
                  to="/rewards"
                >
                  <Gift size={18} />
                  Open your mystery box
                </Link>
              )}
            </div>
          </div>
          <div
            className={`yq-kid-hero-art yq-kid-art-${activeTheme}`}
            aria-hidden="true"
          >
            {themedArtwork ? (
              <img
                src={`/quest-media/themes/theme-icons/${activeTheme}/${activeTheme}-icon.png`}
                alt=""
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src =
                    "/quest-media/graphics/login-kids-reference.png";
                }}
              />
            ) : (
              <img
                src="/quest-media/graphics/login-kids-reference.png"
                alt=""
              />
            )}
            <span className="yq-kid-spark yq-kid-spark-one">
              <Sparkles size={24} />
            </span>
            <span className="yq-kid-spark yq-kid-spark-two">
              <Star size={18} />
            </span>
          </div>
        </section>

        <section className="yq-kid-score-grid" aria-label="Your progress">
          <article className="yq-kid-score-card yq-kid-score-you">
            <div className="yq-kid-score-top">
              <span className="yq-kid-score-icon yq-kid-score-medal">
                <img src="/quest-media/themes/rewards/medal.png" alt="" />
              </span>
              <span className="yq-kid-chip">Individual score</span>
            </div>
            <strong className="yq-kid-big-number">
              {lifetime.toLocaleString()} <small>XP</small>
            </strong>
            <p>Every challenge helps you level up!</p>
            <div className="yq-kid-bar-labels">
              <span>
                {nextMilestone
                  ? `${Math.max(0, Number(nextMilestone.xp) - lifetime).toLocaleString()} XP to ${String(nextMilestone.tier || "your next reward").toLowerCase()}`
                  : "All quest milestones unlocked!"}
              </span>
              <b>
                {lifetime.toLocaleString()} / {personalTarget.toLocaleString()}{" "}
                XP
              </b>
            </div>
            <div
              className="yq-kid-bar"
              role="progressbar"
              aria-label={`Progress to ${String(nextMilestone?.tier || "next reward")}`}
              aria-valuemin={0}
              aria-valuemax={personalTarget}
              aria-valuenow={Math.min(lifetime, personalTarget)}
            >
              <span style={{ width: `${personalProgress}%` }} />
            </div>
            <div
              className="yq-kid-inline-quest"
              aria-label="Your XP milestones"
            >
              <div className="yq-kid-inline-quest-head">
                <span>
                  <Target size={14} /> YOUR QUEST MAP
                </span>
                <b>
                  {milestones.length ? `${doneCount}/${milestones.length} unlocked` : "Not configured"}
                </b>
              </div>
              <div className="yq-kid-inline-track">
                {milestones.length ? [...milestones]
                  .sort(
                    (a: any, b: any) => Number(a.xp || 0) - Number(b.xp || 0),
                  )
                  .filter((m: any) => Number(m.xp || 0) > 0)
                  .map((m: any, i: number, stops: any[]) => {
                    const need = Number(m.xp || 0);
                    const done = lifetime >= need;
                    return (
                      <div
                        className={`yq-kid-inline-stop ${done ? "is-done" : ""}`}
                        key={`${m.tier || i}-${m.xp}`}
                      >
                        <span
                          className="yq-kid-inline-dot"
                          style={{
                            color: String(
                              m.color ||
                                m.colour ||
                                m.themeColor ||
                                "var(--accent)",
                            ),
                          }}
                        >
                          <Trophy size={15} />
                        </span>
                        <span className="yq-kid-inline-label">
                          <b>
                            {String(m.tier || `Stop ${i + 1}`)}
                          </b>
                          <small>{need.toLocaleString()} XP</small>
                        </span>
                      </div>
                    );
                  }) : <p className="muted">Your youth worker or administrator has not configured any milestones yet.</p>}
              </div>
              {milestones.length > 0 && !nextMilestone && (
                <div className="yq-kid-next-prize">
                  <CheckCircle2 size={14} />
                  <span><b>All configured milestones reached!</b> Amazing work!</span>
                </div>
              )}
            </div>
          </article>
          <article className="yq-kid-score-card yq-kid-score-team">
            <div className="yq-kid-score-top">
              <span className="yq-kid-score-icon yq-kid-score-trophy">
                <img src="/quest-media/themes/rewards/trophy.png" alt="" />
              </span>
              <span className="yq-kid-chip">{team?.name || "Your team"}</span>
            </div>
            <strong className="yq-kid-big-number">
              {teamXp.toLocaleString()} <small>XP</small>
            </strong>
            <p>
              {team?.rank
                ? `${team.name} is currently #${team.rank} by average XP per eligible member.`
                : `${team?.name || "Your team"} is building its progress. Keep going together!`}
            </p>
            <div
              className="yq-kid-bar"
              role="progressbar"
              aria-label="Your team's quest goal progress"
              aria-valuemin={0}
              aria-valuemax={teamTarget}
              aria-valuenow={Math.min(teamXp, teamTarget)}
            >
              <span style={{ width: `${teamProgress}%` }} />
            </div>
            <div className="yq-kid-bar-labels">
              <span>Average team goal</span>
              <span>{Math.round(teamProgress)}% complete</span>
            </div>
            <div className="yq-kid-next-prize">
              <LockKeyhole size={15} />
              <span>
                {team?.eligibleMembers
                  ? `Average ${Math.round(Number(team.averageXpPerMember || 0)).toLocaleString()} XP per eligible member · ${team.eligibleMembers} counted.`
                  : "Your group's competitive ranking appears when it meets the minimum team size."}
              </span>
            </div>

            <div className="yq-kid-inline-quest" aria-label="Your group XP milestones">
              <div className="yq-kid-inline-quest-head">
                <span>
                  <Target size={14} /> GROUP QUEST MAP
                </span>
                <b>
                  {teamMilestones.length
                    ? `${teamMilestonesDone}/${teamMilestones.length} unlocked`
                    : "Not configured"}
                </b>
              </div>
              <div className="yq-kid-inline-track">
                {teamMilestones.length ? (
                  teamMilestones.map((milestone: any, index: number) => (
                    <div
                      className={`yq-kid-inline-stop ${milestone.unlocked ? "is-done" : ""}`}
                      key={`${milestone.name}-${milestone.xp}-${index}`}
                    >
                      <span className="yq-kid-inline-dot">
                        {milestone.unlocked
                          ? <CheckCircle2 size={15} />
                          : <LockKeyhole size={15} />}
                      </span>
                      <span className="yq-kid-inline-label">
                        <b>{milestone.name}</b>
                        <small>
                          {Number(milestone.xp).toLocaleString()} group XP
                          {milestone.prize ? ` · ${milestone.prize}` : ""}
                        </small>
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="muted">
                    Your youth worker or administrator has not configured any group milestones yet.
                  </p>
                )}
              </div>
              {teamMilestones.length > 0 && teamMilestonesDone === teamMilestones.length && (
                <div className="yq-kid-next-prize">
                  <CheckCircle2 size={14} />
                  <span><b>All group milestones reached!</b> Amazing teamwork!</span>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="yq-kid-two-column">
          <article className="yq-kid-panel yq-kid-challenge-panel">
            <div className="yq-kid-panel-heading">
              <span className="yq-kid-panel-icon">
                <Gamepad2 size={24} />
              </span>
              <div>
                <span className="yq-kid-eyebrow">READY WHEN YOU ARE</span>
                <h2>{next?.title || "Your next challenge"}</h2>
              </div>
            </div>
            {next ? (
              <>
                <p className="yq-kid-panel-description">
                  {next.description ||
                    "A new challenge is waiting for you. Give it a go!"}
                </p>
                <div className="yq-kid-meta">
                  <span>{next.gameType || next.kind || "Challenge"}</span>
                  {remainingAttempts(next) != null && (
                    <span>
                      {remainingAttempts(next)}{" "}
                      {Number(remainingAttempts(next)) === 1 ? "try" : "tries"}{" "}
                      left
                    </span>
                  )}
                  {next.endAt && <Countdown until={next.endAt} />}
                </div>
                <Link
                  className="yq-kid-button yq-kid-button-main yq-kid-full-button"
                  to={`/games/${next.assignmentId}`}
                >
                  {next.status === "live" ? "Let’s play!" : "See challenge"}
                  <ArrowRight size={17} />
                </Link>
                <div className="yq-kid-small-note">
                  You have {assignedGameCount}{" "}
                  {assignedGameCount === 1 ? "challenge" : "challenges"} waiting
                  for you.
                </div>
              </>
            ) : (
              <div className="yq-kid-empty">
                <Gamepad2 size={32} />
                <h3>All caught up!</h3>
                <p>Your next challenge will appear here when it's ready.</p>
                <Link className="yq-kid-button yq-kid-button-main" to="/games">
                  Explore games
                  <ArrowRight size={16} />
                </Link>
              </div>
            )}
          </article>

          <article className="yq-kid-panel yq-kid-streak-panel">
            <div className="yq-kid-panel-heading">
              <span className="yq-kid-panel-icon">
                <Flame size={24} />
              </span>
              <div>
                <span className="yq-kid-eyebrow">SHOWING UP IS A WIN</span>
                <h2>Onsite event attendance</h2>
              </div>
            </div>
            <div className="yq-kid-streak-banner">
              <div className="yq-kid-streak-flame">
                <Flame size={30} />
              </div>
              <div>
                <strong>{data.onsiteAttendanceStreak?.current || data.profile?.streak || 0} day check-in streak</strong>
                <span>
                  {data.onsiteAttendanceStreak?.hasAttendedToday
                    ? "Today's event check-in is counted. Great work!"
                    : "Scan the youth worker's QR code when you arrive at an onsite event."}
                </span>
              </div>
              <span className="yq-kid-streak-badge">
                <Zap size={15} /> KEEP IT UP
              </span>
            </div>
            <div className="yq-kid-streak-extra">
              <div>
                <strong>Daily login</strong>
                <b>{data.loginStreak?.current || 0} day{data.loginStreak?.current === 1 ? "" : "s"}</b>
                <span>
                  {data.loginStreak?.enabled === false
                    ? "Daily login rewards are currently paused."
                    : <>
                        {data.loginStreak?.loggedInToday ? "Today's login reward is counted. " : "Log in today to keep your streak going. "}
                        {data.loginStreak?.nextMilestone
                          ? `Next login reward: ${data.loginStreak.nextRewardXp} XP, including a ${data.loginStreak.nextMilestone.bonus_xp} XP bonus in ${data.loginStreak.milestoneWithinDays} more day${data.loginStreak.milestoneWithinDays === 1 ? "" : "s"}.`
                          : `Keep logging in for ${data.loginStreak?.dailyXp || 0} XP each day!`}
                      </>}
                </span>
              </div>
              <div>
                <strong>Event attendance</strong>
                <b>{data.onsiteAttendanceStreak?.current || 0} day{data.onsiteAttendanceStreak?.current === 1 ? "" : "s"} · {data.onsiteAttendanceStreak?.currentMultiplier || 1}×</b>
                <span>
                  {data.onsiteAttendanceStreak?.hasAttendedToday ? "Check-in counted today. " : "Next check-in: "}
                  {`Next check-in earns ${data.onsiteAttendanceStreak?.nextRewardXp || 0} XP. `}
                  {data.onsiteAttendanceStreak?.nextMilestone
                    ? `Reach ${data.onsiteAttendanceStreak.nextMilestone.multiplier}× in ${data.onsiteAttendanceStreak.milestoneWithinDays} more check-in day${data.onsiteAttendanceStreak.milestoneWithinDays === 1 ? "" : "s"}.`
                    : `Base reward: ${data.onsiteAttendanceStreak?.baseXp || 0} XP.`}
                </span>
              </div>
            </div>
            <div className="yq-kid-streak-week">
              <div className="yq-kid-streak-week-head">
                <strong>This week</strong>
                <span>
                  {data.attendanceStats?.daysLast7 || 0} of 7 check-ins
                </span>
              </div>
              <div className="yq-kid-streak-days">
                {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => {
                  const values = data.attendanceStats?.last7 || [];
                  const active = Boolean(values[i]);
                  return (
                    <div
                      className={active ? "is-active" : ""}
                      key={`${day}-${i}`}
                    >
                      <span>{day}</span>
                      <i>
                        {active ? (
                          <CheckCircle2 size={16} />
                        ) : (
                          <span className="yq-kid-streak-empty-dot" />
                        )}
                      </i>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="yq-kid-week-stats">
              <div>
                <strong>
                  {data.attendanceStats?.daysLast7 || 0}
                  <small>/7</small>
                </strong>
                <span>this week</span>
              </div>
              <div>
                <strong>
                  {data.attendanceStats?.daysLast28 || 0}
                  <small>/28</small>
                </strong>
                <span>last 4 weeks</span>
              </div>
            </div>
          </article>
        </section>

        <section className="yq-kid-event-row">
          {event ? (
            <article className="yq-kid-panel">
              <div className="yq-kid-panel-heading">
                <span className="yq-kid-panel-icon">
                  <MapPinned size={24} />
                </span>
                <div>
                  <span className="yq-kid-eyebrow">
                    {data.currentEvent ? "HAPPENING NOW" : data.nextEvent ? "UP NEXT · DON'T MISS IT" : "SOMETHING TO LOOK FORWARD TO"}
                  </span>
                  <h2>{event.title}</h2>
                </div>
              </div>
              <p className="yq-kid-panel-description">
                {event.locationName || t("eventDetails")}
              </p>
              {(data.currentEvent || data.nextEvent) && (
                <p className="yq-kid-small-note">
                  {data.currentEvent
                    ? "When you arrive, ask a youth worker to show you the attendance QR code and scan it once."
                    : "Coming up soon — remember to scan the attendance QR code when you arrive to earn your onsite XP."}
                </p>
              )}
              <EventMap
                value={event}
                events={data.events || []}
                onDirections={() =>
                  event.directionsUrl &&
                  window.open(
                    event.directionsUrl,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              />
            </article>
          ) : (
            <article className="yq-kid-panel yq-kid-event-empty">
              <CalendarCheck size={32} />
              <span className="yq-kid-eyebrow">UPCOMING FUN</span>
              <h2>No events just yet</h2>
              <p>When something fun is planned, you’ll find it here.</p>
            </article>
          )}
        </section>
        <section className="yq-kid-qr">
          <PointsQrCard
            avatar={data.profile.avatar}
            tier={data.profile.milestoneTier}
          />
        </section>
      </main>
    </div>
  );
}

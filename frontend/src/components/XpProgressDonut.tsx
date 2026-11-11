type Milestone = {
  tier?: string;
  xp?: number;
  rewardId?: number | null;
  color?: string;
};

export function XpProgressDonut({
  xp = 0,
  target = 1000,
  milestones = [],
  nextAward,
}: {
  xp?: number;
  target?: number;
  milestones?: Milestone[];
  nextAward?: Milestone;
}) {
  const safeXp = Math.max(0, Number.isFinite(Number(xp)) ? Number(xp) : 0);
  const safeTarget = Math.max(
    1,
    Number.isFinite(Number(target)) ? Number(target) : 1,
  );
  const progress = Math.max(0, Math.min(1, safeXp / safeTarget));
  const radius = 66,
    circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);
  const completed = milestones.filter(
    (m) => safeXp >= Number(m.xp || 0),
  ).length;
  const next = nextAward || milestones.find((m) => safeXp < Number(m.xp || 0));
  const nextXp = Number(next?.xp || safeTarget),
    toNext = Math.max(0, nextXp - safeXp);
  return (
    <div className="xp-progress-compact" aria-label="XP progress">
      <div className="xp-donut-wrap">
        <svg
          className="xp-donut"
          viewBox="0 0 160 160"
          role="img"
          aria-label={`${Math.round(progress * 100)} percent overall progress`}
        >
          <circle className="xp-donut-track" cx="80" cy="80" r={radius} />
          <circle
            className="xp-donut-progress"
            cx="80"
            cy="80"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
          {milestones.slice(0, 8).map((m, i) => {
            const angle = (Number(m.xp || 0) / safeTarget) * 360 - 90;
            const x = 80 + 73 * Math.cos((angle * Math.PI) / 180),
              y = 80 + 73 * Math.sin((angle * Math.PI) / 180);
            return (
              <circle
                key={`${m.tier || i}`}
                cx={x}
                cy={y}
                r="5"
                fill={
                  safeXp >= Number(m.xp || 0)
                    ? m.color || "var(--accent)"
                    : "var(--surface2)"
                }
                stroke="var(--surface)"
                strokeWidth="2"
              />
            );
          })}
        </svg>
        <div className="xp-donut-center">
          <strong>{safeXp.toLocaleString()}</strong>
          <span>XP</span>
          <b>{Math.round(progress * 100)}%</b>
        </div>
      </div>
      <div className="xp-compact-copy">
        <span className="eyebrow">YOUR PROGRESS</span>
        <strong>{toNext.toLocaleString()} XP to next reward</strong>
        <span>
          {completed}/{milestones.length || 0} milestones ·{" "}
          {safeTarget.toLocaleString()} XP target
        </span>
        {next && (
          <small className="xp-next-reward">
            <i style={{ background: next.color || "var(--accent2)" }} />
            {next.tier || "Next reward"} at {nextXp.toLocaleString()} XP
          </small>
        )}
        <div className="xp-milestone-legend">
          {milestones.slice(0, 5).map((m, i) => (
            <span
              key={`${m.tier || i}`}
              className={safeXp >= Number(m.xp || 0) ? "done" : ""}
            >
              <i style={{ background: m.color || "var(--accent)" }} />
              {m.tier || `Milestone ${i + 1}`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

import type { CSSProperties } from "react";
import { ArrowRight, Flame } from "lucide-react";
import { Link } from "react-router-dom";
import { QuestArt } from "./QuestArt";
import { t } from "../i18n";
import { QUEST_FEATURES } from "../config/youthDashboard";

export function QuestOverview() {
  return (
    <section
      className="quest-overview dashboard-reveal"
      aria-labelledby="quest-overview-title"
    >
      <div className="quest-overview-heading">
        <span className="eyebrow">{t("explorePlayGrow")}</span>
        <h2 id="quest-overview-title">{t("makeEverySmallWinCount")}</h2>
        <p>{t("questEverythingInOne")}</p>
      </div>
      <div className="quest-feature-grid">
        {QUEST_FEATURES.map(
          ({ tone, icon: Icon, titleKey, bodyKey, href, art }) => (
            <Link
              to={href}
              className={`quest-feature quest-feature-${tone}`}
              key={titleKey}
            >
              <span className="quest-feature-icon">
                <Icon size={24} strokeWidth={2.2} />
              </span>
              <div className="quest-feature-copy">
                <h3>{t(titleKey)}</h3>
                <p>{t(bodyKey)}</p>
              </div>
              <QuestArt kind={art} alt="" className="quest-feature-art" />
              <span className="quest-feature-arrow">
                <ArrowRight size={17} />
              </span>
            </Link>
          ),
        )}
      </div>
    </section>
  );
}

export function KeepMoving({
  streak = 0,
  progress = 0,
  onActionHref = "/activity",
}: {
  streak?: number;
  progress?: number;
  onActionHref?: string;
}) {
  const safeProgress = Math.max(
    0,
    Math.min(100, Number.isFinite(Number(progress)) ? Number(progress) : 0),
  );
  return (
    <section
      className="keep-moving dashboard-reveal"
      aria-labelledby="keep-moving-title"
    >
      <div className="keep-moving-copy">
        <span className="keep-moving-icon">
          <Flame size={23} />
        </span>
        <span className="eyebrow">{t("keepMoving")}</span>
        <h2 id="keep-moving-title">{t("keepStreakAlive")}</h2>
        <p>{t("keepStreakBody")}</p>
        <div
          className="streak-row"
          aria-label={`${streak} day attendance streak`}
        >
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className={i < streak ? "filled" : ""}>
              {i < streak ? "●" : "○"}
            </span>
          ))}
        </div>
        <Link className="btn btn-primary keep-moving-action" to={onActionHref}>
          {t("viewProgress")} <ArrowRight size={16} />
        </Link>
      </div>
      <div className="keep-moving-visual">
        <div
          className="streak-donut"
          style={{ "--streak-progress": `${safeProgress}%` } as CSSProperties}
        >
          <div className="streak-donut-inner">
            <strong>{Math.round(safeProgress)}%</strong>
            <span>{t("dailyProgress")}</span>
          </div>
        </div>
        <QuestArt kind="streak" alt="" />
      </div>
    </section>
  );
}

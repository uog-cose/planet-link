import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Gamepad2,
  HelpCircle,
  Home,
  LockKeyhole,
  MapPinned,
  Palette,
  QrCode,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
  MinusCircle,
  PlusCircle,
  Bell,
  Target,
} from "lucide-react";
import { Card } from "../components/ui";
import { t } from "../i18n";

const workerSteps = [
  { icon: QrCode, title: "guideStep1", body: "guideStep1Body" },
  { icon: Gamepad2, title: "guideStep2", body: "guideStep2Body" },
  { icon: Zap, title: "guideStep3", body: "guideStep3Body" },
  { icon: Activity, title: "guideStep4", body: "guideStep4Body" },
] as const;
const workerWorkflows = [
  {
    icon: Gamepad2,
    title: "guideWorkerCreateGame",
    body: "guideWorkerCreateGameBody",
  },
  {
    icon: MinusCircle,
    title: "guideWorkerRemovePoints",
    body: "guideWorkerRemovePointsBody",
  },
  {
    icon: PlusCircle,
    title: "guideWorkerAwardPoints",
    body: "guideWorkerAwardPointsBody",
  },
  {
    icon: QrCode,
    title: "guideWorkerAttendance",
    body: "guideWorkerAttendanceBody",
  },
] as const;
const adminAreas = [
  { icon: Users, title: "guideAccounts", body: "guideAccountsBody" },
  { icon: Gamepad2, title: "guideGames", body: "guideGamesBody" },
  { icon: QrCode, title: "guideAttendance", body: "guideAttendanceBody" },
  { icon: Sparkles, title: "guideRewards", body: "guideRewardsBody" },
  { icon: Palette, title: "guideTheme", body: "guideThemeBody" },
] as const;
const adminWorkflows = [
  {
    icon: ShieldCheck,
    title: "guideAdminSetupProgramme",
    body: "guideAdminSetupProgrammeBody",
  },
  {
    icon: Gamepad2,
    title: "guideAdminGameWorkflow",
    body: "guideAdminGameWorkflowBody",
  },
  {
    icon: Zap,
    title: "guideAdminPointsWorkflow",
    body: "guideAdminPointsWorkflowBody",
  },
  {
    icon: Palette,
    title: "guideAdminThemeWorkflow",
    body: "guideAdminThemeWorkflowBody",
  },
  {
    icon: Users,
    title: "guideAdminAccountsWorkflow",
    body: "guideAdminAccountsWorkflowBody",
  },
  {
    icon: Sparkles,
    title: "guideAdminRewardsWorkflow",
    body: "guideAdminRewardsWorkflowBody",
  },
] as const;
function IconCard({
  icon: Icon,
  title,
  body,
  number,
}: {
  icon: any;
  title: string;
  body: string;
  number?: number;
}) {
  return (
    <Card className="guide-step-card">
      <div className="guide-step-top">
        <span className="guide-icon">
          <Icon size={20} />
        </span>
        {number && (
          <span className="guide-number">
            {String(number).padStart(2, "0")}
          </span>
        )}
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
    </Card>
  );
}
type GuideAuth = { role?: "youth" | "worker" | "admin" } | null;
const guideLinks = (auth: GuideAuth) => {
  if (auth?.role === "youth")
    return [
      ["/", "Home", Home],
      ["/games", "Games", Gamepad2],
      ["/activity", "Activity", Activity],
      ["/profile", "Profile", Users],
      ["/notifications/settings", "Notifications", Bell],
    ] as const;
  if (auth?.role === "worker")
    return [
      ["/worker", "Home", Home],
      ["/worker/games", "Games", Gamepad2],
      ["/worker/skills", "Skills", Target],
      ["/worker/accounts", "Accounts", Users],
      ["/worker/map-event", "Map", MapPinned],
    ] as const;
  if (auth?.role === "admin")
    return [
      ["/admin", "Home", Home],
      ["/admin/games", "Games", Gamepad2],
      ["/admin/people", "People", Users],
      ["/admin/control-surfaces", "Controls", Target],
      ["/admin/stats", "Stats", Activity],
    ] as const;
  return [
    ["/login", "Sign in", Home],
    ["/public", "Public view", MapPinned],
  ] as const;
};
export function Guide({ auth = null }: { auth?: GuideAuth }) {
  const [role, setRole] = useState<"worker" | "admin">(
    auth?.role === "admin" ? "admin" : "worker",
  );
  const links = guideLinks(auth);
  return (
    <div className="page guide-page">
      <nav className="guide-page-nav" aria-label="Help navigation">
        {links.map(([href, label, Icon]) => (
          <Link key={href} to={href}>
            <Icon size={16} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="guide-hero">
        <div>
          <span className="eyebrow">{t("help")}</span>
          <h2>{t("guideTitle")}</h2>
          <p>{t("guideIntro")}</p>
        </div>
        <div className="guide-hero-art">
          <BookOpen size={48} />
          <span>YQ</span>
        </div>
      </div>
      <div className="guide-role-tabs" role="tablist">
        <button
          className={role === "worker" ? "active" : ""}
          onClick={() => setRole("worker")}
          role="tab"
        >
          {t("guideWorkerTitle")}
        </button>
        <button
          className={role === "admin" ? "active" : ""}
          onClick={() => setRole("admin")}
          role="tab"
        >
          {t("guideAdminTitle")}
        </button>
      </div>
      {role === "worker" ? (
        <>
          <section className="guide-section">
            <div className="section-head">
              <div>
                <span className="eyebrow">{t("guideQuickStart")}</span>
                <h3>{t("guideWorkerTitle")}</h3>
                <p>{t("guideWorkerIntro")}</p>
              </div>
              <ShieldCheck size={28} />
            </div>
            <div className="guide-step-grid">
              {workerSteps.map((x, i) => (
                <IconCard
                  key={x.title}
                  icon={x.icon}
                  title={t(x.title as any)}
                  body={t(x.body as any)}
                  number={i + 1}
                />
              ))}
            </div>
          </section>
          <section className="guide-section">
            <div className="section-head">
              <div>
                <span className="eyebrow">{t("guideWorkerWorkflowTitle")}</span>
                <h3>{t("guideWorkerWorkflowTitle")}</h3>
                <p>{t("guideWorkerWorkflowIntro")}</p>
              </div>
              <ArrowRight size={28} />
            </div>
            <div className="guide-step-grid guide-workflow-grid">
              {workerWorkflows.map((x, i) => (
                <IconCard
                  key={x.title}
                  icon={x.icon}
                  title={t(x.title as any)}
                  body={t(x.body as any)}
                  number={i + 1}
                />
              ))}
            </div>
          </section>
          <section className="guide-callout">
            <div className="guide-icon">
              <LockKeyhole size={20} />
            </div>
            <div>
              <h3>{t("guideSecurity")}</h3>
              <p>{t("guideSecurityBody")}</p>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="guide-section">
            <div className="section-head">
              <div>
                <span className="eyebrow">{t("guideAdminSetup")}</span>
                <h3>{t("guideAdminTitle")}</h3>
                <p>{t("guideAdminIntro")}</p>
              </div>
              <ShieldCheck size={28} />
            </div>
            <div className="guide-step-grid">
              {adminAreas.map((x, i) => (
                <IconCard
                  key={x.title}
                  icon={x.icon}
                  title={t(x.title as any)}
                  body={t(x.body as any)}
                  number={i + 1}
                />
              ))}
            </div>
          </section>
          <section className="guide-section">
            <div className="section-head">
              <div>
                <span className="eyebrow">{t("guideAdminWorkflowTitle")}</span>
                <h3>{t("guideAdminWorkflowTitle")}</h3>
                <p>{t("guideAdminWorkflowIntro")}</p>
              </div>
              <ArrowRight size={28} />
            </div>
            <div className="guide-step-grid guide-workflow-grid">
              {adminWorkflows.map((x, i) => (
                <IconCard
                  key={x.title}
                  icon={x.icon}
                  title={t(x.title as any)}
                  body={t(x.body as any)}
                  number={i + 1}
                />
              ))}
            </div>
          </section>
          <section className="guide-callout">
            <div className="guide-icon">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3>{t("guideSecurity")}</h3>
              <p>{t("guideSecurityBody")}</p>
            </div>
          </section>
        </>
      )}
      <section className="guide-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">{t("guideCommonTroubleshooting")}</span>
            <h3>{t("guideCommonTroubleshooting")}</h3>
            <p>{t("guideCommonTroubleshootingBody")}</p>
          </div>
          <HelpCircle size={28} />
        </div>
      </section>
      <section className="guide-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">{t("guideOffline")}</span>
            <h3>{t("guideOffline")}</h3>
            <p>{t("guideOfflineBody")}</p>
          </div>
          <Zap size={28} />
        </div>
      </section>
      <div className="guide-footer-links">
        <Link to="/privacy">
          <ShieldCheck size={16} />
          {t("guidePrivacyLink")}
        </Link>
        <Link to="/cookies">
          <LockKeyhole size={16} />
          {t("guideCookiesLink")}
        </Link>
        <span>
          <HelpCircle size={16} />
          {t("guideNeedHelp")} — {t("guideNeedHelpBody")}
        </span>
      </div>
    </div>
  );
}

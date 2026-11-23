import { useCallback, useEffect, useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api, setClientAuthenticated } from "../../api";
import { CONFIG } from "../../config";
import { t } from "../../i18n";
import {
  Gamepad2,
  HelpCircle,
  Gift,
  Home,
  LogOut,
  MapPinned,
  Palette,
  QrCode,
  SlidersHorizontal,
  Users,
  Target,
  Building2,
  History,
  UserRound,
  BarChart3,
  CalendarDays,
  Bell,
  Trash2,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import { User } from "../../types";
import { ChangePassword } from "../../pages/auth/ChangePassword";
import { YouthDashboard } from "../../pages/youth/Dashboard";
import { Challenges } from "../../pages/youth/Challenges";
import { BenchmarkGame } from "../../pages/youth/BenchmarkGame";
import { Skills } from "../../pages/youth/Skills";
import { Rewards } from "../../pages/youth/Rewards";
import { Drawings } from "../../pages/youth/Drawings";
import { Worker } from "../../pages/worker/Worker";
import { Attendance } from "../../pages/worker/Attendance";
import { Groups } from "../../pages/worker/Groups";
import { Admin } from "../../pages/admin/Admin";
import { Guide } from "../../pages/Guide";
import { Privacy } from "../../pages/Privacy";
import { Cookies } from "../../pages/Cookies";
import { ControlSurfaces } from "../../pages/admin/ControlSurfaces";
import { AdminStats } from "../../pages/admin/AdminStats";
import { AdminConfig } from "../../pages/admin/AdminConfig";
import { ThemeEditor } from "../../pages/admin/ThemeEditor";
import { Participants } from "../../pages/worker/Participants";
import { PointsApproval } from "../../pages/worker/PointsApproval";
import { PasswordResetQr } from "../../pages/admin/PasswordResetQr";
import { AttendanceCheckIn } from "../../pages/youth/AttendanceCheckIn";
import { ErrorPage } from "../feedback/ErrorPage";
import { GameEditor } from "../../pages/admin/GameEditor";
import { Accounts } from "../../pages/staff/Accounts";
import { RewardsConfig } from "../../pages/staff/RewardsConfig";
import { SkillsConfig } from "../../pages/staff/SkillsConfig";
import { Notifications } from "../../pages/Notifications";
import { NotificationBell } from "../NotificationBell";
import { OfflineBanner } from "../OfflineBanner";
import { PwaInstallPrompt } from "../PwaInstallPrompt";
import { NotificationSettings } from "../../pages/NotificationSettings";
import { NotificationSounds } from "../../pages/admin/NotificationSounds";
import { MapEvent } from "../../pages/admin/MapEvent";
import { Activity } from "../../pages/youth/Activity";
import { Explorer } from "../../pages/youth/Explorer";
import { PointsQr } from "../../pages/youth/PointsQr";
import { ProgrammeInstances } from "../../pages/admin/ProgrammeInstances";
import { PeopleGroups } from "../../pages/admin/PeopleGroups";
import { celebrateAward } from "../AwardCelebration";
import type { AwardDetail } from "../AwardCelebration";
import { PhoneNotificationPrompt } from "../PhoneNotificationPrompt";
import { avatarAsset } from "../QuestArt";
import { MilestoneAvatar } from "../MilestoneAvatar";
import { applyTheme } from "../../theme";
import { CommandPalette } from "../CommandPalette";

function notificationToAward(n: any): AwardDetail {
  const negative =
    n.kind === "penalty" || /^[-−]\d+\s*XP/i.test(String(n.title));
  const reward = n.kind === "reward";
  const xpMatch =
    String(n.title || "").match(/([+-]\d+)\s*XP/i) ||
    String(n.body || "").match(/([+-]\d+)\s*XP/i);
  const xp = xpMatch ? Number(xpMatch[1]) : undefined;
  const performance =
    typeof n.performance === "number" ? n.performance : undefined;
  const declined =
    n.kind === "approval" && /declined|rejected/i.test(String(n.title));
  const kind: AwardDetail["kind"] = declined
    ? "approval-rejected"
    : negative
      ? "penalty"
      : reward
        ? "reward"
        : n.kind === "game"
          ? "game-score"
          : n.kind === "approval"
            ? "approval"
            : n.kind === "help"
              ? "help"
              : "xp";
  return {
    notificationId: Number(n.id),
    title: n.title,
    xp: reward ? undefined : xp,
    body: n.body,
    kind,
    performance,
    url: n.url,
  };
}

function YouthAwardWatcher({ role }: { role: string }) {
  useEffect(() => {
    if (role !== "youth" && role !== "worker" && role !== "admin") return;
    let alive = true;
    const storageKey = `yq-popup-seen:${role}`;
    const seen = new Set<number>();
    try {
      JSON.parse(sessionStorage.getItem(storageKey) || "[]").forEach(
        (id: any) => {
          const n = Number(id);
          if (Number.isFinite(n)) seen.add(n);
        },
      );
    } catch {}
    const remember = (id: number) => {
      seen.add(id);
      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify([...seen].slice(-250)),
        );
      } catch {}
    };
    let reconcileInFlight = false;
    const claim = async (ids: number[]) => {
      if (!ids.length) return { ids: new Set<number>(), items: [] as any[] };
      try {
        const r = await api<any>("/notifications/popup-delivered/", {
          method: "POST",
          body: JSON.stringify({ ids }),
        });
        return {
          ids: new Set<number>((r.ids || []).map((x: any) => Number(x))),
          items: Array.isArray(r.items) ? r.items : [],
        };
      } catch {
        return { ids: new Set<number>(), items: [] as any[] };
      }
    };
    const showItems = (items: any[]) => {
      if (!alive) return;
      // The server's popup_delivered_at is the durable claim; sessionStorage also protects
      // against duplicate delivery across SSE reconnects and simultaneous push events.
      items
        .slice()
        .sort(
          (a, b) =>
            new Date(a.created_at || 0).getTime() -
              new Date(b.created_at || 0).getTime() ||
            Number(a.id) - Number(b.id),
        )
        .forEach((n: any) => {
          const id = Number(n.id ?? n.notificationId);
          if (!Number.isFinite(id) || seen.has(id)) return;
          remember(id);
          window.dispatchEvent(
            new CustomEvent("yq-notification-received", {
              detail: { ...n, id },
            }),
          );
          celebrateAward(notificationToAward({ ...n, id }));
        });
    };
    const acceptItems = async (items: any[]) => {
      const fresh = items.filter(
        (n: any) => Number.isFinite(Number(n.id)) && !seen.has(Number(n.id)),
      );
      if (!fresh.length) return;
      const claimed = await claim(fresh.map((n: any) => Number(n.id)));
      // Only display items this client successfully claimed, preventing multiple tabs
      // from displaying the same popup. Preserve stream order.
      showItems(claimed.items);
    };
    const handlePush = (n: any) => {
      if (!alive || !n) return;
      const id = Number(n.id ?? n.notificationId);
      if (!Number.isFinite(id) || seen.has(id)) return;
      void acceptItems([{ ...n, id }]);
    };
    const onPush = (e: Event) => handlePush((e as CustomEvent).detail);
    window.addEventListener("yq-push-notification", onPush);
    const q = (window as any).__yqPushQueue as MessageEvent[] | undefined;
    if (q?.length) {
      const pending = q.splice(0, q.length);
      pending.forEach((e) => handlePush(e.data?.notification));
    }
    const reconcile = async () => {
      if (reconcileInFlight || !alive) return;
      reconcileInFlight = true;
      try {
        const r = await api<any>("/notifications/pending-popups/");
        if (alive) await acceptItems(r.items || []);
      } catch {
      } finally {
        reconcileInFlight = false;
      }
    };
    void reconcile();
    let source: EventSource | null = null;
    let fallbackTimer: number | undefined;
    let fallbackDelay = 30000;
    const connect = () => {
      if (!alive || document.visibilityState === "hidden" || source) return;
      const url = new URL(
        `${CONFIG.apiUrl.replace(/\/$/, "")}/notifications/events/`,
        window.location.origin,
      );
      source = new EventSource(url.toString(), { withCredentials: true });
      source.addEventListener("notification", (event: MessageEvent) => {
        try {
          const items = JSON.parse(event.data);
          if (Array.isArray(items)) void acceptItems(items);
        } catch {}
      });
      source.addEventListener("notifications-disabled", () => {
        source?.close();
        source = null;
      });
      source.addEventListener("auth-required", () => {
        source?.close();
        source = null;
      });
      source.onopen = () => {
        fallbackDelay = 30000;
      };
      source.onerror = () => {
        source?.close();
        source = null;
        void reconcile();
        if (fallbackTimer) window.clearTimeout(fallbackTimer);
        fallbackTimer = window.setTimeout(() => {
          fallbackDelay = Math.min(fallbackDelay * 2, 120000);
          connect();
        }, fallbackDelay);
      };
    };
    // SSE replaces the 3-second client poll. A slow fallback reconciliation protects
    // deployments where streaming is not supported by the proxy/server.
    connect();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (!source) connect();
        void reconcile();
      } else {
        source?.close();
        source = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    const slowFallback = window.setInterval(() => {
      if (document.visibilityState === "visible" && !source) void reconcile();
    }, 60000);
    return () => {
      alive = false;
      source?.close();
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      window.clearInterval(slowFallback);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("yq-push-notification", onPush);
    };
  }, [role]);
  return null;
}

function decodePushKey(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
function PushRegistration({ auth }: { auth: User }) {
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      )
        return;
      try {
        const server = await api<any>("/settings/notifications/");
        if (
          !server.pushConfigured ||
          !server.optIn ||
          localStorage.getItem("yq_notifications_opted_out") === "1"
        )
          return;
        if (Notification.permission !== "granted") return;
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          const key = (await api<any>("/notifications/config/")).publicKey;
          if (!key) return;
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: decodePushKey(key),
          });
        }
        if (alive) {
          await api("/notifications/push/", {
            method: "POST",
            body: JSON.stringify({ subscription: sub.toJSON() }),
          });
          if (!server.pushOptIn)
            await api("/settings/notifications/", {
              method: "POST",
              body: JSON.stringify({ optIn: true, pushOptIn: true }),
            });
        }
      } catch {}
    };
    void sync();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void sync();
    };
    const onPageShow = () => void sync();
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [auth.username, auth.role]);
  return null;
}

const navByRole: Record<
  User["role"],
  Array<[string, keyof typeof import("../../locales/en.json"), LucideIcon]>
> = {
  youth: [
    ["/", "home", Home],
    ["/games", "challenges", Gamepad2],
    ["/rewards", "rewards", Gift],
    ["/activity", "recentlyEarned", History],
    ["/points-qr", "pointsQr", QrCode],
    ["/profile", "profile", UserRound],
  ],
  worker: [
    ["/worker", "overview", Home],
    ["/worker/points", "assignPoints", ClipboardCheck],
    ["/worker/games", "games", Gamepad2],
    ["/worker/scratch-cards", "scratchCards", Gift],
    ["/worker/accounts", "accounts", Users],
    ["/groups", "groups", Users],
    ["/worker/skills", "skills", Target],
    ["/worker/map-event", "publicDisplay", MapPinned],
    ["/help", "help", HelpCircle],
  ],
  admin: [
    ["/admin", "overview", Home],
    ["/worker/points", "assignPoints", ClipboardCheck],
    ["/admin/stats", "stats", BarChart3],
    ["/admin/people", "accountsAndGroups", Users],
    ["/admin/control-surfaces", "controlSurfaces", SlidersHorizontal],
    ["/admin/instances", "programmeInstances", Building2],
    ["/admin/password-reset-qr", "passwordResetQr", QrCode],
    ["/help", "help", HelpCircle],
  ],
};

function ApprovalNavItem({ href, labelKey, Icon, active }: any) {
  const [count, setCount] = useState(0);
  const load = useCallback(() => {
    api<any>("/approvals/count/")
      .then((r) => setCount(Number(r.total || 0)))
      .catch(() => {});
  }, []);
  useEffect(() => {
    let alive = true;
    const onChanged = () => {
      if (alive) load();
    };
    void load();
    window.addEventListener("yq-approval-changed", onChanged);
    window.addEventListener("yq-notification-received", onChanged);
    return () => {
      alive = false;
      window.removeEventListener("yq-approval-changed", onChanged);
      window.removeEventListener("yq-notification-received", onChanged);
    };
  }, [load]);
  return (
    <Link to={href} className={active ? "active" : ""}>
      <Icon size={19} />
      <span>{t(labelKey as any)}</span>
      {count > 0 && (
        <span
          className="nav-count"
          aria-label={`${count} items waiting for approval`}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

export function Shell({
  auth,
  setAuth,
}: {
  auth: User | null;
  setAuth: (u: User | null) => void;
}) {
  const nav = useNavigate();
  const loc = useLocation();
  const [youthProfile, setYouthProfile] = useState<any>(null);
  useEffect(() => {
    if (!auth && loc.pathname !== "/login")
      nav("/login", {
        replace: true,
        state: { from: loc.pathname + loc.search },
      });
  }, [auth, loc.pathname, nav]);
  useEffect(() => {
    if (!auth) return;
    let alive = true;
    // Theme Studio owns its local preview. Everywhere else, keep the shell
    // synchronized with the persisted programme theme across users/devices.
    if (loc.pathname === "/admin/theme")
      return () => {
        alive = false;
      };
    const syncSavedTheme = async () => {
      try {
        const x = await api<any>("/public/theme/");
        if (alive && x.themeConfig)
          applyTheme(x.themeConfig, x.theme || "meadow");
      } catch {
        // Retain the last known-good theme during temporary network failures.
      }
    };
    void syncSavedTheme();
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void syncSavedTheme();
    }, 10000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [auth?.role, loc.pathname]);
  useEffect(() => {
    if (auth?.role !== "youth") return;
    let alive = true;
    api<any>("/dashboard/")
      .then((x) => {
        if (alive) setYouthProfile(x.profile || null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [auth?.role]);
  if (!auth) return null;
  if (auth.mustChangePassword && loc.pathname !== "/change-password") {
    nav("/change-password", { replace: true });
    return null;
  }
  if (auth.role === "youth")
    return (
      <div className="app-shell role-youth">
        <OfflineBanner />
        <PushRegistration auth={auth} />
        <PhoneNotificationPrompt />
        <YouthAwardWatcher role="youth" />
        <aside className="sidebar youth-sidebar">
          <div className="logo">
            <span>YQ</span>
            <strong>{t("appName")}</strong>
          </div>
          <nav className="sidebar-nav">
            <div className="sidebar-nav-main">
              {navByRole.youth.map(([href, labelKey, Comp]) => (
                <Link
                  key={href}
                  className={
                    loc.pathname === href ||
                    (href === "/rewards" && loc.pathname.startsWith("/rewards"))
                      ? "active"
                      : ""
                  }
                  to={href}
                >
                  <Comp size={19} />
                  <span>{t(labelKey)}</span>
                </Link>
              ))}
            </div>
            <div className="sidebar-nav-utility">
              <Link className="mobile-nav-profile" to="/profile">
                <UserRound size={18} />
                <span>Profile</span>
              </Link>
              <Link
                className="mobile-nav-notification"
                to="/notifications/settings"
              >
                <Bell size={18} />
                <span>Notifications</span>
              </Link>
              <button
                onClick={async () => {
                  await api("/auth/logout/", { method: "POST" });
                  setClientAuthenticated(false);
                  setAuth(null);
                  nav("/login", { replace: true });
                }}
              >
                <LogOut size={18} />
                <span>{t("logout")}</span>
              </button>
            </div>
          </nav>
        </aside>
        <main className="main youth-main">
          <header className="topbar youth-topbar">
            <CommandPalette role="youth" />
            <div>
              <nav className="shell-breadcrumb" aria-label="Breadcrumb">
                <span>Youth Quest</span>
                <b>›</b>
                <span>
                  {loc.pathname === "/"
                    ? "Home"
                    : loc.pathname.startsWith("/games")
                      ? "Games"
                      : loc.pathname.startsWith("/rewards")
                        ? "Rewards"
                        : loc.pathname.startsWith("/activity")
                          ? "Activity"
                          : loc.pathname.startsWith("/notifications")
                            ? "Notifications"
                            : "Profile"}
                </span>
              </nav>
              <h1>
                {loc.pathname === "/"
                  ? "Your quest"
                  : loc.pathname.startsWith("/games")
                    ? "Games"
                    : loc.pathname.startsWith("/rewards")
                      ? "Rewards"
                      : loc.pathname.startsWith("/activity")
                        ? "Activity"
                        : loc.pathname.startsWith("/notifications")
                          ? "Notifications"
                          : "Your profile"}
              </h1>
            </div>
            <div className="top-actions mobile-profile-notify">
              <NotificationBell label={t("notifications")} />
              <Link
                className="profile-avatar-link"
                to="/profile"
                aria-label="Open profile"
              >
                <MilestoneAvatar
                  avatar={youthProfile?.avatar}
                  imageUrl={youthProfile?.avatarImageUrl}
                  tier={youthProfile?.milestoneTier}
                  color={youthProfile?.milestoneColor}
                  level={youthProfile?.level}
                  size="sm"
                />
              </Link>
            </div>
          </header>
          <Routes>
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/" element={<YouthDashboard />} />
            <Route path="/points-qr" element={<PointsQr />} />
            <Route path="/games" element={<Challenges />} />
            <Route path="/games/:assignmentId" element={<BenchmarkGame />} />
            <Route path="/rewards" element={<Rewards />} />
            <Route path="/skills" element={<Navigate to="/games" replace />} />
            <Route
              path="/drawings"
              element={<Navigate to="/games" replace />}
            />
            <Route path="/activity" element={<Activity />} />
            <Route path="/profile" element={<Explorer />} />
            <Route
              path="/profile/notifications"
              element={<Navigate to="/notifications/settings" replace />}
            />
            <Route
              path="/notifications/settings"
              element={<NotificationSettings />}
            />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="*" element={<ErrorPage kind="404" homePath="/" />} />
          </Routes>
        </main>
      </div>
    );
  const role = auth.role as "worker" | "admin";
  const homePath = role === "worker" ? "/worker" : "/admin";
  const navItems = navByRole[role];
  const sectionLabel = role === "worker" ? t("fieldOps") : t("controlRoom");
  const heading =
    role === "worker" ? t("youthWorkerHub") : t("programmeControl");
  const showPublic = true;
  return (
    <div className={`app-shell role-${role}`}>
      <OfflineBanner />
      <PushRegistration auth={auth} />
      <YouthAwardWatcher role={role} />
      <aside className="sidebar">
        <div className="logo">
          <span>YQ</span>
          <strong>{t("appName")}</strong>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-nav-main">
            {navItems.map(([href, labelKey, Comp]) =>
              href === "/worker/points" ? (
                <ApprovalNavItem
                  key={href}
                  href={href}
                  labelKey={labelKey}
                  Icon={Comp as LucideIcon}
                  active={loc.pathname === href}
                />
              ) : (
                <Link
                  key={href}
                  className={loc.pathname === href ? "active" : ""}
                  to={href}
                >
                  <Comp size={19} />
                  <span>{t(labelKey as any)}</span>
                </Link>
              ),
            )}
          </div>
          <div className="sidebar-nav-utility">
            {showPublic && (
              <Link className="mobile-nav-public" to="/public">
                <MapPinned size={18} />
                <span>{t("publicDisplay")}</span>
              </Link>
            )}
            <Link to="/notifications/settings">
              <Bell size={18} />
              <span>{t("notifications")}</span>
            </Link>
            <Link to={role === "worker" ? "/worker" : "/admin"}>
              <UserRound size={18} />
              <span>Profile</span>
            </Link>
            <button
              onClick={async () => {
                await api("/auth/logout/", { method: "POST" });
                setClientAuthenticated(false);
                setAuth(null);
                nav("/login", { replace: true });
              }}
            >
              <LogOut size={18} />
              <span>{t("logout")}</span>
            </button>
          </div>
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <CommandPalette role={role} />
          <div>
            <nav className="shell-breadcrumb" aria-label="Breadcrumb">
              <span>{sectionLabel}</span>
              <b>›</b>
              <span>
                {loc.pathname === "/"
                  ? heading
                  : loc.pathname
                      .replace(/^\//, "")
                      .split("/")
                      .filter(Boolean)
                      .map((x) =>
                        x
                          .replace(/[-_]/g, " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase()),
                      )
                      .join(" › ")}
              </span>
            </nav>
            <h1>{heading}</h1>
          </div>
          <div className="top-actions">
            {showPublic && (
              <Link className="public-nav" to="/public">
                <MapPinned size={17} />
                {t("publicDisplay")}
              </Link>
            )}
            <div className="mobile-profile-notify">
              <NotificationBell label={t("notifications")} />
              <Link
                className="profile-avatar-link"
                to={role === "worker" ? "/worker" : "/admin"}
                aria-label="Open profile"
              >
                <MilestoneAvatar
                  avatar={role === "worker" ? "alex" : "ben"}
                  tier={role}
                  level={1}
                  showLevel={false}
                  size="sm"
                />
              </Link>
            </div>
            <PwaInstallPrompt />
          </div>
        </header>
        <Routes>
          <Route path="/change-password" element={<ChangePassword />} />
          <Route
            path="/"
            element={role === "worker" ? <Worker /> : <Admin />}
          />
          <Route path="/challenges" element={<Challenges />} />
          <Route
            path="/notifications/settings"
            element={<NotificationSettings />}
          />
          <Route path="/games/:assignmentId" element={<BenchmarkGame />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/rewards" element={<Rewards />} />
          <Route path="/drawings" element={<Drawings />} />
          <Route path="/worker" element={<Worker />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/groups" element={<Groups />} />
          <Route
            path="/participants"
            element={<Navigate to="/worker/accounts" replace />}
          />
          <Route
            path="/worker/points"
            element={<PointsApproval role={role} />}
          />
          <Route path="/worker/scratch-cards" element={<RewardsConfig />} />
          <Route
            path="/worker/rewards"
            element={<Navigate to="/worker/scratch-cards" replace />}
          />
          <Route path="/worker/map-event" element={<MapEvent />} />
          <Route path="/worker/skills" element={<SkillsConfig />} />
          <Route path="/worker/accounts" element={<Accounts role="worker" />} />
          <Route path="/worker/games" element={<GameEditor />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/stats" element={<AdminStats />} />
          <Route path="/admin/control-surfaces" element={<ControlSurfaces />} />
          <Route path="/admin/instances" element={<ProgrammeInstances />} />
          <Route path="/admin/people" element={<PeopleGroups />} />
          <Route path="/admin/config" element={<AdminConfig />} />
          <Route path="/admin/theme" element={<ThemeEditor />} />
          <Route path="/admin/games" element={<GameEditor />} />
          <Route path="/admin/accounts" element={<Accounts role="admin" />} />
          <Route
            path="/admin/password-reset-qr"
            element={<PasswordResetQr />}
          />
          <Route
            path="/admin/notification-sounds"
            element={<NotificationSounds />}
          />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/help" element={<Guide auth={auth} />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/cookies" element={<Cookies />} />
          <Route path="/admin/map-event" element={<MapEvent />} />
          <Route path="/admin/scratch-cards" element={<RewardsConfig />} />
          <Route
            path="/admin/rewards"
            element={<Navigate to="/admin/scratch-cards" replace />}
          />
          <Route path="/admin/skills" element={<SkillsConfig />} />
          <Route
            path="*"
            element={<ErrorPage kind="404" homePath={homePath} />}
          />
        </Routes>
      </main>
    </div>
  );
}

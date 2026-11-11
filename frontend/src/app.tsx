import { useEffect, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import {
  api,
  setClientAuthenticated,
  refreshSession,
  hasClientSessionCookie,
} from "./api";
import { Login } from "./pages/auth/Login";
import { ResetPassword } from "./pages/auth/ResetPassword";
import { ChangePassword } from "./pages/auth/ChangePassword";
import { Public } from "./pages/public/Public";
import { PublicPointsRequest } from "./pages/public/PublicPointsRequest";
import { AttendanceCheckIn } from "./pages/youth/AttendanceCheckIn";
import { ErrorPage, AppErrorBoundary } from "./components/feedback/ErrorPage";
import { Shell } from "./components/layout/Shell";
import { User } from "./types";
import { ToastProvider, useToast } from "./components/ToastProvider";
import { AwardCelebration } from "./components/AwardCelebration";
import { flushOfflineQueue } from "./offlineQueue";
import { Privacy } from "./pages/Privacy";
import { Cookies } from "./pages/Cookies";
import { Guide } from "./pages/Guide";

function GlobalApiErrorNotice() {
  const { show } = useToast();
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (Number(detail.status) === 401) return;
      show(
        String(detail.message || "Something went wrong. Please try again."),
        "error",
      );
    };
    window.addEventListener("yq-api-error", handler);
    return () => window.removeEventListener("yq-api-error", handler);
  }, [show]);
  return null;
}
export function App() {
  const [auth, setAuth] = useState<User | null>(null);
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname;
    let label = "Youth Quest";
    if (path === "/public" || path.startsWith("/public/"))
      label = "Community Board";
    else if (path === "/login") label = "Sign in";
    else if (path === "/privacy") label = "Privacy";
    else if (path === "/cookies") label = "Cookies";
    else if (path === "/help") label = "Guide";
    else if (path === "/")
      label =
        auth?.role === "admin"
          ? "Admin Control Room"
          : auth?.role === "worker"
            ? "Youth Worker Hub"
            : "Your Quest";
    else if (path.startsWith("/games/")) label = "Challenge";
    else if (path === "/games") label = "Games";
    else if (path.startsWith("/rewards")) label = "Rewards";
    else if (path.startsWith("/activity")) label = "Activity";
    else if (path.startsWith("/drawings")) label = "Creative Quest";
    else if (path.startsWith("/notifications")) label = "Notifications";
    else if (path.startsWith("/worker/points")) label = "Points Approval";
    else if (path.startsWith("/worker/games")) label = "Game Library";
    else if (path.startsWith("/worker")) label = "Youth Worker";
    else if (path.startsWith("/admin")) label = "Admin";
    else if (path.startsWith("/profile")) label = "Profile";
    document.title =
      label === "Youth Quest" ? "Youth Quest" : `${label} · Youth Quest`;
  }, [location.pathname, auth?.role]);
  useEffect(() => {
    setClientAuthenticated(Boolean(auth));
  }, [auth]);
  useEffect(() => {
    if (!auth) return;
    const flush = () => {
      void flushOfflineQueue();
    };
    flush();
    window.addEventListener("online", flush);
    window.addEventListener("focus", flush);
    document.addEventListener("visibilitychange", flush);
    const timer = window.setInterval(flush, 30000);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("focus", flush);
      document.removeEventListener("visibilitychange", flush);
      window.clearInterval(timer);
    };
  }, [auth]);
  useEffect(() => {
    const stopWheel = (e: WheelEvent) => {
      const el = e.target as HTMLInputElement | null;
      if (el?.tagName === "INPUT" && el.type === "number") e.preventDefault();
    };
    document.addEventListener("wheel", stopWheel, { passive: false });
    return () => document.removeEventListener("wheel", stopWheel);
  }, []);
  const [booting, setBooting] = useState(hasClientSessionCookie());
  useEffect(() => {
    let cancelled = false;
    if (!hasClientSessionCookie()) {
      setBooting(false);
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      try {
        const x = await api<{
          authenticated: boolean;
          user: User | null;
          theme?: string;
          themeConfig?: Record<string, string>;
        }>("/auth/me/");
        if (x.theme) document.documentElement.dataset.theme = x.theme;
        if (x.themeConfig)
          import("./theme").then(({ applyTheme }) =>
            applyTheme(x.themeConfig!, x.theme),
          );
        if (!cancelled) {
          setClientAuthenticated(Boolean(x.user));
          setAuth(x.user);
        }
      } catch {
        if (await refreshSession()) {
          try {
            const x = await api<{
              authenticated: boolean;
              user: User | null;
              theme?: string;
              themeConfig?: Record<string, string>;
            }>("/auth/me/");
            if (x.theme) document.documentElement.dataset.theme = x.theme;
            if (x.themeConfig)
              import("./theme").then(({ applyTheme }) =>
                applyTheme(x.themeConfig!, x.theme),
              );
            if (!cancelled) {
              setClientAuthenticated(Boolean(x.user));
              setAuth(x.user);
            }
          } catch {
            if (!cancelled) {
              setClientAuthenticated(false);
              setAuth(null);
            }
          }
        } else if (!cancelled) {
          setClientAuthenticated(false);
          setAuth(null);
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  if (booting)
    return (
      <div className="app-loading">
        <div className="boot-skeleton">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  return (
    <ToastProvider>
      <GlobalApiErrorNotice />
      <AwardCelebration />
      <AppErrorBoundary>
        <Routes>
          <Route
            path="/login"
            element={
              <Login
                onLogin={(u) => {
                  setClientAuthenticated(true);
                  setAuth(u);
                }}
              />
            }
          />
          <Route path="/public" element={<Public />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/cookies" element={<Cookies />} />
          <Route path="/help" element={<Guide auth={auth} />} />
          <Route path="/public/points" element={<PublicPointsRequest />} />
          <Route
            path="/public/map/:instanceId/:mapAccess"
            element={<Public />}
          />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/check-in" element={<AttendanceCheckIn />} />
          <Route path="*" element={<Shell auth={auth} setAuth={setAuth} />} />
          <Route path="*" element={<ErrorPage kind="404" />} />
        </Routes>
      </AppErrorBoundary>
    </ToastProvider>
  );
}

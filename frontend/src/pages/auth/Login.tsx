
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, getCsrf, setClientAuthenticated } from "../../api";
import { t } from "../../i18n";
import { CONFIG } from "../../config";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Gamepad2,
  LockKeyhole,
  MapPinned,
  ShieldCheck,
  Users,
  Trophy,
} from "lucide-react";
import { User } from "../../types";
import { DevQuickLogin } from "../../devtools/quick-login";
import { applyTheme, THEME_PRESETS } from "../../theme";

export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const nav = useNavigate();
  const loc = useLocation();
  const returnTo = (loc.state as any)?.from || "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  useEffect(() => {
    let alive = true;
    const syncSavedTheme = async () => {
      try {
        const settings = await api<{
          theme?: string;
          themeConfig?: Record<string, string>;
        }>("/public/theme/");
        if (!alive || !settings.theme) return;
        const theme = THEME_PRESETS[settings.theme] ? settings.theme : "meadow";
        applyTheme(settings.themeConfig || THEME_PRESETS[theme].config, theme);
      } catch {
        // Keep the last known-good theme during temporary network failures.
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
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await getCsrf();
      const x = await api<{ user: User }>("/auth/login/", {
        method: "POST",
        body: JSON.stringify({ username, password, rememberMe }),
      });
      setClientAuthenticated(true);
      onLogin(x.user);
      nav(x.user.mustChangePassword ? "/change-password" : returnTo, {
        replace: true,
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="login-page">
      <section className="login-hero" aria-label={t("loginHeroTitle")}>
        <div className="login-visual" aria-hidden="true">
          <img
            className="login-kids-art"
            src="/quest-media/graphics/login-kids-reference.png"
            alt=""
          />
          <div className="login-explore-card">
            <span className="eyebrow">{t("loginEyebrow")}</span>
            <strong>{t("loginHeroTitle")}</strong>
            <span>{t("loginHeroBody")}</span>
          </div>
        </div>
        <div className="login-hero-content">
          <div className="login-brand-lockup">
            <span className="login-brand-mark">✦</span>
            <span>
              <b>Youth</b>
              <strong>Quest</strong>
            </span>
          </div>
        </div>
        <div className="login-form-pane">
          <form className="login-card" onSubmit={submit}>
            <div className="login-card-topline">
              <span className="login-card-icon">
                <LockKeyhole size={19} />
              </span>
              <span className="eyebrow">{t("signIn")}</span>
            </div>
            <h2>{t("welcomeBack")}</h2>
            <p className="login-help">{t("signInHelp")}</p>
            <label>
              {t("username")}
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              {t("password")}
              <div className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={
                    showPassword ? t("hidePassword") : t("showPassword")
                  }
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <div className="login-options">
              <label className="login-check">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>{t("rememberMe")}</span>
              </label>
            </div>
            {error && (
              <div className="error login-error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary login-submit" type="submit">
              <span>{t("enterQuest")}</span>
              <ArrowRight size={18} />
            </button>
            <div className="login-secure-note">
              <ShieldCheck size={16} />
              <span>{t("loginSecure")}</span>
            </div>
            <div className="login-legal-links">
              <Link to="/privacy">{t("privacy")}</Link>
              <Link to="/cookies">{t("cookies")}</Link>
              <Link to="/help">{t("help")}</Link>
            </div>

            {/* Local development quick login */}
            {CONFIG.env === "local" && CONFIG.quickLogin && (
              <DevQuickLogin
                onLogin={onLogin}
                navigate={nav}
                returnTo={returnTo}
              />
            )}
          </form>
        </div>
      </section>

      {!navigator.onLine && (
        <div className="login-offline-notice">
          Offline mode — reconnect to sign in.
        </div>
      )}
    </main>
  );
}

function LoginFeature({
  icon,
  tone,
  title,
  body,
}: {
  icon: ReactNode;
  tone: string;
  title: string;
  body: string;
}) {
  return (
    <article className={`login-feature-card tone-${tone}`}>
      <span className="feature-icon">{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <span className="feature-arrow">
        <ArrowRight size={16} />
      </span>
    </article>
  );
}

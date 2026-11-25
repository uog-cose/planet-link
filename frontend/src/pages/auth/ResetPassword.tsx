import { FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useSearchParams, Link } from "react-router-dom";
import { api, getCsrf, setClientAuthenticated } from "../../api";
import { t } from "../../i18n";
import { Button, Card } from "../../components/ui";

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 10) {
      setError(t("passwordMin"));
      return;
    }
    if (password !== confirm) {
      setError(t("passwordMismatch"));
      return;
    }
    setBusy(true);
    try {
      await getCsrf();
      await api("/auth/password-reset/", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setClientAuthenticated(true);
      window.location.replace("/");
    } catch (e) {
      setError((e as Error).message || t("resetExpired"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="reset-page">
      <Card className="reset-card">
        <span className="eyebrow">YOUTH QUEST</span>
        <h1>{t("resetPassword")}</h1>
        {done ? (
          <>
            <p>{t("resetComplete")}</p>
            <Link className="btn btn-primary" to="/">
              Return to dashboard
            </Link>
          </>
        ) : !token ? (
          <p className="error">{t("resetExpired")}</p>
        ) : (
          <form onSubmit={submit}>
            <p className="qr-reset-info">{t("resetPasswordHelp")}</p>
            <label>
              {t("newPassword")}
              <div className="password-input-wrap">
                <input type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="password-visibility" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(v => !v)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </label>
            <label>
              {t("confirmPassword")}
              <div className="password-input-wrap">
                <input type={showConfirm ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                <button type="button" className="password-visibility" aria-label={showConfirm ? "Hide password" : "Show password"} onClick={() => setShowConfirm(v => !v)}>{showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </label>
            {error && <p className="error">{error}</p>}
            <Button type="submit" disabled={busy}>
              {t("setPassword")}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}

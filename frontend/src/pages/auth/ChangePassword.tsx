import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LockKeyhole, ArrowRight, Eye, EyeOff } from "lucide-react";
import { api, setClientAuthenticated } from "../../api";
import { Button, Card } from "../../components/ui";
import { useToast } from "../../components/ToastProvider";

export function ChangePassword() {
  const nav = useNavigate();
  const { show } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (next.length < 10) {
      setError("Use at least 10 characters.");
      return;
    }
    if (next !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const r = await api<any>("/auth/change-password/", {
        method: "POST",
        body: JSON.stringify({ currentPassword: current, password: next }),
      });
      setClientAuthenticated(true);
      show("Password changed successfully.", "success");
      nav(
        r.user?.role === "admin"
          ? "/admin"
          : r.user?.role === "worker"
            ? "/worker"
            : "/",
        { replace: true },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to change password.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="reset-page password-change-page">
      <Card className="reset-card password-change-card">
        <span className="login-card-icon">
          <LockKeyhole size={19} />
        </span>
        <span className="eyebrow">FIRST SIGN-IN</span>
        <h1>Create your password</h1>
        <p>
          Your account was created by a Youth Quest worker. Choose a private
          password before continuing.
        </p>
        <form onSubmit={submit}>
          <label>
            Current password
            <div className="password-input-wrap">
              <input type={showCurrent ? "text" : "password"} autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
              <button type="button" className="password-visibility" aria-label={showCurrent ? "Hide password" : "Show password"} onClick={() => setShowCurrent(v => !v)}>{showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </label>
          <label>
            New password
            <div className="password-input-wrap">
              <input type={showNext ? "text" : "password"} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
              <button type="button" className="password-visibility" aria-label={showNext ? "Hide password" : "Show password"} onClick={() => setShowNext(v => !v)}>{showNext ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </label>
          <label>
            Confirm password
            <div className="password-input-wrap">
              <input type={showConfirm ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              <button type="button" className="password-visibility" aria-label={showConfirm ? "Hide password" : "Show password"} onClick={() => setShowConfirm(v => !v)}>{showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </label>
          {error && <p className="error">{error}</p>}
          <Button type="submit" disabled={busy} icon={ArrowRight}>
            {busy ? "Saving…" : "Continue to Youth Quest"}
          </Button>
        </form>
      </Card>
    </main>
  );
}

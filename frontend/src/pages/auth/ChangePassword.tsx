import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LockKeyhole, ArrowRight } from "lucide-react";
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
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
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

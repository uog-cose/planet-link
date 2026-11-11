import { ShieldCheck, UserRound, Wrench, Zap } from "lucide-react";
import { api, getCsrf } from "../../api";
import { CONFIG } from "../../config";
import type { User } from "../../types";
import "./quick-login.css";

type DevAccount = "alex" | "worker" | "admin";

const ACCOUNTS: Array<{
  id: DevAccount;
  label: string;
  role: string;
  icon: typeof UserRound;
}> = [
  { id: "alex", label: "Alex", role: "Young Person", icon: UserRound },
  { id: "worker", label: "Worker", role: "Youth Worker", icon: Wrench },
  { id: "admin", label: "Admin", role: "Administrator", icon: ShieldCheck },
];

export function DevQuickLogin({
  onLogin,
  navigate,
  returnTo,
}: {
  onLogin: (user: User) => void;
  navigate: (path: string) => void;
  returnTo: string;
}) {
  async function login(account: DevAccount) {
    await getCsrf();
    const result = await api<{ user: User }>("/auth/dev-login/", {
      method: "POST",
      body: JSON.stringify({ username: account }),
    });
    onLogin(result.user);
    navigate(returnTo);
  }

  if (CONFIG.env !== "local") return null;

  return (
    <section className="quick-login" aria-label="Development quick login">
      <div className="quick-login-head">
        <Zap size={16} />
        <div>
          <strong>Development quick login</strong>
          <span>
            Local testing only. This component is excluded from production use.
          </span>
        </div>
      </div>
      <div className="quick-login-grid">
        {ACCOUNTS.map(({ id, label, role, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="quick-login-button"
            onClick={() => login(id)}
          >
            <Icon size={18} />
            <span>
              <b>{label}</b>
              <small>{role}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
